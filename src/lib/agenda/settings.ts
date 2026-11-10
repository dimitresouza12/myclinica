// Configurações da Agenda por clínica (Configurações → Agenda). Sem linha no banco valem os padrões.
import { DEFAULT_SHIFTS, type Shift } from './availability'

export type ExtraSlotPolicy = 'none' | 'admin' | 'admin_recepcao'

export interface ScheduleSettings {
  shifts: Shift[]
  /** quem pode encaixar fora da escala */
  extraSlotPolicy: ExtraSlotPolicy
  extraSlotRequireReason: boolean
  reminderEnabled: boolean
  /** avisa quando há dia por definir nos próximos N dias */
  reminderDaysBefore: number
  /** horário de funcionamento da grade: casas de `start` até antes de `end` */
  opening: { start: string; end: string }
}

export const DEFAULT_OPENING = { start: '07:00', end: '19:30' }

export const DEFAULT_SETTINGS: ScheduleSettings = {
  shifts: DEFAULT_SHIFTS,
  extraSlotPolicy: 'admin_recepcao',
  extraSlotRequireReason: true,
  reminderEnabled: true,
  reminderDaysBefore: 3,
  opening: DEFAULT_OPENING,
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

function parseShifts(raw: unknown): Shift[] {
  if (!Array.isArray(raw)) return DEFAULT_SHIFTS
  const list = raw.filter((s): s is Shift =>
    !!s && typeof s.id === 'string' && typeof s.name === 'string' && HHMM.test(String(s.start)) && HHMM.test(String(s.end)) && toMin(s.end) > toMin(s.start))
  return list.length > 0 ? list : DEFAULT_SHIFTS
}

/** Linha do banco (colunas em snake_case, qualquer uma pode faltar) -> configurações. */
export function parseSettings(row: Record<string, unknown> | null | undefined): ScheduleSettings {
  if (!row) return DEFAULT_SETTINGS
  const policy = row.extra_slot_policy
  const days = Number(row.reminder_days_before)
  const op = row.opening_hours as { start?: unknown; end?: unknown } | null | undefined
  const opening = op && HHMM.test(String(op.start)) && HHMM.test(String(op.end)) && toMin(String(op.end)) > toMin(String(op.start))
    ? { start: String(op.start), end: String(op.end) }
    : DEFAULT_OPENING
  return {
    shifts: parseShifts(row.shifts),
    extraSlotPolicy: policy === 'none' || policy === 'admin' || policy === 'admin_recepcao' ? policy : DEFAULT_SETTINGS.extraSlotPolicy,
    extraSlotRequireReason: row.extra_slot_require_reason !== false,
    reminderEnabled: row.reminder_enabled !== false,
    reminderDaysBefore: Number.isFinite(days) && days >= 0 && days <= 30 ? Math.round(days) : DEFAULT_SETTINGS.reminderDaysBefore,
    opening,
  }
}

/** Casas da grade ("07:00", "07:30"…): de `start` enquanto a casa começar antes de `end`. */
export function buildSlots(opening: { start: string; end: string }, stepMin = 30): string[] {
  const out: string[] = []
  for (let m = toMin(opening.start); m < toMin(opening.end); m += stepMin) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
  }
  return out
}

/** Esse usuário pode encaixar fora da escala? */
export function canExtraSlot(policy: ExtraSlotPolicy, who: { isAdmin: boolean; isAdminOrRecepcao: boolean }): boolean {
  if (policy === 'none') return false
  return policy === 'admin' ? who.isAdmin : who.isAdminOrRecepcao
}

/** Confere o que o admin digitou antes de salvar. Devolve a mensagem do primeiro problema, ou null. */
export function validateSettings(s: ScheduleSettings): string | null {
  if (s.shifts.length === 0) return 'Deixe pelo menos um turno.'
  const names = new Set<string>()
  for (const sh of s.shifts) {
    const name = sh.name.trim()
    if (!name) return 'Dê um nome a cada turno.'
    if (names.has(name.toLowerCase())) return `Há dois turnos chamados "${name}".`
    names.add(name.toLowerCase())
    if (!HHMM.test(sh.start) || !HHMM.test(sh.end) || toMin(sh.end) <= toMin(sh.start)) return `O turno "${name}" precisa terminar depois de começar.`
  }
  if (!HHMM.test(s.opening.start) || !HHMM.test(s.opening.end) || toMin(s.opening.end) <= toMin(s.opening.start)) return 'O horário de funcionamento precisa terminar depois de começar.'
  return null
}

/** Colunas do banco a partir das configurações. */
export function settingsToRow(s: ScheduleSettings) {
  return {
    shifts: s.shifts.map(x => ({ id: x.id, name: x.name.trim(), start: x.start, end: x.end })),
    extra_slot_policy: s.extraSlotPolicy,
    extra_slot_require_reason: s.extraSlotRequireReason,
    reminder_enabled: s.reminderEnabled,
    reminder_days_before: s.reminderDaysBefore,
    opening_hours: s.opening,
  }
}
