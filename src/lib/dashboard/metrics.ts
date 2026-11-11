// Números do Dashboard calculados a partir das linhas já buscadas. Funções puras, no fuso local do navegador
// (o mesmo da agenda), para testar sem banco.

export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** "2026-10-27" no fuso local (não em UTC: 22h no Brasil já é o dia seguinte em UTC). */
export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

/** Os n dias que terminam em `today` (inclusive), do mais antigo para o mais novo. */
export function lastDays(today: Date, n: number): Date[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)))
}

/** Domingo a sábado da semana de `d`. */
export function weekDays(d: Date): Date[] {
  const sunday = addDays(d, -d.getDay())
  return Array.from({ length: 7 }, (_, i) => addDays(sunday, i))
}

interface Money { created_at: string | null; total_amount: number | null; type?: string | null }

/** Soma de receitas por dia, na ordem dos dias pedidos. */
export function revenueByDay(records: Money[], days: Date[]): number[] {
  const byKey = new Map<string, number>()
  for (const r of records) {
    if (!r.created_at || (r.type && r.type !== 'receita')) continue
    const k = localDayKey(new Date(r.created_at))
    byKey.set(k, (byKey.get(k) ?? 0) + (r.total_amount ?? 0))
  }
  return days.map(d => byKey.get(localDayKey(d)) ?? 0)
}

/** Receita do mês até hoje contra o mesmo trecho do mês anterior (dia 1 até o mesmo dia). */
export function monthToDate(records: Money[], today: Date): { current: number; previous: number; pct: number | null } {
  const y = today.getFullYear()
  const m = today.getMonth()
  const day = today.getDate()
  const prevLast = new Date(y, m, 0).getDate()
  let current = 0
  let previous = 0
  for (const r of records) {
    if (!r.created_at || (r.type && r.type !== 'receita')) continue
    const d = new Date(r.created_at)
    if (d.getFullYear() === y && d.getMonth() === m && d.getDate() <= day) current += r.total_amount ?? 0
    const pm = new Date(y, m - 1, 1)
    if (d.getFullYear() === pm.getFullYear() && d.getMonth() === pm.getMonth() && d.getDate() <= Math.min(day, prevLast)) previous += r.total_amount ?? 0
  }
  return { current, previous, pct: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null }
}

interface Appt { status: string; scheduled_at: string }

export interface Attendance {
  done: number
  noShow: number
  cancelled: number
  /** compareceram ÷ (compareceram + faltaram); null sem nenhum dos dois */
  rate: number | null
  perDay: { done: number[]; noShow: number[]; cancelled: number[] }
}

/** Comparecimento nos dias pedidos, contando só consultas que já passaram de `now`. */
export function attendance(appts: Appt[], days: Date[], now: Date): Attendance {
  const idx = new Map(days.map((d, i) => [localDayKey(d), i]))
  const perDay = { done: days.map(() => 0), noShow: days.map(() => 0), cancelled: days.map(() => 0) }
  for (const a of appts) {
    const when = new Date(a.scheduled_at)
    if (when > now) continue
    const i = idx.get(localDayKey(when))
    if (i === undefined) continue
    if (a.status === 'concluido') perDay.done[i]++
    else if (a.status === 'faltou') perDay.noShow[i]++
    else if (a.status === 'cancelado') perDay.cancelled[i]++
  }
  const sum = (v: number[]) => v.reduce((s, n) => s + n, 0)
  const done = sum(perDay.done)
  const noShow = sum(perDay.noShow)
  return { done, noShow, cancelled: sum(perDay.cancelled), rate: done + noShow > 0 ? done / (done + noShow) : null, perDay }
}

/** Confirmação da semana: das consultas de pé na semana (sem canceladas e faltas), quantas já passaram de "agendado". */
export function weekConfirmation(appts: Appt[], week: Date[]): { confirmed: number; total: number; rate: number | null } {
  const keys = new Set(week.map(localDayKey))
  let confirmed = 0
  let total = 0
  for (const a of appts) {
    if (!keys.has(localDayKey(new Date(a.scheduled_at)))) continue
    if (a.status === 'agendado') total++
    else if (a.status === 'confirmado' || a.status === 'arrived' || a.status === 'in_progress' || a.status === 'concluido') { total++; confirmed++ }
  }
  return { confirmed, total, rate: total > 0 ? confirmed / total : null }
}

/** Consultas por dia (sem canceladas). */
export function appointmentsByDay(appts: Appt[], days: Date[]): number[] {
  const idx = new Map(days.map((d, i) => [localDayKey(d), i]))
  const out = days.map(() => 0)
  for (const a of appts) {
    if (a.status === 'cancelado' || a.status === 'bloqueado') continue
    const i = idx.get(localDayKey(new Date(a.scheduled_at)))
    if (i !== undefined) out[i]++
  }
  return out
}

/** Primeiro atendimento de hoje ainda por acontecer (agendado ou confirmado), com 15 min de tolerância para atraso. */
export function nextAppointment<T extends Appt>(today: T[], now: Date): T | null {
  const tolerance = now.getTime() - 15 * 60 * 1000
  return [...today]
    .filter(a => (a.status === 'agendado' || a.status === 'confirmado') && new Date(a.scheduled_at).getTime() >= tolerance)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0] ?? null
}

/** Total de pacientes ativos ao fim de cada dia, a partir do total de hoje e das datas de cadastro recentes. */
export function patientsSeries(totalNow: number, recentCreatedAt: string[], days: Date[]): number[] {
  return days.map(d => {
    const end = addDays(d, 1).getTime()
    const after = recentCreatedAt.filter(c => new Date(c).getTime() >= end).length
    return totalNow - after
  })
}
