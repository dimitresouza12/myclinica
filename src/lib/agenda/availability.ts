// Escala dos profissionais: quando cada um atende. Funções puras, no fuso local do navegador.
// Camadas por dia: escala da data > rotina semanal > por definir. Sem escala ligada, atende a qualquer hora.
import { localDateKey, buildBusyMap, conflictInSpan, type SlotAppt } from './slots'

/** Janela de atendimento no dia, "HH:mm". `shift_id` liga à turno da clínica quando veio de um turno. */
export interface Window { start: string; end: string; shift_id?: string | null }

/** Rotina de um dia da semana (0 = domingo). Dia da semana sem linha = não atende pela rotina. */
export interface PatternRow { weekday: number; windows: Window[] }

/** Escala de uma data; substitui a rotina nesse dia. `works` falso = não atende. */
export interface DayRow { date: string; works: boolean; windows: Window[] }

export interface ScheduleData {
  /** professionals.schedule_enabled; falso = como antes (sem escala) */
  enabled: boolean
  pattern: PatternRow[]
  days: DayRow[]
}

export interface Shift { id: string; name: string; start: string; end: string }

export const DEFAULT_SHIFTS: Shift[] = [
  { id: 'manha', name: 'Manhã', start: '08:00', end: '12:00' },
  { id: 'tarde', name: 'Tarde', start: '13:00', end: '18:00' },
]

export const NO_SCHEDULE: ScheduleData = { enabled: false, pattern: [], days: [] }

export type DayStatus =
  | { state: 'sem_escala' }
  | { state: 'atende'; windows: Window[]; source: 'dia' | 'rotina' }
  | { state: 'nao_atende'; source: 'dia' | 'rotina' }
  | { state: 'por_definir' }

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/** Dia da semana (0 = domingo) de "AAAA-MM-DD" sem passar por fuso. */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

/** Como o profissional está nesse dia. */
export function dayStatus(schedule: ScheduleData | undefined, dateStr: string): DayStatus {
  if (!schedule || !schedule.enabled) return { state: 'sem_escala' }
  const day = schedule.days.find(d => d.date === dateStr)
  if (day) return day.works ? { state: 'atende', windows: day.windows, source: 'dia' } : { state: 'nao_atende', source: 'dia' }
  if (schedule.pattern.length > 0) {
    const row = schedule.pattern.find(p => p.weekday === weekdayOf(dateStr))
    return row && (row.windows.length > 0) ? { state: 'atende', windows: row.windows, source: 'rotina' } : { state: 'nao_atende', source: 'rotina' }
  }
  return { state: 'por_definir' }
}

/** A consulta inteira (início + duração) cabe numa janela? Janelas vazias com `atende` = dia todo. */
export function fitsWindows(slot: string, durationMin: number, windows: Window[]): boolean {
  if (windows.length === 0) return true
  const s = toMin(slot)
  const e = s + (durationMin || 30)
  return windows.some(w => s >= toMin(w.start) && e <= toMin(w.end))
}

/** Esse horário está dentro da escala do profissional? Sem escala ligada, sempre. */
export function slotInSchedule(schedule: ScheduleData | undefined, dateStr: string, slot: string, durationMin: number): boolean {
  const st = dayStatus(schedule, dateStr)
  if (st.state === 'sem_escala') return true
  if (st.state !== 'atende') return false
  return fitsWindows(slot, durationMin, st.windows)
}

/** Janelas de um turno da clínica. */
export const windowOfShift = (s: Shift): Window => ({ start: s.start, end: s.end, shift_id: s.id })

/** Texto curto de um dia: "Manhã · Tarde", "08:00–12:00", "Não atende", "Por definir". */
export function describeDay(status: DayStatus, shifts: Shift[] = DEFAULT_SHIFTS): string {
  switch (status.state) {
    case 'sem_escala': return 'Sem escala'
    case 'por_definir': return 'Por definir'
    case 'nao_atende': return 'Não atende'
    case 'atende': {
      if (status.windows.length === 0) return 'Dia todo'
      return status.windows.map(w => {
        const sh = w.shift_id ? shifts.find(s => s.id === w.shift_id && s.start === w.start && s.end === w.end) : undefined
        return sh ? sh.name : `${w.start}–${w.end}`
      }).join(' · ')
    }
  }
}

/** Os 7 dias (domingo a sábado) da semana que contém `ref`, como "AAAA-MM-DD". */
export function weekDates(ref: Date): string[] {
  const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - ref.getDay())
  return Array.from({ length: 7 }, (_, i) => localDateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)))
}

/** Resumo de uma linha da escala do profissional para o cabeçalho da agenda dele. */
export function summarizeSchedule(schedule: ScheduleData | undefined, ref: Date, shifts: Shift[] = DEFAULT_SHIFTS): string {
  if (!schedule || !schedule.enabled) return 'Atende em qualquer horário (escala não configurada)'
  const names = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
  const dates = weekDates(ref)
  const statuses = dates.map(d => dayStatus(schedule, d))
  if (statuses.every(s => s.state === 'por_definir')) return 'Escala por definir nesta semana'
  const days = statuses.map((s, i) => ({ s, i })).filter(x => x.s.state === 'atende')
  if (days.length === 0) return 'Não atende nesta semana'
  const list = days.map(x => names[x.i]).join(', ')
  const texts = new Set(days.map(x => describeDay(x.s, shifts)))
  const when = texts.size === 1 ? ` · ${[...texts][0].toLowerCase()}` : ''
  const open = statuses.some(s => s.state === 'por_definir') ? ' · há dias por definir' : ''
  return `Atende ${list}${when}${open}`
}

/** Casas livres de um profissional num dia: dentro da escala, sem consulta nem bloqueio e com a consulta inteira cabendo. */
export function freeSlotsOfDay(
  appts: SlotAppt[],
  opts: { professionalId: string; dateStr: string; durationMin: number; slots: string[]; schedule?: ScheduleData; ignoreId?: string | null },
): string[] {
  const busy = buildBusyMap(appts, { dateStr: opts.dateStr, professionalId: opts.professionalId, ignoreId: opts.ignoreId, slots: opts.slots })
  return opts.slots.filter(slot =>
    slotInSchedule(opts.schedule, opts.dateStr, slot, opts.durationMin) &&
    !conflictInSpan(slot, opts.durationMin, busy, opts.slots),
  )
}

export interface ClosedRange { start: number; end: number }

/**
 * Trechos do dia (em minutos desde 00:00, dentro de min..max) em que o profissional não atende.
 * Sem escala ligada: nenhum. Não atende ou por definir: o dia todo. Atende: o que sobra fora das janelas.
 */
export function closedRanges(schedule: ScheduleData | undefined, dateStr: string, min: number, max: number): ClosedRange[] {
  const st = dayStatus(schedule, dateStr)
  if (st.state === 'sem_escala') return []
  if (st.state !== 'atende') return [{ start: min, end: max }]
  if (st.windows.length === 0) return []
  const open = st.windows
    .map(w => ({ start: Math.max(toMin(w.start), min), end: Math.min(toMin(w.end), max) }))
    .filter(w => w.end > w.start)
    .sort((a, b) => a.start - b.start)
  const out: ClosedRange[] = []
  let cursor = min
  for (const w of open) {
    if (w.start > cursor) out.push({ start: cursor, end: w.start })
    cursor = Math.max(cursor, w.end)
  }
  if (cursor < max) out.push({ start: cursor, end: max })
  return out
}

/** Quantos dias, de hoje até daqui a `days`, ficaram por definir para esse profissional. */
export function undefinedDaysAhead(schedule: ScheduleData | undefined, from: Date, days: number): number {
  if (!schedule || !schedule.enabled) return 0
  let n = 0
  for (let i = 0; i <= days; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i)
    if (dayStatus(schedule, localDateKey(d)).state === 'por_definir') n++
  }
  return n
}
