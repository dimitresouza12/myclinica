import { describe, it, expect } from 'vitest'
import { computeClinicStatus, primeiraCobrancaCombinada, primeiraCobrancaVencida, CLINIC_STATUS_LABELS } from './clinicStatus'

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

// 12:00 em Brasília (15:00Z) do dia, para não depender do fuso da máquina
const noon = (day: string) => new Date(`${day}T12:00:00-03:00`)

describe('primeiraCobrancaCombinada', () => {
  const due = '2027-01-15'

  it('sem billing_first_due → false (também quando a coluna não existe)', () => {
    expect(primeiraCobrancaCombinada({ billing_paid: false }, noon('2026-12-01'))).toBe(false)
    expect(primeiraCobrancaCombinada({ billing_first_due: null, billing_paid: false }, noon('2026-12-01'))).toBe(false)
    expect(primeiraCobrancaCombinada({ billing_first_due: 'lixo', billing_paid: false }, noon('2026-12-01'))).toBe(false)
  })

  it('antes do vencimento → true', () => {
    expect(primeiraCobrancaCombinada({ billing_first_due: due, billing_paid: false }, noon('2026-11-25'))).toBe(true)
  })

  it('no dia do vencimento e nos 2 dias de tolerância → true', () => {
    expect(primeiraCobrancaCombinada({ billing_first_due: due, billing_paid: false }, noon('2027-01-15'))).toBe(true)
    expect(primeiraCobrancaCombinada({ billing_first_due: due, billing_paid: false }, noon('2027-01-17'))).toBe(true)
  })

  it('3 dias depois do vencimento sem pagar → false (o bloqueio volta)', () => {
    expect(primeiraCobrancaCombinada({ billing_first_due: due, billing_paid: false }, noon('2027-01-18'))).toBe(false)
  })

  it('já pago → false', () => {
    expect(primeiraCobrancaCombinada({ billing_first_due: due, billing_paid: true }, noon('2026-12-01'))).toBe(false)
  })

  it('usa o dia de Brasília: 23h30 de 17/01 ainda vale, 00h30 de 18/01 não', () => {
    const f = { billing_first_due: due, billing_paid: false }
    expect(primeiraCobrancaCombinada(f, new Date('2027-01-17T23:30:00-03:00'))).toBe(true)
    expect(primeiraCobrancaCombinada(f, new Date('2027-01-18T00:30:00-03:00'))).toBe(false)
  })

  it('aceita o valor do banco com hora anexada (timestamp)', () => {
    expect(primeiraCobrancaCombinada({ billing_first_due: '2027-01-15T00:00:00+00:00', billing_paid: false }, noon('2027-01-16'))).toBe(true)
  })

  it('virada de mês e de ano na tolerância', () => {
    const f = { billing_first_due: '2026-12-31', billing_paid: false }
    expect(primeiraCobrancaCombinada(f, noon('2027-01-02'))).toBe(true)
    expect(primeiraCobrancaCombinada(f, noon('2027-01-03'))).toBe(false)
  })
})

describe('computeClinicStatus — awaiting_first_charge', () => {
  const now = noon('2026-11-25')
  const expired = '2026-11-20T12:00:00-03:00'

  it('trial vencido, não pago, com 1ª cobrança combinada → awaiting_first_charge', () => {
    expect(computeClinicStatus({ trial_ends_at: expired, billing_paid: false, billing_overdue_since: null, billing_first_due: '2027-01-15' }, now)).toBe('awaiting_first_charge')
  })

  it('trial vencido, não pago, sem billing_first_due → trial_expired (comportamento anterior)', () => {
    expect(computeClinicStatus({ trial_ends_at: expired, billing_paid: false, billing_overdue_since: null }, now)).toBe('trial_expired')
    expect(computeClinicStatus({ trial_ends_at: expired, billing_paid: false, billing_overdue_since: null, billing_first_due: null }, now)).toBe('trial_expired')
  })

  it('tolerância esgotada sem pagar → volta a trial_expired', () => {
    expect(computeClinicStatus({ trial_ends_at: expired, billing_paid: false, billing_overdue_since: null, billing_first_due: '2027-01-15' }, noon('2027-01-18'))).toBe('trial_expired')
  })

  it('pago → active, mesmo com billing_first_due', () => {
    expect(computeClinicStatus({ trial_ends_at: expired, billing_paid: true, billing_overdue_since: null, billing_first_due: '2027-01-15' }, now)).toBe('active')
  })

  it('em atraso → suspended tem prioridade', () => {
    expect(computeClinicStatus({ trial_ends_at: expired, billing_paid: false, billing_overdue_since: '2027-01-20', billing_first_due: '2027-01-15' }, now)).toBe('suspended')
  })

  it('trial ainda correndo → trial, mesmo com billing_first_due', () => {
    expect(computeClinicStatus({ trial_ends_at: '2026-12-01T12:00:00-03:00', billing_paid: false, billing_overdue_since: null, billing_first_due: '2027-01-15' }, now)).toBe('trial')
  })

  it('tem rótulo', () => {
    expect(CLINIC_STATUS_LABELS.awaiting_first_charge).toBe('Aguardando 1ª cobrança')
  })
})

describe('primeiraCobrancaVencida', () => {
  const due = { billing_first_due: '2027-01-15', billing_paid: false }

  it('false até o dia do vencimento + 2 dias (acesso liberado)', () => {
    expect(primeiraCobrancaVencida(due, noon('2027-01-10'))).toBe(false)
    expect(primeiraCobrancaVencida(due, noon('2027-01-15'))).toBe(false)
    expect(primeiraCobrancaVencida(due, noon('2027-01-17'))).toBe(false)
  })
  it('true a partir de vencimento + 3 dias', () => {
    expect(primeiraCobrancaVencida(due, noon('2027-01-18'))).toBe(true)
    expect(primeiraCobrancaVencida(due, noon('2027-03-01'))).toBe(true)
  })
  it('false se pagou, se não há data ou se a data é inválida', () => {
    expect(primeiraCobrancaVencida({ ...due, billing_paid: true }, noon('2027-02-01'))).toBe(false)
    expect(primeiraCobrancaVencida({ billing_paid: false }, noon('2027-02-01'))).toBe(false)
    expect(primeiraCobrancaVencida({ billing_first_due: null, billing_paid: false }, noon('2027-02-01'))).toBe(false)
    expect(primeiraCobrancaVencida({ billing_first_due: 'lixo', billing_paid: false }, noon('2027-02-01'))).toBe(false)
  })
  it('usa o dia de Brasília na virada da tolerância', () => {
    // 17/01 23h30 em Brasília ainda é dia 17; 18/01 00h30 já é dia 18
    expect(primeiraCobrancaVencida(due, new Date('2027-01-17T23:30:00-03:00'))).toBe(false)
    expect(primeiraCobrancaVencida(due, new Date('2027-01-18T00:30:00-03:00'))).toBe(true)
  })
  it('é o complemento de primeiraCobrancaCombinada quando há data e não pagou', () => {
    for (const d of ['2027-01-14', '2027-01-15', '2027-01-17', '2027-01-18', '2027-02-20']) {
      expect(primeiraCobrancaVencida(due, noon(d))).toBe(!primeiraCobrancaCombinada(due, noon(d)))
    }
  })
  it('timestamp completo em billing_first_due também vale', () => {
    expect(primeiraCobrancaVencida({ billing_first_due: '2027-01-15T00:00:00+00:00', billing_paid: false }, noon('2027-01-18'))).toBe(true)
  })
})
