import { describe, expect, it } from 'vitest'
import { countByProfessional, daySummary, daysWithAppointments, inRange, monthGrid, rangeFor } from './view'
import { localDayKey } from '@/lib/dashboard/metrics'

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h)
const iso = (y: number, m: number, d: number, h = 12) => at(y, m, d, h).toISOString()

describe('rangeFor', () => {
  it('dia: do começo do dia ao começo do seguinte', () => {
    const r = rangeFor('dia', at(2026, 10, 27, 15))
    expect([localDayKey(r.start), localDayKey(r.end)]).toEqual(['2026-10-27', '2026-10-28'])
  })

  it('semana: domingo a domingo', () => {
    const r = rangeFor('semana', at(2026, 10, 27))
    expect([localDayKey(r.start), localDayKey(r.end)]).toEqual(['2026-10-25', '2026-11-01'])
  })

  it('mês: do dia 1 ao dia 1 do mês seguinte, inclusive em dezembro', () => {
    const r = rangeFor('mes', at(2026, 12, 15))
    expect([localDayKey(r.start), localDayKey(r.end)]).toEqual(['2026-12-01', '2027-01-01'])
  })
})

describe('monthGrid', () => {
  it('tem 42 dias e começa num domingo', () => {
    const g = monthGrid(2026, 9) // outubro de 2026
    expect(g).toHaveLength(42)
    expect(g[0].getDay()).toBe(0)
    expect(localDayKey(g[0])).toBe('2026-09-27')
    expect(g.some(d => localDayKey(d) === '2026-10-31')).toBe(true)
  })

  it('mês que começa no domingo não ganha dias do mês anterior', () => {
    expect(localDayKey(monthGrid(2026, 10)[0])).toBe('2026-11-01') // 1º de novembro de 2026 é domingo
  })
})

describe('contagens', () => {
  const appts = [
    { status: 'confirmado', scheduled_at: iso(2026, 10, 27, 9), professional_id: 'a' },
    { status: 'agendado', scheduled_at: iso(2026, 10, 27, 10), professional_id: 'a' },
    { status: 'concluido', scheduled_at: iso(2026, 10, 27, 11), professional_id: 'b' },
    { status: 'cancelado', scheduled_at: iso(2026, 10, 27, 12), professional_id: 'b' },
    { status: 'bloqueado', scheduled_at: iso(2026, 10, 27, 13), professional_id: 'b' },
    { status: 'faltou', scheduled_at: iso(2026, 10, 28, 9), professional_id: null },
  ]

  it('daysWithAppointments ignora cancelamentos e bloqueios', () => {
    expect([...daysWithAppointments(appts)].sort()).toEqual(['2026-10-27', '2026-10-28'])
    expect(daysWithAppointments([appts[3], appts[4]]).size).toBe(0)
  })

  it('daySummary conta por situação, sem cancelados e bloqueios', () => {
    expect(daySummary(appts, at(2026, 10, 27))).toEqual({ total: 3, agendado: 1, confirmado: 1, concluido: 1, faltou: 0 })
  })

  it('countByProfessional usa "" para sem profissional', () => {
    expect(countByProfessional(appts)).toEqual({ a: 2, b: 1, '': 1 })
  })

  it('inRange exclui o fim', () => {
    const r = rangeFor('dia', at(2026, 10, 27))
    expect(inRange(appts, r.start, r.end)).toHaveLength(5)
  })
})
