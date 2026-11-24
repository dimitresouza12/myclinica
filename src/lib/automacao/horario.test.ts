import { describe, it, expect } from 'vitest'
import { isOutsideOpeningHours, openingFromRow } from './horario'
import { DEFAULT_OPENING as DEFAULT_OPENING_HOURS } from '@/lib/agenda/settings'

const TZ = 'America/Fortaleza' // UTC-3 o ano todo
const at = (hhmm: string, day = '2026-11-17') => new Date(`${day}T${hhmm}:00-03:00`)
const open = { start: '08:00', end: '18:00' }

describe('isOutsideOpeningHours', () => {
  it('dentro do expediente: false', () => {
    expect(isOutsideOpeningHours(at('08:00'), TZ, open)).toBe(false)
    expect(isOutsideOpeningHours(at('12:30'), TZ, open)).toBe(false)
    expect(isOutsideOpeningHours(at('17:59'), TZ, open)).toBe(false)
  })
  it('antes da abertura e a partir do fechamento: true', () => {
    expect(isOutsideOpeningHours(at('07:59'), TZ, open)).toBe(true)
    expect(isOutsideOpeningHours(at('18:00'), TZ, open)).toBe(true)
    expect(isOutsideOpeningHours(at('23:30'), TZ, open)).toBe(true)
    expect(isOutsideOpeningHours(at('00:10'), TZ, open)).toBe(true)
  })
  it('usa o fuso da clínica, não o do servidor', () => {
    // 20:30 UTC = 17:30 em Fortaleza (dentro); 21:30 UTC = 18:30 (fora)
    expect(isOutsideOpeningHours(new Date('2026-11-17T20:30:00Z'), TZ, open)).toBe(false)
    expect(isOutsideOpeningHours(new Date('2026-11-17T21:30:00Z'), TZ, open)).toBe(true)
    // 13:00 UTC = 08:00 em Nova York (EST, novembro): dentro do mesmo expediente; 12:59 UTC = 07:59: fora
    expect(isOutsideOpeningHours(new Date('2026-11-17T13:00:00Z'), 'America/New_York', open)).toBe(false)
    expect(isOutsideOpeningHours(new Date('2026-11-17T12:59:00Z'), 'America/New_York', open)).toBe(true)
  })
  it('fuso inválido: não considera fora do horário (nunca responde por engano)', () => {
    expect(isOutsideOpeningHours(at('23:00'), 'Mars/Olympus', open)).toBe(false)
  })
})

describe('openingFromRow', () => {
  it('sem linha ou opening_hours nulo: padrão da agenda (07:00 a 19:30)', () => {
    expect(openingFromRow(null)).toEqual(DEFAULT_OPENING_HOURS)
    expect(openingFromRow({ opening_hours: null })).toEqual(DEFAULT_OPENING_HOURS)
  })
  it('lê {start,end} válido; inválido volta ao padrão', () => {
    expect(openingFromRow({ opening_hours: { start: '08:30', end: '17:00' } })).toEqual({ start: '08:30', end: '17:00' })
    expect(openingFromRow({ opening_hours: { start: '17:00', end: '08:00' } })).toEqual(DEFAULT_OPENING_HOURS)
    expect(openingFromRow({ opening_hours: 'x' })).toEqual(DEFAULT_OPENING_HOURS)
  })
})
