'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatDate, formatCurrency } from '@/lib/utils'
import { PhoneInput } from '@/components/ui/PhoneInput'
import { formatBrPhone, isCompleteBrPhone, waMeNumber, PHONE_INCOMPLETE } from '@/lib/phoneFormat'
import { getGCalToken, isGCalConnected, silentRefreshGCal, fetchGCalEvents, createGCalEvent, updateGCalEvent, deleteGCalEvent, connectGoogleCalendar, disconnectGoogleCalendar, type GCalEvent } from '@/lib/googleCalendar'
import { DatePicker } from '@/components/ui/DatePicker'
import { syncLeadAppointments } from '@/lib/sync-leads'
import { useProfessionals, useProcedures, useAgendaData, useWhatsAppState } from '@/hooks/useClinicData'
import { confirmationLabel, type ConfirmationInfo } from '@/lib/whatsapp/labels'
import { whatsappApi } from '@/components/configuracoes/whatsappApi'
import { getSpecialtyConfig } from '@/lib/specialtyConfig'
import { isAdmin, isAdminOrRecepcao, myScopedProfessionalId } from '@/lib/professionalScope'
import { useQueryClient } from '@tanstack/react-query'
import type { Appointment, Patient, Professional, Procedure } from '@/types'
import { type CalendarEvent, type FullCalendarHandle } from '@/components/agenda/FullCalendarWrapper'
import styles from './agenda.module.css'
import btn from '@/components/ui/button.module.css'
import { PageHeader } from '@/components/ui/PageHeader'
import { PillTabs, type PillOption } from '@/components/ui/PillTabs'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { StatusDot, type StatusTone } from '@/components/ui/StatusDot'
import { MiniCalendar } from '@/components/agenda/MiniCalendar'
import { AgendaSidebar } from '@/components/agenda/AgendaSidebar'
import { DayColumns, type DayColumn } from '@/components/agenda/DayColumns'
import { ScheduleEditor } from '@/components/agenda/ScheduleEditor'
import { TeamSchedule } from '@/components/agenda/TeamSchedule'
import { rangeFor, daysWithAppointments, inRange, countByProfessional, daySummary } from '@/lib/agenda/view'
import { useSchedules, scheduleOf } from '@/hooks/useSchedules'
import { buildSlots, canExtraSlot, DEFAULT_SETTINGS } from '@/lib/agenda/settings'
import { closedRanges, freeSlotsOfDay, slotInSchedule, dayStatus, describeDay, summarizeSchedule, weekDates } from '@/lib/agenda/availability'
import { buildBusyMap, conflictInSpan, nextFreeSlots, isClinicBlock, toLocalInput, overlaps, MAX_APPT_MS } from '@/lib/agenda/slots'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import f from '@/components/ui/modalForm.module.css'
import { ensureRevenueForAppointment, notifyRevenuePending, removeRevenueForAppointment, promptCreditUsage } from '@/lib/appointmentRevenue'
import { IntegerInput, MoneyInput } from '@/components/ui/NumericInput'
import { usePageSearch } from '@/store/pageSearch'

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
  /** encaixe: marcar fora da escala do profissional, com motivo */
  extra_mode: boolean
  extra_reason: string
}

const BLANK: NewAppt = {
  patient_id: '', professional_id: '', procedure_id: '', procedure_name: '', procedure_price: '',
  scheduled_at: '', duration_minutes: 60, status: 'agendado', notes: '', extra_mode: false, extra_reason: '',
}

type ViewMode = 'mes' | 'semana' | 'dia'

const PROF_COLORS = [
  '#4DD9C0', '#0B9B85', '#127C9A', '#2F6FB0',
  '#7C5CBF', '#E0735A', '#E8A838', '#3BAD88',
  '#CF4B8B', '#5A9E5C',
]

const STATUS_TONE: Record<string, StatusTone> = {
  agendado: 'wait', confirmado: 'ok', concluido: 'idle', faltou: 'warn', cancelado: 'bad', bloqueado: 'idle',
}

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
  concluido: 'Concluído', cancelado: 'Cancelado', faltou: 'Faltou', bloqueado: 'Bloqueado',
}
const STATUS_DOTS: Record<string, string> = {
  agendado: 'var(--st-wait)', confirmado: 'var(--st-ok)', concluido: 'var(--st-idle)', cancelado: 'var(--st-bad)', faltou: 'var(--st-warn)', bloqueado: 'var(--st-idle)',
}
// Próximo passo natural de cada status: vira o botão de destaque no detalhe da consulta.
const NEXT_STEP: Record<string, { status: string; label: string } | undefined> = {
  agendado: { status: 'confirmado', label: 'Confirmar consulta' },
  confirmado: { status: 'concluido', label: 'Concluir consulta' },
}

interface BlockForm {
  professional_id: string
  scheduled_at: string
  duration_minutes: number
  notes: string
}
const BLANK_BLOCK: BlockForm = { professional_id: '', scheduled_at: '', duration_minutes: 60, notes: '' }

// ── Helper: format time range ──────────────────────────────────
function fmtTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
/** "segunda-feira, 2 de novembro · 10:00" (com o ano só quando não é o corrente) */
function fmtWhen(iso: string) {
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  const day = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) })
  return `${day} · ${fmtTime(iso)}`
}
function fmtEndTime(iso: string, durationMin: number) {
  const d = new Date(new Date(iso).getTime() + durationMin * 60000)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// ── Conflito de horário ────────────────────────────────────────
/**
 * Confere no banco se o profissional já está ocupado em [início, início + duração).
 * Considera as consultas dele e os bloqueios da clínica toda (sem profissional).
 * Busca só a janela que pode alcançar o horário (uma consulta dura no máximo 12 h), para não esbarrar
 * no limite de 1000 linhas do banco em quem tem muito histórico.
 */
async function checkConflict(
  clinicId: string, professionalId: string, startMs: number, durationMin: number, ignoreId?: string | null,
): Promise<'conflict' | 'free' | 'error'> {
  const endMs = startMs + durationMin * 60000
  const { data, error } = await supabase
    .from('appointments')
    .select('id, scheduled_at, duration_minutes')
    .eq('clinic_id', clinicId)
    .or(`professional_id.eq.${professionalId},and(professional_id.is.null,status.eq.bloqueado)`)
    .neq('status', 'cancelado')
    .gte('scheduled_at', new Date(startMs - MAX_APPT_MS).toISOString())
    .lt('scheduled_at', new Date(endMs).toISOString())
  if (error) return 'error'
  const hit = (data ?? []).some(c => {
    if (ignoreId && c.id === ignoreId) return false
    const cStart = new Date(c.scheduled_at).getTime()
    return overlaps(startMs, endMs, cStart, cStart + (c.duration_minutes ?? 60) * 60000)
  })
  return hit ? 'conflict' : 'free'
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
const LockIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>
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
  onReschedule,
  onDelete,
  canDelete,
  onArrive,
  onPhoneAdded,
  confirmation,
  whatsappConnected,
  onWhatsAppSent,
}: {
  appt: Appointment
  profColorIdx: Record<string, number>
  onUpdateStatus: (id: string, status: string) => void
  onGCal: (a: Appointment) => void
  onClose: () => void
  onEdit: (a: Appointment) => void
  onReschedule: (a: Appointment) => void
  onDelete: (a: Appointment) => void
  /** excluir fica só com o administrador; a recepção cancela */
  canDelete: boolean
  onArrive: (a: Appointment, arrived: boolean) => void
  onPhoneAdded?: (patientId: string, phone: string) => void
  confirmation?: ConfirmationInfo
  whatsappConnected?: boolean
  onWhatsAppSent?: () => void
}) {
  const color = profColor(appt.professional_id, profColorIdx)
  // instante em que o detalhe foi aberto (não chamar Date.now() direto no render)
  const [openedAt] = useState(() => Date.now())
  const [waSending, setWaSending] = useState(false)
  const isDemo = useAuthStore(s => s.clinic?.demoMode === true)
  const [waMsg, setWaMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const waLabel = confirmation ? confirmationLabel(confirmation) : null
  const canSendWa =
    !!whatsappConnected && !!appt.patient_id &&
    (appt.status === 'agendado' || appt.status === 'confirmado') &&
    new Date(appt.scheduled_at).getTime() > openedAt

  async function sendWhatsAppNow() {
    setWaSending(true); setWaMsg(null)
    try {
      await whatsappApi('/api/whatsapp/send-now', { method: 'POST', body: { appointmentId: appt.id } })
      setWaMsg({ ok: true, text: 'Mensagem enviada.' })
      onWhatsAppSent?.()
    } catch (e) {
      setWaMsg({ ok: false, text: e instanceof Error ? e.message : 'Não foi possível enviar.' })
    } finally {
      setWaSending(false)
    }
  }
  const [showPhoneInput, setShowPhoneInput] = useState(false)
  const [phoneInput, setPhoneInput] = useState('')
  const [savingPhone, setSavingPhone] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [showStatus, setShowStatus] = useState(false)
  const nextStep = NEXT_STEP[appt.status ?? '']
  const canReschedule = appt.status !== 'concluido'
  // chegada: só no dia da consulta e enquanto ela está agendada ou confirmada
  const waiting = appt.status === 'agendado' || appt.status === 'confirmado'
  const isToday = new Date(appt.scheduled_at).toDateString() === new Date(openedAt).toDateString()
  const canArrive = waiting && isToday
  // confirmada, hoje e ainda sem chegada: o passo da vez é receber o paciente; depois, concluir
  const arriveIsPrimary = canArrive && !appt.arrived_at && appt.status === 'confirmado'

  async function savePhone() {
    if (!appt.patient_id) return
    if (!isCompleteBrPhone(phoneInput)) { showToast('error', PHONE_INCOMPLETE); return }
    setSavingPhone(true)
    await supabase.from('patients').update({ phone: phoneInput }).eq('id', appt.patient_id)
    setSavingPhone(false)
    setShowPhoneInput(false)
    onPhoneAdded?.(appt.patient_id, phoneInput)
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
        <button type="button" className={styles.btnClose} onClick={onClose} aria-label="Fechar"><Icon name="close" size={18} /></button>
      </div>

      <div className={styles.detailBody}>
        <div className={styles.detailInfoGrid}>
          <InfoCard label="Procedimento" value={appt.procedure_name ?? '-'} fullWidth />
          <InfoCard label="Data e hora" value={fmtWhen(appt.scheduled_at)} fullWidth />
          <InfoCard label="Duração" value={`${appt.duration_minutes ?? 60} min`} />
          {appt.professionals?.name && (
            <InfoCard label="Profissional" value={appt.professionals.name} />
          )}
          {appt.patients?.phone && <InfoCard label="Telefone" value={formatBrPhone(appt.patients.phone) || '-'} />}
          {appt.arrived_at && <InfoCard label="Chegada" value={fmtTime(appt.arrived_at)} />}
          {appt.extra_slot_reason && <InfoCard label="Encaixe fora da escala" value={appt.extra_slot_reason} fullWidth />}
          {appt.notes && <InfoCard label="Observações" value={appt.notes} fullWidth />}
        </div>

        {(waLabel || canSendWa) && (
          <div className={styles.waBox}>
            <p className={styles.detailActionsLabel}>Confirmação pelo WhatsApp</p>
            {waLabel && <span className={`${styles.waChip} ${styles[`waTone_${waLabel.tone}`]}`}>{waLabel.text}</span>}
            {canSendWa && (
              <button className={styles.waBtn} onClick={sendWhatsAppNow} disabled={waSending || isDemo} aria-describedby={isDemo ? 'agenda-demo-wa-note' : undefined}>
                {waSending ? 'Enviando…' : confirmation ? 'Reenviar mensagem agora' : 'Enviar confirmação agora'}
              </button>
            )}
            {isDemo && <span id="agenda-demo-wa-note" className={styles.waHint}>Envio de mensagens desativado na conta de demonstração.</span>}
            {waMsg && <span className={waMsg.ok ? styles.waOk : styles.waErr} role="status">{waMsg.text}</span>}
          </div>
        )}

        <div className={styles.detailActions}>
          {arriveIsPrimary ? (
            <button type="button" className={styles.btnNextStep} onClick={() => onArrive(appt, true)}>Paciente chegou</button>
          ) : nextStep && (
            <button type="button" className={styles.btnNextStep} onClick={() => onUpdateStatus(appt.id, nextStep.status)}>
              {nextStep.label}
            </button>
          )}
          {canArrive && !arriveIsPrimary && !appt.arrived_at && (
            <button type="button" className={styles.btnArrive} onClick={() => onArrive(appt, true)}>Paciente chegou</button>
          )}
          {canArrive && appt.arrived_at && (
            <button type="button" className={styles.btnUndoArrive} onClick={() => onArrive(appt, false)}>Desfazer chegada</button>
          )}
          <button type="button" className={styles.statusToggle} onClick={() => setShowStatus(v => !v)} aria-expanded={showStatus}>
            Alterar status
          </button>
          {showStatus && (
            <div className={styles.statusBtns}>
              {(['agendado','confirmado','concluido','cancelado','faltou'] as const).filter(st => st !== appt.status).map(st => (
                <button
                  key={st}
                  type="button"
                  className={`${styles.statusBtn} ${styles[`statusBtn_${st}`]}`}
                  onClick={() => { setShowStatus(false); onUpdateStatus(appt.id, st) }}
                >
                  <span className={styles.statusDot} style={{ background: STATUS_DOTS[st] }} />
                  {STATUS_LABELS[st]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={styles.detailFooter}>
        <div className={styles.detailFooterWa}>
          {waMeNumber(appt.patients?.phone) ? (
            <>
              <a
                className={styles.btnWhatsApp}
                href={isDemo ? undefined : `https://wa.me/${waMeNumber(appt.patients?.phone)}?text=${encodeURIComponent(
                  `Olá, ${appt.patients?.name?.split(' ')[0]}! Passando para lembrar da sua consulta marcada para ${formatDate(appt.scheduled_at)}. Até lá!`
                )}`}
                target="_blank" rel="noopener noreferrer"
                aria-disabled={isDemo || undefined}
                aria-describedby={isDemo ? 'agenda-demo-wa-note-footer' : undefined}
                onClick={isDemo ? e => e.preventDefault() : undefined}
              >Lembrar</a>
              <a
                className={styles.btnChat}
                href={isDemo ? undefined : `https://wa.me/${waMeNumber(appt.patients?.phone)}`}
                target="_blank" rel="noopener noreferrer"
                aria-disabled={isDemo || undefined}
                aria-describedby={isDemo ? 'agenda-demo-wa-note-footer' : undefined}
                onClick={isDemo ? e => e.preventDefault() : undefined}
              >Conversar</a>
              {isDemo && <span id="agenda-demo-wa-note-footer" className={styles.waHint}>Envio de mensagens desativado na conta de demonstração.</span>}
            </>
          ) : showPhoneInput ? (
            <div className={styles.phoneInputRow}>
              <PhoneInput
                className={styles.phoneInput}
                value={phoneInput}
                onChange={setPhoneInput}
                onKeyDown={e => { if (e.key === 'Enter') savePhone(); if (e.key === 'Escape') setShowPhoneInput(false) }}
                autoFocus
              />
              <button className={styles.btnPhoneSave} onClick={savePhone} disabled={savingPhone || !isCompleteBrPhone(phoneInput)}>
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
          {canReschedule && <button className={styles.btnDetailEdit} onClick={() => onReschedule(appt)}>Remarcar</button>}
          <button className={styles.btnDetailEdit} onClick={() => onEdit(appt)}>Editar</button>
          <button className={styles.btnDetailEdit} onClick={() => setShowMore(v => !v)} aria-expanded={showMore}>Mais</button>
        </div>
        {showMore && (
          <div className={styles.moreActions}>
            {appt.gcal_event_id ? (
              <span className={styles.gcalSynced}><Icon name="check" size={12} /> No Google Agenda</span>
            ) : (
              <button type="button" className={styles.btnGcalLarge} onClick={() => onGCal(appt)}>Adicionar ao Google Agenda</button>
            )}
            {canDelete && <button type="button" className={styles.btnDetailDelete} onClick={() => onDelete(appt)}>Excluir consulta</button>}
          </div>
        )}
      </div>
    </>
  )
}

// ── Block detail content (bloqueio de horário) ──────────────────
function BlockDetailContent({ appt, onClose, onDelete }: {
  appt: Appointment
  onClose: () => void
  onDelete: (a: Appointment) => void
}) {
  return (
    <>
      <div className={styles.detailHeader}>
        <div className={styles.detailPatientInfo}>
          <div className={styles.detailAvatar} style={{ background: '#9CA3AF', color: '#fff' }}><Icon name="ban" size={18} /></div>
          <div>
            <div className={styles.detailName}>Horário bloqueado</div>
            <span className={`${styles.detailStatusBadge} ${styles.badge_bloqueado}`}>Bloqueado</span>
          </div>
        </div>
        <button type="button" className={styles.btnClose} onClick={onClose} aria-label="Fechar"><Icon name="close" size={18} /></button>
      </div>
      <div className={styles.detailBody}>
        <div className={styles.detailInfoGrid}>
          <InfoCard label="Data e hora" value={formatDate(appt.scheduled_at)} />
          <InfoCard label="Duração" value={`${appt.duration_minutes ?? 60} min`} />
          {appt.professionals?.name && <InfoCard label="Profissional" value={appt.professionals.name} />}
          {appt.notes && <InfoCard label="Motivo" value={appt.notes} fullWidth />}
        </div>
      </div>
      <div className={styles.detailFooter}>
        <div className={styles.detailFooterActions}>
          <button className={styles.btnDetailDelete} onClick={() => onDelete(appt)}>Remover bloqueio</button>
        </div>
      </div>
    </>
  )
}

// ── Main component ─────────────────────────────────────────────
function AgendaContent() {
  const { clinic, user, setSession } = useAuthStore()
  const defaultDuration = getSpecialtyConfig(clinic?.type).defaultDurationMinutes
  // Modelo de acesso por profissional: admin/recepção continuam vendo a
  // agenda inteira; qualquer outro profissional com login vinculado só vê
  // (e só pode criar/editar) os próprios agendamentos.
  const canSeeAllProfessionals = isAdminOrRecepcao(user)
  const scopeProfessionalId = myScopedProfessionalId(user)
  const blankAppt = useCallback((): NewAppt => ({ ...BLANK, duration_minutes: defaultDuration, professional_id: scopeProfessionalId ?? '' }), [defaultDuration, scopeProfessionalId])
  const queryClient = useQueryClient()
  const { data: agendaData, isLoading: loading } = useAgendaData(clinic?.id, scopeProfessionalId)
  const confirmations = agendaData?.confirmations ?? {}
  const { data: waState } = useWhatsAppState(clinic?.id)
  const whatsappConnected = waState?.status === 'conectado'
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const { data: allProfessionals = [] } = useProfessionals(clinic?.id)
  // Profissional restrito só vê/agenda a si mesmo nos seletores — a lista
  // completa (allProfessionals) continua existindo pra admin/recepção.
  const professionals = canSeeAllProfessionals
    ? allProfessionals
    : allProfessionals.filter(p => p.id === scopeProfessionalId)
  // Duração pré-preenchida pelo profissional selecionado — não pela área da
  // clínica (Bloco D): professional.default_duration_minutes se definido,
  // senão a duração padrão da área dele (specialty_type), senão a da clínica.
  const resolveProfessionalDuration = useCallback((professionalId: string): number => {
    const prof = professionals.find(p => p.id === professionalId)
    if (!prof) return defaultDuration
    return prof.default_duration_minutes ?? getSpecialtyConfig(prof.specialty_type ?? clinic?.type).defaultDurationMinutes
  }, [professionals, defaultDuration, clinic?.type])
  const { data: procedures = [] } = useProcedures(clinic?.id)
  // Escala dos profissionais: sem as tabelas (ou com a escala desligada para o profissional) tudo segue como antes.
  const { data: schedules } = useSchedules(clinic?.id)
  const scheduleFor = useCallback(
    (professionalId: string) => {
      const prof = allProfessionals.find(p => p.id === professionalId)
      return scheduleOf(schedules, professionalId, prof?.schedule_enabled)
    },
    [schedules, allProfessionals],
  )
  // Grade de horários e regras de encaixe vêm das configurações da clínica (padrões se não houver)
  const scheduleSettings = schedules?.settings ?? DEFAULT_SETTINGS
  const TIME_SLOTS = useMemo(() => buildSlots(scheduleSettings.opening), [scheduleSettings.opening])
  const canExtra = canExtraSlot(scheduleSettings.extraSlotPolicy, { isAdmin: isAdmin(user), isAdminOrRecepcao: canSeeAllProfessionals })
  const canDeleteAppt = isAdmin(user)
  // Editor de escala (de um profissional, numa semana) e a grade da equipe; o editor aberto pela equipe volta para ela ao fechar
  const [scheduleEditor, setScheduleEditor] = useState<{ prof: Professional; date: Date; fromTeam: boolean } | null>(null)
  const [teamOpen, setTeamOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('dia')
  const calRef = useRef<FullCalendarHandle>(null)
  const [calendarTitle, setCalendarTitle] = useState('')
  const [calRange, setCalRange] = useState<{ start: Date; end: Date } | null>(null)
  const [hiddenProfIds, setHiddenProfIds] = useState<Set<string>>(new Set())
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<NewAppt>(blankAppt)
  const [saving, setSaving] = useState(false)
  const [syncToGCal, setSyncToGCal] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [searchQ, setSearchQ] = usePageSearch()
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
  // A lista de pacientes carregada vem cortada em 1000 linhas: o que se digita é buscado no banco.
  const [patientHits, setPatientHits] = useState<{ q: string; rows: Patient[] } | null>(null)
  const [showBlockModal, setShowBlockModal] = useState(false)
  // Clique numa casa livre: escolhe entre agendar uma consulta e bloquear o horário
  const [slotChoice, setSlotChoice] = useState<{ date: string; time: string; professionalId: string } | null>(null)
  const [blockForm, setBlockForm] = useState<BlockForm>(BLANK_BLOCK)
  const [savingBlock, setSavingBlock] = useState(false)
  const [blockError, setBlockError] = useState('')
  // Remarcar: escolhe só a nova data e hora; paciente, procedimento e profissional continuam os mesmos.
  const [resched, setResched] = useState<{ appt: Appointment; date: string; time: string } | null>(null)
  const [reschedSaving, setReschedSaving] = useState(false)
  const [reschedError, setReschedError] = useState('')
  const [reschedDone, setReschedDone] = useState<Appointment | null>(null)
  // Novo agendamento rápido: duração, valor, status e observações ficam recolhidos até alguém querer mudá-los
  const [showMoreForm, setShowMoreForm] = useState(false)
  // Visão Dia: lista (padrão) ou uma coluna por profissional. A escolha fica guardada neste navegador.
  const [dayLayout, setDayLayout] = useState<'lista' | 'colunas'>(() => {
    try { return window.localStorage.getItem('agenda.dayLayout') === 'colunas' ? 'colunas' : 'lista' } catch { return 'lista' }
  })

  // On mobile (<900px), show detail as overlay; on desktop, as side panel
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width:900px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Abaixo de 600px, 7 colunas de dia não cabem legíveis — a visão Semana
  // fica escondida (ver .segBtnWeek) e cai automaticamente pra Dia.
  const [isNarrow, setIsNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width:600px)')
    setIsNarrow(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsNarrow(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

    // o erro de salvar aparece no fim do formulário: leva a vista até ele
  const saveErrorRef = useRef<HTMLParagraphElement>(null)
  const blockErrorRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (saveError) saveErrorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [saveError])
  useEffect(() => { if (blockError) blockErrorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [blockError])

  // Sync hook cache → local state (enables optimistic mutations while keeping cache benefit)
  useEffect(() => {
    if (agendaData) {
      setAppointments(agendaData.appointments)
      setPatients(agendaData.patients)
    }
  }, [agendaData])

  // Vindo do CRM ("Agendar"), abre o novo agendamento já com o paciente escolhido. Uma vez só; o parâmetro some da URL.
  const prefillPatientId = useSearchParams().get('paciente')
  const prefillDone = useRef(false)
  useEffect(() => {
    if (!prefillPatientId || prefillDone.current || !agendaData) return
    prefillDone.current = true
    window.history.replaceState(null, '', '/agenda')
    const openWith = (p: Patient) => {
      setForm({ ...blankAppt(), patient_id: p.id })
      setPatientSearch(p.name)
      setShowModal(true)
    }
    const p = agendaData.patients.find(x => x.id === prefillPatientId)
    if (p) {
      // roda uma única vez (ref acima), quando os dados chegam
      openWith(p)
      return
    }
    // a lista carregada é cortada em 1000 linhas: paciente de fora dela é buscado pelo id
    if (!clinic?.id) return
    supabase.from('patients').select('id, name, phone').eq('id', prefillPatientId).eq('clinic_id', clinic.id).maybeSingle()
      .then(({ data }) => { if (data) openWith(data as Patient) })
  }, [prefillPatientId, agendaData, blankAppt, clinic?.id])

  // Link /agenda?profissional=<id>: abre já na agenda só dele. Uma vez só, quando a lista de profissionais chega
  // (ajuste de estado durante a renderização, protegido por `focusDone`).
  const focusParam = useSearchParams().get('profissional')
  const [focusDone, setFocusDone] = useState(false)
  if (focusParam && !focusDone && allProfessionals.length > 1) {
    setFocusDone(true)
    if (allProfessionals.some(p => p.id === focusParam)) {
      setHiddenProfIds(new Set(['', ...allProfessionals.filter(p => p.id !== focusParam).map(p => p.id)]))
    }
  }

  // Link /agenda?escala=1 (do lembrete no sino): abre a escala da equipe, uma vez, quando a escala está disponível
  const teamParam = useSearchParams().get('escala')
  const [teamDone, setTeamDone] = useState(false)
  if (teamParam && !teamDone && schedules?.available && canSeeAllProfessionals) {
    setTeamDone(true)
    setTeamOpen(true)
  }

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

  // Casa da grade -> quem ocupa, no dia e profissional escolhidos. Bloqueio da clínica toda vale para todos.
  const slotBusyMap = useMemo<Map<string, string>>(
    () => buildBusyMap(appointments, {
      dateStr: form.scheduled_at.slice(0, 10),
      professionalId: form.professional_id,
      ignoreId: editingId,
      slots: TIME_SLOTS,
    }),
    [appointments, form.scheduled_at, form.professional_id, editingId, TIME_SLOTS],
  )

  // Atalho de telefone ("quando a Dra. X tem horário?"): os próximos horários livres do profissional escolhido
  const nextFree = useMemo(() => {
    if (!showModal || !form.professional_id) return []
    const durationMin = Number(form.duration_minutes) || defaultDuration
    const schedule = scheduleFor(form.professional_id)
    return nextFreeSlots(appointments, {
      professionalId: form.professional_id,
      durationMin,
      slots: TIME_SLOTS,
      from: new Date(),
      count: 6,
      ignoreId: editingId,
      isOpen: (d, slot) => slotInSchedule(schedule, d, slot, durationMin),
    })
  }, [showModal, appointments, form.professional_id, form.duration_minutes, editingId, defaultDuration, scheduleFor, TIME_SLOTS])

  // Escala do profissional escolhido no formulário e se o horário marcado cai fora dela (encaixe)
  const formSchedule = form.professional_id ? scheduleFor(form.professional_id) : undefined
  const formDateStr = form.scheduled_at.slice(0, 10)
  const formDayStatus = formDateStr ? dayStatus(formSchedule, formDateStr) : null
  const formOutside = !!formSchedule && !!formDateStr && form.scheduled_at.length >= 16 &&
    !slotInSchedule(formSchedule, formDateStr, form.scheduled_at.slice(11, 16), Number(form.duration_minutes) || defaultDuration)

  useEffect(() => {
    const q = patientSearch.trim()
    if (!clinic?.id || !showPatientDrop || q.length < 2) return
    const clinicId = clinic.id
    let cancelled = false
    const timer = setTimeout(async () => {
      // vírgula, parênteses e % têm função na sintaxe do filtro: viram espaço
      const safe = q.replace(/[%,()*\\]/g, ' ').trim()
      const { data, error } = await supabase
        .from('patients')
        .select('id, name, phone')
        .eq('clinic_id', clinicId)
        .eq('is_active', true)
        .ilike('name', `%${safe}%`)
        .order('name')
        .limit(8)
      if (!cancelled && !error) setPatientHits({ q, rows: (data ?? []) as Patient[] })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [patientSearch, showPatientDrop, clinic?.id])

  // o que aparece no menu: o resultado do banco para o texto atual; antes dele chegar, a lista carregada
  const patientOptions = useMemo(() => {
    const q = patientSearch.trim()
    if (patientHits && patientHits.q === q) return patientHits.rows
    return patients.filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8)
  }, [patientHits, patientSearch, patients])

  function toggleProfFilter(profId: string) {
    setHiddenProfIds(prev => {
      const next = new Set(prev)
      if (next.has(profId)) next.delete(profId)
      else next.add(profId)
      return next
    })
  }

  // Agenda exclusiva de um profissional = só ele marcado (e o resto, inclusive "sem profissional", oculto).
  // Derivado do filtro que já existe: marcar uma caixa a mais na lateral sai do foco sozinho.
  const focusedProf = useMemo(() => {
    if (professionals.length < 2) return null
    const shown = professionals.filter(p => !hiddenProfIds.has(p.id))
    return shown.length === 1 && hiddenProfIds.has('') ? shown[0] : null
  }, [professionals, hiddenProfIds])

  function focusProfessional(profId: string) {
    setHiddenProfIds(new Set(['', ...professionals.filter(p => p.id !== profId).map(p => p.id)]))
    window.history.replaceState(null, '', `/agenda?profissional=${profId}`)
  }

  function clearProfessionalFocus() {
    setHiddenProfIds(new Set())
    window.history.replaceState(null, '', '/agenda')
  }

  // Toque no avatar (celular): foca o profissional; toque de novo no focado volta para todos
  function tapProfAvatar(profId: string) {
    if (focusedProf?.id === profId) clearProfessionalFocus()
    else if (hiddenProfIds.size === 0) focusProfessional(profId)
    else toggleProfFilter(profId)
  }

  const focusNextFree = useMemo(() => {
    if (!focusedProf) return []
    const durationMin = resolveProfessionalDuration(focusedProf.id)
    const schedule = scheduleFor(focusedProf.id)
    return nextFreeSlots(appointments, {
      professionalId: focusedProf.id,
      durationMin,
      slots: TIME_SLOTS,
      from: new Date(),
      count: 6,
      isOpen: (d, slot) => slotInSchedule(schedule, d, slot, durationMin),
    })
  }, [appointments, focusedProf, resolveProfessionalDuration, scheduleFor, TIME_SLOTS])

  // Agendamentos visíveis após o filtro de profissionais (chips com anel colorido na TopBar)
  const visibleAppointments = useMemo(
    // bloqueio da clínica toda vale para todo mundo: não some ao ocultar "sem profissional"
    () => appointments.filter(a => isClinicBlock(a) || !hiddenProfIds.has(a.professional_id ?? '')),
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
        title: a.status === 'bloqueado'
          ? (viewMode === 'mes' ? 'Bloqueado' : `Bloqueado: ${a.notes || 'horário indisponível'}`)
          // no Mês a célula é estreita: só o primeiro nome
          : viewMode === 'mes' ? (a.patients?.name ?? 'Paciente').split(' ')[0] : `${a.patients?.name ?? 'Paciente'} — ${a.procedure_name ?? 'Consulta'}`,
        start, end,
        classNames: [`ev-${a.status ?? 'agendado'}`],
        startEditable: a.status !== 'bloqueado' && a.status !== 'concluido',
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
    // Escala do profissional em foco: o que está fora dela fica listrado (Semana) ou apagado (Mês)
    const shading: CalendarEvent[] = []
    const sched = focusedProf ? scheduleFor(focusedProf.id) : undefined
    if (sched && calRange && (viewMode === 'semana' || viewMode === 'mes')) {
      for (let d = new Date(calRange.start.getFullYear(), calRange.start.getMonth(), calRange.start.getDate()); d < calRange.end; d.setDate(d.getDate() + 1)) {
        const key = localDateStr(d)
        const pending = dayStatus(sched, key).state === 'por_definir'
        const cls = [pending ? 'sched-pending' : 'sched-off']
        if (viewMode === 'mes') {
          if (dayStatus(sched, key).state !== 'atende') shading.push({ id: `bg-${key}`, title: '', start: key, display: 'background', classNames: cls, extendedProps: {} })
          continue
        }
        for (const r of closedRanges(sched, key, 6 * 60, 21 * 60)) {
          const at = (m: number) => `${key}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`
          shading.push({ id: `bg-${key}-${r.start}`, title: '', start: at(r.start), end: at(r.end), display: 'background', classNames: cls, extendedProps: {} })
        }
      }
    }
    return [...shading, ...clinicEvents, ...gEvents]
  }, [visibleAppointments, gcalEvents, focusedProf, scheduleFor, calRange, viewMode])

  // Horas visíveis na Semana: o horário da clínica (Configurações → Agenda); se houver consulta fora dele no período, estica até ela
  const calSlotRange = useMemo(() => {
    const hour = (hhmm: string) => Number(hhmm.slice(0, 2)) + (Number(hhmm.slice(3, 5)) > 0 ? 1 : 0)
    let minH = Number(scheduleSettings.opening.start.slice(0, 2))
    let maxH = Math.min(24, hour(scheduleSettings.opening.end))
    if (calRange) {
      for (const a of visibleAppointments) {
        const st = new Date(a.scheduled_at)
        if (st < calRange.start || st >= calRange.end) continue
        const en = new Date(st.getTime() + (a.duration_minutes ?? 60) * 60000)
        minH = Math.min(minH, st.getHours())
        maxH = Math.max(maxH, Math.min(24, en.getHours() + (en.getMinutes() > 0 ? 1 : 0)))
      }
    }
    const pad = (n: number) => String(n).padStart(2, '0')
    return { min: `${pad(minH)}:00:00`, max: maxH >= 24 ? '24:00:00' : `${pad(maxH)}:00:00` }
  }, [scheduleSettings.opening, calRange, visibleAppointments])

  // Mini calendário: com um profissional em foco e escala ligada, cada dia mostra se ele atende
  const focusSched = focusedProf ? scheduleFor(focusedProf.id) : undefined
  const miniDayTone = focusSched
    ? (key: string) => { const st = dayStatus(focusSched, key).state; return st === 'sem_escala' ? undefined : st }
    : undefined

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
      return matchStatus && matchDate
    })
  }, [visibleAppointments, filterStatus, currentDate])

  // Colunas da visão Dia: os profissionais visíveis e, se houver consulta sem profissional no dia, uma coluna para elas
  const dayColumns = useMemo<DayColumn[]>(() => {
    const cols: DayColumn[] = professionals
      .filter(p => !hiddenProfIds.has(p.id))
      .map(p => ({ id: p.id, name: p.name, initials: initials(p.name), color: profColor(p.id, profColorIndex) }))
    if (filtered.some(a => !a.professional_id && a.status !== 'bloqueado')) {
      cols.push({ id: '', name: 'Sem profissional', initials: '–', color: '#9CA3AF' })
    }
    return cols
  }, [professionals, hiddenProfIds, filtered, profColorIndex])

  // Busca da visão Dia: procura em todas as datas, por nome, procedimento, profissional ou telefone.
  // Próximas consultas primeiro (da mais perto para a mais longe), depois as passadas (da mais recente).
  const searchResults = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    if (!q) return null
    const digits = q.replace(/\D/g, '')
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const rows = visibleAppointments.filter(a => {
      if (a.status === 'bloqueado' || !a.scheduled_at) return false
      if (filterStatus && a.status !== filterStatus) return false
      return !!(
        a.patients?.name?.toLowerCase().includes(q) ||
        a.procedure_name?.toLowerCase().includes(q) ||
        a.professionals?.name?.toLowerCase().includes(q) ||
        (digits.length >= 3 && (a.patients?.phone ?? '').replace(/\D/g, '').includes(digits))
      )
    })
    const ms = (a: Appointment) => new Date(a.scheduled_at).getTime()
    const upcoming = rows.filter(a => ms(a) >= todayStart.getTime()).sort((a, b) => ms(a) - ms(b))
    const past = rows.filter(a => ms(a) < todayStart.getTime()).sort((a, b) => ms(b) - ms(a))
    const all = [...upcoming, ...past]
    return { total: all.length, rows: all.slice(0, 60) }
  }, [visibleAppointments, filterStatus, searchQ])

  function openSearchResult(a: Appointment) {
    setCurrentDate(new Date(a.scheduled_at))
    setSearchQ('')
    setSelected(a)
  }

  // Date nav
  function prevDay() { setCurrentDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() - 1); return nd }) }
  function nextDay() { setCurrentDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() + 1); return nd }) }

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
    setSelected(null)
    setViewMode(next)
  }

  // Esc fecha o painel de detalhe (no desktop), a não ser que haja um modal ou confirmação aberta por cima
  useEffect(() => {
    if (!selected || isMobile) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, isMobile])

  // Mantém o FullCalendar na visão certa (Mês/Semana) sem desmontar o componente
  useEffect(() => {
    if (viewMode === 'mes') calRef.current?.changeView('dayGridMonth')
    else if (viewMode === 'semana') calRef.current?.changeView('timeGridWeek')
  }, [viewMode])

  // O botão "Semana" some abaixo de 600px (.segBtnWeek) — se a tela encolher
  // (ou girar) enquanto o usuário está nela, cai pra Dia em vez de deixar a
  // view presa sem um jeito de sair dela.
  useEffect(() => {
    if (isNarrow && viewMode === 'semana') switchView('dia')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNarrow])

  // Navegação unificada da TopBar — dirige o FullCalendar (Mês/Semana) ou currentDate (Dia/Lista)
  function handlePrev() { isCalendarView ? calRef.current?.prev() : prevDay() }
  function handleNext() { isCalendarView ? calRef.current?.next() : nextDay() }

  function goToday() {
    if (isCalendarView) calRef.current?.today()
    setCurrentDate(new Date())
  }

  // Período em foco (Dia: o dia; Semana/Mês: o que o FullCalendar está mostrando) e o que a barra lateral conta nele
  const range = useMemo(
    () => (isCalendarView && calRange ? calRange : rangeFor(viewMode, currentDate)),
    [isCalendarView, calRange, viewMode, currentDate],
  )
  const rangeAppts = useMemo(() => inRange(visibleAppointments, range.start, range.end), [visibleAppointments, range])
  const rangeCount = rangeAppts.filter(a => a.status !== 'bloqueado' && a.status !== 'cancelado').length
  const markedDays = useMemo(() => daysWithAppointments(visibleAppointments), [visibleAppointments])
  const profCounts = useMemo(() => countByProfessional(inRange(appointments, range.start, range.end)), [appointments, range])
  const todayStats = useMemo(() => daySummary(visibleAppointments, new Date()), [visibleAppointments])
  // mês do mini calendário: o do meio da semana (uma semana de 29/out a 4/nov mostra outubro ou novembro conforme o dia do meio)
  const miniFocus = viewMode === 'semana' ? new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate() + 3) : range.start
  const miniMonth = new Date(miniFocus.getFullYear(), miniFocus.getMonth(), 1)
  const rangeLabel = viewMode === 'dia'
    ? currentDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    : calendarTitle
  const viewOptions: PillOption<ViewMode>[] = [
    { value: 'dia', label: 'Dia' },
    ...(isNarrow ? [] : [{ value: 'semana' as const, label: 'Semana' }]),
    { value: 'mes', label: 'Mês' },
  ]

  function pickDay(d: Date) {
    setCurrentDate(d)
    // No Mês, escolher um dia no mini calendário abre aquele dia
    if (viewMode === 'mes') {
      setSelected(null)
      setViewMode('dia')
      return
    }
    if (isCalendarView) calRef.current?.gotoDate(d)
  }

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

  // Na agenda exclusiva de um profissional, o novo agendamento já vem para ele
  function openNewAppt() {
    if (focusedProf) setForm({ ...blankAppt(), professional_id: focusedProf.id, duration_minutes: resolveProfessionalDuration(focusedProf.id) })
    setShowModal(true)
  }

  function handleDateSelect(dateStr: string) {
    // Mês: clicou num dia inteiro, sem horário. Semana: clicou num horário, então pergunta o que fazer com ele.
    if (dateStr.length <= 10) {
      setForm({ ...blankAppt(), scheduled_at: dateStr + 'T09:00' })
      setShowModal(true)
      return
    }
    setSlotChoice({ date: dateStr.slice(0, 10), time: dateStr.slice(11, 16), professionalId: focusedProf?.id ?? scopeProfessionalId ?? '' })
  }

  function chooseSlotSchedule() {
    if (!slotChoice) return
    const { date, time, professionalId } = slotChoice
    setForm({ ...blankAppt(), professional_id: professionalId, duration_minutes: professionalId ? resolveProfessionalDuration(professionalId) : defaultDuration, scheduled_at: `${date}T${time}` })
    setSlotChoice(null)
    setShowModal(true)
  }

  function chooseSlotBlock() {
    if (!slotChoice) return
    const { date, time, professionalId } = slotChoice
    setBlockForm({ ...BLANK_BLOCK, professional_id: professionalId, scheduled_at: `${date}T${time}` })
    setBlockError('')
    setSlotChoice(null)
    setShowBlockModal(true)
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
      const patient = patients.find(p => p.id === form.patient_id) ?? patientHits?.rows.find(p => p.id === form.patient_id)

      // fora da escala do profissional só como encaixe, com motivo
      const extraReason = form.extra_reason.trim()
      if (formOutside && scheduleSettings.extraSlotRequireReason && !extraReason) {
        setSaveError('Este horário está fora da escala do profissional. Informe o motivo do encaixe.')
        return
      }

      if (professionalId) {
        const result = await checkConflict(clinic.id, professionalId, new Date(scheduledAtISO).getTime(), duration, editingId)
        if (result === 'error') {
          setSaveError('Não foi possível conferir a agenda. Tente de novo.')
          return
        }
        if (result === 'conflict') {
          setSaveError('Este profissional já tem agendamento ou bloqueio nesse horário.')
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
        // só vai quando há encaixe: a coluna só existe depois da migration da escala
        ...(formOutside
          ? { extra_slot_reason: extraReason || 'Encaixe fora da escala' }
          : editingId && appointments.find(a => a.id === editingId)?.extra_slot_reason ? { extra_slot_reason: null } : {}),
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
          const concludedAppt = { ...(existingAppt ?? {} as Appointment), ...payload, status: form.status as Appointment['status'], id: editingId }
          const creditUsage = await promptCreditUsage(clinic!.id, concludedAppt.patient_id)
          const result = await ensureRevenueForAppointment(clinic!.id, concludedAppt, creditUsage)
          notifyRevenuePending(result, concludedAppt)
          if (creditUsage.useCredit) queryClient.invalidateQueries({ queryKey: ['patient-credits', clinic?.id] })
        } else if (existingAppt?.status === 'concluido' && form.status !== 'concluido') {
          await removeRevenueForAppointment(editingId)
          queryClient.invalidateQueries({ queryKey: ['patient-credits', clinic?.id] })
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
      setForm(blankAppt())
      setEditingId(null)
      loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('load failed') || msg.toLowerCase().includes('network')) {
        setShowModal(false); setForm(blankAppt()); setEditingId(null); loadData()
      } else {
        setSaveError(`Erro inesperado: ${msg}`)
      }
    } finally { setSaving(false) }
  }

  async function updateStatus(id: string, status: string) {
    const appt = appointments.find(a => a.id === id)

    if (status === 'concluido' && appt) {
      const linkedProc = procedures.find(p => p.id === appt.procedure_id)
      const priceIsPending = !(appt.procedure_price && appt.procedure_price > 0) && !linkedProc?.is_free
      if (priceIsPending) {
        const confirmed = await confirmDialog({
          message: 'Este procedimento está sem preço definido — nenhuma receita será lançada no Financeiro ao concluir. Deseja continuar mesmo assim?',
          confirmText: 'Concluir mesmo assim',
        })
        if (!confirmed) return
      }
    }

    await supabase.from('appointments').update({ status }).eq('id', id).eq('clinic_id', clinic!.id)
    if (status === 'concluido' && appt) {
      const concludedAppt = { ...appt, status: 'concluido' as const }
      const creditUsage = await promptCreditUsage(clinic!.id, concludedAppt.patient_id)
      const result = await ensureRevenueForAppointment(clinic!.id, concludedAppt, creditUsage)
      notifyRevenuePending(result, concludedAppt)
      if (creditUsage.useCredit) queryClient.invalidateQueries({ queryKey: ['patient-credits', clinic?.id] })
    } else if (appt?.status === 'concluido' && status !== 'concluido') {
      await removeRevenueForAppointment(id)
      queryClient.invalidateQueries({ queryKey: ['patient-credits', clinic?.id] })
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

  function closeModal() {
    setShowModal(false)
    setEditingId(null)
    setForm(blankAppt())
    setSaveError('')
    setShowNewPatient(false)
    setNpName('')
    setNpPhone('')
    setPatientSearch('')
    setShowPatientDrop(false)
    setShowMoreForm(false)
  }

  async function createPatient() {
    if (!clinic || !npName.trim()) return
    if (npPhone && !isCompleteBrPhone(npPhone)) { showToast('error', PHONE_INCOMPLETE); return }
    setSavingPatient(true)
    const { data, error } = await supabase
      .from('patients')
      .insert([{ clinic_id: clinic.id, name: npName.trim(), phone: npPhone || null, is_active: true }])
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
      patient_id: appt.patient_id ?? '',
      professional_id: appt.professional_id ?? '',
      procedure_id: appt.procedure_id ?? (appt.procedure_name ? 'outro' : ''),
      procedure_name: appt.procedure_name ?? '',
      procedure_price: appt.procedure_price != null ? String(appt.procedure_price) : '',
      scheduled_at: toLocalInput(appt.scheduled_at),
      duration_minutes: appt.duration_minutes ?? 60,
      status: appt.status,
      notes: appt.notes ?? '',
      extra_mode: !!appt.extra_slot_reason,
      extra_reason: appt.extra_slot_reason ?? '',
    })
    setSelected(null)
    setShowNewPatient(false)
    setNpName('')
    setNpPhone('')
    setPatientSearch(appt.patients?.name ?? patients.find(p => p.id === appt.patient_id)?.name ?? '')
    setShowPatientDrop(false)
    setShowMoreForm(true)
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

  async function markArrived(appt: Appointment, arrived: boolean) {
    const at = arrived ? new Date().toISOString() : null
    const { error } = await supabase.from('appointments').update({ arrived_at: at }).eq('id', appt.id).eq('clinic_id', clinic!.id)
    if (error) { showToast('error', 'Não foi possível registrar a chegada.'); return }
    setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, arrived_at: at } : a))
    setSelected(prev => prev && prev.id === appt.id ? { ...prev, arrived_at: at } : prev)
    showToast('ok', arrived ? 'Chegada registrada' : 'Chegada desfeita')
  }

  function openReschedule(appt: Appointment) {
    setReschedError('')
    setReschedDone(null)
    setResched({ appt, date: toLocalInput(appt.scheduled_at).slice(0, 10), time: '' })
    setSelected(null)
  }

  function closeReschedule() {
    setResched(null)
    setReschedDone(null)
    setReschedError('')
  }

  // Horários ocupados do profissional no dia escolhido, sem contar a própria consulta que está sendo remarcada
  const reschedBusy = useMemo<Map<string, string>>(
    () => resched
      ? buildBusyMap(appointments, { dateStr: resched.date, professionalId: resched.appt.professional_id ?? '', ignoreId: resched.appt.id, slots: TIME_SLOTS })
      : new Map(),
    [resched, appointments, TIME_SLOTS],
  )

  // Remarcar de verdade: confere conflito, grava, atualiza o Google Agenda. Devolve a mensagem de erro, ou os novos status e observações.
  async function applyReschedule(appt: Appointment, newStart: Date, extraReason: string | null): Promise<{ error: string } | { status: Appointment['status']; notes: string }> {
    const duration = appt.duration_minutes ?? 60
    if (appt.professional_id) {
      const result = await checkConflict(clinic!.id, appt.professional_id, newStart.getTime(), duration, appt.id)
      if (result !== 'free') {
        return { error: result === 'error'
          ? 'Não foi possível conferir a agenda. Tente de novo.'
          : 'Este profissional já tem agendamento ou bloqueio nesse horário.' }
      }
    }
    // a confirmação era para o horário antigo: volta para "agendado". Concluído nem chega aqui.
    const status = appt.status === 'confirmado' || appt.status === 'cancelado' || appt.status === 'faltou' ? 'agendado' : appt.status
    const trail = `Remarcada de ${formatDate(appt.scheduled_at)}.`
    const notes = appt.notes ? `${appt.notes}\n${trail}` : trail
    const { error } = await supabase
      .from('appointments')
      .update({ scheduled_at: newStart.toISOString(), status, notes, ...(extraReason ? { extra_slot_reason: extraReason } : {}) })
      .eq('id', appt.id)
      .eq('clinic_id', clinic!.id)
    if (error) return { error: `Erro ao remarcar: ${error.message}` }
    if (appt.gcal_event_id && gcalConnected) {
      const token = getGCalToken()
      if (token) {
        try {
          await updateGCalEvent(token, appt.gcal_event_id, {
            summary: `${appt.procedure_name || 'Consulta'} — ${appt.patients?.name ?? 'Paciente'}`,
            description: notes || undefined,
            start: newStart.toISOString(),
            end: new Date(newStart.getTime() + duration * 60000).toISOString(),
          })
        } catch { /* ignora */ }
      }
    }
    return { status, notes }
  }

  async function handleReschedule() {
    if (!clinic || !resched || !resched.date || !resched.time) return
    const { appt } = resched
    const newStart = new Date(`${resched.date}T${resched.time}`)
    if (newStart.getTime() === new Date(appt.scheduled_at).getTime()) {
      setReschedError('Escolha um horário diferente do atual.')
      return
    }
    setReschedSaving(true)
    setReschedError('')
    const sched = appt.professional_id ? scheduleFor(appt.professional_id) : undefined
    const outside = !!sched && !slotInSchedule(sched, resched.date, resched.time, appt.duration_minutes ?? 60)
    const res = await applyReschedule(appt, newStart, outside ? 'Remarcada para fora da escala' : null)
    if ('error' in res) {
      setReschedError(res.error)
      setReschedSaving(false)
      return
    }
    setReschedSaving(false)
    setReschedDone({ ...appt, scheduled_at: newStart.toISOString(), status: res.status, notes: res.notes })
    setCurrentDate(newStart)
    loadData()
  }

  // Arrastar uma consulta no calendário (Semana e Mês) para remarcar
  async function handleEventDrop(id: string, newStart: Date, revert: () => void) {
    const appt = appointments.find(a => a.id === id)
    if (!appt || !clinic || appt.status === 'concluido' || appt.status === 'bloqueado') { revert(); return }
    const sched = appt.professional_id ? scheduleFor(appt.professional_id) : undefined
    const time = `${String(newStart.getHours()).padStart(2, '0')}:${String(newStart.getMinutes()).padStart(2, '0')}`
    const outside = !!sched && !slotInSchedule(sched, localDateStr(newStart), time, appt.duration_minutes ?? 60)
    if (outside && !canExtra) {
      showToast('error', 'Esse horário está fora da escala do profissional.')
      revert()
      return
    }
    const ok = await confirmDialog({
      title: 'Remarcar consulta?',
      message: `Mover ${appt.patients?.name ?? 'o agendamento'} para ${formatDate(newStart.toISOString())}?${outside ? ' Esse horário está fora da escala do profissional e ficará registrado como encaixe.' : ''}`,
      confirmText: 'Remarcar',
    })
    if (!ok) { revert(); return }
    const res = await applyReschedule(appt, newStart, outside ? 'Remarcada para fora da escala' : null)
    if ('error' in res) {
      showToast('error', res.error)
      revert()
      return
    }
    showToast('ok', 'Consulta remarcada')
    loadData()
  }

  function openBlockModal() {
    setBlockForm({ ...BLANK_BLOCK, professional_id: scopeProfessionalId ?? '' })
    setBlockError('')
    setShowBlockModal(true)
  }

  function closeBlockModal() {
    setShowBlockModal(false)
    setBlockForm(BLANK_BLOCK)
    setBlockError('')
  }

  async function handleSaveBlock() {
    if (!clinic || !blockForm.scheduled_at) return
    const duration = Number(blockForm.duration_minutes)
    if (!Number.isFinite(duration) || duration < 15) {
      setBlockError('A duração deve ser de pelo menos 15 minutos.')
      return
    }
    setSavingBlock(true)
    setBlockError('')
    const scheduledAtISO = new Date(blockForm.scheduled_at).toISOString()
    const professionalId = blockForm.professional_id || null

    if (professionalId) {
      const result = await checkConflict(clinic.id, professionalId, new Date(scheduledAtISO).getTime(), duration)
      if (result !== 'free') {
        setBlockError(result === 'error'
          ? 'Não foi possível conferir a agenda. Tente de novo.'
          : 'Já existe um agendamento ou bloqueio nesse horário para este profissional.')
        setSavingBlock(false)
        return
      }
    }

    const { error } = await supabase.from('appointments').insert([{
      clinic_id: clinic.id,
      patient_id: null,
      professional_id: professionalId,
      procedure_name: null,
      status: 'bloqueado',
      scheduled_at: scheduledAtISO,
      duration_minutes: duration,
      notes: blockForm.notes || null,
    }])
    setSavingBlock(false)
    if (error) {
      setBlockError(`Erro ao criar bloqueio: ${error.message}`)
      return
    }
    closeBlockModal()
    loadData()
  }

  async function handleDeleteBlock(appt: Appointment) {
    if (!(await confirmDialog({ message: 'Remover este bloqueio de horário?', confirmText: 'Remover', danger: true }))) return
    await supabase.from('appointments').delete().eq('id', appt.id).eq('clinic_id', clinic!.id)
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

  // Filtro de status e modo de exibição do dia: na barra de cima no desktop, em faixa própria no celular
  const statusFilterEl = (
    <>
      <SelectMenu
        className={styles.statusSelect}
        value={filterStatus}
        onChange={setFilterStatus}
        options={[
          { value: '', label: 'Todos os status' },
          { value: 'agendado', label: 'Agendado' },
          { value: 'confirmado', label: 'Confirmado' },
          { value: 'concluido', label: 'Concluído' },
          { value: 'cancelado', label: 'Cancelado' },
          { value: 'faltou', label: 'Faltou' },
        ]}
      />
      {filterStatus && (
        <button className={styles.btnClear} onClick={() => setFilterStatus('')}>Limpar</button>
      )}
    </>
  )
  const layoutToggleEl = !loading && !isMobile && dayColumns.length > 0 ? (
    <PillTabs
      label="Como mostrar o dia"
      options={[{ value: 'lista' as const, label: 'Lista' }, { value: 'colunas' as const, label: 'Colunas' }]}
      value={dayLayout}
      onChange={v => {
        setDayLayout(v)
        try { window.localStorage.setItem('agenda.dayLayout', v) } catch { /* sem armazenamento: vale só nesta sessão */ }
      }}
    />
  ) : null

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className={styles.shell}>
      <PageHeader
        title="Agenda"
        subtitle={`${rangeCount} ${rangeCount === 1 ? 'consulta' : 'consultas'}${rangeLabel ? ` · ${rangeLabel}` : ''}`}
        actions={<>
          <PillTabs label="Visão da agenda" options={viewOptions} value={viewMode} onChange={switchView} />
          {canSeeAllProfessionals && schedules?.available && allProfessionals.length > 0 && (
            <button type="button" className={`${btn.secondary} ${styles.teamCta}`} onClick={() => setTeamOpen(true)}>
              Escala da equipe
            </button>
          )}
          <button className={`${btn.primary} ${styles.headerCta}`} onClick={openNewAppt}>
            <Icon name="plus" size={16} />
            Novo agendamento
          </button>
        </>}
      />
      <div className={styles.layout}>
        <aside className={styles.side} aria-label="Resumo da agenda">
          <div className={styles.miniCard}>
            <MiniCalendar
              key={`${miniMonth.getFullYear()}-${miniMonth.getMonth()}`}
              month={miniMonth}
              highlight={viewMode === 'mes' ? null : range}
              marked={markedDays}
              onPick={pickDay}
              dayTone={miniDayTone}
            />
          </div>
          <AgendaSidebar
            professionals={professionals.map((p, i) => ({ id: p.id, name: p.name, initials: initials(p.name), color: PROF_COLORS[i % PROF_COLORS.length], count: profCounts[p.id] ?? 0 }))}
            unassignedCount={profCounts[''] ?? 0}
            hiddenIds={hiddenProfIds}
            onToggle={toggleProfFilter}
            onFocus={focusProfessional}
            focusedId={focusedProf?.id ?? null}
            today={todayStats}
          />
        </aside>
        <div className={styles.page}>
      <div className={styles.topbar}>
        <div className={styles.topbarRow}>
          <div className={styles.tbLeft}>
            <button className={styles.navBtn} onClick={handlePrev} aria-label="Anterior"><ChevronLeft /></button>
            <button className={styles.navBtn} onClick={handleNext} aria-label="Próximo"><ChevronRight /></button>
            <div className={styles.tbDate}>
              <h2>{isCalendarView ? calendarTitle : fmtTopbarDate(currentDate)}</h2>
              {!isCalendarView && <span>{fmtTopbarWeekday(currentDate)}</span>}
            </div>
            <button className={styles.btnToday} onClick={goToday}>Hoje</button>
          </div>

          <div className={styles.tbActions}>
            {viewMode === 'dia' && (
              <div className={`${styles.search} ${styles.localSearch}`}>
                <SearchIcon />
                <input
                  placeholder="Buscar nome ou telefone..."
                  aria-label="Buscar por nome ou telefone, em todas as datas"
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                />
              </div>
            )}
            {viewMode === 'dia' && !isMobile && <>{statusFilterEl}{layoutToggleEl}</>}
            <button type="button" className={styles.btnSecondaryAction} onClick={openBlockModal} title="Reservar um horário em que ninguém pode agendar (almoço, reunião, folga)">
              <LockIcon />
              <span className={styles.btnSecondaryLabel}>Bloquear horário</span>
            </button>
            {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
              gcalConnected ? (
                <div className={styles.gcalStatus} title={`${gcalEvents.length} evento(s) sincronizado(s)`}>
                  <span className={styles.gcalDot} />
                  <span>Google Calendar</span>
                </div>
              ) : (
                <button className={styles.btnGcalConnect} onClick={handleConnectGCal}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  Vincular Google Calendar
                </button>
              )
            ) : null}
          </div>
        </div>
      </div>

      {gcalError && <p className={styles.gcalErrorMsg}>{gcalError}</p>}

      {/* ── Agenda exclusiva do profissional ── */}
      {focusedProf && (
        <div className={styles.focusBar}>
          <span className={styles.focusAvatar} style={{ background: profColor(focusedProf.id, profColorIndex) }}>{initials(focusedProf.name)}</span>
          <div className={styles.focusInfo}>
            <strong className={styles.focusName}>Agenda de {focusedProf.name}</strong>
            <span className={styles.focusSub}>
              {profCounts[focusedProf.id] ?? 0} {(profCounts[focusedProf.id] ?? 0) === 1 ? 'consulta' : 'consultas'} {viewMode === 'dia' ? 'no dia' : viewMode === 'semana' ? 'na semana' : 'no mês'}
            </span>
          </div>
          <button type="button" className={styles.focusBack} onClick={clearProfessionalFocus}>Voltar para todos</button>
          {schedules?.available && (() => {
            const sched = scheduleFor(focusedProf.id)
            const shifts = schedules.settings.shifts
            return (
              <div className={styles.focusSchedule}>
                <div className={styles.scheduleHead}>
                  <span className={styles.focusFreeLabel}>{summarizeSchedule(sched, currentDate, shifts)}</span>
                  {canSeeAllProfessionals && (
                    <button type="button" className={styles.focusBack} onClick={() => setScheduleEditor({ prof: focusedProf, date: currentDate, fromTeam: false })}>
                      {focusedProf.schedule_enabled ? 'Editar dias e horários' : 'Definir escala'}
                    </button>
                  )}
                </div>
                {sched && (
                  <ul className={styles.weekStrip} aria-label="Escala da semana">
                    {weekDates(currentDate).map(d => {
                      const st = dayStatus(sched, d)
                      const free = freeSlotsOfDay(appointments, { professionalId: focusedProf.id, dateStr: d, durationMin: resolveProfessionalDuration(focusedProf.id), slots: TIME_SLOTS, schedule: sched }).length
                      return (
                        <li key={d} className={`${styles.weekCell}${st.state === 'atende' ? ` ${styles.weekCellOn}` : ''}${d === localDateStr(currentDate) ? ` ${styles.weekCellToday}` : ''}`}>
                          <b>{new Date(`${d}T00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')} {d.slice(8)}</b>
                          <span>{describeDay(st, shifts)}</span>
                          {st.state === 'atende' && <small>{free} {free === 1 ? 'livre' : 'livres'}</small>}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })()}
          {focusNextFree.length > 0 && (
            <div className={styles.focusFree}>
              <span className={styles.focusFreeLabel}>Próximos horários livres</span>
              <div className={styles.nextFreeRow}>
                {focusNextFree.map(s => (
                  <button
                    key={`${s.date}T${s.time}`}
                    type="button"
                    className={styles.nextFreeChip}
                    title="Agendar neste horário"
                    onClick={() => {
                      setForm({ ...blankAppt(), professional_id: focusedProf.id, duration_minutes: resolveProfessionalDuration(focusedProf.id), scheduled_at: `${s.date}T${s.time}` })
                      setShowModal(true)
                    }}
                  >
                    {new Date(`${s.date}T00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '')} · {s.time}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Date strip: date-picker horizontal deslizante (mobile, visões Dia/Lista) ── */}
      {!isCalendarView && (
        <div className={styles.dateStrip} data-hscroll>
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

      {/* ── Filtro de profissionais: só avatares, nas telas sem a barra lateral ── */}
      {professionals.length > 1 && (
        <div className={styles.profFiltersMobile} data-hscroll>
          {professionals.map((p, i) => {
            const color = PROF_COLORS[i % PROF_COLORS.length]
            const active = !hiddenProfIds.has(p.id)
            return (
              <button
                key={p.id}
                type="button"
                className={styles.profFilterBtn}
                data-active={active}
                title={focusedProf?.id === p.id ? `Voltar para todos` : hiddenProfIds.size === 0 ? `Ver só a agenda de ${p.name}` : `${active ? 'Ocultar' : 'Mostrar'} ${p.name}`}
                onClick={() => tapProfAvatar(p.id)}
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

      {/* ── Filtro de status (visão Dia no celular; no desktop fica na barra de cima) ── */}
      {viewMode === 'dia' && isMobile && (
        <div className={styles.filters}>{statusFilterEl}</div>
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
                  onRangeChange={(start, end) => setCalRange({ start, end })}
                  onEventDrop={handleEventDrop}
                  slotMinTime={calSlotRange.min}
                  slotMaxTime={calSlotRange.max}
                />
              </div>
            ) : searchResults ? (
              /* ── Resultado da busca, em todas as datas ── */
              <div className={styles.listScroll}>
                <div className={styles.srHead}>
                  {searchResults.total === 0
                    ? 'Nenhuma consulta encontrada em nenhuma data'
                    : `${searchResults.total} ${searchResults.total === 1 ? 'consulta encontrada' : 'consultas encontradas'} em todas as datas${searchResults.total > searchResults.rows.length ? ` · mostrando as ${searchResults.rows.length} primeiras` : ''}`}
                </div>
                {searchResults.rows.map(a => {
                  const d = new Date(a.scheduled_at)
                  return (
                    <button key={a.id} type="button" className={styles.srRow} onClick={() => openSearchResult(a)}>
                      <span className={styles.srDate}>
                        <strong>{d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</strong>
                        <span>{fmtTime(a.scheduled_at)}</span>
                      </span>
                      <span className={styles.srMain}>
                        <strong className={styles.srName}>{a.patients?.name ?? '-'}</strong>
                        <span className={styles.srSub}>
                          {[a.procedure_name ?? 'Consulta', a.professionals?.name, d.toLocaleDateString('pt-BR', d.getFullYear() === new Date().getFullYear() ? { weekday: 'long' } : { weekday: 'long', year: 'numeric' })].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <StatusDot tone={STATUS_TONE[a.status ?? 'agendado'] ?? 'idle'}>{STATUS_LABELS[a.status ?? ''] ?? a.status}</StatusDot>
                    </button>
                  )
                })}
              </div>
            ) : dayLayout === 'colunas' && !isMobile && dayColumns.length > 0 ? (
              /* ── Visão Dia em colunas: um profissional por coluna, com as casas livres ── */
              <DayColumns
                dateStr={localDateStr(currentDate)}
                columns={dayColumns}
                appointments={filtered}
                slots={TIME_SLOTS}
                statusLabels={STATUS_LABELS}
                onOpenAppt={setSelected}
                isOpen={(professionalId, time) => slotInSchedule(scheduleFor(professionalId), localDateStr(currentDate), time, 30)}
                onFreeSlot={(professionalId, time) => setSlotChoice({ date: localDateStr(currentDate), time, professionalId })}
              />
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
                    <button className={styles.btnPrimary} onClick={openNewAppt} style={{ marginTop: 4 }}>
                      <PlusIcon /> Novo Agendamento
                    </button>
                  </div>
                ) : (
                  <div className={styles.lrList}>
                    {filtered.map(a => {
                      const color = a.status === 'bloqueado' ? '#9CA3AF' : profColor(a.professional_id, profColorIndex)
                      if (a.status === 'bloqueado') {
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
                              className={`${styles.lrCard} ${styles.lrCardBlocked}`}
                              style={{ '--lr-accent': color } as React.CSSProperties}
                              role="button"
                              tabIndex={0}
                              onClick={() => setSelected(a)}
                              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(a) } }}
                            >
                              <strong className={styles.lrCardName}>Horário bloqueado</strong>
                              <span className={styles.lrCardProc}>{a.notes || 'Horário indisponível'}</span>
                              <div className={styles.lrCardFoot}>
                                {a.professionals?.name && (
                                  <>
                                    <span className={styles.lrProAvatar} style={{ background: color }}>{initials(a.professionals.name)}</span>
                                    <span className={styles.lrProName}>{a.professionals.name}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      }
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
                              {confirmations[a.id] && (() => {
                                const l = confirmationLabel(confirmations[a.id])
                                return <span className={`${styles.lrWa} ${styles[`waTone_${l.tone}`]}`} title={l.text}>{l.short}</span>
                              })()}
                              <span className={styles.lrStatusWrap}>
                                <StatusDot tone={STATUS_TONE[a.status ?? 'agendado'] ?? 'idle'}>{STATUS_LABELS[a.status ?? ''] ?? a.status}</StatusDot>
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
            <button className={styles.fab} onClick={openNewAppt} title="Novo agendamento">
              <PlusIcon />
              <span className={styles.fabLabel}>Novo agendamento</span>
            </button>
          </div>

          {/* ── Side detail panel (desktop, non-mobile) ── */}
          {!isMobile && selected && (
            <div className={styles.panel}>
              <div className={styles.panelInner}>
                {selected.status === 'bloqueado' ? (
                  <BlockDetailContent appt={selected} onClose={() => setSelected(null)} onDelete={handleDeleteBlock} />
                ) : (
                <ApptDetailContent
                  appt={selected}
                  profColorIdx={profColorIndex}
                  onUpdateStatus={updateStatus}
                  confirmation={confirmations[selected.id]}
                  whatsappConnected={whatsappConnected}
                  onWhatsAppSent={() => queryClient.invalidateQueries({ queryKey: ['agenda', clinic?.id] })}
                  onGCal={openGCal}
                  onClose={() => setSelected(null)}
                  onEdit={openEdit}
                  onReschedule={openReschedule}
                  onDelete={handleDelete}
            canDelete={canDeleteAppt}
            onArrive={markArrived}
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
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Detalhe do agendamento no celular ── */}
      <Modal open={isMobile && !!selected} onClose={() => setSelected(null)} bare title="Detalhes do agendamento">
        {selected && (
          <>
          {selected.status === 'bloqueado' ? (
            <BlockDetailContent appt={selected} onClose={() => setSelected(null)} onDelete={handleDeleteBlock} />
          ) : (
          <ApptDetailContent
            appt={selected}
            profColorIdx={profColorIndex}
            onUpdateStatus={updateStatus}
              confirmation={confirmations[selected.id]}
              whatsappConnected={whatsappConnected}
              onWhatsAppSent={() => queryClient.invalidateQueries({ queryKey: ['agenda', clinic?.id] })}
            onGCal={openGCal}
            onClose={() => setSelected(null)}
            onEdit={openEdit}
            onReschedule={openReschedule}
            onDelete={handleDelete}
            canDelete={canDeleteAppt}
            onArrive={markArrived}
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
          )}
          </>
        )}
      </Modal>

      {/* ── Evento do Google Calendar ── */}
      <Modal open={!!selectedGcal} onClose={() => setSelectedGcal(null)} bare title="Evento do Google Calendar">
        {selectedGcal && (
          <>
          <div className={styles.detailHeader}>
            <div className={styles.detailPatientInfo}>
              <div className={styles.detailAvatar} style={{ background: '#4285F4', color: '#fff' }}><Icon name="calendar" size={18} /></div>
              <div>
                <div className={styles.detailName}>{selectedGcal.summary}</div>
                <span className={`${styles.detailStatusBadge} ${styles.badge_confirmado}`}>Google Calendar</span>
              </div>
            </div>
            <button type="button" className={styles.btnClose} onClick={() => setSelectedGcal(null)} aria-label="Fechar"><Icon name="close" size={18} /></button>
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
          </>
        )}
      </Modal>

      {/* ── Novo e editar agendamento ── */}
      {scheduleEditor && clinic && schedules?.available && (
        <ScheduleEditor
          key={`${scheduleEditor.prof.id}-${scheduleEditor.date.getTime()}`}
          open
          onClose={() => { if (scheduleEditor.fromTeam) setTeamOpen(true); setScheduleEditor(null) }}
          professional={scheduleEditor.prof}
          clinicId={clinic.id}
          userId={user?.id}
          shifts={schedules.settings.shifts}
          saved={schedules.byProfessional[scheduleEditor.prof.id] ?? { pattern: [], days: [] }}
          initialDate={scheduleEditor.date}
        />
      )}

      {teamOpen && clinic && schedules?.available && (
        <TeamSchedule
          open
          onClose={() => setTeamOpen(false)}
          professionals={allProfessionals}
          schedules={schedules}
          shifts={schedules.settings.shifts}
          clinicId={clinic.id}
          userId={user?.id}
          initialDate={currentDate}
          colorOf={id => profColor(id, profColorIndex)}
          initialsOf={initials}
          onEdit={(prof, date) => { setTeamOpen(false); setScheduleEditor({ prof, date, fromTeam: true }) }}
        />
      )}

      <Modal
        open={showModal}
        onClose={closeModal}
        title={editingId ? 'Editar agendamento' : 'Novo agendamento'}
        footer={
          <>
            <button type="button" className={btn.secondary} onClick={closeModal}>Cancelar</button>
            <button type="button" className={btn.primary} onClick={handleSave} disabled={saving || !form.patient_id || !form.scheduled_at}>
              {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Salvar agendamento'}
            </button>
          </>
        }
      >
        {/* ── Paciente ── */}
        <div className={f.field}>
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
              <PhoneInput value={npPhone} onChange={setNpPhone} aria-label="Telefone / WhatsApp" />
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
                  {patientOptions.map(p => (
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
                  {patientOptions.length === 0 && (
                    <div className={styles.patientDropEmpty}>Nenhum paciente encontrado</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Profissional ── */}
        <div className={f.field}>
          <label>Profissional</label>
          <SelectMenu
            variant="field"
            ariaLabel="Profissional"
            value={form.professional_id}
            onChange={pid => setForm(p => ({ ...p, professional_id: pid, duration_minutes: resolveProfessionalDuration(pid) }))}
            options={[
              ...(canSeeAllProfessionals ? [{ value: '', label: 'Sem profissional' }] : []),
              ...professionals.map(p => ({ value: p.id, label: p.name })),
            ]}
          />
        </div>

        {/* ── Procedimento ── */}
        <div className={f.field}>
          <label>Procedimento</label>
          <SelectMenu
            variant="field"
            ariaLabel="Procedimento"
            value={form.procedure_id}
            onChange={v => {
              const proc = procedures.find(p => p.id === v)
              setForm(prev => ({
                ...prev,
                procedure_id: v,
                procedure_name: proc ? proc.name : (v === 'outro' ? '' : prev.procedure_name),
                procedure_price: proc ? String(proc.price) : (v === '' ? '' : prev.procedure_price),
              }))
            }}
            options={[
              { value: '', label: 'Sem procedimento' },
              ...procedures.filter(p => p.is_active).map(p => ({ value: p.id, label: `${p.name} — ${formatCurrency(p.price)}` })),
              { value: 'outro', label: 'Outro (digitar)' },
            ]}
          />
        </div>
        {form.procedure_id === 'outro' && (
          <div className={f.field}>
            <input
              value={form.procedure_name}
              onChange={e => setForm(p => ({ ...p, procedure_name: e.target.value }))}
              placeholder="Nome do procedimento..."
              autoFocus
            />
          </div>
        )}
        {/* ── Próximos horários livres do profissional ── */}
        {form.professional_id && nextFree.length > 0 && (
          <div className={f.field}>
            <label>Próximos horários livres</label>
            <div className={styles.nextFreeRow}>
              {nextFree.map(s => {
                const picked = form.scheduled_at === `${s.date}T${s.time}`
                return (
                  <button
                    key={`${s.date}T${s.time}`}
                    type="button"
                    className={`${styles.nextFreeChip}${picked ? ` ${styles.nextFreeChipOn}` : ''}`}
                    onClick={() => setForm(p => ({ ...p, scheduled_at: `${s.date}T${s.time}` }))}
                  >
                    {new Date(`${s.date}T00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '')} · {s.time}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Data ── */}
        <div className={f.field}>
          <label>Data *</label>
          <DatePicker
            ariaLabel="Data"
            value={form.scheduled_at.slice(0, 10)}
            onChange={date => {
              const prevTime = form.scheduled_at.slice(11, 16) || '09:00'
              setForm(p => ({ ...p, scheduled_at: date ? `${date}T${prevTime}` : '' }))
            }}
          />
        </div>

        {/* ── Grade de horários ── */}
        <div className={f.field}>
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
                // ocupado = a casa em si ou qualquer casa dentro da duração escolhida (09:00 por 60 min invade o 09:30)
                const ownBusy = hasDate ? slotBusyMap.get(slot) : undefined
                const busyName = hasDate ? conflictInSpan(slot, Number(form.duration_minutes), slotBusyMap, TIME_SLOTS) : undefined
                const isBusy = !!busyName
                const isSelected = form.scheduled_at.slice(11, 16) === slot
                // fora da escala: só abre no modo encaixe
                const isOutside = hasDate && !!formSchedule && !slotInSchedule(formSchedule, formDateStr, slot, Number(form.duration_minutes) || defaultDuration)
                const closed = isOutside && !form.extra_mode
                return (
                  <button
                    key={slot}
                    type="button"
                    disabled={!hasDate || isBusy || closed}
                    title={!hasDate ? 'Selecione a data primeiro' : ownBusy ? `Ocupado — ${busyName}` : isBusy ? `Não cabe: ${busyName} logo depois (${form.duration_minutes} min)` : isOutside ? (closed ? 'Fora da escala do profissional' : `Encaixe fora da escala — ${slot}`) : `Selecionar ${slot}`}
                    className={`${styles.timeSlot}${isSelected ? ` ${styles.timeSlotSelected}` : ''}${isBusy || closed ? ` ${styles.timeSlotBusy}` : ''}${isOutside && form.extra_mode && !isBusy ? ` ${styles.timeSlotExtra}` : ''}`}
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
            <p className={styles.timeGridHint}>Horários em cinza estão ocupados ou não comportam a duração escolhida</p>
          )}
          {formSchedule && formDayStatus && (
            <div className={styles.scheduleNote}>
              <p className={styles.timeGridHint}>
                {formDayStatus.state === 'nao_atende' && 'O profissional não atende neste dia.'}
                {formDayStatus.state === 'por_definir' && 'A escala deste dia ainda não foi definida.'}
                {formDayStatus.state === 'atende' && `Escala do dia: ${describeDay(formDayStatus, schedules?.settings.shifts)}. Horários fora dela ficam em cinza.`}
              </p>
              {(canExtra || form.extra_mode) && (
                <button
                  type="button"
                  className={styles.extraToggle}
                  aria-pressed={form.extra_mode}
                  onClick={() => setForm(p => ({ ...p, extra_mode: !p.extra_mode }))}
                >
                  {form.extra_mode ? 'Voltar a mostrar só a escala' : 'Encaixar fora da escala'}
                </button>
              )}
            </div>
          )}
          {(form.extra_mode || formOutside) && formSchedule && (
            <div className={`${f.field} ${styles.extraReason}`}>
              <label>Motivo do encaixe{scheduleSettings.extraSlotRequireReason ? ' *' : ' (opcional)'}</label>
              <input
                value={form.extra_reason}
                onChange={e => setForm(p => ({ ...p, extra_reason: e.target.value }))}
                placeholder="Ex.: paciente com dor, retorno urgente"
                maxLength={200}
              />
            </div>
          )}
        </div>

        {/* ── Mais detalhes: duração, valor, status e observações ── */}
        <button
          type="button"
          className={styles.moreToggle}
          onClick={() => setShowMoreForm(v => !v)}
          aria-expanded={showMoreForm}
        >
          <Icon name={showMoreForm ? 'chevronDown' : 'chevronRight'} size={14} />
          Mais detalhes
          {!showMoreForm && <span className={styles.moreSummary}>{form.duration_minutes || 60} min</span>}
        </button>
        {showMoreForm && (
          <>
            <div className={f.field}>
              <label>Duração (min)</label>
              <IntegerInput value={form.duration_minutes || ''} onChange={v => setForm(p => ({ ...p, duration_minutes: v === '' ? 0 : Number(v) }))} min={5} max={720} placeholder="60" />
            </div>
            {form.procedure_id && form.procedure_id !== 'outro' && (
              <div className={f.field}>
                <label>Valor (R$)</label>
                <MoneyInput
                  value={form.procedure_price}
                  onChange={v => setForm(p => ({ ...p, procedure_price: v }))}
                />
              </div>
            )}
            <div className={f.field}>
              <label>Status</label>
              <SelectMenu variant="field" ariaLabel="Status" value={form.status}
                onChange={v => setForm(p => ({ ...p, status: v }))}
                options={[{ value: 'agendado', label: 'Agendado' }, { value: 'confirmado', label: 'Confirmado' }]} />
            </div>
            <div className={f.field}>
              <label>Observações</label>
              <textarea rows={3} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Informações adicionais..." />
            </div>
          </>
        )}
        {gcalConnected && (
          <label className={styles.gcalCheck}>
            <input type="checkbox" checked={syncToGCal} onChange={e => setSyncToGCal(e.target.checked)} />
            Sincronizar com Google Calendar
          </label>
        )}
        {saveError && <p ref={saveErrorRef} className={f.error} role="alert">{saveError}</p>}
      </Modal>

      {/* ── Remarcar consulta ── */}
      <Modal
        open={!!resched}
        onClose={closeReschedule}
        size="sm"
        title={reschedDone ? 'Consulta remarcada' : 'Remarcar consulta'}
        subtitle={resched ? `${resched.appt.patients?.name ?? 'Paciente'}${resched.appt.professionals?.name ? ` · ${resched.appt.professionals.name}` : ''}` : undefined}
        footer={reschedDone ? (
          <>
            {waMeNumber(reschedDone.patients?.phone) && (
              <a
                className={btn.secondary}
                href={clinic?.demoMode ? undefined : `https://wa.me/${waMeNumber(reschedDone.patients?.phone)}?text=${encodeURIComponent(
                  `Olá, ${reschedDone.patients?.name?.split(' ')[0]}! Sua consulta foi remarcada para ${formatDate(reschedDone.scheduled_at)}. Até lá!`
                )}`}
                target="_blank" rel="noopener noreferrer"
                aria-disabled={clinic?.demoMode ? true : undefined}
                aria-describedby={clinic?.demoMode ? 'agenda-demo-resched-note' : undefined}
                onClick={clinic?.demoMode ? e => e.preventDefault() : undefined}
              >Avisar paciente no WhatsApp</a>
            )}
            {waMeNumber(reschedDone.patients?.phone) && clinic?.demoMode && (
              <span id="agenda-demo-resched-note" className={styles.waHint}>Envio de mensagens desativado na conta de demonstração.</span>
            )}
            <button type="button" className={btn.primary} onClick={closeReschedule}>Fechar</button>
          </>
        ) : (
          <>
            <button type="button" className={btn.secondary} onClick={closeReschedule}>Cancelar</button>
            <button type="button" className={btn.primary} onClick={handleReschedule} disabled={reschedSaving || !resched?.date || !resched?.time}>
              {reschedSaving ? 'Remarcando...' : 'Remarcar'}
            </button>
          </>
        )}
      >
        {resched && (reschedDone ? (
          <p className={styles.reschedDone}>
            Nova data: <strong>{formatDate(reschedDone.scheduled_at)}</strong>. O histórico ficou nas observações da consulta.
          </p>
        ) : (
          <>
            <p className={styles.reschedFrom}>Hoje: {formatDate(resched.appt.scheduled_at)} · {resched.appt.duration_minutes ?? 60} min</p>
            <div className={f.field}>
              <label>Nova data *</label>
              <DatePicker
                ariaLabel="Nova data"
                value={resched.date}
                onChange={date => setResched(r => r ? { ...r, date, time: '' } : r)}
              />
            </div>
            <div className={f.field}>
              <div className={styles.fieldLabelRow}>
                <label>Novo horário *</label>
                {resched.time && <span className={styles.selectedTimeLabel}>{resched.time} selecionado</span>}
              </div>
              <div className={styles.timeGrid}>
                {TIME_SLOTS.map(slot => {
                  const ownBusy = resched.date ? reschedBusy.get(slot) : undefined
                  const busyName = resched.date ? conflictInSpan(slot, resched.appt.duration_minutes ?? 60, reschedBusy, TIME_SLOTS) : undefined
                  const isBusy = !!busyName
                  // fora da escala do profissional: só quem pode encaixar escolhe, e fica registrado
                  const reschedSched = resched.appt.professional_id ? scheduleFor(resched.appt.professional_id) : undefined
                  const isOutside = !!resched.date && !!reschedSched && !slotInSchedule(reschedSched, resched.date, slot, resched.appt.duration_minutes ?? 60)
                  const closed = isOutside && !canExtra
                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={!resched.date || isBusy || closed}
                      title={ownBusy ? `Ocupado — ${busyName}` : isBusy ? `Não cabe: ${busyName} logo depois` : isOutside ? (closed ? 'Fora da escala do profissional' : `Encaixe fora da escala — ${slot}`) : `Selecionar ${slot}`}
                      className={`${styles.timeSlot}${resched.time === slot ? ` ${styles.timeSlotSelected}` : ''}${isBusy || closed ? ` ${styles.timeSlotBusy}` : ''}${isOutside && !closed && !isBusy ? ` ${styles.timeSlotExtra}` : ''}`}
                      onClick={() => setResched(r => r ? { ...r, time: slot } : r)}
                    >
                      {slot}
                    </button>
                  )
                })}
              </div>
              {reschedBusy.size > 0 && <p className={styles.timeGridHint}>Horários em cinza estão ocupados ou não comportam a duração da consulta</p>}
            </div>
            {reschedError && <p className={f.error} role="alert">{reschedError}</p>}
          </>
        ))}
      </Modal>

      {/* ── Casa livre: agendar ou bloquear ── */}
      <Modal
        open={!!slotChoice}
        onClose={() => setSlotChoice(null)}
        size="sm"
        title={slotChoice ? `${slotChoice.time} · ${new Date(`${slotChoice.date}T00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}` : 'Horário'}
        subtitle={slotChoice?.professionalId ? professionals.find(p => p.id === slotChoice.professionalId)?.name : undefined}
      >
        <div className={styles.slotChoice}>
          <button type="button" className={`${btn.primary} ${styles.slotChoiceBtn}`} onClick={chooseSlotSchedule}>
            <Icon name="plus" size={16} /> Agendar consulta
          </button>
          <button type="button" className={`${btn.secondary} ${styles.slotChoiceBtn}`} onClick={chooseSlotBlock}>
            Bloquear este horário
          </button>
          <p className={styles.slotChoiceHint}>Bloquear reserva o horário para almoço, reunião ou folga: ninguém consegue agendar nele.</p>
        </div>
      </Modal>

      {/* ── Bloqueio de horário ── */}
      <Modal
        open={showBlockModal}
        onClose={closeBlockModal}
        size="sm"
        title="Bloquear horário"
        footer={
          <>
            <button type="button" className={btn.secondary} onClick={closeBlockModal}>Cancelar</button>
            <button type="button" className={btn.primary} onClick={handleSaveBlock} disabled={savingBlock || !blockForm.scheduled_at}>
              {savingBlock ? 'Salvando...' : 'Bloquear horário'}
            </button>
          </>
        }
      >
        <div className={f.field}>
          <label>Profissional</label>
          <SelectMenu variant="field" ariaLabel="Profissional" value={blockForm.professional_id}
            onChange={v => setBlockForm(p => ({ ...p, professional_id: v }))}
            options={[
              ...(canSeeAllProfessionals ? [{ value: '', label: 'Toda a clínica' }] : []),
              ...professionals.map(p => ({ value: p.id, label: p.name })),
            ]} />
        </div>
        <div className={f.field}>
          <label>Data *</label>
          <DatePicker
            ariaLabel="Data"
            value={blockForm.scheduled_at.slice(0, 10)}
            onChange={date => {
              const prevTime = blockForm.scheduled_at.slice(11, 16) || '09:00'
              setBlockForm(p => ({ ...p, scheduled_at: date ? `${date}T${prevTime}` : '' }))
            }}
          />
        </div>
        <div className={f.field}>
          <label>Horário início *</label>
          <SelectMenu
            variant="field"
            ariaLabel="Horário de início"
            value={blockForm.scheduled_at.slice(11, 16)}
            onChange={v => setBlockForm(p => ({ ...p, scheduled_at: `${p.scheduled_at.slice(0, 10)}T${v}` }))}
            disabled={!blockForm.scheduled_at.slice(0, 10)}
            options={[{ value: '', label: 'Selecione...' }, ...TIME_SLOTS.map(slot => ({ value: slot, label: slot }))]}
          />
        </div>
        <div className={f.field}>
          <label>Duração (min)</label>
          <IntegerInput value={blockForm.duration_minutes || ''} onChange={v => setBlockForm(p => ({ ...p, duration_minutes: v === '' ? 0 : Number(v) }))} min={5} max={720} placeholder="60" />
        </div>
        <div className={f.field}>
          <label>Motivo</label>
          <input value={blockForm.notes} onChange={e => setBlockForm(p => ({ ...p, notes: e.target.value }))} placeholder="Ex: Almoço, Férias, Indisponível..." />
        </div>
        {blockError && <p ref={blockErrorRef} className={f.error} role="alert">{blockError}</p>}
      </Modal>
        </div>
      </div>
    </div>
  )
}

export default function AgendaPage() {
  return <PermissionGuard module="agenda"><AgendaContent /></PermissionGuard>
}
