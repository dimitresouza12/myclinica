import { describe, expect, it } from 'vitest'
import { addDaysToKey, dateKeyInZone, isValidDateKey, isValidTime, toMinutes, weekdayOfKey, zonedWallToUtcMs } from './tz'

describe('zonedWallToUtcMs', () => {
  it('Brasília e Fortaleza são UTC-3: 08:00 local = 11:00 UTC', () => {
    expect(new Date(zonedWallToUtcMs('2026-12-01', '08:00', 'America/Sao_Paulo')).toISOString()).toBe('2026-12-01T11:00:00.000Z')
    expect(new Date(zonedWallToUtcMs('2026-12-01', '08:00', 'America/Fortaleza')).toISOString()).toBe('2026-12-01T11:00:00.000Z')
  })
  it('Manaus é UTC-4 e Rio Branco UTC-5', () => {
    expect(new Date(zonedWallToUtcMs('2026-12-01', '08:00', 'America/Manaus')).toISOString()).toBe('2026-12-01T12:00:00.000Z')
    expect(new Date(zonedWallToUtcMs('2026-12-01', '08:00', 'America/Rio_Branco')).toISOString()).toBe('2026-12-01T13:00:00.000Z')
  })
  it('hora tarde da noite local cai no dia seguinte em UTC', () => {
    expect(new Date(zonedWallToUtcMs('2026-12-01', '22:30', 'America/Sao_Paulo')).toISOString()).toBe('2026-12-02T01:30:00.000Z')
  })
  it('não depende do fuso do servidor', () => {
    const a = zonedWallToUtcMs('2026-07-15', '09:00', 'America/Sao_Paulo')
    expect(a).toBe(Date.UTC(2026, 6, 15, 12, 0))
  })
})

describe('dateKeyInZone', () => {
  it('23:30 em Brasília ainda é o mesmo dia, embora em UTC já seja o seguinte', () => {
    const ms = Date.UTC(2026, 11, 2, 2, 30) // 02/12 02:30 UTC = 01/12 23:30 Brasília
    expect(dateKeyInZone(ms, 'America/Sao_Paulo')).toBe('2026-12-01')
    expect(dateKeyInZone(ms, 'UTC')).toBe('2026-12-02')
  })
  it('é o inverso de zonedWallToUtcMs', () => {
    const ms = zonedWallToUtcMs('2026-03-10', '00:00', 'America/Manaus')
    expect(dateKeyInZone(ms, 'America/Manaus')).toBe('2026-03-10')
    expect(dateKeyInZone(ms - 60_000, 'America/Manaus')).toBe('2026-03-09')
  })
})

describe('calendário puro', () => {
  it('soma dias atravessando mês e ano', () => {
    expect(addDaysToKey('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDaysToKey('2028-02-28', 1)).toBe('2028-02-29')
  })
  it('dia da semana: 2026-11-29 é domingo', () => {
    expect(weekdayOfKey('2026-11-29')).toBe(0)
    expect(weekdayOfKey('2026-11-30')).toBe(1)
  })
  it('valida data e hora', () => {
    expect(isValidDateKey('2026-02-31')).toBe(false)
    expect(isValidDateKey('2026-2-3')).toBe(false)
    expect(isValidDateKey('2026-12-01')).toBe(true)
    expect(isValidDateKey(20261201)).toBe(false)
    expect(isValidTime('24:00')).toBe(false)
    expect(isValidTime('08:60')).toBe(false)
    expect(isValidTime('08:30')).toBe(true)
    expect(toMinutes('13:45')).toBe(825)
  })
})
