'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatDate, formatPhone, formatCurrency } from '@/lib/utils'
import { getGCalToken, isGCalConnected, silentRefreshGCal, fetchGCalEvents, createGCalEvent, updateGCalEvent, deleteGCalEvent, connectGoogleCalendar, disconnectGoogleCalendar, type GCalEvent } from '@/lib/googleCalendar'
import { Portal } from '@/components/ui/Portal'
import { useScrollLock } from '@/hooks/useScrollLock'
import { syncLeadAppointments } from '@/lib/sync-leads'
import { hasWhatsApp } from '@/lib/planGates'
import { useProfessionals, useProcedures, useAgendaData } from '@/hooks/useClinicData'
import { useQueryClient } from '@tanstack/react-query'
import type { Appointment, Patient, Professional, Procedure } from '@/types'
import { type CalendarEvent, type FullCalendarHandle } from '@/components/agenda/FullCalendarWrapper'
import styles from './agenda.module.css'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { Icon } from '@/components/ui/Icon'

const FullCalendarWrapper = dynamic(
  () => import('@/components/agenda/FullCalendarWrapper'),
  { ssr: false, loading: () => <div className={styles.calLoading}>Carregando calendário...</div> }
)

interface NewAppt {
  patient_id: string
  professional_id: string
  procedure_id: string
  procedure_name: string
  procedure_price: string
  scheduled_at: string
  duration_minutes: number
  status: string
  notes: string
}

const BLANK: NewAppt = {
  patient_id: '', professional_id: '', procedure_id: '', procedure_name: '', procedure_price: '',
  scheduled_at: '', duration_minutes: 60, status: 'agendado', notes: '',
}

type ViewMode = 'mes' | 'semana' | 'dia'

// 30-min slots from 07:00 to 19:00
const TIME_SLOTS: string[] = []
for (let h = 7; h <= 19; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 19) TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`)
}

const PROF_COLORS = [
  '#4DD9C0', '#0B9B85', '#127C9A', '#2F6FB0',
  '#7C5CBF', '#E0735A', '#E8A838', '#3BAD88',
  '#CF4B8B', '#5A9E5C',
]

function profColor(profId: string | null, profIndex: Record<string, number>): string {
  if (!profId) return '#9BB5B3'
  const idx = profIndex[profId] ?? 0
  return PROF_COLORS[idx % PROF_COLORS.length]
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

const STATUS_LABELS: Record<string, string> = {
  agendado: 'Agendado', confirmado: 'Confirmado',
  concluido: 'Concluído', cancelado: 'Cancelado', faltou: 'Faltou',
}
const STATUS_DOTS: Record<string, string> = {
  agendado: '#94A3B8', confirmado: '#4DD9C0', concluido: '#10B981', cancelado: '#EF4444', faltou: '#F59E0B',
}
// Cores mais distintas para o FullCalendar (evita coincidência com profColor teal)
const STATUS_CAL: Record<string, string> = {
  agendado: '#3B82F6', confirmado: '#10B981', concluido: '#6B7280', cancelado: '#EF4444', faltou: '#F59E0B',
}

// ── Helper: format time range ──────────────────────────────────
function fmtTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
function fmtEndTime(iso: string, durationMin: number) {
  const d = new Date(new Date(iso).getTime() + durationMin * 60000)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// ── Topbar date helpers ────────────────────────────────────────
function fmtTopbarDate(d: Date) {
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
}
function fmtTopbarWeekday(d: Date) {
  return d.toLocaleDateString('pt-BR', { weekday: 'long' })
}

// ── InfoCard ───────────────────────────────────────────────────
function InfoCard({ label, value, fullWidth = false }: {
  label: string; value: string; fullWidth?: boolean
}) {
  return (
    <div className={`${styles.infoCard} ${fullWidth ? styles.infoCardFull : ''}`}>
      <div>
        <span className={styles.infoCardLabel}>{label}</span>
        <span className={styles.infoCardValue}>{value}</span>
      </div>
    </div>
  )
}

// ── SVG icons ──────────────────────────────────────────────────
const ChevronLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
)
const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
)
const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)
const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)

// ── Appointment detail content (shared between panel & modal) ──
function ApptDetailContent({
  appt,
  profColorIdx,
  onUpdateStatus,
  onGCal,
  onClose,
  onEdit,
  onDelete,
  onPhoneAdded,
}: {
  appt: Appointment
  profColorIdx: Record<string, number>
  onUpdateStatus: (id: string, status: string) => void
  onGCal: (a: Appointment) => void
  onClose: () => void
  onEdit: (a: Appointment) => void
  onDelete: (a: Appointment) => void
  onPhoneAdded?: (patientId: string, phone: string) => void
}) {
  const color = profColor(appt.professional_id, profColorIdx)
  const [showPhoneInput, setShowPhoneInput] = useState(false)
  const [phoneInput, setPhoneInput] = useState('')
  const [savingPhone, setSavingPhone] = useState(false)

  async function savePhone() {
    if (!phoneInput.trim() || !appt.patient_id) return
    setSavingPhone(true)
    await supabase.from('patients').update({ phone: phoneInput.trim() }).eq('id', appt.patient_id)
    setSavingPhone(false)
    setShowPhoneInput(false)
    onPhoneAdded?.(appt.patient_id, phoneInput.trim())
  }
  return (
    <>
      <div className={styles.detailHeader}>
        <div className={styles.detailPatientInfo}>
          <div className={styles.detailAvatar} style={{ background: color }}>
            {(appt.patients?.name ?? 'P').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
          </div>
          <div>
            <div className={styles.detailName}>{appt.patients?.name ?? 'Agendamento'}</div>
            <span className={`${styles.detailStatusBadge} ${styles[`badge_${appt.status ?? 'agendado'}`]}`}>
              {STATUS_LABELS[appt.status ?? ''] ?? appt.status}
            </span>
          </div>
        </div>
        <button className={styles.btnClose} onClick={onClose}><Icon name="close" size={18} /></button>
      </div>

      <div className={styles.detailBody}>
        <div className={styles.detailInfoGrid}>
          <InfoCard label="Procedimento" value={appt.procedure_name ?? '-'} />
          <InfoCard label="Data e hora" value={formatDate(appt.scheduled_at)} />
          <InfoCard label="Duração" value={`${appt.duration_minutes ?? 60} min`} />
          <InfoCard label="Telefone" value={formatPhone(appt.patients?.phone)} />
          {appt.professionals?.name && (
            <InfoCard label="Profissional" value={appt.professionals.name} />
          )}
          {appt.notes && <InfoCard label="Observações" value={appt.notes} fullWidth />}
        </div>

        <div className={styles.detailActions}>
          <p className={styles.detailActionsLabel}>Alterar status</p>
          <div className={styles.statusBtns}>
            {(['agendado','confirmado','concluido','cancelado','faltou'] as const).map(s => (
              <button
                key={s}
                className={`${styles.statusBtn} ${styles[`statusBtn_${s}`]} ${appt.status === s ? styles.statusBtnActive : ''}`}
                onClick={() => onUpdateStatus(appt.id, s)}
              >
                <span className={styles.statusDot} style={{ background: STATUS_DOTS[s] }} />
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.detailFooter}>
        <div className={styles.detailFooterWa}>
          {appt.patients?.phone ? (
            <>
              <a
                className={styles.btnWhatsApp}
                href={`https://wa.me/55${appt.patients.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                  `Olá, ${appt.patients.name?.split(' ')[0]}! Passando para lembrar da sua consulta marcada para ${formatDate(appt.scheduled_at)}. Até lá!`
                )}`}
                target="_blank" rel="noopener noreferrer"
              >Lembrar</a>
              <a
                className={styles.btnChat}
                href={`https://wa.me/55${appt.patients.phone.replace(/\D/g, '')}`}
                target="_blank" rel="noopener noreferrer"
              >Conversar</a>
            </>
          ) : showPhoneInput ? (
            <div className={styles.phoneInputRow}>
              <input
                className={styles.phoneInput}
                type="tel"
                placeholder="(11) 99999-9999"
                value={phoneInput}
                onChange={e => setPhoneInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') savePhone(); if (e.key === 'Escape') setShowPhoneInput(false) }}
                autoFocus
              />
              <button className={styles.btnPhoneSave} onClick={savePhone} disabled={savingPhone || !phoneInput.trim()}>
                {savingPhone ? '...' : 'Salvar'}
              </button>
              <button className={styles.btnPhoneCancel} onClick={() => setShowPhoneInput(false)}><Icon name="close" size={14} /></button>
            </div>
          ) : (
            <button className={styles.btnWhatsAppNoPhone} onClick={() => setShowPhoneInput(true)}>
              + Adicionar telefone
            </button>
          )}
        </div>
        <div className={styles.detailFooterActions}>
          <button className={styles.btnDetailEdit} onClick={() => onEdit(appt)}>Editar</button>
          <button className={styles.btnDetailDelete} onClick={() => onDelete(appt)}>Excluir</button>
          {!appt.gcal_event_id && (
            <button className={styles.btnGcalLarge} onClick={() => onGCal(appt)}>
              + Google Agenda
            </button>
          )}
          {appt.gcal_event_id && (
            <span className={styles.gcalSynced}><Icon name="check" size={12} /> Google Agenda</span>
          )}
        </div>
      </div>
    </>
  )
}

// ── Main component ─────────────────────────────────────────────
function AgendaContent() {
  const { clinic, user, setSession } = useAuthStore()
  const queryClient = useQueryClient()
  const { data: agendaData, isLoading: loading } = useAgendaData(clinic?.id)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const { data: professionals = [] } = useProfessionals(clinic?.id)
  const { data: procedures = [] } = useProcedures(clinic?.id)
  const [viewMode, setViewMode] = useState<ViewMode>('dia')
  const calRef = useRef<FullCalendarHandle>(null)
  const [calendarTitle, setCalendarTitle] = useState('')
  const [hiddenProfIds, setHiddenProfIds] = useState<Set<string>>(new Set())
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<NewAppt>(BLANK)
  const [saving, setSaving] = useState(false)
  const [syncToGCal, setSyncToGCal] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [selectedGcal, setSelectedGcal] = useState<GCalEvent | null>(null)
  const [gcalEvents, setGcalEvents] = useState<GCalEvent[]>([])
  const [gcalConnected, setGcalConnected] = useState(false)
  const [gcalError, setGcalError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [showNewPatient, setShowNewPatient] = useState(false)
  const [npName, setNpName] = useState('')
  const [npPhone, setNpPhone] = useState('')
  const [savingPatient, setSavingPatient] = useState(false)
  const [patientSearch, setPatientSearch] = useState('')
  const [showPatientDrop, setShowPatientDrop] = useState(false)

  // On mobile (<900px), show detail as overlay; on desktop, as side panel
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width:900px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useScrollLock(showModal || !!selectedGcal || (isMobile && !!selected))

  // Sync hook cache → local state (enables optimistic mutations while keeping cache benefit)
  useEffect(() => {
    if (agendaData) {
      setAppointments(agendaData.appointments)
      setPatients(agendaData.patients)
    }
  }, [agendaData])

  function loadData() {
    queryClient.invalidateQueries({ queryKey: ['agenda', clinic?.id] })
  }

  useEffect(() => {
    const connected = isGCalConnected(clinic?.gcalConnected)
    setGcalConnected(connected)
    setSyncToGCal(connected)
  }, [clinic?.gcalConnected])

  const loadGCalEvents = useCallback(async (token: string, profs: Professional[]) => {
    try {
      const now = new Date()
      const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
      const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString()
      const calendarIds = ['primary', ...profs.map(p => p.google_calendar_id).filter((id): id is string => !!id)]
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

  const profColorIndex = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {}
    professionals.forEach((p, i) => { map[p.id] = i })
    return map
  }, [professionals])

  // Map slot → patient first name for busy slots on the selected date/professional
  const slotBusyMap = useMemo<Map<string, string>>(() => {
    const dateStr = form.scheduled_at.slice(0, 10)
    if (!dateStr) return new Map()
    const map = new Map<string, string>()
    appointments.forEach(a => {
      if (!a.scheduled_at || a.status === 'cancelado') return
      if (editingId && a.id === editingId) return
      if (form.professional_id && a.professional_id !== form.professional_id) return
      if (localDateStr(new Date(a.scheduled_at)) !== dateStr) return
      const aStartMs = new Date(a.scheduled_at).getTime()
      const aEndMs = aStartMs + (a.duration_minutes ?? 60) * 60000
      TIME_SLOTS.forEach(slot => {
        const slotMs = new Date(`${dateStr}T${slot}:00`).getTime()
        if (aStartMs < slotMs + 30 * 60000 && aEndMs > slotMs && !map.has(slot)) {
          map.set(slot, a.patients?.name?.split(' ')[0] ?? 'Ocupado')
        }
      })
    })
    return map
  }, [appointments, form.scheduled_at, form.professional_id, editingId])

  function toggleProfFilter(profId: string) {
    setHiddenProfIds(prev => {
      const next = new Set(prev)
      if (next.has(profId)) next.delete(profId)
      else next.add(profId)
      return next
    })
  }

  // Agendamentos visíveis após o filtro de profissionais (chips com anel colorido na TopBar)
  const visibleAppointments = useMemo(
    () => appointments.filter(a => !hiddenProfIds.has(a.professional_id ?? '')),
    [appointments, hiddenProfIds]
  )

  const calendarEvents = useMemo<CalendarEvent[]>(() => {
    const clinicEvents: CalendarEvent[] = visibleAppointments.map(a => {
      const start = a.scheduled_at
      let end: string | undefined
      if (start) {
        const startDt = new Date(start)
        const endDt = new Date(startDt.getTime() + (a.duration_minutes ?? 60) * 60000)
        // Cap at 23:59:59 of the same local day to prevent FullCalendar multi-day rendering
        const endOfDay = new Date(startDt)
        endOfDay.setHours(23, 59, 59, 999)
        end = (endDt > endOfDay ? endOfDay : endDt).toISOString()
      }
      return {
        id: a.id,
        title: `${a.patients?.name ?? 'Paciente'} — ${a.procedure_name ?? 'Consulta'}`,
        start, end,
        color: STATUS_CAL[a.status ?? 'agendado'] ?? STATUS_CAL.agendado,
        extendedProps: { appt: a },
      }
    })
    const gEvents: CalendarEvent[] = gcalEvents.map(e => ({
      id: `gcal-${e.id}`,
      title: e.summary,
      start: e.start.dateTime ?? e.start.date ?? '',
      end: e.end.dateTime ?? e.end.date,
      color: '#4285F4',
      extendedProps: { gcal: true, link: e.htmlLink },
    }))
    return [...clinicEvents, ...gEvents]
  }, [visibleAppointments, gcalEvents])

  // Helper: local date string "YYYY-MM-DD" from a Date object (respects timezone)
  function localDateStr(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  // Agendamentos do dia em foco, com busca e filtro de status (visão Dia)
  const filtered = useMemo(() => {
    const targetDate = localDateStr(currentDate)
    return visibleAppointments.filter(a => {
      const matchStatus = !filterStatus || a.status === filterStatus
      const matchDate = a.scheduled_at && localDateStr(new Date(a.scheduled_at)) === targetDate
      const matchSearch = !searchQ ||
        a.patients?.name?.toLowerCase().includes(searchQ.toLowerCase()) ||
        a.procedure_name?.toLowerCase().includes(searchQ.toLowerCase()) ||
        a.professionals?.name?.toLowerCase().includes(searchQ.toLowerCase())
      return matchStatus && matchDate && matchSearch
    })
  }, [visibleAppointments, filterStatus, currentDate, searchQ])

  // Date nav
  function prevDay() { setCurrentDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() - 1); return nd }) }
  function nextDay() { setCurrentDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() + 1); return nd }) }
  function goToday() { setCurrentDate(new Date()) }

  const isCalendarView = viewMode === 'mes' || viewMode === 'semana'

  // Troca de visão preservando a data em foco — o calendário e a data (Dia/Lista)
  // são mantidos em sincronia para que a navegação da TopBar seja única e contínua.
  function switchView(next: ViewMode) {
    const wasCalendar = isCalendarView
    const isNextCalendar = next === 'mes' || next === 'semana'
    if (wasCalendar && !isNextCalendar) {
      const d = calRef.current?.getDate()
      if (d) setCurrentDate(d)
    } else if (!wasCalendar && isNextCalendar) {
      calRef.current?.gotoDate(currentDate)
    }
    setViewMode(next)
  }

  // Mantém o FullCalendar na visão certa (Mês/Semana) sem desmontar o componente
  useEffect(() => {
    if (viewMode === 'mes') calRef.current?.changeView('dayGridMonth')
    else if (viewMode === 'semana') calRef.current?.changeView('timeGridWeek')
  }, [viewMode])

  // Navegação unificada da TopBar — dirige o FullCalendar (Mês/Semana) ou currentDate (Dia/Lista)
  function handlePrev() { isCalendarView ? calRef.current?.prev() : prevDay() }
  function handleNext() { isCalendarView ? calRef.current?.next() : nextDay() }
  function handleToday() { isCalendarView ? calRef.current?.today() : goToday() }

  // Faixa de 7 dias (3 antes / 3 depois do dia atual) para o date-picker deslizante do mobile
  const dateStripDays = useMemo(() => {
    const days: Date[] = []
    for (let i = -3; i <= 3; i++) {
      const d = new Date(currentDate)
      d.setDate(d.getDate() + i)
      days.push(d)
    }
    return days
  }, [currentDate])

  function handleEventClick(id: string) {
    if (id.startsWith('gcal-')) {
      const gcalId = id.replace('gcal-', '')
      const ev = gcalEvents.find(e => e.id === gcalId)
      if (ev) setSelectedGcal(ev)
      return
    }
    const appt = appointments.find(a => a.id === id)
    if (appt) setSelected(appt)
  }

  function handleDateSelect(dateStr: string) {
    setForm({ ...BLANK, scheduled_at: dateStr.length <= 10 ? dateStr + 'T09:00' : dateStr })
    setShowModal(true)
  }

  async function handleSave() {
    if (!clinic || !form.patient_id || !form.scheduled_at) return
    const duration = Number(form.duration_minutes)
    if (!Number.isFinite(duration) || duration < 15) {
      setSaveError('A duração deve ser de pelo menos 15 minutos.')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      const scheduledAtISO = new Date(form.scheduled_at).toISOString()
      const professionalId = form.professional_id || null
      const procId = (form.procedure_id && form.procedure_id !== 'outro') ? form.procedure_id : null
      const procName = procId
        ? (procedures.find(p => p.id === procId)?.name ?? form.procedure_name)
        : (form.procedure_name || null)
      const patient = patients.find(p => p.id === form.patient_id)

      if (professionalId) {
        const startMs = new Date(scheduledAtISO).getTime()
        const endISO = new Date(startMs + duration * 60000).toISOString()
        const { data: conflicts } = await supabase
          .from('appointments')
          .select('id, scheduled_at, duration_minutes')
          .eq('clinic_id', clinic.id)
          .eq('professional_id', professionalId)
          .neq('status', 'cancelado')
          .lt('scheduled_at', endISO)
        const overlap = (conflicts ?? []).some(c => {
          if (editingId && c.id === editingId) return false
          const cStart = new Date(c.scheduled_at).getTime()
          const cEnd = cStart + (c.duration_minutes ?? 60) * 60000
          return cStart < startMs + duration * 60000 && startMs < cEnd
        })
        if (overlap) {
          setSaveError('Este profissional já tem agendamento nesse horário.')
          return
        }
      }

      const payload = {
        patient_id: form.patient_id,
        professional_id: professionalId,
        procedure_id: procId,
        procedure_name: procName,
        procedure_price: form.procedure_price ? parseFloat(form.procedure_price) : null,
        scheduled_at: scheduledAtISO,
        duration_minutes: duration,
        status: form.status,
        notes: form.notes || null,
      }

      if (editingId) {
        const { error: updateErr } = await supabase
          .from('appointments')
          .update(payload)
          .eq('id', editingId)
          .eq('clinic_id', clinic.id)
        if (updateErr) {
          setSaveError(`Erro ao atualizar: ${updateErr.message}`)
          return
        }
        const existingAppt = appointments.find(a => a.id === editingId)
        if (gcalConnected) {
          const token = getGCalToken()
          if (token) {
            const end = new Date(new Date(scheduledAtISO).getTime() + duration * 60000).toISOString()
            const summary = `${procName || 'Consulta'} — ${patient?.name ?? 'Paciente'}`
            if (existingAppt?.gcal_event_id) {
              try {
                await updateGCalEvent(token, existingAppt.gcal_event_id, {
                  summary, description: form.notes || undefined, start: scheduledAtISO, end,
                })
              } catch { /* ignore */ }
            } else if (syncToGCal) {
              try {
                const event = await createGCalEvent(token, {
                  summary, description: form.notes || undefined, start: scheduledAtISO, end,
                })
                if (event.id) {
                  await supabase.from('appointments').update({ gcal_event_id: event.id }).eq('id', editingId)
                }
              } catch { /* ignore */ }
            }
            await loadGCalEvents(token, professionals)
          }
        }
        if (form.status === 'concluido') {
          await ensureRevenueForAppointment({ ...(existingAppt ?? {} as Appointment), ...payload, status: form.status as Appointment['status'], id: editingId })
        } else if (existingAppt?.status === 'concluido' && form.status !== 'concluido') {
          await removeRevenueForAppointment(editingId)
        }
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from('appointments')
          .insert([{ ...payload, clinic_id: clinic.id }])
          .select('id').single()
        if (insertErr) {
          setSaveError(insertErr.code === '23P01'
            ? 'Conflito de horário com outro agendamento.'
            : `Erro ao salvar: ${insertErr.message}`)
          return
        }
        if (syncToGCal && gcalConnected && inserted) {
          const token = getGCalToken()
          if (token) {
            const end = new Date(new Date(scheduledAtISO).getTime() + duration * 60000).toISOString()
            try {
              const event = await createGCalEvent(token, {
                summary: `${procName || 'Consulta'} — ${patient?.name ?? 'Paciente'}`,
                description: form.notes || undefined,
                start: scheduledAtISO, end,
              })
              if (event.id) {
                await supabase.from('appointments').update({ gcal_event_id: event.id }).eq('id', inserted.id)
              }
              await loadGCalEvents(token, professionals)
              if (event.htmlLink) window.open(event.htmlLink, '_blank')
            } catch { /* ignora erro gcal */ }
          }
        }
      }

      setShowModal(false)
      setForm(BLANK)
      setEditingId(null)
      loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('load failed') || msg.toLowerCase().includes('network')) {
        setShowModal(false); setForm(BLANK); setEditingId(null); loadData()
      } else {
        setSaveError(`Erro inesperado: ${msg}`)
      }
    } finally { setSaving(false) }
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('appointments').update({ status }).eq('id', id).eq('clinic_id', clinic!.id)
    const appt = appointments.find(a => a.id === id)
    if (status === 'concluido' && appt) {
      await ensureRevenueForAppointment({ ...appt, status: 'concluido' })
    } else if (appt?.status === 'concluido' && status !== 'concluido') {
      await removeRevenueForAppointment(id)
    }
    if (appt?.gcal_event_id && gcalConnected) {
      const token = getGCalToken()
      if (token) {
          const end = new Date(new Date(appt.scheduled_at).getTime() + (appt.duration_minutes ?? 60) * 60000).toISOString()
        try {
          await updateGCalEvent(token, appt.gcal_event_id, {
            summary: `${appt.procedure_name || 'Consulta'} — ${appt.patients?.name ?? 'Paciente'} [${STATUS_LABELS[status] ?? status}]`,
            description: appt.notes || undefined,
            start: appt.scheduled_at, end,
          })
        } catch { /* ignora */ }
      }
    }
    loadData()
    setSelected(null)
  }

  async function ensureRevenueForAppointment(appt: Appointment) {
    if (!clinic || !appt.procedure_id || !appt.procedure_price || appt.procedure_price <= 0) return
    const { data: existing } = await supabase
      .from('financial_records')
      .select('id')
      .eq('appointment_id', appt.id)
      .maybeSingle()
    if (existing) return
    await supabase.from('financial_records').insert([{
      clinic_id: clinic.id,
      patient_id: appt.patient_id ?? null,
      appointment_id: appt.id,
      procedure_id: appt.procedure_id,
      total_amount: appt.procedure_price,
      category: 'Procedimento',
      type: 'receita',
      payment_method: null,
      notes: appt.procedure_name,
    }])
  }

  async function removeRevenueForAppointment(apptId: string) {
    await supabase.from('financial_records').delete().eq('appointment_id', apptId)
  }

  function closeModal() {
    setShowModal(false)
    setEditingId(null)
    setForm(BLANK)
    setSaveError('')
    setShowNewPatient(false)
    setNpName('')
    setNpPhone('')
    setPatientSearch('')
    setShowPatientDrop(false)
  }

  async function createPatient() {
    if (!clinic || !npName.trim()) return
    setSavingPatient(true)
    const { data, error } = await supabase
      .from('patients')
      .insert([{ clinic_id: clinic.id, name: npName.trim(), phone: npPhone.trim() || null, is_active: true }])
      .select('id, name, phone')
      .single()
    setSavingPatient(false)
    if (error || !data) return
    setPatients(prev => [...prev, data as Patient].sort((a, b) => a.name.localeCompare(b.name)))
    setForm(prev => ({ ...prev, patient_id: data.id }))
    setPatientSearch((data as Patient).name)
    setShowNewPatient(false)
    setNpName('')
    setNpPhone('')
  }

  function openEdit(appt: Appointment) {
    setEditingId(appt.id)
    setForm({
      patient_id: appt.patient_id,
      professional_id: appt.professional_id ?? '',
      procedure_id: appt.procedure_id ?? (appt.procedure_name ? 'outro' : ''),
      procedure_name: appt.procedure_name ?? '',
      procedure_price: appt.procedure_price != null ? String(appt.procedure_price) : '',
      scheduled_at: appt.scheduled_at.slice(0, 16),
      duration_minutes: appt.duration_minutes ?? 60,
      status: appt.status,
      notes: appt.notes ?? '',
    })
    setSelected(null)
    setShowNewPatient(false)
    setNpName('')
    setNpPhone('')
    setPatientSearch(patients.find(p => p.id === appt.patient_id)?.name ?? '')
    setShowPatientDrop(false)
    setShowModal(true)
  }

  async function handleDelete(appt: Appointment) {
    if (!(await confirmDialog({ message: `Excluir agendamento de ${appt.patients?.name ?? 'Paciente'}? Esta ação não pode ser desfeita.`, confirmText: 'Excluir', danger: true }))) return
    if (appt.gcal_event_id && gcalConnected) {
      const token = getGCalToken()
      if (token) {
        try { await deleteGCalEvent(token, appt.gcal_event_id) } catch { /* ignore */ }
      }
    }
    await supabase.from('appointments').delete().eq('id', appt.id).eq('clinic_id', clinic!.id)
    await removeRevenueForAppointment(appt.id)
    setSelected(null)
    loadData()
  }

  function openGCal(appt: Appointment) {
    const start = new Date(appt.scheduled_at)
    const end = new Date(start.getTime() + (appt.duration_minutes ?? 60) * 60000)
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace('.000', '')
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(appt.procedure_name ?? 'Consulta')}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent(`Paciente: ${appt.patients?.name ?? ''}\nTelefone: ${appt.patients?.phone ?? ''}`)}`
    window.open(url, '_blank')
  }

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      {/* ── Topbar ── */}
      <div className={styles.topbar}>
        <div className={styles.tbLeft}>
          <button className={styles.navBtn} onClick={handlePrev} title="Anterior"><ChevronLeft /></button>
          <button className={styles.navBtn} onClick={handleNext} title="Próximo"><ChevronRight /></button>
          <button className={styles.todayBtn} onClick={handleToday}>Hoje</button>
          <div className={styles.tbDate}>
            {isCalendarView ? (
              <h1>{calendarTitle}</h1>
            ) : (
              <>
                <h1>{fmtTopbarDate(currentDate)}</h1>
                <span>{fmtTopbarWeekday(currentDate)}</span>
              </>
            )}
          </div>
        </div>

        <div className={styles.seg}>
          <button
            className={`${styles.segBtn} ${viewMode === 'mes' ? styles.segBtnActive : ''}`}
            onClick={() => switchView('mes')}
          >Mês</button>
          <button
            className={`${styles.segBtn} ${viewMode === 'semana' ? styles.segBtnActive : ''}`}
            onClick={() => switchView('semana')}
          >Semana</button>
          <button
            className={`${styles.segBtn} ${viewMode === 'dia' ? styles.segBtnActive : ''}`}
            onClick={() => switchView('dia')}
          >Dia</button>
        </div>

        <div className={styles.tbRight}>
          {viewMode === 'dia' && (
            <div className={styles.search}>
              <SearchIcon />
              <input
                placeholder="Buscar paciente..."
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
              />
            </div>
          )}

          {professionals.length > 1 && (
            <div className={styles.profFilters}>
              {professionals.map((p, i) => {
                const color = PROF_COLORS[i % PROF_COLORS.length]
                const active = !hiddenProfIds.has(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={styles.profFilterBtn}
                    data-active={active}
                    title={`${active ? 'Ocultar' : 'Mostrar'} ${p.name}`}
                    onClick={() => toggleProfFilter(p.id)}
                  >
                    <span className={styles.profAvatar} style={{ background: color }}>{initials(p.name)}</span>
                  </button>
                )
              })}
              <button
                type="button"
                className={styles.profFilterBtn}
                data-active={!hiddenProfIds.has('')}
                title={`${!hiddenProfIds.has('') ? 'Ocultar' : 'Mostrar'} agendamentos sem profissional`}
                onClick={() => toggleProfFilter('')}
              >
                <span className={`${styles.profAvatar} ${styles.profAvatarNone}`}>—</span>
              </button>
            </div>
          )}

          {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
            gcalConnected ? (
              <div className={styles.gcalStatus}>
                <span className={styles.gcalDot} />
                <span>Google Calendar</span>
                <span className={styles.gcalEventsCount}>{gcalEvents.length} evento(s)</span>
              </div>
            ) : (
              <button className={styles.btnGcalConnect} onClick={handleConnectGCal}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                Vincular Google Calendar
              </button>
            )
          ) : (
            <div className={styles.gcalUnlinked}>
              <span className={styles.gcalDotOff} />
              <span>Google Calendar</span>
            </div>
          )}

          <button className={styles.btnPrimary} onClick={() => setShowModal(true)}>
            <PlusIcon />
            Novo Agendamento
          </button>
        </div>
      </div>

      {gcalError && <p className={styles.gcalErrorMsg}>{gcalError}</p>}

      {/* ── Date strip: date-picker horizontal deslizante (mobile, visões Dia/Lista) ── */}
      {!isCalendarView && (
        <div className={styles.dateStrip}>
          {dateStripDays.map(d => {
            const isToday = localDateStr(d) === localDateStr(new Date())
            const isSel = localDateStr(d) === localDateStr(currentDate)
            return (
              <button
                key={localDateStr(d)}
                type="button"
                className={`${styles.dateStripItem} ${isSel ? styles.dateStripItemSel : ''} ${isToday ? styles.dateStripItemToday : ''}`}
                onClick={() => setCurrentDate(d)}
              >
                <span className={styles.dateStripDow}>{d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</span>
                <span className={styles.dateStripNum}>{d.getDate()}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Filtro de profissionais (mobile): chips com avatar + nome, rolagem horizontal ── */}
      {professionals.length > 1 && (
        <div className={styles.profFiltersMobile}>
          {professionals.map((p, i) => {
            const color = PROF_COLORS[i % PROF_COLORS.length]
            const active = !hiddenProfIds.has(p.id)
            return (
              <button
                key={p.id}
                type="button"
                className={styles.profChip}
                data-active={active}
                onClick={() => toggleProfFilter(p.id)}
              >
                <span className={styles.profChipAvatar} style={{ background: color }}>{initials(p.name)}</span>
                {p.name}
              </button>
            )
          })}
          <button
            type="button"
            className={styles.profChip}
            data-active={!hiddenProfIds.has('')}
            onClick={() => toggleProfFilter('')}
          >
            <span className={`${styles.profChipAvatar} ${styles.profAvatarNone}`}>—</span>
            Sem profissional
          </button>
        </div>
      )}

      {/* ── Filters (visão Dia) ── */}
      {viewMode === 'dia' && (
        <div className={styles.filters}>
          <select className={styles.filterInput} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">Todos os status</option>
            <option value="agendado">Agendado</option>
            <option value="confirmado">Confirmado</option>
            <option value="concluido">Concluído</option>
            <option value="cancelado">Cancelado</option>
            <option value="faltou">Faltou</option>
          </select>
          {filterStatus && (
            <button className={styles.btnClear} onClick={() => setFilterStatus('')}>Limpar</button>
          )}
        </div>
      )}

      {/* ── Stage ── */}
      {loading ? (
        <div className={styles.loadingWrap}>
          <div className={styles.spinner} />
          Carregando agenda...
        </div>
      ) : (
        <div className={styles.stage}>
          <div className={styles.calWrap}>
            {isCalendarView ? (
              <div className={styles.calendarWrap}>
                <FullCalendarWrapper
                  ref={calRef}
                  view={viewMode === 'mes' ? 'dayGridMonth' : 'timeGridWeek'}
                  events={calendarEvents}
                  onEventClick={handleEventClick}
                  onDateSelect={handleDateSelect}
                  onTitleChange={setCalendarTitle}
                />
                <p className={styles.calHint}>Clique num evento para ver detalhes • Clique numa data para criar agendamento</p>
              </div>
            ) : (
              /* ── Visão Dia: cards com trilho de horário ── */
              <div className={styles.listScroll}>
                {filtered.length === 0 ? (
                  <div className={styles.listEmpty}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    <span>Nenhum agendamento para este dia</span>
                    <button className={styles.btnPrimary} onClick={() => setShowModal(true)} style={{ marginTop: 4 }}>
                      <PlusIcon /> Novo Agendamento
                    </button>
                  </div>
                ) : (
                  <div className={styles.lrList}>
                    {filtered.map(a => {
                      const color = profColor(a.professional_id, profColorIndex)
                      return (
                        <div key={a.id} className={styles.lrItem}>
                          <div className={styles.lrRailWrap}>
                            <div className={styles.lrRail}>
                              <span className={styles.lrRailTime}>{fmtTime(a.scheduled_at)}</span>
                              <span className={styles.lrRailDur}>{a.duration_minutes ?? 60}min</span>
                            </div>
                            <div className={styles.lrDotLine} />
                          </div>
                          <div
                            className={styles.lrCard}
                            style={{ '--lr-accent': color } as React.CSSProperties}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelected(a)}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(a) } }}
                          >
                            <button
                              className={styles.lrGcal}
                              onClick={e => { e.stopPropagation(); openGCal(a) }}
                              title="Adicionar ao Google Calendar"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            </button>
                            <strong className={styles.lrCardName}>{a.patients?.name ?? '-'}</strong>
                            <span className={styles.lrCardProc}>{a.procedure_name ?? 'Consulta'}</span>
                            <div className={styles.lrCardFoot}>
                              {a.professionals?.name && (
                                <>
                                  <span className={styles.lrProAvatar} style={{ background: color }}>{initials(a.professionals.name)}</span>
                                  <span className={styles.lrProName}>{a.professionals.name}</span>
                                </>
                              )}
                              <span className={`${styles.lrStatus} ${styles[`badge_${a.status ?? 'agendado'}`]}`}>
                                {STATUS_LABELS[a.status ?? ''] ?? a.status}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* FAB — único CTA no mobile (≤600px) */}
            <button className={styles.fab} onClick={() => setShowModal(true)} title="Novo agendamento">
              <PlusIcon />
              <span className={styles.fabLabel}>Novo agendamento</span>
            </button>
          </div>

          {/* ── Side detail panel (desktop, non-mobile) ── */}
          {!isMobile && selected && (
            <div className={styles.panel}>
              <div className={styles.panelInner}>
                <ApptDetailContent
                  appt={selected}
                  profColorIdx={profColorIndex}
                  onUpdateStatus={updateStatus}
                  onGCal={openGCal}
                  onClose={() => setSelected(null)}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onPhoneAdded={(patientId, phone) => {
                    setAppointments(prev => prev.map(a =>
                      a.patient_id === patientId && a.patients
                        ? { ...a, patients: { ...a.patients, phone } }
                        : a
                    ))
                    setSelected(prev => prev && prev.patient_id === patientId && prev.patients
                      ? { ...prev, patients: { ...prev.patients, phone } }
                      : prev
                    )
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Mobile detail overlay ── */}
      {isMobile && selected && (
        <Portal>
          <div className={styles.overlay} onClick={() => setSelected(null)}>
            <div className={styles.detailPanel} onClick={e => e.stopPropagation()}>
              <ApptDetailContent
                appt={selected}
                profColorIdx={profColorIndex}
                onUpdateStatus={updateStatus}
                onGCal={openGCal}
                onClose={() => setSelected(null)}
                onEdit={openEdit}
                onDelete={handleDelete}
                onPhoneAdded={(patientId, phone) => {
                  setAppointments(prev => prev.map(a =>
                    a.patient_id === patientId && a.patients
                      ? { ...a, patients: { ...a.patients, phone } }
                      : a
                  ))
                  setSelected(prev => prev && prev.patient_id === patientId && prev.patients
                    ? { ...prev, patients: { ...prev.patients, phone } }
                    : prev
                  )
                }}
              />
            </div>
          </div>
        </Portal>
      )}

      {/* ── GCal event detail ── */}
      {selectedGcal && (
        <Portal>
          <div className={styles.overlay} onClick={() => setSelectedGcal(null)}>
            <div className={styles.detailPanel} onClick={e => e.stopPropagation()}>
              <div className={styles.detailHeader}>
                <div className={styles.detailPatientInfo}>
                  <div className={styles.detailAvatar} style={{ background: '#4285F4', color: '#fff' }}><Icon name="calendar" size={18} /></div>
                  <div>
                    <div className={styles.detailName}>{selectedGcal.summary}</div>
                    <span className={`${styles.detailStatusBadge} ${styles.badge_confirmado}`}>Google Calendar</span>
                  </div>
                </div>
                <button className={styles.btnClose} onClick={() => setSelectedGcal(null)}><Icon name="close" size={18} /></button>
              </div>
              <div className={styles.detailBody}>
                <div className={styles.detailInfoGrid}>
                  {selectedGcal.start.dateTime && (
                    <InfoCard label="Início" value={new Date(selectedGcal.start.dateTime).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} />
                  )}
                  {selectedGcal.end.dateTime && (
                    <InfoCard label="Término" value={new Date(selectedGcal.end.dateTime).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} />
                  )}
                  {selectedGcal.description && (
                    <InfoCard label="Descrição" value={selectedGcal.description} fullWidth />
                  )}
                </div>
              </div>
              <div className={styles.detailFooter}>
                {selectedGcal.htmlLink && (
                  <a href={selectedGcal.htmlLink} target="_blank" rel="noopener noreferrer" className={styles.btnGcalLarge}>
                    Abrir no Google Calendar
                  </a>
                )}
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* ── New appointment modal ── */}
      {showModal && (
        <Portal>
          <div className={styles.overlay} onClick={closeModal}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2>{editingId ? 'Editar Agendamento' : 'Novo Agendamento'}</h2>
                <button className={styles.btnClose} onClick={closeModal}><Icon name="close" size={18} /></button>
              </div>
              <div className={styles.modalBody}>
                {/* ── Paciente ── */}
                <div className={styles.field}>
                  <div className={styles.fieldLabelRow}>
                    <label>Paciente *</label>
                    <button
                      type="button"
                      className={styles.btnNewPatient}
                      onClick={() => { setShowNewPatient(p => !p); setPatientSearch('') }}
                    >
                      {showNewPatient ? <><Icon name="chevronLeft" size={12} /> Voltar à lista</> : '+ Novo paciente'}
                    </button>
                  </div>
                  {showNewPatient ? (
                    <div className={styles.newPatientForm}>
                      <input
                        placeholder="Nome completo *"
                        value={npName}
                        onChange={e => setNpName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') createPatient() }}
                        autoFocus
                      />
                      <input
                        placeholder="Telefone / WhatsApp"
                        value={npPhone}
                        onChange={e => setNpPhone(e.target.value)}
                        type="tel"
                      />
                      <button
                        type="button"
                        className={styles.btnCreatePatient}
                        onClick={createPatient}
                        disabled={savingPatient || !npName.trim()}
                      >
                        {savingPatient ? 'Criando...' : 'Criar e selecionar'}
                      </button>
                    </div>
                  ) : (
                    <div className={styles.patientCombo}>
                      <input
                        className={`${styles.patientSearch}${form.patient_id ? ` ${styles.patientSearchSelected}` : ''}`}
                        placeholder="Digite o nome do paciente..."
                        value={patientSearch}
                        autoComplete="off"
                        onChange={e => {
                          setPatientSearch(e.target.value)
                          setForm(p => ({ ...p, patient_id: '' }))
                          setShowPatientDrop(true)
                        }}
                        onFocus={() => setShowPatientDrop(true)}
                        onBlur={() => setTimeout(() => setShowPatientDrop(false), 150)}
                      />
                      {form.patient_id && (
                        <span className={styles.patientComboCheck}><Icon name="check" size={12} /></span>
                      )}
                      {showPatientDrop && (
                        <div className={styles.patientDrop}>
                          {patients
                            .filter(p => !patientSearch || p.name.toLowerCase().includes(patientSearch.toLowerCase()))
                            .slice(0, 8)
                            .map(p => (
                              <button
                                key={p.id}
                                type="button"
                                className={`${styles.patientDropItem}${form.patient_id === p.id ? ` ${styles.patientDropItemActive}` : ''}`}
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => {
                                  setForm(prev => ({ ...prev, patient_id: p.id }))
                                  setPatientSearch(p.name)
                                  setShowPatientDrop(false)
                                }}
                              >
                                <span className={styles.patientDropInitial}>
                                  {p.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                                </span>
                                {p.name}
                              </button>
                            ))}
                          {patients.filter(p => !patientSearch || p.name.toLowerCase().includes(patientSearch.toLowerCase())).length === 0 && (
                            <div className={styles.patientDropEmpty}>Nenhum paciente encontrado</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Profissional ── */}
                <div className={styles.field}>
                  <label>Profissional</label>
                  <select value={form.professional_id} onChange={e => setForm(p => ({ ...p, professional_id: e.target.value }))}>
                    <option value="">Sem profissional</option>
                    {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                {/* ── Procedimento ── */}
                <div className={styles.field}>
                  <label>Procedimento</label>
                  <select
                    value={form.procedure_id}
                    onChange={e => {
                      const proc = procedures.find(p => p.id === e.target.value)
                      setForm(prev => ({
                        ...prev,
                        procedure_id: e.target.value,
                        procedure_name: proc ? proc.name : (e.target.value === 'outro' ? '' : prev.procedure_name),
                        procedure_price: proc ? String(proc.price) : (e.target.value === '' ? '' : prev.procedure_price),
                      }))
                    }}
                  >
                    <option value="">Sem procedimento</option>
                    {procedures.filter(p => p.is_active).map(p => (
                      <option key={p.id} value={p.id}>{p.name} — {formatCurrency(p.price)}</option>
                    ))}
                    <option value="outro">Outro (digitar)</option>
                  </select>
                </div>
                {form.procedure_id === 'outro' && (
                  <div className={styles.field}>
                    <input
                      value={form.procedure_name}
                      onChange={e => setForm(p => ({ ...p, procedure_name: e.target.value }))}
                      placeholder="Nome do procedimento..."
                      autoFocus
                    />
                  </div>
                )}
                {form.procedure_id && form.procedure_id !== 'outro' && (
                  <div className={styles.field}>
                    <label>Valor (R$)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.procedure_price}
                      onChange={e => setForm(p => ({ ...p, procedure_price: e.target.value }))}
                      placeholder="0,00"
                    />
                  </div>
                )}

                {/* ── Data ── */}
                <div className={styles.field}>
                  <label>Data *</label>
                  <input
                    type="date"
                    value={form.scheduled_at.slice(0, 10)}
                    onChange={e => {
                      const date = e.target.value
                      const prevTime = form.scheduled_at.slice(11, 16) || '09:00'
                      setForm(p => ({ ...p, scheduled_at: date ? `${date}T${prevTime}` : '' }))
                    }}
                  />
                </div>

                {/* ── Grade de horários ── */}
                <div className={styles.field}>
                  <div className={styles.fieldLabelRow}>
                    <label>Horário *</label>
                    {form.scheduled_at.slice(11, 16) && (
                      <span className={styles.selectedTimeLabel}>
                        {form.scheduled_at.slice(11, 16)} selecionado
                      </span>
                    )}
                  </div>
                  <div className={`${styles.timeGridWrap}${!form.scheduled_at.slice(0, 10) ? ` ${styles.timeGridLocked}` : ''}`}>
                    <div className={styles.timeGrid}>
                      {TIME_SLOTS.map(slot => {
                        const hasDate = !!form.scheduled_at.slice(0, 10)
                        const busyName = hasDate ? slotBusyMap.get(slot) : undefined
                        const isBusy = !!busyName
                        const isSelected = form.scheduled_at.slice(11, 16) === slot
                        return (
                          <button
                            key={slot}
                            type="button"
                            disabled={!hasDate || isBusy}
                            title={!hasDate ? 'Selecione a data primeiro' : isBusy ? `Ocupado — ${busyName}` : `Selecionar ${slot}`}
                            className={`${styles.timeSlot}${isSelected ? ` ${styles.timeSlotSelected}` : ''}${isBusy ? ` ${styles.timeSlotBusy}` : ''}`}
                            onClick={() => setForm(p => ({ ...p, scheduled_at: `${p.scheduled_at.slice(0, 10)}T${slot}` }))}
                          >
                            {slot}
                          </button>
                        )
                      })}
                    </div>
                    {!form.scheduled_at.slice(0, 10) && (
                      <div className={styles.timeGridOverlay}>
                        <span>Escolha a data primeiro</span>
                      </div>
                    )}
                  </div>
                  {form.professional_id && slotBusyMap.size > 0 && (
                    <p className={styles.timeGridHint}>Horários em cinza já estão ocupados para este profissional</p>
                  )}
                </div>

                {/* ── Duração / Status / Notas ── */}
                <div className={styles.field}>
                  <label>Duração (min)</label>
                  <input type="number" value={form.duration_minutes} onChange={e => setForm(p => ({ ...p, duration_minutes: Number(e.target.value) }))} min={15} step={15} />
                </div>
                <div className={styles.field}>
                  <label>Status</label>
                  <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                    <option value="agendado">Agendado</option>
                    <option value="confirmado">Confirmado</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label>Observações</label>
                  <textarea rows={3} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Informações adicionais..." />
                </div>
                {gcalConnected && (
                  <label className={styles.gcalCheck}>
                    <input type="checkbox" checked={syncToGCal} onChange={e => setSyncToGCal(e.target.checked)} />
                    Sincronizar com Google Calendar
                  </label>
                )}
              </div>
              {saveError && <div className={styles.saveErrorMsg}>{saveError}</div>}
              <div className={styles.modalFooter}>
                <button className={styles.btnCancel} onClick={closeModal}>Cancelar</button>
                <button className={styles.btnSave} onClick={handleSave} disabled={saving || !form.patient_id || !form.scheduled_at}>
                  {saving ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Salvar Agendamento'}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  )
}

export default function AgendaPage() {
  return <PermissionGuard module="agenda"><AgendaContent /></PermissionGuard>
}
