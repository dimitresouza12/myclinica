import { formatMonthLabel } from '@/lib/utils'

/** Períodos do relatório: hoje, esta semana (domingo a sábado, como no Financeiro), um mês à escolha ou um intervalo livre. */
export type PeriodKind = 'diario' | 'semanal' | 'mensal' | 'personalizado'

export interface PeriodInput {
  kind: PeriodKind
  /** 'YYYY-MM', usado em `mensal` */
  month: string
  /** 'YYYY-MM-DD', usados em `personalizado` */
  customFrom: string
  customTo: string
}

/** Intervalo de busca: `from` incluso, `to` exclusivo (instantes ISO). */
export interface PeriodRange { from: string; to: string }

export type Granularity = 'day' | 'month'

export interface ResolvedPeriod {
  from: Date
  /** exclusivo: o instante seguinte ao último dia do período */
  to: Date
  label: string
  /** até 92 dias o gráfico e a tabela vão por dia; acima disso, por mês */
  granularity: Granularity
}

export interface Bucket { key: string; label: string }

const pad = (n: number) => String(n).padStart(2, '0')

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 'YYYY-MM-DD' como data local (new Date('YYYY-MM-DD') seria UTC e voltaria um dia em fuso atrás de UTC) */
export function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const br = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`

/** Intervalo padrão do "Personalizar": os últimos 30 dias, hoje incluso */
export function defaultCustomRange(now = new Date()): { from: string; to: string } {
  return { from: ymd(addDays(startOfDay(now), -29)), to: ymd(startOfDay(now)) }
}

export function resolvePeriod(input: PeriodInput, now = new Date()): ResolvedPeriod {
  const today = startOfDay(now)
  let from: Date
  let to: Date
  let label: string

  if (input.kind === 'diario') {
    from = today
    to = addDays(today, 1)
    label = 'hoje'
  } else if (input.kind === 'semanal') {
    from = addDays(today, -today.getDay())
    to = addDays(from, 7)
    label = 'esta semana'
  } else if (input.kind === 'mensal') {
    const [y, m] = input.month.split('-').map(Number)
    from = new Date(y, m - 1, 1)
    to = new Date(y, m, 1)
    label = formatMonthLabel(input.month)
  } else {
    const fallback = defaultCustomRange(now)
    let a = parseYmd(input.customFrom) ?? parseYmd(fallback.from)!
    let b = parseYmd(input.customTo) ?? parseYmd(fallback.to)!
    if (a > b) [a, b] = [b, a]
    from = a
    to = addDays(b, 1)
    label = `${br(a)} a ${br(b)}`
  }

  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000)
  return { from, to, label, granularity: days <= 92 ? 'day' : 'month' }
}

export function toRange(p: ResolvedPeriod): PeriodRange {
  return { from: p.from.toISOString(), to: p.to.toISOString() }
}

/** Chave do balde de uma data (hora local) */
export function bucketKey(d: Date, g: Granularity): string {
  return g === 'day' ? ymd(d) : `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

export function monthShortLabel(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('. de ', '/')
}

/** Todos os baldes do período, em ordem, inclusive os vazios */
export function buildBuckets(p: ResolvedPeriod): Bucket[] {
  const out: Bucket[] = []
  if (p.granularity === 'day') {
    for (let d = p.from; d < p.to; d = addDays(d, 1)) {
      out.push({ key: ymd(d), label: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}` })
    }
  } else {
    for (let d = new Date(p.from.getFullYear(), p.from.getMonth(), 1); d < p.to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      out.push({ key: bucketKey(d, 'month'), label: monthShortLabel(d.getFullYear(), d.getMonth()) })
    }
  }
  return out
}
