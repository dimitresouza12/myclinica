import { describe, expect, it } from 'vitest'
import { TERMO_VERSAO, montarTermo } from './termoAssinatura'

const base = { planoLabel: 'Completo', valorCheio: 129.9, valorPrimeira: 64.95, dataPrimeira: '15/01/2027', promo: true }

describe('termo de assinatura no cartão', () => {
  it('traz versão e as cláusulas obrigatórias', () => {
    const t = montarTermo(base)
    expect(t.versao).toBe(TERMO_VERSAO)
    expect(t.secoes.length).toBeGreaterThanOrEqual(5)
    const x = t.texto
    expect(x).toContain('plano Completo')
    expect(x).toContain('Hoje nada é cobrado (R$ 0,00)')
    expect(x).toContain('R$ 64,95, em 15/01/2027')
    expect(x).toContain('R$ 129,90')
    expect(x).toMatch(/sem fidelidade/i)
    expect(x).toMatch(/não tem fidelidade nem multa/)
    expect(x).toMatch(/não é devolvida/)
    expect(x).toContain('bloqueado 2 dias depois do vencimento')
    expect(x).toContain('Asaas')
    expect(x).toMatch(/não armazena o número completo/)
    expect(x).toContain('LGPD')
  })

  it('cláusula do desconto só aparece com promoção', () => {
    expect(montarTermo(base).texto).toContain('somente para a primeira mensalidade')
    const sem = montarTermo({ ...base, promo: false, valorPrimeira: 129.9 })
    expect(sem.texto).not.toContain('50%')
    expect(sem.texto).toContain('R$ 129,90, em 15/01/2027')
  })

  it('é determinístico: mesmos dados, mesmo texto (base do hash da prova)', () => {
    expect(montarTermo(base).texto).toBe(montarTermo({ ...base }).texto)
    expect(montarTermo(base).texto).not.toBe(montarTermo({ ...base, valorCheio: 99.9 }).texto)
  })

  it('não contém emoji', () => {
    expect(montarTermo(base).texto).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})
