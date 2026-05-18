'use client'
import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatDate, formatPhone, getStatusClass } from '@/lib/utils'
import { syncLeadAppointments } from '@/lib/sync-leads'
import { getGCalToken, isGCalConnected, createGCalEvent } from '@/lib/googleCalendar'
import type { Patient, Appointment, Professional } from '@/types'
import { ProntuarioModal } from '@/components/prontuario/ProntuarioModal'
import { PatientFormModal } from '@/components/pacientes/PatientFormModal'
import { GlobalSearch } from '@/components/layout/GlobalSearch'
import styles from './pacientes.module.css'

type ActiveTab = 'atendimentos' | 'pacientes'

const BLANK_APPT = { patient_id: '', professional_id: '', procedure_name: '', scheduled_at: '', duration_minutes: 60, status: 'agendado', notes: '' }

function PacientesContent() {
  const { clinic } = useAuthStore()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<ActiveTab>('atendimentos')
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [loading, setLoading] = useState(true)

  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [prontuarioPatient, setProntuarioPatient] = useState<Patient | null>(null)
  const [editPatient, setEditPatient] = useState<Patient | null>(null)
  const [showNewPatient, setShowNewPatient] = useState(false)

  const [showNewAppt, setShowNewAppt] = useState(false)
  const [apptForm, setApptForm] = useState(BLANK_APPT)
  const [apptSaving, setApptSaving] = useState(false)
  const [apptError, setApptError] = useState('')
  const [syncToGCal, setSyncToGCal] = useState(false)
  const gcalConnected = isGCalConnected(clinic?.gcalConnected)

  useEffect(() => {
    if (!clinic?.id) return
    // Reset estado ao trocar de clínica para evitar exibir dados da clínica anterior
    setAppointments([])
    setPatients([])
    setLoading(true)
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic?.id])

  async function loadData() {
    if (!clinic) return
    // Sincroniza leads do WhatsApp/n8n apenas no plano Plus
    if (clinic.plan === 'plus') {
      await syncLeadAppointments(clinic.id, clinic.slug)
    }
    const [apptRes, patRes, profRes] = await Promise.all([
      supabase.from('appointments').select('*, patients(id, name, phone)').eq('clinic_id', clinic.id).order('scheduled_at', { ascending: false }),
      supabase.from('patients').select('*').eq('clinic_id', clinic.id).eq('is_active', true).order('name'),
      supabase.from('professionals').select('*').eq('clinic_id', clinic.id).order('name'),
    ])
    setAppointments((apptRes.data ?? []) as Appointment[])
    const pats = (patRes.data ?? []) as Patient[]
    setPatients(pats)
    setProfessionals((profRes.data ?? []) as Professional[])
    setLoading(false)

    // Open prontuário directly if ?patient=<id> is in URL
    const targetId = searchParams.get('patient')
    if (targetId) {
      const target = pats.find(p => p.id === targetId)
      if (target) {
        setTab('pacientes')
        setProntuarioPatient(target)
      }
    }
  }

  const filteredAppointments = useMemo(() => {
    const term = search.toLowerCase()
    return appointments.filter((a) => {
      const name = (a.patients?.name ?? '').toLowerCase()
      const phone = (a.patients?.phone ?? '').toLowerCase()
      const matchSearch = !term || name.includes(term) || phone.includes(term)
      const matchStatus = !filterStatus || (a.status ?? '').toLowerCase().includes(filterStatus)
      return matchSearch && matchStatus
    })
  }, [appointments, search, filterStatus])

  const filteredPatients = useMemo(() => {
    const term = search.toLowerCase()
    return patients.filter((p) => {
      const name = p.name.toLowerCase()
      const phone = (p.phone ?? '').toLowerCase()
      const email = (p.email ?? '').toLowerCase()
      return !term || name.includes(term) || phone.includes(term) || email.includes(term)
    })
  }, [patients, search])

  function handleSaved() {
    setEditPatient(null)
    setShowNewPatient(false)
    loadData()
  }

  async function handleSaveAppt() {
    if (!clinic) { setApptError('Clínica não carregada. Recarregue a página.'); return }
    if (!apptForm.patient_id) { setApptError('Selecione um paciente.'); return }
    if (!apptForm.scheduled_at) { setApptError('Informe a data e hora.'); return }
    setApptSaving(true)
    setApptError('')
    const { data: inserted, error } = await supabase.from('appointments').insert([{
      clinic_id: clinic.id,
      patient_id: apptForm.patient_id,
      professional_id: apptForm.professional_id || null,
      procedure_name: apptForm.procedure_name || null,
      scheduled_at: new Date(apptForm.scheduled_at).toISOString(),
      duration_minutes: apptForm.duration_minutes,
      status: apptForm.status,
      notes: apptForm.notes || null,
    }]).select('id').single()
    if (error) { setApptSaving(false); setApptError(`Erro: ${error.message}`); return }

    if (syncToGCal && gcalConnected && inserted) {
      const token = getGCalToken()
      if (token) {
        const patient = patients.find(p => p.id === apptForm.patient_id)
        const end = new Date(new Date(apptForm.scheduled_at).getTime() + apptForm.duration_minutes * 60000).toISOString()
        try {
          const event = await createGCalEvent(token, {
            summary: `${apptForm.procedure_name || 'Consulta'} — ${patient?.name ?? 'Paciente'}`,
            description: apptForm.notes || undefined,
            start: apptForm.scheduled_at,
            end,
          })
          if (event.id) await supabase.from('appointments').update({ gcal_event_id: event.id }).eq('id', inserted.id)
        } catch { /* ignora erros do GCal */ }
      }
    }

    setApptSaving(false)
    setShowNewAppt(false)
    setApptForm(BLANK_APPT)
    setSyncToGCal(false)
    loadData()
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Pacientes e Leads</h1>
          <p className={styles.sub}>
            {tab === 'atendimentos'
              ? `${filteredAppointments.length} agendamentos`
              : `${filteredPatients.length} pacientes`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <GlobalSearch />
          {tab === 'atendimentos' && (
            <button className={styles.btnPrimary} onClick={() => { setApptForm(BLANK_APPT); setApptError(''); setShowNewAppt(true) }}>
              + Novo Atendimento
            </button>
          )}
          {tab === 'pacientes' && (
            <button className={styles.btnPrimary} onClick={() => setShowNewPatient(true)}>
              + Novo Paciente
            </button>
          )}
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === 'atendimentos' ? styles.tabActive : ''}`} onClick={() => setTab('atendimentos')}>
            Atendimentos
          </button>
          <button className={`${styles.tab} ${tab === 'pacientes' ? styles.tabActive : ''}`} onClick={() => setTab('pacientes')}>
            Pacientes
          </button>
        </div>

        <div className={styles.filters}>
          <input
            className={styles.search}
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {tab === 'atendimentos' && (
            <select
              className={styles.select}
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">Todos os status</option>
              <option value="agendado">Agendado</option>
              <option value="confirmado">Confirmado</option>
              <option value="concluido">Concluído</option>
              <option value="cancelado">Cancelado</option>
              <option value="faltou">Faltou</option>
            </select>
          )}
        </div>
      </div>

      {loading ? (
        <p className={styles.loading}>Carregando...</p>
      ) : tab === 'atendimentos' ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Telefone</th>
                <th>Procedimento</th>
                <th>Status</th>
                <th>Criado em</th>
                <th>Agendado para</th>
              </tr>
            </thead>
            <tbody>
              {filteredAppointments.length === 0 ? (
                <tr><td colSpan={6} className={styles.empty}>Nenhum agendamento encontrado.</td></tr>
              ) : filteredAppointments.map((a) => (
                <tr key={a.id}>
                  <td className={styles.bold}>{a.patients?.name ?? '-'}</td>
                  <td>{formatPhone(a.patients?.phone)}</td>
                  <td>{a.procedure_name ?? '-'}</td>
                  <td><span className={`status-badge status-${getStatusClass(a.status).replace('status-', '')}`}>{a.status}</span></td>
                  <td>{formatDate(a.created_at)}</td>
                  <td>{formatDate(a.scheduled_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Telefone</th>
                <th>E-mail</th>
                <th>Cadastro</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredPatients.length === 0 ? (
                <tr><td colSpan={5} className={styles.empty}>Nenhum paciente encontrado.</td></tr>
              ) : filteredPatients.map((p) => (
                <tr key={p.id}>
                  <td className={styles.bold}>{p.name}</td>
                  <td>{formatPhone(p.phone)}</td>
                  <td>{p.email ?? '-'}</td>
                  <td>{formatDate(p.created_at, true)}</td>
                  <td>
                    <div className={styles.actions}>
                      <button className={styles.btnAction} onClick={() => setProntuarioPatient(p)}>
                        Prontuário
                      </button>
                      <button className={`${styles.btnAction} ${styles.btnSecondary}`} onClick={() => setEditPatient(p)}>
                        Editar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {prontuarioPatient && (
        <ProntuarioModal
          patient={prontuarioPatient}
          clinic={clinic!}
          onClose={() => setProntuarioPatient(null)}
        />
      )}

      {(editPatient || showNewPatient) && (
        <PatientFormModal
          patient={editPatient}
          clinicId={clinic!.id}
          onClose={() => { setEditPatient(null); setShowNewPatient(false) }}
          onSaved={handleSaved}
        />
      )}

      {showNewAppt && (
        <div className={styles.overlay} onClick={() => setShowNewAppt(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Novo Atendimento</h2>
              <button className={styles.btnClose} onClick={() => setShowNewAppt(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.field}>
                <label>Paciente *</label>
                <select value={apptForm.patient_id} onChange={e => setApptForm(p => ({ ...p, patient_id: e.target.value }))}>
                  <option value="">Selecionar paciente</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Profissional</label>
                <select value={apptForm.professional_id} onChange={e => setApptForm(p => ({ ...p, professional_id: e.target.value }))}>
                  <option value="">Sem profissional</option>
                  {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Procedimento</label>
                <input value={apptForm.procedure_name} onChange={e => setApptForm(p => ({ ...p, procedure_name: e.target.value }))} placeholder="Ex: Consulta, Retorno..." />
              </div>
              <div className={styles.field}>
                <label>Data e Hora *</label>
                <input type="datetime-local" value={apptForm.scheduled_at} onChange={e => setApptForm(p => ({ ...p, scheduled_at: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>Duração (min)</label>
                <input type="number" value={apptForm.duration_minutes} onChange={e => setApptForm(p => ({ ...p, duration_minutes: Number(e.target.value) }))} min={15} step={15} />
              </div>
              <div className={styles.field}>
                <label>Status</label>
                <select value={apptForm.status} onChange={e => setApptForm(p => ({ ...p, status: e.target.value }))}>
                  <option value="agendado">Agendado</option>
                  <option value="confirmado">Confirmado</option>
                  <option value="concluido">Concluído</option>
                  <option value="cancelado">Cancelado</option>
                  <option value="faltou">Faltou</option>
                </select>
              </div>
              <div className={styles.field}>
                <label>Observações</label>
                <textarea rows={3} value={apptForm.notes} onChange={e => setApptForm(p => ({ ...p, notes: e.target.value }))} />
              </div>
              {gcalConnected && (
                <label className={styles.gcalCheck}>
                  <input type="checkbox" checked={syncToGCal} onChange={e => setSyncToGCal(e.target.checked)} />
                  Sincronizar com Google Calendar
                </label>
              )}
              {apptError && <p className={styles.error}>{apptError}</p>}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnCancel} onClick={() => setShowNewAppt(false)}>Cancelar</button>
              <button className={styles.btnSave} onClick={handleSaveAppt} disabled={apptSaving || !apptForm.patient_id || !apptForm.scheduled_at}>
                {apptSaving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PacientesPage() {
  return (
    <Suspense fallback={<div />}>
      <PacientesContent />
    </Suspense>
  )
}
