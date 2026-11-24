import { describe, expect, it } from 'vitest'
import { avisoPromo, podeAssinarAgora, situacaoDoPlano, type ClinicaPlano } from './planoResumo'

const NOW = new Date('2027-01-10T15:00:00Z')
const base: ClinicaPlano = { trialEndsAt: '2027-01-08T00:00:00Z', billingPaid: false, billingOverdueSince: null, billingFirstDue: null, asaasSubscriptionId: null }

describe('situacaoDoPlano', () => {
  it('cartão cadastrado antes da 1ª cobrança NÃO é "pagamento atrasado"', () => {
    const s = situacaoDoPlano({ ...base, billingFirstDue: '2027-01-15', asaasSubscriptionId: 'sub_1' }, NOW)
    expect(s.status).toBe('awaiting_first_charge')
    expect(s.badge).toBe('Aguardando 1ª cobrança')
    expect(s.frase).toContain('15/01/2027')
  })
  it('em atraso quando há billing_overdue_since', () => {
    expect(situacaoDoPlano({ ...base, billingOverdueSince: '2027-01-01' }, NOW).tom).toBe('bad')
  })
  it('teste encerrado sem cartão', () => {
    const s = situacaoDoPlano(base, NOW)
    expect(s.badge).toBe('Teste encerrado')
    expect(s.frase).toContain('Assine')
  })
  it('em teste e ativa', () => {
    expect(situacaoDoPlano({ ...base, trialEndsAt: '2027-01-13T15:00:00Z' }, NOW).badge).toBe('Teste grátis')
    expect(situacaoDoPlano({ ...base, billingPaid: true }, NOW).badge).toBe('Ativa')
  })
})

describe('podeAssinarAgora', () => {
  it('só sem assinatura, sem 1ª cobrança combinada e sem estar pago', () => {
    expect(podeAssinarAgora(base, NOW)).toBe(true)
    expect(podeAssinarAgora({ ...base, asaasSubscriptionId: 'sub_1' }, NOW)).toBe(false)
    expect(podeAssinarAgora({ ...base, billingFirstDue: '2027-01-15' }, NOW)).toBe(false)
    expect(podeAssinarAgora({ ...base, billingPaid: true }, NOW)).toBe(false)
  })
})

describe('avisoPromo', () => {
  it('mostra os dois valores', () => {
    const t = avisoPromo(64.95, 129.9)
    expect(t).toContain('R$ 64,95')
    expect(t).toContain('R$ 129,90')
  })
})
