import { describe, expect, it } from 'vitest'
import { CAMPANHA_CONTRATO, campanhaAtiva, firstDueDateFor } from './campanha'

describe('campanha de contrato', () => {
  it('vale até 15/12/2026 23:59 de Fortaleza', () => {
    expect(campanhaAtiva(new Date('2026-12-15T23:59:59.000-03:00'))).toBe(true)
    expect(campanhaAtiva(new Date('2026-12-16T00:00:00.000-03:00'))).toBe(false)
    expect(campanhaAtiva(new Date('2026-11-23T10:00:00-03:00'))).toBe(true)
  })

  it('dentro da janela a primeira cobrança é 15/01/2027, qualquer que seja o trial', () => {
    const now = new Date('2026-11-23T10:00:00-03:00')
    expect(firstDueDateFor('2026-12-01T12:00:00Z', now)).toBe(CAMPANHA_CONTRATO.firstDueDate)
    expect(firstDueDateFor(null, now)).toBe('2027-01-15')
  })

  it('fora da janela é o fim do teste; sem teste ou teste vencido vale hoje', () => {
    const now = new Date('2026-12-20T10:00:00-03:00')
    expect(firstDueDateFor('2026-12-28T15:00:00-03:00', now)).toBe('2026-12-28')
    expect(firstDueDateFor('2026-12-10T15:00:00-03:00', now)).toBe('2026-12-20')
    expect(firstDueDateFor(null, now)).toBe('2026-12-20')
  })
})
