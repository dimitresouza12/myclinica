import { describe, expect, it } from 'vitest'
import { htmlFichaAplicacao, htmlHistoricoAplicacoes, svgMapaAplicacao } from './imprimir'
import { normalizarAplicacao, type Aplicacao } from './aplicacoes'

function apl(p: Record<string, unknown> = {}): Aplicacao {
  return normalizarAplicacao({
    id: 'a1', data: '2026-11-10', tipo: 'toxina', produto: 'Toxina <X>', fabricante: 'Lab & Cia', lote: 'A123', validade: '2027-06-30',
    dose: 20, dose_unidade: 'U', quantidade_baixa: 20,
    regioes: [{ id: 'r1', regiao: 'Glabela', unidades: 12, x: 150, y: 82 }, { id: 'r2', regiao: 'Frontal', unidades: 8, x: null, y: null }],
    observacoes: 'Diluição 2,5 ml', contract_id: null, lot_id: 'l1', profissional_nome: 'Dra. Ana', profissional_registro: 'CRBM 123',
    estornada_em: null, estorno_motivo: null, created_at: '2026-11-10T14:00:00Z', ...p,
  })!
}
const cab = { clinica: 'Clínica <Bela>', paciente: 'Maria "M" Souza' }

describe('ficha de aplicação', () => {
  it('traz produto, fabricante, lote, validade, dose e regiões, com o texto escapado', () => {
    const h = htmlFichaAplicacao(cab, apl())
    expect(h).toContain('FICHA DE APLICAÇÃO')
    expect(h).toContain('Toxina &lt;X&gt;')
    expect(h).toContain('Lab &amp; Cia')
    expect(h).toContain('A123')
    expect(h).toContain('30/06/2027')
    expect(h).toContain('20 U')
    expect(h).toContain('Glabela')
    expect(h).toContain('Frontal')
    expect(h).toContain('Clínica &lt;Bela&gt;')
    expect(h).toContain('Maria &quot;M&quot; Souza')
    expect(h).not.toContain('<X>')
  })
  it('mostra o termo vinculado, ou diz que não há', () => {
    expect(htmlFichaAplicacao(cab, apl(), { titulo: 'TCLE toxina', situacao: 'Assinado' })).toContain('TCLE toxina (Assinado)')
    expect(htmlFichaAplicacao(cab, apl())).toContain('Nenhum termo vinculado')
  })
  it('marca a aplicação estornada', () => {
    expect(htmlFichaAplicacao(cab, apl({ estornada_em: '2026-11-11T10:00:00Z', estorno_motivo: 'Lançada no paciente errado' }))).toContain('APLICAÇÃO ESTORNADA: Lançada no paciente errado')
  })
  it('desenha só os pontos que existem no mapa', () => {
    const svg = svgMapaAplicacao(apl())
    expect(svg).toContain('<svg')
    expect((svg.match(/<circle/g) ?? []).length).toBe(1)
    expect(svgMapaAplicacao(apl({ regioes: [{ id: 'r', regiao: 'Frontal', unidades: 8 }] }))).toBe('')
  })
})

describe('histórico', () => {
  it('lista as aplicações e deixa as estornadas de fora', () => {
    const h = htmlHistoricoAplicacoes(cab, [apl(), apl({ id: 'a2', produto: 'Preenchedor Y', estornada_em: '2026-11-11T10:00:00Z' })])
    expect(h).toContain('HISTÓRICO DE APLICAÇÕES')
    expect(h).toContain('Toxina &lt;X&gt;')
    expect(h).not.toContain('Preenchedor Y')
    expect(h).toContain('Glabela 12 U, Frontal 8 U')
  })
  it('sem aplicações', () => {
    expect(htmlHistoricoAplicacoes(cab, [])).toContain('Nenhuma aplicação registrada')
  })
})
