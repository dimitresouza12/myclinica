import { describe, expect, it } from 'vitest'
import {
  CARD_INSTALLMENT_FEES, MAX_INSTALLMENTS, cardChargeCents, cardChargeTotal, cardFeeCents, contractMonthlyValue,
  contractSavings, contractTotal, monthlyContractPrice, monthlyPriceNoContract, quoteContract, upfrontContractTotal,
} from './contratoPrecos'
import { PUBLIC_PLANS, isPublicPlan } from './planCatalog'

const MONTHS = [3, 6, 12] as const

describe('tabela de preços do contrato', () => {
  it('mensal sem contrato', () => {
    expect(monthlyPriceNoContract('essencial')).toBe(99.9)
    expect(monthlyPriceNoContract('completo')).toBe(129.9)
    expect(monthlyPriceNoContract('equipe')).toBe(169.9)
  })

  it.each([
    ['essencial', [94.9, 89.9, 84.9]],
    ['completo', [123.9, 116.9, 109.9]],
    ['equipe', [161.9, 152.9, 144.9]],
  ] as const)('mês a mês de %s (3/6/12)', (plan, expected) => {
    MONTHS.forEach((m, i) => expect(monthlyContractPrice(plan, m)).toBe(expected[i]))
  })

  it.each([
    ['essencial', [269.9, 509.9, 899.9]],
    ['completo', [349.9, 659.9, 1169.9]],
    ['equipe', [458.9, 866.9, 1529.9]],
  ] as const)('à vista de %s (3/6/12)', (plan, expected) => {
    MONTHS.forEach((m, i) => expect(upfrontContractTotal(plan, m)).toBe(expected[i]))
  })

  it('total do contrato depende do modo', () => {
    expect(contractTotal('essencial', 3, 'monthly')).toBe(284.7) // 94,90 x 3
    expect(contractTotal('essencial', 3, 'upfront')).toBe(269.9)
    expect(contractTotal('equipe', 12, 'monthly')).toBe(1738.8) // 144,90 x 12
  })

  it('valor mensal equivalente e economia', () => {
    expect(contractMonthlyValue('essencial', 3, 'monthly')).toBe(94.9)
    expect(contractMonthlyValue('essencial', 12, 'upfront')).toBe(74.99) // 899,90 / 12 arredondado
    expect(contractSavings('essencial', 3, 'upfront')).toBe(29.8) // 299,70 - 269,90
    expect(contractSavings('completo', 12, 'monthly')).toBe(240) // 1558,80 - 1318,80
  })

  it('o plano equipe é vendido e o ilimitado/completo_plus não', () => {
    expect(PUBLIC_PLANS).toContain('equipe')
    expect(isPublicPlan('equipe')).toBe(true)
    expect(isPublicPlan('ilimitado')).toBe(false)
    expect(isPublicPlan('completo_plus')).toBe(false)
  })
})

describe('taxa de parcelamento no cartão', () => {
  it('1x não tem acréscimo', () => {
    expect(cardFeeCents(26990, 1)).toBe(0)
    expect(cardChargeTotal(269.9, 1)).toBe(269.9)
  })

  it('parcelado repassa a taxa e as parcelas são iguais', () => {
    for (const n of [2, 3, 6, 7, 12]) {
      const net = 89990
      const charge = cardChargeCents(net, n)
      expect(charge).toBeGreaterThan(net)
      expect(charge % n).toBe(0)
      expect(cardFeeCents(net, n)).toBe(charge - net)
    }
  })

  it('a faixa maior custa mais', () => {
    expect(cardFeeCents(89990, 12)).toBeGreaterThan(cardFeeCents(89990, 6))
  })

  it('a configuração cobre de 1 a 12 sem buraco', () => {
    for (let n = 1; n <= MAX_INSTALLMENTS; n++) {
      expect(CARD_INSTALLMENT_FEES.filter(f => n >= f.from && n <= f.to)).toHaveLength(1)
    }
    expect(() => cardChargeCents(10000, 13)).toThrow()
  })
})

describe('quoteContract', () => {
  it('mensal monta o orçamento', () => {
    const r = quoteContract({ plan: 'completo', months: 6, paymentMode: 'monthly' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.quote).toMatchObject({ plan: 'completo', months: 6, paymentMode: 'monthly', installments: 1, monthlyValue: 116.9, cardFeeValue: 0 })
    expect(r.quote.contractTotal).toBe(701.4)
    expect(r.quote.totalValue).toBe(701.4)
  })

  it('à vista parcelado soma a taxa no total e a parcela fecha a conta', () => {
    const r = quoteContract({ plan: 'essencial', months: 12, paymentMode: 'upfront', installments: 6 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.quote.contractTotal).toBe(899.9)
    expect(r.quote.cardFeeValue).toBeGreaterThan(0)
    expect(Math.round(r.quote.totalValue * 100)).toBe(Math.round(r.quote.contractTotal * 100) + Math.round(r.quote.cardFeeValue * 100))
    expect(Math.round(r.quote.installmentValue * 100) * 6).toBe(Math.round(r.quote.totalValue * 100))
  })

  it.each([
    [{ plan: 'ilimitado', months: 3, paymentMode: 'monthly' }],
    [{ plan: 'completo_plus', months: 3, paymentMode: 'monthly' }],
    [{ plan: 'essencial', months: 4, paymentMode: 'monthly' }],
    [{ plan: 'essencial', months: 3, paymentMode: 'boleto' }],
    [{ plan: 'essencial', months: 3, paymentMode: 'upfront', installments: 13 }],
    [{ plan: 'essencial', months: 3, paymentMode: 'upfront', installments: 0 }],
    [{ plan: 'essencial', months: 3, paymentMode: 'upfront', installments: 1.5 }],
    [{ plan: undefined, months: undefined, paymentMode: undefined }],
  ])('rejeita entrada inválida %j', input => {
    expect(quoteContract(input).ok).toBe(false)
  })

  it('mensal ignora parcelas (cartão só vale no à vista)', () => {
    const r = quoteContract({ plan: 'essencial', months: 3, paymentMode: 'monthly', installments: 6 })
    if (r.ok) expect(r.quote.installments).toBe(1)
  })
})
