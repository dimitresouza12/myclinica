// Tipos e regras de configuração do agendamento online (tela do admin e página pública). Sem rede.

import type { DayRow, PatternRow, ScheduleData, Window } from '@/lib/agenda/availability'
import { DEFAULT_OPENING } from '@/lib/agenda/settings'
import { toMinutes } from './tz'
import type { OnlineRules } from './horarios'

export type ConfirmMode = 'pendente' | 'confirmado'

export const TIMEZONES: { value: string; label: string }[] = [
  { value: 'America/Sao_Paulo', label: 'Brasília (SP, RJ, MG, sul, DF)' },
  { value: 'America/Fortaleza', label: 'Fortaleza (CE, RN, PI, MA)' },
  { value: 'America/Recife', label: 'Recife (PE, AL, SE, PB)' },
  { value: 'America/Bahia', label: 'Salvador (BA)' },
  { value: 'America/Belem', label: 'Belém (PA, AP)' },
  { value: 'America/Manaus', label: 'Manaus (AM)' },
  { value: 'America/Cuiaba', label: 'Cuiabá (MT)' },
  { value: 'America/Campo_Grande', label: 'Campo Grande (MS)' },
  { value: 'America/Porto_Velho', label: 'Porto Velho (RO)' },
  { value: 'America/Boa_Vista', label: 'Boa Vista (RR)' },
  { value: 'America/Rio_Branco', label: 'Rio Branco (AC)' },
  { value: 'America/Noronha', label: 'Fernando de Noronha' },
]
const TIMEZONE_SET = new Set(TIMEZONES.map(t => t.value))
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo'

export const CONFIRM_MODE_LABELS: Record<ConfirmMode, { label: string; hint: string }> = {
  pendente: { label: 'Pendente de confirmação', hint: 'O horário fica reservado como Agendado e a clínica confirma depois.' },
  confirmado: { label: 'Confirmado na hora', hint: 'O horário já nasce Confirmado, sem passo da clínica.' },
}

/** Configuração salva (linha de clinic_online_booking). */
export interface OnlineBookingSettings {
  enabled: boolean
  slug: string
  confirmMode: ConfirmMode
  minNoticeHours: number
  maxDaysAhead: number
  timezone: string
}

export const DEFAULT_ONLINE_SETTINGS: OnlineBookingSettings = {
  enabled: false, slug: '', confirmMode: 'pendente', minNoticeHours: 4, maxDaysAhead: 30, timezone: DEFAULT_TIMEZONE,
}

const int = (v: unknown, fallback: number, min: number, max: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback
}

export function parseOnlineSettings(row: Record<string, unknown> | null | undefined): OnlineBookingSettings {
  if (!row) return DEFAULT_ONLINE_SETTINGS
  const tz = String(row.timezone ?? '')
  return {
    enabled: row.enabled === true,
    slug: typeof row.slug === 'string' ? row.slug : '',
    confirmMode: row.confirm_mode === 'confirmado' ? 'confirmado' : 'pendente',
    minNoticeHours: int(row.min_notice_hours, DEFAULT_ONLINE_SETTINGS.minNoticeHours, 0, 720),
    maxDaysAhead: int(row.max_days_ahead, DEFAULT_ONLINE_SETTINGS.maxDaysAhead, 1, 180),
    timezone: TIMEZONE_SET.has(tz) ? tz : DEFAULT_TIMEZONE,
  }
}

export function settingsToRow(s: OnlineBookingSettings) {
  return {
    enabled: s.enabled,
    slug: s.slug.trim() === '' ? null : s.slug.trim(),
    confirm_mode: s.confirmMode,
    min_notice_hours: s.minNoticeHours,
    max_days_ahead: s.maxDaysAhead,
    timezone: s.timezone,
  }
}

/** Confere o que o admin digitou antes de salvar. Mensagem do primeiro problema, ou null. */
export function validateOnlineSettings(s: OnlineBookingSettings, picked: { professionals: number }): string | null {
  if (s.enabled && picked.professionals === 0) return 'Escolha pelo menos um profissional para ligar o agendamento online.'
  if (s.enabled && !s.slug.trim()) return 'Escolha o endereço do link para ligar o agendamento online.'
  if (!Number.isInteger(s.minNoticeHours) || s.minNoticeHours < 0 || s.minNoticeHours > 720) return 'A antecedência mínima vai de 0 a 720 horas.'
  if (!Number.isInteger(s.maxDaysAhead) || s.maxDaysAhead < 1 || s.maxDaysAhead > 180) return 'A janela máxima vai de 1 a 180 dias.'
  return null
}

/**
 * Profissional só entra no link com a escala ligada: sem escala o público veria a grade inteira (almoço e folgas
 * incluídos). O banco também recusa (trigger em online_booking_professionals); aqui é a mensagem antes de salvar.
 */
export function scheduleProblem(selectedIds: string[], professionals: { id: string; name: string; schedule_enabled?: boolean | null }[]): string | null {
  const bad = professionals.filter(p => selectedIds.includes(p.id) && !p.schedule_enabled).map(p => p.name)
  if (bad.length === 0) return null
  const who = bad.join(', ')
  return bad.length === 1
    ? `${who} não tem escala ligada. Ligue a escala na Agenda ou desmarque o profissional: sem escala o link mostraria todos os horários, inclusive almoço e folgas.`
    : `${who} não têm escala ligada. Ligue a escala na Agenda ou desmarque esses profissionais: sem escala o link mostraria todos os horários, inclusive almoço e folgas.`
}

// ── contexto público (resposta de online_booking_context) ──────────────────

export interface PublicProfessional { id: string; name: string; specialty: string | null; durationMinutes: number }
export interface PublicProcedure { id: string; name: string; category: string | null }
export interface PublicContext {
  clinic: { name: string; logoUrl: string | null; address: string | null; phone: string | null; primaryColor: string | null }
  config: { confirmMode: ConfirmMode; minNoticeHours: number; maxDaysAhead: number; timezone: string }
  professionals: PublicProfessional[]
  procedures: PublicProcedure[]
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

/** Só cor hexadecimal vai para o estilo da página (nada vindo do banco entra como CSS solto). */
export function safeColor(v: unknown): string | null {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null
}

/** Só endereço https vai para <img>. */
export function safeImageUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null
  try {
    const u = new URL(v)
    return u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

/** Resposta crua do RPC -> contexto tipado. null se não tiver o formato esperado. */
export function parsePublicContext(raw: unknown): PublicContext | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const clinic = r.clinic as Record<string, unknown> | undefined
  const config = r.config as Record<string, unknown> | undefined
  if (!clinic || !config || typeof clinic.name !== 'string') return null
  const professionals: PublicProfessional[] = (Array.isArray(r.professionals) ? r.professionals : [])
    .map(p => p as Record<string, unknown>)
    .filter(p => typeof p.id === 'string' && typeof p.name === 'string')
    .map(p => ({ id: p.id as string, name: p.name as string, specialty: text(p.specialty), durationMinutes: int(p.duration_minutes, 30, 10, 240) }))
  const procedures: PublicProcedure[] = (Array.isArray(r.procedures) ? r.procedures : [])
    .map(p => p as Record<string, unknown>)
    .filter(p => typeof p.id === 'string' && typeof p.name === 'string')
    .map(p => ({ id: p.id as string, name: p.name as string, category: text(p.category) }))
  return {
    clinic: {
      name: clinic.name,
      logoUrl: safeImageUrl(clinic.logo_url),
      address: text(clinic.address),
      phone: text(clinic.phone),
      primaryColor: safeColor(clinic.primary_color),
    },
    config: {
      confirmMode: config.confirm_mode === 'confirmado' ? 'confirmado' : 'pendente',
      minNoticeHours: int(config.min_notice_hours, 4, 0, 720),
      maxDaysAhead: int(config.max_days_ahead, 30, 1, 180),
      timezone: TIMEZONE_SET.has(String(config.timezone)) ? String(config.timezone) : DEFAULT_TIMEZONE,
    },
    professionals,
    procedures,
  }
}

// ── disponibilidade (resposta de online_booking_availability) ──────────────

export interface Availability {
  rules: OnlineRules
  durationMin: number
  schedule: ScheduleData
  busy: { startMs: number; endMs: number }[]
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

function windowsOf(raw: unknown): Window[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((w): w is Window => !!w && typeof (w as Window).start === 'string' && typeof (w as Window).end === 'string')
    .map(w => ({ start: w.start, end: w.end, shift_id: w.shift_id ?? null }))
}

/** Resposta crua do RPC -> o que `freeSlotsByDay` precisa. null se o formato não for o esperado. */
export function parseAvailability(raw: unknown): Availability | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const cfg = r.config as Record<string, unknown> | undefined
  const sch = r.schedule as Record<string, unknown> | undefined
  if (!cfg || !sch) return null

  const open = cfg.opening as { start?: unknown; end?: unknown } | undefined
  const opening = open && HHMM.test(String(open.start)) && HHMM.test(String(open.end)) && toMinutes(String(open.end)) > toMinutes(String(open.start))
    ? { start: String(open.start), end: String(open.end) }
    : DEFAULT_OPENING
  const step = Number(cfg.step_minutes)
  const tz = String(cfg.timezone)

  const pattern: PatternRow[] = (Array.isArray(sch.pattern) ? sch.pattern : [])
    .map(p => p as Record<string, unknown>)
    .filter(p => Number.isInteger(p.weekday))
    .map(p => ({ weekday: p.weekday as number, windows: windowsOf(p.windows) }))
  const days: DayRow[] = (Array.isArray(sch.days) ? sch.days : [])
    .map(d => d as Record<string, unknown>)
    .filter(d => typeof d.date === 'string')
    .map(d => ({ date: d.date as string, works: d.works === true, windows: windowsOf(d.windows) }))

  const busy = (Array.isArray(r.busy) ? r.busy : [])
    .filter((b): b is [number, number] => Array.isArray(b) && Number.isFinite(Number(b[0])) && Number.isFinite(Number(b[1])))
    .map(b => ({ startMs: Number(b[0]), endMs: Number(b[1]) }))

  return {
    rules: {
      timezone: TIMEZONE_SET.has(tz) ? tz : DEFAULT_TIMEZONE,
      minNoticeHours: int(cfg.min_notice_hours, 4, 0, 720),
      maxDaysAhead: int(cfg.max_days_ahead, 30, 1, 180),
      stepMinutes: [15, 20, 30, 60].includes(step) ? step : 30,
      opening,
    },
    durationMin: int(r.duration_minutes, 30, 10, 240),
    schedule: { enabled: sch.enabled === true, pattern, days },
    busy,
  }
}

// ── resposta da criação ────────────────────────────────────────────────────

export type BookingErrorCode =
  | 'indisponivel' | 'dados_invalidos' | 'profissional_invalido' | 'procedimento_invalido'
  | 'fora_da_janela' | 'horario_invalido' | 'horario_ocupado' | 'limite'

/** Mensagem e status HTTP de cada recusa do banco. Nunca devolvemos o texto cru do banco ao paciente. */
export const BOOKING_ERRORS: Record<BookingErrorCode, { status: number; message: string }> = {
  indisponivel: { status: 404, message: 'O agendamento online não está disponível agora.' },
  dados_invalidos: { status: 400, message: 'Confira os dados informados e tente de novo.' },
  profissional_invalido: { status: 400, message: 'Escolha um profissional da lista.' },
  procedimento_invalido: { status: 400, message: 'Escolha um serviço da lista.' },
  fora_da_janela: { status: 409, message: 'Esse horário não está mais disponível para agendamento online. Escolha outro.' },
  horario_invalido: { status: 409, message: 'Esse horário não está mais disponível. Escolha outro.' },
  horario_ocupado: { status: 409, message: 'Alguém acabou de reservar esse horário. Escolha outro.' },
  limite: { status: 429, message: 'Muitas tentativas de agendamento. Fale com a clínica por telefone ou WhatsApp.' },
}

export function isBookingErrorCode(code: unknown): code is BookingErrorCode {
  return typeof code === 'string' && code in BOOKING_ERRORS
}

export interface BookingDone {
  status: 'agendado' | 'confirmado'
  startsAt: string
  durationMinutes: number
  clinicName: string
  professionalName: string
  procedureName: string
}

// ── cor da clínica na página pública ───────────────────────────────────────

function luminance(hex: string): number {
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

const DARK_TEXT = '#0D2421'

/** Cor de texto legível (escura ou clara) sobre o fundo `hex` (#RRGGBB): a de maior razão de contraste (WCAG). */
export function contrastText(hex: string): '#0D2421' | '#FFFFFF' {
  const bg = luminance(hex)
  const dark = (bg + 0.05) / (luminance(DARK_TEXT) + 0.05)
  const light = 1.05 / (bg + 0.05)
  return dark >= light ? DARK_TEXT : '#FFFFFF'
}
