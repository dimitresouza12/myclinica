import { describe, it, expect } from 'vitest'
import { hojeBrasil, brasilDayRange, brasilDayOf } from './brasilDate'

describe('datas em Brasília', () => {
  it('22h em Brasília ainda é o mesmo dia (em UTC já é o dia seguinte)', () => {
    const t = new Date('2026-11-10T01:30:00Z') // 22:30 de 09/11 em Brasília
    expect(t.toISOString().slice(0, 10)).toBe('2026-11-10')
    expect(hojeBrasil(t)).toBe('2026-11-09')
  })
  it('manhã em Brasília', () => {
    expect(hojeBrasil(new Date('2026-11-10T12:00:00Z'))).toBe('2026-11-10')
  })
  it('janela do dia vai de 00:00 a 23:59:59 de Brasília', () => {
    expect(brasilDayRange('2026-11-09')).toEqual({ start: '2026-11-09T03:00:00.000Z', end: '2026-11-10T02:59:59.999Z' })
    expect(brasilDayRange('09/11/2026')).toBeNull()
  })
  it('consulta às 22h de Brasília cai no dia dela, não no seguinte', () => {
    expect(brasilDayOf('2026-11-10T01:00:00.000Z')).toBe('2026-11-09')
    const r = brasilDayRange(brasilDayOf('2026-11-10T01:00:00.000Z')!)!
    expect('2026-11-10T01:00:00.000Z' >= r.start && '2026-11-10T01:00:00.000Z' <= r.end).toBe(true)
  })
})
