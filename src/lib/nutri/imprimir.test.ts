import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/print', () => ({ printDocumento: vi.fn() }))

import { carregarTaco } from './alimentos'
import { esc, htmlCompras, htmlEvolucao, htmlPlano, htmlSubstituicoes } from './imprimir'
import { planoVazio } from './plano'
import { avaliacaoVazia, seriesDeEvolucao } from './avaliacao'

const ALIMENTOS_TACO = await carregarTaco()

const cab = { clinica: 'Clínica <b>X</b>', paciente: 'Ana & Cia' }
const plano = (() => {
  const p = planoVazio('Plano <script>')
  p.meta = { kcal: 500, proteinaG: null, carboidratoG: null, lipidioG: null }
  p.refeicoes[0].itens = [{ id: 'a', alimentoId: 'taco-3', gramas: 150, medida: '4 colheres <de sopa>' }, { id: 'b', alimentoId: 'taco-488', gramas: 100 }]
  return p
})()

describe('impressos', () => {
  it('escapa todo texto digitado', () => {
    expect(esc('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;')
    const html = htmlPlano(cab, plano, ALIMENTOS_TACO)
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<b>X</b>')
    expect(html).toContain('Ana &amp; Cia')
    expect(html).toContain('4 colheres &lt;de sopa&gt;')
  })
  it('plano traz totais e resumo do dia', () => {
    const html = htmlPlano(cab, plano, ALIMENTOS_TACO)
    expect(html).toContain('Arroz, tipo 1, cozido')
    expect(html).toContain('192') // 150 g x 128 kcal
    expect(html).toContain('Resumo do dia')
    expect(html).toContain('TACO')
  })
  it('substituições e compras saem com conteúdo; sem itens, com aviso', () => {
    expect(htmlSubstituicoes(cab, plano, ALIMENTOS_TACO)).toContain('pode ser trocado por')
    expect(htmlCompras(cab, plano, ALIMENTOS_TACO, 7)).toContain('1,05 kg') // 150 g x 7
    expect(htmlCompras(cab, planoVazio(), ALIMENTOS_TACO)).toContain('Adicione alimentos')
  })
  it('evolução lista datas e variação', () => {
    const mk = (id: string, data: string, peso: string) => ({ id, data, dados: { ...avaliacaoVazia('F'), peso } })
    const html = htmlEvolucao(cab, seriesDeEvolucao([mk('a', '2026-04-01', '75'), mk('b', '2026-05-01', '72')], null))
    expect(html).toContain('01/04/2026')
    expect(html).toContain('-3')
  })
  it('evolução mantém duas avaliações do mesmo dia', () => {
    const mk = (id: string, data: string, peso: string) => ({ id, data, dados: { ...avaliacaoVazia('F'), peso } })
    const html = htmlEvolucao(cab, seriesDeEvolucao([mk('a', '2026-04-01', '75'), mk('b', '2026-04-01', '73.4')], null))
    expect(html.match(/01\/04\/2026/g)).toHaveLength(2)
    expect(html).toContain('>75<')
    expect(html).toContain('73,4')
  })
})
