import { describe, it, expect } from 'vitest'
import { parseN8nDate } from './n8nDate'

describe('parseN8nDate', () => {
  it('vazio → null', () => {
    expect(parseN8nDate(null)).toBeNull()
    expect(parseN8nDate('')).toBeNull()
  })
  it('timestamp com fuso explícito é mantido', () => {
    expect(parseN8nDate('2026-11-15T12:30:00Z')).toBe('2026-11-15T12:30:00.000Z')
    expect(parseN8nDate('2026-11-15T09:30:00-03:00')).toBe('2026-11-15T12:30:00.000Z')
    expect(parseN8nDate('2026-11-15T09:30:00+00:00')).toBe('2026-11-15T09:30:00.000Z')
  })
  it('DD/MM/AAAA com e sem hora, em Brasília', () => {
    expect(parseN8nDate('15/11/2026 14:30')).toBe('2026-11-15T17:30:00.000Z')
    expect(parseN8nDate('15/11/2026 9:30')).toBe('2026-11-15T12:30:00.000Z')
    expect(parseN8nDate('15/11/2026')).toBe('2026-11-15T12:00:00.000Z')
  })
  it('AAAA-MM-DD sem hora: 9h de Brasília, no mesmo dia', () => {
    expect(parseN8nDate('2026-11-15')).toBe('2026-11-15T12:00:00.000Z')
    expect(parseN8nDate(' 2026-11-15 ')).toBe('2026-11-15T12:00:00.000Z')
  })
  it('AAAA-MM-DD com hora de 1 dígito', () => {
    expect(parseN8nDate('2026-11-15 9:30')).toBe('2026-11-15T12:30:00.000Z')
    expect(parseN8nDate('2026-11-15T9:30')).toBe('2026-11-15T12:30:00.000Z')
  })
  it('AAAA-MM-DD HH:mm(:ss) sem fuso: Brasília', () => {
    expect(parseN8nDate('2026-11-15 14:30')).toBe('2026-11-15T17:30:00.000Z')
    expect(parseN8nDate('2026-11-15T14:30:00')).toBe('2026-11-15T17:30:00.000Z')
    expect(parseN8nDate('2026-11-15 23:30:15.123')).toBe('2026-11-16T02:30:15.000Z')
  })
  it('lixo → null', () => {
    expect(parseN8nDate('amanhã')).toBeNull()
    expect(parseN8nDate('2026-13-45')).toBeNull()
  })
})
