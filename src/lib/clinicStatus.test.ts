import { describe, it, expect } from 'vitest'
import { computeClinicStatus } from './clinicStatus'

const DAY = 86_400_000
const future = (ms = DAY) => new Date(Date.now() + ms).toISOString()
const past = (ms = DAY) => new Date(Date.now() - ms).toISOString()

describe('computeClinicStatus — BE-01: tabela-verdade completa', () => {
  it('sem trial_ends_at e sem atraso → active (acesso permanente)', () => {
    expect(computeClinicStatus({ trial_ends_at: null, billing_paid: false, billing_overdue_since: null })).toBe('active')
  })

  it('sem trial_ends_at, pago → active', () => {
    expect(computeClinicStatus({ trial_ends_at: null, billing_paid: true, billing_overdue_since: null })).toBe('active')
  })

  it('trial no futuro, não pago → trial', () => {
    expect(computeClinicStatus({ trial_ends_at: future(), billing_paid: false, billing_overdue_since: null })).toBe('trial')
  })

  it('trial no futuro, pago → trial (ainda dentro do prazo)', () => {
    expect(computeClinicStatus({ trial_ends_at: future(), billing_paid: true, billing_overdue_since: null })).toBe('trial')
  })

  it('trial no passado, nunca pago → trial_expired (bloqueia no PaymentLateBanner)', () => {
    expect(computeClinicStatus({ trial_ends_at: past(), billing_paid: false, billing_overdue_since: null })).toBe('trial_expired')
  })

  it('trial no passado, pago → active (converteu)', () => {
    expect(computeClinicStatus({ trial_ends_at: past(), billing_paid: true, billing_overdue_since: null })).toBe('active')
  })

  it('billing_overdue_since setado → suspended, independente do trial', () => {
    expect(computeClinicStatus({ trial_ends_at: null, billing_paid: false, billing_overdue_since: past() })).toBe('suspended')
    expect(computeClinicStatus({ trial_ends_at: future(), billing_paid: false, billing_overdue_since: past() })).toBe('suspended')
  })

  it('overdue tem prioridade mesmo se billing_paid=true (dado inconsistente não quebra)', () => {
    expect(computeClinicStatus({ trial_ends_at: null, billing_paid: true, billing_overdue_since: past() })).toBe('suspended')
  })

  it('borda exata: trial_ends_at no passado por 1ms já conta como expirado', () => {
    expect(computeClinicStatus({ trial_ends_at: past(1), billing_paid: false, billing_overdue_since: null })).toBe('trial_expired')
  })
})
