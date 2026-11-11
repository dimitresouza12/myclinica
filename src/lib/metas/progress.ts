import { RESULT_SCORE } from './constants'
import type { Goal, GoalLog, GoalResult } from './types'

/** Quantos registros mais recentes entram no "progresso atual" de uma meta. */
export const RECENT_WINDOW = 3

export interface SeriesPoint {
  /** YYYY-MM-DD */
  date: string
  /** 0 a 100 */
  score: number
}

const byDateAsc = (a: GoalLog, b: GoalLog) =>
  a.log_date === b.log_date ? a.created_at.localeCompare(b.created_at) : a.log_date.localeCompare(b.log_date)

export function scoreOf(result: GoalResult): number {
  return RESULT_SCORE[result]
}

export function logsOfGoal(logs: GoalLog[], goalId: string): GoalLog[] {
  return logs.filter(l => l.goal_id === goalId).sort(byDateAsc)
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** Um ponto por data: se houve mais de um registro no mesmo dia, vale a média. */
export function seriesFromLogs(logs: GoalLog[]): SeriesPoint[] {
  const byDate = new Map<string, number[]>()
  for (const l of [...logs].sort(byDateAsc)) {
    const arr = byDate.get(l.log_date) ?? []
    arr.push(scoreOf(l.result))
    byDate.set(l.log_date, arr)
  }
  return [...byDate.entries()].map(([date, s]) => ({ date, score: Math.round(mean(s)) }))
}

/** Série geral: média de todos os registros de cada data, de todas as metas informadas. */
export function overallSeries(goals: Goal[], logs: GoalLog[]): SeriesPoint[] {
  const ids = new Set(goals.map(g => g.id))
  return seriesFromLogs(logs.filter(l => ids.has(l.goal_id)))
}

export type Trend = 'avanco' | 'estavel' | 'retrocesso' | 'sem_dados'

export function trendOf(series: SeriesPoint[]): Trend {
  if (series.length < 2) return 'sem_dados'
  const d = series[series.length - 1].score - series[0].score
  return d > 0 ? 'avanco' : d < 0 ? 'retrocesso' : 'estavel'
}

export const TREND_LABEL: Record<Trend, string> = {
  avanco: 'Em evolução',
  estavel: 'Estável',
  retrocesso: 'Retrocesso',
  sem_dados: 'Poucos registros',
}

export interface GoalProgress {
  sessions: number
  lastResult: GoalResult | null
  lastDate: string | null
  /** Média dos últimos RECENT_WINDOW registros (0 a 100); null sem registros. */
  percent: number | null
  trend: Trend
}

export function goalProgress(logs: GoalLog[]): GoalProgress {
  const sorted = [...logs].sort(byDateAsc)
  if (sorted.length === 0) return { sessions: 0, lastResult: null, lastDate: null, percent: null, trend: 'sem_dados' }
  const recent = sorted.slice(-RECENT_WINDOW).map(l => scoreOf(l.result))
  const last = sorted[sorted.length - 1]
  return {
    sessions: sorted.length,
    lastResult: last.result,
    lastDate: last.log_date,
    percent: Math.round(mean(recent)),
    trend: trendOf(seriesFromLogs(sorted)),
  }
}

/** Progresso geral: média do progresso das metas em andamento ou atingidas que já têm registro. */
export function overallProgress(goals: Goal[], logs: GoalLog[]): number | null {
  const vals: number[] = []
  for (const g of goals) {
    if (g.status === 'cancelada' || g.status === 'suspensa') continue
    const p = goalProgress(logsOfGoal(logs, g.id)).percent
    if (p !== null) vals.push(p)
  }
  return vals.length ? Math.round(mean(vals)) : null
}

export function inPeriod<T extends { log_date: string }>(logs: T[], from: string, to: string): T[] {
  return logs.filter(l => (!from || l.log_date >= from) && (!to || l.log_date <= to))
}

export interface GoalPeriodSummary {
  goal: Goal
  sessions: number
  counts: Record<GoalResult, number>
  firstScore: number | null
  lastScore: number | null
  lastResult: GoalResult | null
  percent: number | null
  trend: Trend
  series: SeriesPoint[]
}

/** Resumo de cada meta dentro do período, para o relatório evolutivo. */
export function summarizePeriod(goals: Goal[], logs: GoalLog[], from: string, to: string): GoalPeriodSummary[] {
  return goals.map(goal => {
    const own = inPeriod(logsOfGoal(logs, goal.id), from, to)
    const series = seriesFromLogs(own)
    const prog = goalProgress(own)
    return {
      goal,
      sessions: own.length,
      counts: {
        adquirido: own.filter(l => l.result === 'adquirido').length,
        com_pista: own.filter(l => l.result === 'com_pista').length,
        nao_adquirido: own.filter(l => l.result === 'nao_adquirido').length,
      },
      firstScore: series.length ? series[0].score : null,
      lastScore: series.length ? series[series.length - 1].score : null,
      lastResult: prog.lastResult,
      percent: prog.percent,
      trend: prog.trend,
      series,
    }
  })
}

/** Datas distintas (sessões) com algum registro. */
export function sessionDates(logs: GoalLog[]): string[] {
  return [...new Set(logs.map(l => l.log_date))].sort()
}
