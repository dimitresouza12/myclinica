import { describe, expect, it } from 'vitest'
import { fluxoDaEscolha, opcoesDePrazo, parcelasPossiveis, resumoDaEscolha } from './assinaturaEscolha'

describe('opcoesDePrazo', () => {
  it('começa no mensal e traz os descontos 10/15/20 e 15/20/25', () => {
    const o = opcoesDePrazo('essencial')
    expect(o.map(x => x.prazo)).toEqual([1, 3, 6, 12])
    expect(o[0]).toMatchObject({ valorMensal: 99.9, descontoMensalPct: 0, economiaMensal: 0 })
    expect(o.slice(1).map(x => x.descontoMensalPct)).toEqual([10, 15, 20])
    expect(o.slice(1).map(x => x.descontoAvistaPct)).toEqual([15, 20, 25])
    expect(o[3]).toMatchObject({ valorMensal: 79.9, economiaMensal: 240, economiaAvista: 299.9 })
  })
})

describe('fluxoDaEscolha', () => {
  it('mensal vai ao cartão, contrato ao contrato', () => {
    expect(fluxoDaEscolha(1)).toBe('cartao')
    expect(fluxoDaEscolha(3)).toBe('contrato')
    expect(fluxoDaEscolha(12)).toBe('contrato')
  })
})

describe('resumoDaEscolha', () => {
  it('mensal sem fidelidade', () => {
    expect(resumoDaEscolha({ plan: 'completo', prazo: 1, mode: 'monthly' })).toMatchObject({ fluxo: 'cartao', valorMensal: 129.9, economia: 0, erro: null })
  })
  it('contrato mês a mês', () => {
    expect(resumoDaEscolha({ plan: 'completo', prazo: 6, mode: 'monthly' })).toMatchObject({ valorMensal: 109.9, total: 659.4, economia: 120, taxaCartao: 0 })
  })
  it('à vista 1x sem taxa, parcelado com taxa e parcela fechando a conta', () => {
    expect(resumoDaEscolha({ plan: 'essencial', prazo: 3, mode: 'upfront', installments: 1 })).toMatchObject({ totalCobrado: 253.9, taxaCartao: 0, economia: 45.8 })
    const r = resumoDaEscolha({ plan: 'essencial', prazo: 12, mode: 'upfront', installments: 6 })
    expect(r.taxaCartao).toBeGreaterThan(0)
    expect(Math.round(r.valorParcela * 100) * 6).toBe(Math.round(r.totalCobrado * 100))
  })
})

describe('parcelasPossiveis', () => {
  it('sempre inclui 1x e respeita o máximo e a parcela mínima', () => {
    const p = parcelasPossiveis('essencial', 12)
    expect(p[0]).toBe(1)
    expect(Math.max(...p)).toBeLessThanOrEqual(12)
    expect(parcelasPossiveis('essencial', 3)).toContain(3)
  })
})
