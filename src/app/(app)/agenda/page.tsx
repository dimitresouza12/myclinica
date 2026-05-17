'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatDate, formatPhone } from '@/lib/utils'
import { getGCalToken, isGCalConnected, silentRefreshGCal, fetchGCalEvents, createGCalEvent, connectGoogleCalendar, type GCalEvent } from '@/lib/googleCalendar'
import { Portal } from '@/components/ui/Portal'
import { syncLeadAppointments } from '@/lib/sync-leads'
import type { Appointment, Patient, Professional } from '@/types'
import { statusColor, type CalendarEvent } from '@/components/agenda/FullCalendarWrapper'
import styles from './agenda.module.css'

const FullCalendarWrapper = dynamic(
  () => import('@/components/agenda/FullCalendarWrapper'),
  { ssr: false, loading: () => <div className={styles.calLoading}>Carregando calendário...</div> }
)

interface NewAppt {
  patient_id: string
  professional_id: string
  procedure_name: string
  scheduled_at: string
  duration_minutes: number
  status: string
  notes: string
}

const BLANK: NewAppt = {
  patient_id: '', professional_id: '', procedure_name: '',
  scheduled_at: '', duration_minutes: 60, status: 'agendado', notes: '',
}

type ViewMode = 'calendar' | 'lista'

export default function AgendaPage() {
  const { clinic } = useAuthStore()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('calendar')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<NewAppt>(BLANK)
  const [saving, setSaving] = useState(false)
  const [syncToGCal, setSyncToGCal] = useState(false)
  const [filterDate, setFilterDate] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [gcalEvents, setGcalEvents] = useState<GCalEvent[]>([])
  const [gcalConnected, setGcalConnected] = useState(false)
  const [gcalError, setGcalError] = useState('')

  const loadData = useCallback(async () => {
    if (!clinic?.id) return
    const clinicId = clinic.id
    // Sincroniza leads do WhatsApp/n8n apenas no plano Plus
    if (clinic.plan === 'plus') {
      await syncLeadAppointments(clinicId, clinic.slug)
    }
    const [apptRes, patRes, profRes] = await Promise.all([
      supabase
        .from('appointments')
        .select('*, patients(id, name, phone), clinic_users(id, display_name)')
        .eq('clinic_id', clinicId)
        .order('scheduled_at', { ascending: false }),
      supabase.from('patients').select('id, name, phone').eq('clinic_id', clinicId).eq('is_active', true).order('name'),
      supabase.from('professionals').select('*').eq('clinic_id', clinicId).order('name'),
    ])
    // Guard: descarta resultado se a clínica mudou durante o fetch
    if (clinic?.id !== clinicId) return
    setAppointments((apptRes.data ?? []) as Appointment[])
    setPatients((patRes.data ?? []) as Patient[])
    setProfessionals((profRes.data ?? []) as Professional[])
    setLoading(false)
  }, [clinic])

  useEffect(() => {
    if (!clinic?.id) return
    // Reset estado ao trocar de clínica
    setAppointments([])
    setPatients([])
    setProfessionals([])
    setGcalEvents([])
    setLoading(true)
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic?.id])

  useEffect(() => {
    // Initialize connected state from intent flag (survives token expiry)
    setGcalConnected(isGCalConnected())
  }, [])

  const loadGCalEvents = useCallback(async (token: string, profs: Professional[]) => {
    try {
      const now = new Date()
      const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
      const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString()
      const calendarIds = ['primary', ...profs.map((p) => p.google_calendar_id).filter((id): id is string => !!id)]
      const events = await fetchGCalEvents(token, timeMin, timeMax, calendarIds)
      setGcalEvents(events)
    } catch {
      setGcalConnected(false)
    }
  }, [])

  useEffect(() => {
    if (!gcalConnected) return
    async function tryLoad() {
      // Use valid token or try to silently refresh if expired
      let token = getGCalToken()
      if (!token) token = await silentRefreshGCal()
      if (token) loadGCalEvents(token, professionals)
      else setGcalConnected(false)
    }
    tryLoad()
  }, [gcalConnected, professionals, loadGCalEvents])

  async function handleConnectGCal() {
    setGcalError('')
    try {
      const token = await connectGoogleCalendar()
      setGcalConnected(true)
      await loadGCalEvents(token, professionals)
    } catch (err: unknown) {
      setGcalError(err instanceof Error ? err.message : 'Erro ao conectar')
    }
  }

  const calendarEvents = useMemo<CalendarEvent[]>(() => {
    const clinicEvents: CalendarEvent[] = appointments.map((a) => {
      const start = a.scheduled_at
      const end = start
        ? new Date(new Date(start).getTime() + (a.duration_minutes ?? 60) * 60000).toISOString()
        : undefined
      return {
        id: a.id,
        title: `${a.patients?.name ?? 'Paciente'} — ${a.procedure_name ?? 'Consulta'}`,
        start,
        end,
        color: statusColor(a.status ?? ''),
        extendedProps: { appt: a },
      }
    })
    const gEvents: CalendarEvent[] = gcalEvents.map((e) => ({
      id: `gcal-${e.id}`,
      title: `📅 ${e.summary}`,
      start: e.start.dateTime ?? e.start.date ?? '',
      end: e.end.dateTime ?? e.end.date,
      color: '#4285F4',
      extendedProps: { gcal: true, link: e.htmlLink },
    }))
    return [...clinicEvents, ...gEvents]
  }, [appointments, gcalEvents])

  const filtered = appointments.filter((a) => {
    const matchStatus = !filterStatus || a.status === filterStatus
    const matchDate = !filterDate || a.scheduled_at?.startsWith(filterDate)
    return matchStatus && matchDate
  })

  function handleEventClick(id: string) {
    const appt = appointments.find((a) => a.id === id)
    if (appt) setSelected(appt)
  }

  function handleDateSelect(dateStr: string) {
    setForm({ ...BLANK, scheduled_at: dateStr.length <= 10 ? dateStr + 'T09:00' : dateStr })
    setShowModal(true)
  }

  async function handleSave() {
    if (!clinic || !form.patient_id || !form.scheduled_at) return
    setSaving(true)
    await supabase.from('appointments').insert([{ ...form, clinic_id: clinic.id }])

    // Sync to Google Calendar if connected and checkbox checked
    if (syncToGCal && gcalConnected) {
      const token = getGCalToken()
      if (token) {
        const patient = patients.find(p => p.id === form.patient_id)
        const end = new Date(new Date(form.scheduled_at).getTime() + form.duration_minutes * 60000).toISOString()
        try {
          const event = await createGCalEvent(token, {
            summary: `${form.procedure_name || 'Consulta'} — ${patient?.name ?? 'Paciente'}`,
            description: form.notes || undefined,
            start: form.scheduled_at,
            end,
          })
          await loadGCalEvents(token, professionals)
          if (event.htmlLink) window.open(event.htmlLink, '_blank')
        } catch { /* ignore gcal errors */ }
      }
    }

    setSaving(false)
    setShowModal(false)
    setForm(BLANK)
    loadData()
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('appointments').update({ status }).eq('id', id).eq('clinic_id', clinic!.id)
    loadData()
    setSelected(null)
  }

  function openGCal(appt: Appointment) {
    const start = new Date(appt.scheduled_at)
    const end = new Date(start.getTime() + (appt.duration_minutes ?? 60) * 60000)
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace('.000', '')
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(appt.procedure_name ?? 'Consulta')}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent(`Paciente: ${appt.patients?.name ?? ''}\nTelefone: ${appt.patients?.phone ?? ''}`)}`
    window.open(url, '_blank')
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Agenda</h1>
          <p className={styles.sub}>{appointments.length} agendamentos</p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.viewToggle}>
            <button
              className={`${styles.toggleBtn} ${viewMode === 'calendar' ? styles.toggleActive : ''}`}
              onClick={() => setViewMode('calendar')}
            >
              Calendário
            </button>
            <button
              className={`${styles.toggleBtn} ${viewMode === 'lista' ? styles.toggleActive : ''}`}
              onClick={() => setViewMode('lista')}
            >
              Lista
            </button>
          </div>
          {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
            gcalConnected ? (
              <button className={styles.btnGcalSmall} title={`${gcalEvents.length} evento(s) sincronizado(s)`}>
                <span className={styles.gcalDot} /> GCal
              </button>
            ) : (
              <button className={styles.btnGcalSmall} onClick={handleConnectGCal}>
                Vincular Google Calendar
              </button>
            )
          )}
          <button className={styles.btnPrimary} onClick={() => setShowModal(true)}>
            + Novo Agendamento
          </button>
        </div>
      </div>

      {gcalError && <p className={styles.gcalErrorMsg}>{gcalError}</p>}

      {viewMode === 'lista' && (
        <div className={styles.filters}>
          <input
            type="date"
            className={styles.input}
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />
          <select className={styles.input} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Todos os status</option>
            <option value="agendado">Agendado</option>
            <option value="confirmado">Confirmado</option>
            <option value="concluido">Concluído</option>
            <option value="cancelado">Cancelado</option>
            <option value="faltou">Faltou</option>
          </select>
          {(filterDate || filterStatus) && (
            <button className={styles.btnClear} onClick={() => { setFilterDate(''); setFilterStatus('') }}>
              Limpar
            </button>
          )}
        </div>
      )}

      {loading ? (
        <p className={styles.loading}>Carregando...</p>
      ) : viewMode === 'calendar' ? (
        <div className={styles.calendarWrap}>
          <FullCalendarWrapper
            events={calendarEvents}
            onEventClick={handleEventClick}
            onDateSelect={handleDateSelect}
          />
          <p className={styles.calHint}>Clique em um evento para ver detalhes. Selecione uma data para criar agendamento.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Telefone</th>
                <th>Procedimento</th>
                <th>Profissional</th>
                <th>Data</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className={styles.empty}>Nenhum agendamento encontrado.</td></tr>
              ) : filtered.map((a) => (
                <tr key={a.id} className={styles.row} onClick={() => setSelected(a)}>
                  <td className={styles.bold}>{a.patients?.name ?? '-'}</td>
                  <td>{formatPhone(a.patients?.phone)}</td>
                  <td>{a.procedure_name ?? '-'}</td>
                  <td>{a.clinic_users?.display_name ?? '-'}</td>
                  <td>{formatDate(a.scheduled_at)}</td>
                  <td><span className={`status-badge status-${a.status ?? 'pendente'}`}>{a.status ?? 'pendente'}</span></td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button className={styles.btnGcal} onClick={() => openGCal(a)} title="Adicionar ao Google Calendar">
                      📅 GCal
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <Portal>
        <div className={styles.overlay} onClick={() => setSelected(null)}>
          <div className={styles.detailPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.detailHeader}>
              <h3>{selected.patients?.name ?? 'Agendamento'}</h3>
              <button className={styles.btnClose} onClick={() => setSelected(null)}>✕</button>
            </div>
            <div className={styles.detailBody}>
              <Row label="Procedimento" value={selected.procedure_name ?? '-'} />
              <Row label="Data" value={formatDate(selected.scheduled_at)} />
              <Row label="Duração" value={`${selected.duration_minutes ?? 60} min`} />
              <Row label="Telefone" value={formatPhone(selected.patients?.phone)} />
              <Row label="Status atual" value={selected.status ?? '-'} />
              {selected.notes && <Row label="Observações" value={selected.notes} />}
            </div>
            <div className={styles.detailActions}>
              <p className={styles.detailActionsLabel}>Alterar status:</p>
              <div className={styles.statusBtns}>
                {['agendado','confirmado','concluido','cancelado','faltou'].map((s) => (
                  <button
                    key={s}
                    className={`${styles.statusBtn} ${selected.status === s ? styles.statusBtnActive : ''}`}
                    onClick={() => updateStatus(selected.id, s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <button className={styles.btnGcalLarge} onClick={() => openGCal(selected)}>
                📅 Adicionar ao Google Calendar
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* New appointment modal */}
      {showModal && (
        <Portal>
        <div className={styles.overlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Novo Agendamento</h2>
              <button className={styles.btnClose} onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.field}>
                <label>Paciente *</label>
                <select value={form.patient_id} onChange={(e) => setForm((p) => ({ ...p, patient_id: e.target.value }))}>
                  <option value="">Selecionar paciente</option>
                  {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Profissional</label>
                <select value={form.professional_id} onChange={(e) => setForm((p) => ({ ...p, professional_id: e.target.value }))}>
                  <option value="">Sem profissional</option>
                  {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Procedimento</label>
                <input value={form.procedure_name} onChange={(e) => setForm((p) => ({ ...p, procedure_name: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>Data e Hora *</label>
                <input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm((p) => ({ ...p, scheduled_at: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>Duração (min)</label>
                <input type="number" value={form.duration_minutes} onChange={(e) => setForm((p) => ({ ...p, duration_minutes: Number(e.target.value) }))} min={15} step={15} />
              </div>
              <div className={styles.field}>
                <label>Status</label>
                <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                  <option value="agendado">Agendado</option>
                  <option value="confirmado">Confirmado</option>
                </select>
              </div>
              <div className={styles.field}>
                <label>Observações</label>
                <textarea rows={3} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              </div>
              {gcalConnected && (
                <label className={styles.gcalCheck}>
                  <input type="checkbox" checked={syncToGCal} onChange={e => setSyncToGCal(e.target.checked)} />
                  Sincronizar com Google Calendar
                </label>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnCancel} onClick={() => setShowModal(false)}>Cancelar</button>
              <button className={styles.btnSave} onClick={handleSave} disabled={saving || !form.patient_id || !form.scheduled_at}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '0.75rem' }}>
      <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}
