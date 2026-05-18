'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatDate, formatPhone } from '@/lib/utils'
import { getGCalToken, isGCalConnected, silentRefreshGCal, fetchGCalEvents, createGCalEvent, updateGCalEvent, connectGoogleCalendar, disconnectGoogleCalendar, type GCalEvent } from '@/lib/googleCalendar'
import { Portal } from '@/components/ui/Portal'
import { syncLeadAppointments } from '@/lib/sync-leads'
import type { Appointment, Patient, Professional } from '@/types'
import { type CalendarEvent } from '@/components/agenda/FullCalendarWrapper'
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

// Paleta de cores para profissionais (estilo Google Calendar)
const PROF_COLORS = [
  '#4285F4', // Google Blue
  '#0F9D58', // Google Green
  '#DB4437', // Google Red
  '#F4B400', // Google Yellow
  '#AB47BC', // Purple
  '#00ACC1', // Cyan
  '#FF7043', // Deep Orange
  '#5C6BC0', // Indigo
  '#26A69A', // Teal
  '#EC407A', // Pink
]

function profColor(profId: string | null, profIndex: Record<string, number>): string {
  if (!profId) return '#6B7280'
  const idx = profIndex[profId] ?? 0
  return PROF_COLORS[idx % PROF_COLORS.length]
}

export default function AgendaPage() {
  const { clinic, user, setSession } = useAuthStore()
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
  const [selectedGcal, setSelectedGcal] = useState<GCalEvent | null>(null)
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
    // Fonte primária: banco (via store). Fallback: localStorage para sessões antigas.
    setGcalConnected(isGCalConnected(clinic?.gcalConnected))
  }, [clinic?.gcalConnected])

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
      await disconnectGoogleCalendar(clinic?.id)
    }
  }, [clinic?.id])

  useEffect(() => {
    if (!gcalConnected) return
    async function tryLoad() {
      let token = getGCalToken()
      if (!token) token = await silentRefreshGCal(gcalConnected)
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
      setSession({ ...clinic!, gcalConnected: true }, user!)
      await loadGCalEvents(token, professionals)
    } catch (err: unknown) {
      setGcalError(err instanceof Error ? err.message : 'Erro ao conectar')
    }
  }

  // Map each professional id to a stable color index
  const profColorIndex = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {}
    professionals.forEach((p, i) => { map[p.id] = i })
    return map
  }, [professionals])

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
        color: profColor(a.professional_id, profColorIndex),
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
  }, [appointments, gcalEvents, profColorIndex])

  const filtered = appointments.filter((a) => {
    const matchStatus = !filterStatus || a.status === filterStatus
    const matchDate = !filterDate || a.scheduled_at?.startsWith(filterDate)
    return matchStatus && matchDate
  })

  function handleEventClick(id: string) {
    if (id.startsWith('gcal-')) {
      const gcalId = id.replace('gcal-', '')
      const ev = gcalEvents.find((e) => e.id === gcalId)
      if (ev) setSelectedGcal(ev)
      return
    }
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

    const scheduledAtISO = new Date(form.scheduled_at).toISOString()

    const { data: inserted, error: insertErr } = await supabase
      .from('appointments')
      .insert([{ ...form, scheduled_at: scheduledAtISO, clinic_id: clinic.id }])
      .select('id')
      .single()

    if (insertErr) {
      setSaving(false)
      alert(`Erro ao salvar agendamento: ${insertErr.message}`)
      return
    }

    // Sync to Google Calendar if connected and checkbox checked
    if (syncToGCal && gcalConnected && inserted) {
      const token = getGCalToken()
      if (token) {
        const patient = patients.find(p => p.id === form.patient_id)
        const end = new Date(new Date(scheduledAtISO).getTime() + form.duration_minutes * 60000).toISOString()
        try {
          const event = await createGCalEvent(token, {
            summary: `${form.procedure_name || 'Consulta'} — ${patient?.name ?? 'Paciente'}`,
            description: form.notes || undefined,
            start: scheduledAtISO,
            end,
          })
          if (event.id) {
            await supabase.from('appointments').update({ gcal_event_id: event.id }).eq('id', inserted.id)
          }
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

    // Se o agendamento tem gcal_event_id e GCal está conectado, atualiza o título do evento
    const appt = appointments.find(a => a.id === id)
    if (appt?.gcal_event_id && gcalConnected) {
      const token = getGCalToken()
      if (token) {
        const statusLabel: Record<string, string> = {
          agendado: '🕐', confirmado: '✅', concluido: '🎉', cancelado: '❌', faltou: '😔',
        }
        const emoji = statusLabel[status] ?? ''
        const end = new Date(new Date(appt.scheduled_at).getTime() + (appt.duration_minutes ?? 60) * 60000).toISOString()
        try {
          await updateGCalEvent(token, appt.gcal_event_id, {
            summary: `${emoji} ${appt.procedure_name || 'Consulta'} — ${appt.patients?.name ?? 'Paciente'}`,
            description: appt.notes || undefined,
            start: appt.scheduled_at,
            end,
          })
        } catch { /* ignore gcal errors */ }
      }
    }

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
          {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
            gcalConnected ? (
              <div className={styles.gcalStatus}>
                <span className={styles.gcalDot} />
                <span>Google Calendar vinculado</span>
                <span className={styles.gcalEventsCount}>{gcalEvents.length} evento(s)</span>
              </div>
            ) : (
              <button className={styles.btnGcalConnect} onClick={handleConnectGCal}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                Vincular Google Calendar
              </button>
            )
          ) : (
            <div className={styles.gcalUnlinked}>
              <span className={styles.gcalDotOff} />
              <span>Google Calendar não vinculado</span>
            </div>
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
          {professionals.length > 1 && (
            <div className={styles.profLegend}>
              <span className={styles.profLegendItem} style={{ color: 'var(--text-secondary)' }}>
                <span className={styles.profDot} style={{ background: '#6B7280' }} />
                Sem profissional
              </span>
              {professionals.map((p, i) => (
                <span key={p.id} className={styles.profLegendItem}>
                  <span className={styles.profDot} style={{ background: PROF_COLORS[i % PROF_COLORS.length] }} />
                  {p.name}
                </span>
              ))}
            </div>
          )}
          <FullCalendarWrapper
            events={calendarEvents}
            onEventClick={handleEventClick}
            onDateSelect={handleDateSelect}
          />
          <p className={styles.calHint}>Clique em um evento para ver detalhes. Selecione uma data para criar agendamento.</p>
        </div>
      ) : (
        <div className={styles.listWrap}>
          {filtered.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>📅</span>
              <p>Nenhum agendamento encontrado.</p>
            </div>
          ) : filtered.map((a) => {
            const color = profColor(a.professional_id, profColorIndex)
            return (
              <div key={a.id} className={styles.listCard} onClick={() => setSelected(a)}>
                <div className={styles.listCardAccent} style={{ background: color }} />
                <div className={styles.listCardAvatar} style={{ background: color }}>
                  {(a.patients?.name ?? 'P').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                </div>
                <div className={styles.listCardMain}>
                  <span className={styles.listCardName}>{a.patients?.name ?? '-'}</span>
                  <span className={styles.listCardProc}>{a.procedure_name ?? 'Consulta'}</span>
                </div>
                <div className={styles.listCardMeta}>
                  <span className={styles.listCardDate}>{STATUS_ICONS[a.status ?? ''] ?? '🕐'} {formatDate(a.scheduled_at)}</span>
                  {a.clinic_users?.display_name && (
                    <span className={styles.listCardProf}>{a.clinic_users.display_name}</span>
                  )}
                </div>
                <span className={`${styles.listCardBadge} ${styles[`badge_${a.status ?? 'agendado'}`]}`}>
                  {STATUS_LABELS[a.status ?? ''] ?? a.status}
                </span>
                <button
                  className={styles.listCardGcal}
                  onClick={(e) => { e.stopPropagation(); openGCal(a) }}
                  title="Google Calendar"
                >
                  📅
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* GCal event detail panel */}
      {selectedGcal && (
        <Portal>
          <div className={styles.overlay} onClick={() => setSelectedGcal(null)}>
            <div className={styles.detailPanel} onClick={(e) => e.stopPropagation()}>
              <div className={styles.detailHeader}>
                <div className={styles.detailPatientInfo}>
                  <div className={styles.detailAvatar} style={{ background: '#4285F4' }}>📅</div>
                  <div>
                    <h3 className={styles.detailName}>{selectedGcal.summary}</h3>
                    <span className={`${styles.detailStatusBadge} ${styles.badge_confirmado}`}>Google Calendar</span>
                  </div>
                </div>
                <button className={styles.btnClose} onClick={() => setSelectedGcal(null)}>✕</button>
              </div>
              <div className={styles.detailInfoGrid}>
                {selectedGcal.start.dateTime && (
                  <InfoCard icon="📅" label="Início" value={new Date(selectedGcal.start.dateTime).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} />
                )}
                {selectedGcal.end.dateTime && (
                  <InfoCard icon="🏁" label="Término" value={new Date(selectedGcal.end.dateTime).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} />
                )}
                {selectedGcal.description && (
                  <InfoCard icon="📝" label="Descrição" value={selectedGcal.description} fullWidth />
                )}
              </div>
              <div className={styles.detailFooter}>
                {selectedGcal.htmlLink && (
                  <a
                    href={selectedGcal.htmlLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.btnGcalLarge}
                  >
                    📅 Abrir no Google Calendar
                  </a>
                )}
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Detail panel */}
      {selected && (
        <Portal>
        <div className={styles.overlay} onClick={() => setSelected(null)}>
          <div className={styles.detailPanel} onClick={(e) => e.stopPropagation()}>
            {/* Header com avatar */}
            <div className={styles.detailHeader}>
              <div className={styles.detailPatientInfo}>
                <div
                  className={styles.detailAvatar}
                  style={{ background: profColor(selected.professional_id, profColorIndex) }}
                >
                  {(selected.patients?.name ?? 'P').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                </div>
                <div>
                  <h3 className={styles.detailName}>{selected.patients?.name ?? 'Agendamento'}</h3>
                  <span className={`${styles.detailStatusBadge} ${styles[`badge_${selected.status ?? 'agendado'}`]}`}>
                    {STATUS_LABELS[selected.status ?? ''] ?? selected.status}
                  </span>
                </div>
              </div>
              <button className={styles.btnClose} onClick={() => setSelected(null)}>✕</button>
            </div>

            {/* Info cards */}
            <div className={styles.detailInfoGrid}>
              <InfoCard icon="🩺" label="Procedimento" value={selected.procedure_name ?? '-'} />
              <InfoCard icon="📅" label="Data e hora" value={formatDate(selected.scheduled_at)} />
              <InfoCard icon="⏱️" label="Duração" value={`${selected.duration_minutes ?? 60} min`} />
              <InfoCard icon="📞" label="Telefone" value={formatPhone(selected.patients?.phone)} />
              {selected.notes && <InfoCard icon="📝" label="Observações" value={selected.notes} fullWidth />}
            </div>

            {/* Alterar status */}
            <div className={styles.detailActions}>
              <p className={styles.detailActionsLabel}>Alterar status</p>
              <div className={styles.statusBtns}>
                {(['agendado','confirmado','concluido','cancelado','faltou'] as const).map((s) => (
                  <button
                    key={s}
                    className={`${styles.statusBtn} ${styles[`statusBtn_${s}`]} ${selected.status === s ? styles.statusBtnActive : ''}`}
                    onClick={() => updateStatus(selected.id, s)}
                  >
                    {STATUS_ICONS[s]} {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* Ações */}
            <div className={styles.detailFooter}>
              {selected.patients?.phone && (
                <a
                  className={styles.btnWhatsApp}
                  href={`https://wa.me/55${selected.patients.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                    `Olá ${selected.patients.name}! Passando para lembrar da sua consulta em ${formatDate(selected.scheduled_at)}. Qualquer dúvida, estamos à disposição! 😊`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  📲 Lembrete WhatsApp
                </a>
              )}
              <button className={styles.btnGcalLarge} onClick={() => openGCal(selected)}>
                📅 Google Calendar
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

const STATUS_LABELS: Record<string, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  faltou: 'Faltou',
}

const STATUS_ICONS: Record<string, string> = {
  agendado: '🕐',
  confirmado: '✅',
  concluido: '🎉',
  cancelado: '❌',
  faltou: '😔',
}

function InfoCard({ icon, label, value, fullWidth = false }: { icon: string; label: string; value: string; fullWidth?: boolean }) {
  return (
    <div className={`${styles.infoCard} ${fullWidth ? styles.infoCardFull : ''}`}>
      <span className={styles.infoCardIcon}>{icon}</span>
      <div>
        <span className={styles.infoCardLabel}>{label}</span>
        <span className={styles.infoCardValue}>{value}</span>
      </div>
    </div>
  )
}
