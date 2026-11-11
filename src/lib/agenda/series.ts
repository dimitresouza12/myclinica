// Agendamento recorrente: geração das datas da série, conflito de cada ocorrência e escopo de edição.
// Funções puras. As datas são "AAAA-MM-DD" e a conta de calendário usa Date.UTC só como régua de dias
// (nunca toISOString de um horário local), então o resultado não muda com o fuso do navegador.
import { overlaps } from './slots'

export type SeriesFrequency = 'semanal' | 'quinzenal' | 'mensal'
export type SeriesEnd = 'contagem' | 'data'

export const FREQUENCY_LABEL: Record<SeriesFrequency, string> = {
  semanal: 'Toda semana',
  quinzenal: 'A cada 15 dias',
  mensal: 'Todo mês',
}

/** Teto de ocorrências por série (cada uma vira uma consulta). */
export const MAX_SERIES = 52
/** Quantos dias da semana a série pode usar (1x a 3x por semana). */
export const MAX_WEEKDAYS = 3
export const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

export interface SeriesRule {
  frequency: SeriesFrequency
  /** 0 = domingo. Só vale para semanal e quinzenal; a data de início entra sempre. */
  weekdays: number[]
  /** primeira consulta */
  startDate: string
  endMode: SeriesEnd
  /** quando endMode = 'contagem' (inclui a primeira consulta) */
  occurrences: number
  /** quando endMode = 'data' (inclusive) */
  untilDate: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function parse(date: string): { y: number; m: number; d: number } | null {
  if (!DATE_RE.test(date)) return null
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  // 2026-02-31 viraria 2026-03-03: data que não existe não vale
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null
  return { y, m, d }
}

function fmt(t: number): string {
  const x = new Date(t)
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`
}

/** Soma dias a "AAAA-MM-DD". */
export function addDaysKey(date: string, days: number): string {
  const p = parse(date)
  if (!p) return date
  return fmt(Date.UTC(p.y, p.m - 1, p.d + days))
}

/** Dia da semana (0 = domingo) de "AAAA-MM-DD". */
export function weekdayOfKey(date: string): number {
  const p = parse(date)
  return p ? new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() : 0
}

/**
 * Dias da semana válidos de uma série: sempre inclui o da data de início, sem repetir,
 * no máximo MAX_WEEKDAYS (o da data de início tem prioridade), em ordem de calendário.
 */
export function normalizeWeekdays(startDate: string, weekdays: number[]): number[] {
  const startWd = weekdayOfKey(startDate)
  const valid = [...new Set(weekdays.filter(w => Number.isInteger(w) && w >= 0 && w <= 6))].filter(w => w !== startWd)
  return [startWd, ...valid].slice(0, MAX_WEEKDAYS).sort((a, b) => a - b)
}

export interface SeriesDates {
  dates: string[]
  /** a regra pedia mais do que o teto: a lista foi cortada em MAX_SERIES */
  truncated: boolean
}

/** Datas de todas as ocorrências, da primeira (a data de início) em ordem crescente. */
export function generateSeriesDates(rule: SeriesRule): SeriesDates {
  const start = parse(rule.startDate)
  if (!start) return { dates: [], truncated: false }
  const byCount = rule.endMode === 'contagem'
  const wanted = byCount ? Math.max(0, Math.floor(rule.occurrences) || 0) : Infinity
  const until = byCount ? null : (parse(rule.untilDate) ? rule.untilDate : null)
  if (!byCount && !until) return { dates: [], truncated: false }
  // um além do teto só para saber se houve corte
  const limit = Math.min(wanted, MAX_SERIES + 1)
  if (limit <= 0) return { dates: [], truncated: false }
  const out: string[] = []
  const push = (d: string): boolean => {
    if (until && d > until) return false
    out.push(d)
    return out.length < limit
  }

  if (rule.frequency === 'mensal') {
    // mesmo dia do mês; mês mais curto cai no último dia (31 de jan -> 28 de fev -> 31 de mar)
    for (let k = 0; k < 400; k++) {
      const first = new Date(Date.UTC(start.y, start.m - 1 + k, 1))
      const dim = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
      const day = Math.min(start.d, dim)
      if (!push(fmt(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), day)))) break
    }
  } else {
    const step = rule.frequency === 'quinzenal' ? 2 : 1
    const wds = normalizeWeekdays(rule.startDate, rule.weekdays)
    // domingo da semana da data de início: a régua das semanas
    const anchor = Date.UTC(start.y, start.m - 1, start.d - weekdayOfKey(rule.startDate))
    outer: for (let w = 0; w < 600; w += step) {
      for (const wd of wds) {
        const d = fmt(anchor + (w * 7 + wd) * 86400000)
        if (d < rule.startDate) continue
        if (!push(d)) break outer
      }
    }
  }

  const truncated = out.length > MAX_SERIES
  return { dates: out.slice(0, MAX_SERIES), truncated }
}

/** Texto curto da regra: "Toda semana, ter e qui, 8 vezes". */
export function describeRule(rule: SeriesRule): string {
  const parts: string[] = [FREQUENCY_LABEL[rule.frequency]]
  if (rule.frequency !== 'mensal') {
    parts.push(normalizeWeekdays(rule.startDate, rule.weekdays).map(w => WEEKDAY_SHORT[w]).join(' e '))
  }
  parts.push(rule.endMode === 'contagem' ? `${rule.occurrences} ${rule.occurrences === 1 ? 'vez' : 'vezes'}` : `até ${rule.untilDate.split('-').reverse().join('/')}`)
  return parts.join(', ')
}

// ── Revisão das ocorrências antes de confirmar ─────────────────

/** Instante (ms) de uma data e hora locais, do mesmo jeito que o formulário de agendamento grava. */
export function instantOf(date: string, time: string): number {
  return new Date(`${date}T${time}:00`).getTime()
}

export interface BusyRange { start: number; end: number; label?: string }

export type OccurrenceState = 'ok' | 'conflito' | 'fora_escala'

export interface PlannedOccurrence {
  /** posição na série (1, 2, 3...) */
  index: number
  date: string
  time: string
  startMs: number
  endMs: number
  state: OccurrenceState
  /** com quem conflita, quando conflita */
  conflictWith?: string
  /** entra na série? (conflito começa de fora; fora da escala só entra se quem agenda pode encaixar) */
  include: boolean
}

/** Consultas e bloqueios do banco (formato cru) -> faixas ocupadas. */
export function toBusyRanges(rows: { scheduled_at: string; duration_minutes?: number | null; status?: string | null }[]): BusyRange[] {
  return rows.map(r => {
    const start = new Date(r.scheduled_at).getTime()
    return { start, end: start + (r.duration_minutes ?? 60) * 60000, label: r.status === 'bloqueado' ? 'Bloqueio' : 'Outro agendamento' }
  })
}

/**
 * Monta a lista de revisão: para cada data, o horário e se está livre, em conflito ou fora da escala.
 * `inSchedule` devolve se aquele dia/horário cabe na escala do profissional (sem escala: sempre).
 */
export function planOccurrences(
  dates: string[],
  time: string,
  durationMin: number,
  ctx: { busy: BusyRange[]; inSchedule?: (date: string) => boolean; canExtra: boolean },
): PlannedOccurrence[] {
  return dates.map((date, i) => {
    const startMs = instantOf(date, time)
    const endMs = startMs + durationMin * 60000
    const hit = ctx.busy.find(b => overlaps(startMs, endMs, b.start, b.end))
    const outside = !!ctx.inSchedule && !ctx.inSchedule(date)
    const state: OccurrenceState = hit ? 'conflito' : outside ? 'fora_escala' : 'ok'
    return {
      index: i + 1, date, time, startMs, endMs, state,
      conflictWith: hit?.label,
      include: state === 'ok' || (state === 'fora_escala' && ctx.canExtra),
    }
  })
}

// ── Editar / cancelar "só este" ou "este e os próximos" ─────────

export type SeriesScope = 'this' | 'following'

export interface SeriesAppt { id: string; series_id?: string | null; scheduled_at: string; status: string | null }

/**
 * Quais consultas da série o escopo alcança. "Este e os próximos" não mexe no que já foi
 * concluído ou marcado como falta/cancelado: histórico não se reescreve. A consulta escolhida entra sempre.
 */
export function appointmentsInScope(all: SeriesAppt[], target: SeriesAppt, scope: SeriesScope): SeriesAppt[] {
  if (scope === 'this' || !target.series_id) return [target]
  const t = new Date(target.scheduled_at).getTime()
  const rest = all.filter(a =>
    a.id !== target.id && a.series_id === target.series_id &&
    new Date(a.scheduled_at).getTime() > t &&
    (a.status === 'agendado' || a.status === 'confirmado'))
  return [target, ...rest.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())]
}

/** Novo instante de uma consulta: mesmo dia (+ `dayDelta` dias) com o horário local "HH:mm" dado. */
export function shiftedInstant(iso: string, opts: { time?: string; dayDelta?: number }): Date {
  const d = new Date(iso)
  const [hh, mm] = opts.time ? opts.time.split(':').map(Number) : [d.getHours(), d.getMinutes()]
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + (opts.dayDelta ?? 0), hh, mm, 0, 0)
}

/** Uma consulta de série depois da mudança: o profissional que vai ficar com ela e a faixa que ela passa a ocupar. */
export interface FollowingRange { id: string; professionalId: string | null; start: number; end: number }

/**
 * Faixa de cada consulta afetada pela mudança "este e os próximos". O profissional de cada uma vem da própria consulta
 * (uma do meio da série pode ter sido trocada antes), a não ser que a mudança defina um novo para todas.
 */
export function planFollowingRanges(
  targets: { id: string; scheduled_at: string; duration_minutes: number | null; professional_id: string | null }[],
  patch: { fields: Record<string, unknown>; time?: string; dayDelta?: number },
): FollowingRange[] {
  const moves = !!patch.time || !!patch.dayDelta
  const profChanged = 'professional_id' in patch.fields
  const durChanged = 'duration_minutes' in patch.fields
  return targets.map(t => {
    const start = (moves ? shiftedInstant(t.scheduled_at, { time: patch.time, dayDelta: patch.dayDelta }) : new Date(t.scheduled_at)).getTime()
    const dur = (durChanged ? Number(patch.fields.duration_minutes) : (t.duration_minutes ?? 60)) * 60000
    return {
      id: t.id,
      professionalId: profChanged ? ((patch.fields.professional_id as string | null) ?? null) : t.professional_id,
      start,
      end: start + dur,
    }
  })
}

// ── Estado do formulário ───────────────────────────────────────

/** Opções de repetição do Novo agendamento. */
export interface SeriesForm {
  on: boolean
  frequency: SeriesFrequency
  /** dias extras da semana (o da data escolhida entra sozinho) */
  weekdays: number[]
  endMode: SeriesEnd
  occurrences: number
  untilDate: string
}

export const BLANK_SERIES: SeriesForm = { on: false, frequency: 'semanal', weekdays: [], endMode: 'contagem', occurrences: 8, untilDate: '' }

export const ruleOf = (s: SeriesForm, startDate: string): SeriesRule => ({
  frequency: s.frequency, weekdays: s.weekdays, startDate, endMode: s.endMode, occurrences: s.occurrences, untilDate: s.untilDate,
})

/** Dias entre duas datas "AAAA-MM-DD" (b - a), sem passar por fuso. */
export function diffDaysKey(a: string, b: string): number {
  const pa = parse(a)
  const pb = parse(b)
  if (!pa || !pb) return 0
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000)
}
