'use client'
import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatDate, formatPhone, getStatusClass } from '@/lib/utils'
import { syncLeadAppointments } from '@/lib/sync-leads'
import type { Patient, Appointment } from '@/types'
import { ProntuarioModal } from '@/components/prontuario/ProntuarioModal'
import { PatientFormModal } from '@/components/pacientes/PatientFormModal'
import styles from './pacientes.module.css'

type ActiveTab = 'atendimentos' | 'pacientes'

function PacientesContent() {
  const { clinic } = useAuthStore()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<ActiveTab>('atendimentos')
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [loading, setLoading] = useState(true)

  const [prontuarioPatient, setProntuarioPatient] = useState<Patient | null>(null)
  const [editPatient, setEditPatient] = useState<Patient | null>(null)
  const [showNewPatient, setShowNewPatient] = useState(false)

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
    const [apptRes, patRes] = await Promise.all([
      supabase.from('appointments').select('*, patients(id, name, phone)').eq('clinic_id', clinic.id).order('scheduled_at', { ascending: false }),
      supabase.from('patients').select('*').eq('clinic_id', clinic.id).eq('is_active', true).order('name'),
    ])
    setAppointments((apptRes.data ?? []) as Appointment[])
    const pats = (patRes.data ?? []) as Patient[]
    setPatients(pats)
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
        <button className={styles.btnPrimary} onClick={() => setShowNewPatient(true)}>
          + Novo Paciente
        </button>
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
