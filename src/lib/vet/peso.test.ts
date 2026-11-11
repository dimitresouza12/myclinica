import { describe, expect, it } from 'vitest'
import { emOrdemCronologica, lerPeso, pesoAtual, textoDaVariacao, validarPesagem, variacaoDoPeso, variacoesEntrePesagens, type Pesagem } from './peso'

const p = (id: string, weighed_on: string, weight_kg: number, created_at = `${weighed_on}T10:00:00Z`): Pesagem => ({ id, weighed_on, weight_kg, note: null, created_at })

describe('histórico de peso', () => {
  const lista = [p('c', '2026-09-01', 5.2), p('a', '2026-03-01', 4), p('b', '2026-06-01', 4.6)]
  it('ordena por data e acha o peso atual', () => {
    expect(emOrdemCronologica(lista).map(x => x.id)).toEqual(['a', 'b', 'c'])
    expect(pesoAtual(lista)?.id).toBe('c')
    expect(pesoAtual([])).toBeNull()
  })
  it('variação total em kg e em % sobre o primeiro peso', () => {
    const v = variacaoDoPeso(lista)!
    expect(v.deltaKg).toBeCloseTo(1.2, 6)
    expect(v.pct).toBeCloseTo(30, 6)
    expect(v.dias).toBe(184)
  })
  it('com menos de duas pesagens não há variação', () => {
    expect(variacaoDoPeso([p('a', '2026-03-01', 4)])).toBeNull()
    expect(variacaoDoPeso([])).toBeNull()
  })
  it('perda de peso fica negativa', () => {
    const v = variacaoDoPeso([p('a', '2026-03-01', 10), p('b', '2026-04-01', 9.5)])!
    expect(v.pct).toBeCloseTo(-5, 6)
    expect(textoDaVariacao(v.deltaKg, v.pct)).toBe('-0,5 kg (-5%)')
  })
  it('variação entre pesagens vizinhas', () => {
    const r = variacoesEntrePesagens(lista)
    expect(r[0].deltaKg).toBeNull()
    expect(r[1].deltaKg).toBeCloseTo(0.6, 6)
    expect(r[1].pct).toBeCloseTo(15, 6)
    expect(r[2].deltaKg).toBeCloseTo(0.6, 6)
  })
  it('texto da variação', () => {
    expect(textoDaVariacao(0.4, 8)).toBe('+0,4 kg (+8%)')
    expect(textoDaVariacao(0, 0)).toBe('sem variação')
    expect(textoDaVariacao(0.25, null)).toBe('+0,25 kg')
  })
})

describe('leitura do peso digitado', () => {
  it('aceita vírgula e ponto', () => {
    expect(lerPeso('4,25')).toEqual({ valor: 4.25, erro: null })
    expect(lerPeso('0.35').valor).toBe(0.35)
  })
  it('vazio não é erro; fora da faixa e texto são', () => {
    expect(lerPeso('')).toEqual({ valor: null, erro: null })
    expect(lerPeso('0').erro).toMatch(/fora do esperado/)
    expect(lerPeso('5000').erro).toMatch(/fora do esperado/)
    expect(lerPeso('abc').erro).toBe('Digite um número.')
  })
  it('valida o formulário de pesagem', () => {
    expect(validarPesagem('4,2', '2026-11-14', '2026-11-14')).toBeNull()
    expect(validarPesagem('', '2026-11-14', '2026-11-14')).toBe('Informe o peso.')
    expect(validarPesagem('4,2', '2026-11-15', '2026-11-14')).toMatch(/futuro/)
    expect(validarPesagem('4,2', '', '2026-11-14')).toMatch(/data/)
  })
})
