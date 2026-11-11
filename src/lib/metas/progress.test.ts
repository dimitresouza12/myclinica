import { describe, expect, it } from 'vitest'
import { goalProgress, inPeriod, overallProgress, overallSeries, seriesFromLogs, summarizePeriod, trendOf } from './progress'
import type { Goal, GoalLog, GoalResult } from './types'

let n = 0
const log = (goal_id: string, log_date: string, result: GoalResult): GoalLog => ({
  id: `l${++n}`, clinic_id: 'c', patient_id: 'p', goal_id, log_date, result, note: null, professional_id: null,
  created_at: `2026-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
})
const goal = (id: string, status: Goal['status'] = 'em_andamento'): Goal => ({
  id, clinic_id: 'c', patient_id: 'p', area: 'fono', title: id, domain: null, criterion: null, target_date: null,
  status, sort_order: 0, professional_id: null, created_at: '', updated_at: '',
})

describe('seriesFromLogs', () => {
  it('pontua 100/50/0 e ordena por data', () => {
    const s = seriesFromLogs([log('a', '2026-03-10', 'adquirido'), log('a', '2026-03-01', 'nao_adquirido'), log('a', '2026-03-05', 'com_pista')])
    expect(s).toEqual([{ date: '2026-03-01', score: 0 }, { date: '2026-03-05', score: 50 }, { date: '2026-03-10', score: 100 }])
  })
  it('tira a média quando há mais de um registro no dia', () => {
    expect(seriesFromLogs([log('a', '2026-03-01', 'adquirido'), log('a', '2026-03-01', 'nao_adquirido')])).toEqual([{ date: '2026-03-01', score: 50 }])
  })
})

describe('goalProgress', () => {
  it('sem registro', () => {
    expect(goalProgress([])).toEqual({ sessions: 0, lastResult: null, lastDate: null, percent: null, trend: 'sem_dados' })
  })
  it('usa a média dos 3 últimos registros', () => {
    const p = goalProgress([log('a', '2026-01-01', 'nao_adquirido'), log('a', '2026-01-02', 'com_pista'), log('a', '2026-01-03', 'adquirido'), log('a', '2026-01-04', 'adquirido')])
    expect(p.percent).toBe(83)
    expect(p.lastResult).toBe('adquirido')
    expect(p.sessions).toBe(4)
    expect(p.trend).toBe('avanco')
  })
})

describe('trendOf', () => {
  it('detecta avanço, retrocesso e estabilidade', () => {
    expect(trendOf([{ date: 'a', score: 0 }, { date: 'b', score: 50 }])).toBe('avanco')
    expect(trendOf([{ date: 'a', score: 100 }, { date: 'b', score: 50 }])).toBe('retrocesso')
    expect(trendOf([{ date: 'a', score: 50 }, { date: 'b', score: 50 }])).toBe('estavel')
    expect(trendOf([{ date: 'a', score: 50 }])).toBe('sem_dados')
  })
})

describe('overall', () => {
  const goals = [goal('a'), goal('b'), goal('c', 'cancelada')]
  const logs = [log('a', '2026-01-01', 'adquirido'), log('b', '2026-01-01', 'nao_adquirido'), log('c', '2026-01-01', 'adquirido'), log('a', '2026-01-08', 'adquirido')]
  it('progresso geral ignora metas encerradas', () => {
    expect(overallProgress(goals, logs)).toBe(50)
  })
  it('série geral só considera as metas informadas', () => {
    expect(overallSeries(goals.slice(0, 2), logs)).toEqual([{ date: '2026-01-01', score: 50 }, { date: '2026-01-08', score: 100 }])
  })
  it('overallProgress é null sem registro', () => {
    expect(overallProgress([goal('x')], [])).toBeNull()
  })
})

describe('período', () => {
  const logs = [log('a', '2026-01-01', 'nao_adquirido'), log('a', '2026-02-01', 'com_pista'), log('a', '2026-03-01', 'adquirido')]
  it('filtra pelas duas pontas, inclusive', () => {
    expect(inPeriod(logs, '2026-02-01', '2026-03-01')).toHaveLength(2)
    expect(inPeriod(logs, '', '2026-01-31')).toHaveLength(1)
  })
  it('resume por meta', () => {
    const [s] = summarizePeriod([goal('a')], logs, '2026-02-01', '2026-03-31')
    expect(s.sessions).toBe(2)
    expect(s.counts).toEqual({ adquirido: 1, com_pista: 1, nao_adquirido: 0 })
    expect(s.firstScore).toBe(50)
    expect(s.lastScore).toBe(100)
    expect(s.trend).toBe('avanco')
  })
})
