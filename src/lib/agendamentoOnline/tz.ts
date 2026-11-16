// Fuso da clínica para o agendamento online. Funções puras (Intl), sem depender do fuso do servidor:
// o servidor roda em UTC e o paciente escolhe "08:00" no relógio da clínica.

const pad = (n: number) => String(n).padStart(2, '0')

/** "AAAA-MM-DD" com mês e dia existentes (31/02 não passa). */
export function isValidDateKey(key: unknown): key is string {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false
  const [y, m, d] = key.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** "HH:mm" de 00:00 a 23:59. */
export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

/** Minutos desde 00:00 de um "HH:mm". */
export function toMinutes(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
}

/** Soma `n` dias a "AAAA-MM-DD" (calendário puro, sem fuso). */
export function addDaysToKey(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** Dia da semana (0 = domingo) de "AAAA-MM-DD", sem fuso. */
export function weekdayOfKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Data e hora de parede de um instante no fuso `tz`. */
function wallParts(ms: number, tz: string): { y: number; mo: number; d: number; h: number; mi: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms))
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? '0')
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour'), mi: get('minute') }
}

/** "AAAA-MM-DD" do instante no fuso `tz`. */
export function dateKeyInZone(ms: number, tz: string): string {
  const w = wallParts(ms, tz)
  return `${w.y}-${pad(w.mo)}-${pad(w.d)}`
}

/** Diferença (ms) entre a hora de parede de `tz` e UTC no instante `ms`. Negativa a oeste de Greenwich. */
function offsetMs(ms: number, tz: string): number {
  const w = wallParts(ms, tz)
  return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi) - Math.floor(ms / 60000) * 60000
}

/**
 * Instante (ms UTC) em que o relógio de `tz` marca `dateKey` `hhmm`.
 * Duas passadas para acertar a hora vizinha a uma mudança de horário de verão.
 */
export function zonedWallToUtcMs(dateKey: string, hhmm: string, tz: string): number {
  const [y, m, d] = dateKey.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5)))
  let result = guess - offsetMs(guess, tz)
  const second = guess - offsetMs(result, tz)
  if (second !== result) result = second
  return result
}
