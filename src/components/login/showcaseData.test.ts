import { describe, it, expect } from 'vitest'

// o módulo importa useSyncExternalStore do React, que existe em ambiente node
import { buildDay, POOL_SIZES } from './showcaseData'

const NOW = new Date(2026, 9, 28)

describe('buildDay', () => {
  it('é determinístico: mesma semente, mesmo dia', () => {
    expect(buildDay(12345, NOW)).toEqual(buildDay(12345, NOW))
  })
  it('sementes diferentes dão dias diferentes', () => {
    const seen = new Set(Array.from({ length: 50 }, (_, i) => buildDay(i + 1, NOW).slots.map(s => s.name).join('|')))
    expect(seen.size).toBeGreaterThan(45)
  })
  it('tem listas grandes de nomes e atendimentos', () => {
    expect(POOL_SIZES.firstNames).toBeGreaterThanOrEqual(100)
    expect(POOL_SIZES.surnames).toBeGreaterThanOrEqual(80)
    expect(POOL_SIZES.services).toBeGreaterThanOrEqual(40)
  })
  it('agenda: cinco horários em ordem, primeiros nomes diferentes, último é o novo', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const d = buildDay(seed, NOW)
      expect(d.slots).toHaveLength(5)
      const times = d.slots.map(s => s.time)
      expect([...times].sort()).toEqual(times)
      expect(new Set(d.slots.map(s => s.name.split(' ')[0])).size).toBe(5)
      expect(d.slots[4].status).toBe('new')
      expect(d.slots.filter(s => s.status === 'swap')).toHaveLength(1)
      expect(d.slots.some(s => s.status === 'ok')).toBe(true)
    }
  })
  it('conversa, agenda e financeiro contam a mesma história', () => {
    const d = buildDay(777, NOW)
    const swap = d.slots.find(s => s.status === 'swap')!
    expect(d.wa.name).toBe(swap.name)
    expect(d.slots.map(s => s.name)).toContain(d.money.pixName)
    expect(d.money.series).toHaveLength(12)
    expect(d.money.monthTicks).toEqual(['nov', 'jan', 'mar', 'mai', 'jul', 'out'])
    expect(d.dateLabel).toBe('Hoje, quarta 28')
    expect(d.monthLabel).toBe('Outubro')
  })
  it('lista de acontecimentos da faixa é longa e variada', () => {
    const e = buildDay(99, NOW).events
    expect(e.length).toBeGreaterThanOrEqual(24)
    expect(new Set(e.map(x => x[1])).size).toBeGreaterThan(20)
  })
})
