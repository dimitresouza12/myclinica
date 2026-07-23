import { describe, it, expect } from 'vitest'
import { nextOccurrenceOfDay, daysUntilNextOccurrence } from './asaas'

describe('nextOccurrenceOfDay', () => {
  it('dia ainda não chegou neste mês → usa este mês', () => {
    expect(nextOccurrenceOfDay(20, new Date(2026, 6, 5))).toBe('2026-07-20') // 5 jul, dia 20 → 20 jul
  })

  it('dia é hoje → conta como este mês (não empurra pro mês seguinte)', () => {
    expect(nextOccurrenceOfDay(15, new Date(2026, 6, 15))).toBe('2026-07-15')
  })

  it('dia já passou neste mês → pula pro mês seguinte', () => {
    expect(nextOccurrenceOfDay(5, new Date(2026, 6, 20))).toBe('2026-08-05') // 20 jul, dia 5 já passou → 5 ago
  })

  it('vira o ano corretamente (dezembro → janeiro)', () => {
    expect(nextOccurrenceOfDay(10, new Date(2026, 11, 20))).toBe('2027-01-10')
  })

  it('dia 28 funciona em qualquer mês (evita problema de fevereiro)', () => {
    expect(nextOccurrenceOfDay(28, new Date(2026, 1, 1))).toBe('2026-02-28') // fev/2026, dia 1 → 28 ainda não passou
  })
})

describe('daysUntilNextOccurrence', () => {
  it('calcula a distância correta em dias dentro do mesmo mês', () => {
    expect(daysUntilNextOccurrence(20, new Date(2026, 6, 5))).toBe(15) // 5→20 jul = 15 dias
  })

  it('nunca retorna menos que 1 (evita dueDateLimitDays=0 na Asaas)', () => {
    expect(daysUntilNextOccurrence(15, new Date(2026, 6, 15))).toBeGreaterThanOrEqual(1)
  })

  it('calcula corretamente quando precisa pular pro mês seguinte', () => {
    // 20 jul → dia 5: são 16 dias (21,22...31 jul = 11 dias + 5 ago = 16)
    expect(daysUntilNextOccurrence(5, new Date(2026, 6, 20))).toBe(16)
  })
})
