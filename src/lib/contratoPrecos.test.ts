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
    ['essencial', [89.9, 84.9, 79.9]],
    ['completo', [116.9, 109.9, 103.9]],
    ['equipe', [152.9, 143.9, 135.9]],
  ] as const)('mês a mês de %s (3/6/12)', (plan, expected) => {
    MONTHS.forEach((m, i) => expect(monthlyContractPrice(plan, m)).toBe(expected[i]))
  })

  it.each([
    ['essencial', [253.9, 478.9, 898.9]],
    ['completo', [330.9, 622.9, 1168.9]],
    ['equipe', [432.9, 814.9, 1528.9]],
  ] as const)('à vista de %s (3/6/12)', (plan, expected) => {
    MONTHS.forEach((m, i) => expect(upfrontContractTotal(plan, m)).toBe(expected[i]))
  })

  it('total do contrato depende do modo', () => {
    expect(contractTotal('essencial', 3, 'monthly')).toBe(269.7) // 89,90 x 3
    expect(contractTotal('essencial', 3, 'upfront')).toBe(253.9)
    expect(contractTotal('equipe', 12, 'monthly')).toBe(1630.8) // 135,90 x 12
  })

  it('valor mensal equivalente e economia', () => {
    expect(contractMonthlyValue('essencial', 3, 'monthly')).toBe(89.9)
    expect(contractMonthlyValue('essencial', 12, 'upfront')).toBe(74.91) // 898,90 / 12 arredondado
    expect(contractSavings('essencial', 3, 'upfront')).toBe(45.8) // 299,70 - 253,90
    expect(contractSavings('completo', 12, 'monthly')).toBe(312) // 1558,80 - 1246,80
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
      const net = 89890
      const charge = cardChargeCents(net, n)
      expect(charge).toBeGreaterThan(net)
      expect(charge % n).toBe(0)
      expect(cardFeeCents(net, n)).toBe(charge - net)
    }
  })

  it('a faixa maior custa mais', () => {
    expect(cardFeeCents(89890, 12)).toBeGreaterThan(cardFeeCents(89890, 6))
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
    expect(r.quote).toMatchObject({ plan: 'completo', months: 6, paymentMode: 'monthly', installments: 1, monthlyValue: 109.9, cardFeeValue: 0 })
    expect(r.quote.contractTotal).toBe(659.4)
    expect(r.quote.totalValue).toBe(659.4)
  })

  it('à vista parcelado soma a taxa no total e a parcela fecha a conta', () => {
    const r = quoteContract({ plan: 'essencial', months: 12, paymentMode: 'upfront', installments: 6 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.quote.contractTotal).toBe(898.9)
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

  describe('promoção Black Friday na 1ª mensalidade (mês a mês)', () => {
    it('essencial 3 meses: 1ª metade de 89,90 e as demais cheias', () => {
      const r = quoteContract({ plan: 'essencial', months: 3, paymentMode: 'monthly', promoPrimeira: true })
      if (!r.ok) throw new Error(r.error)
      expect(r.quote.promo).toBe(true)
      expect(r.quote.firstValue).toBe(44.95)
      expect(r.quote.monthlyValue).toBe(89.9)
      expect(r.quote.contractTotal).toBe(224.75) // 44,95 + 2 x 89,90
      expect(r.quote.savings).toBe(74.95) // 3 x 99,90 - 224,75
    })
    it('sem promoção o total é mensalidade x meses', () => {
      const r = quoteContract({ plan: 'essencial', months: 3, paymentMode: 'monthly' })
      if (!r.ok) throw new Error(r.error)
      expect(r.quote.promo).toBe(false)
      expect(r.quote.firstValue).toBe(89.9)
      expect(r.quote.contractTotal).toBe(269.7)
    })
    it('à vista ignora a promoção', () => {
      const r = quoteContract({ plan: 'essencial', months: 3, paymentMode: 'upfront', promoPrimeira: true })
      if (!r.ok) throw new Error(r.error)
      expect(r.quote.promo).toBe(false)
      expect(r.quote.contractTotal).toBe(253.9)
    })
  })
})
