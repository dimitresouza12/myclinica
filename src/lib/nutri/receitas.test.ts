import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/print', () => ({ printDocumento: vi.fn() }))

import { carregarTaco } from './alimentos'
import { htmlPlano, htmlPorcoes, htmlReceita } from './imprimir'
import { normalizarPlano, planoVazio } from './plano'
import {
  anexarReceita, filtrarReceitas, formatarTempo, ingredientesDeTexto, ingredientesParaTexto, normalizarAnexo, normalizarIngredientes,
  receitaDaLinha, receitasParaEscolha, validarReceita, type Receita,
} from './receitas'

const TACO = await carregarTaco()

const form = { titulo: 'Panqueca de banana', porcoes: '2', tempo: '15', ingredientes: '1 banana\n2 ovos\n\n  3 col. de aveia  ', preparo: 'Misture tudo.\nFrite.', observacoes: '' }

describe('validarReceita', () => {
  it('aceita e normaliza: apara, descarta linhas vazias, converte números', () => {
    const r = validarReceita(form)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.dados.titulo).toBe('Panqueca de banana')
    expect(r.dados.porcoes).toBe(2)
    expect(r.dados.tempo_preparo_min).toBe(15)
    expect(r.dados.ingredientes).toEqual([{ texto: '1 banana' }, { texto: '2 ovos' }, { texto: '3 col. de aveia' }])
    expect(r.dados.observacoes).toBeNull()
  })

  it('porções e tempo são opcionais', () => {
    const r = validarReceita({ ...form, porcoes: '', tempo: '' })
    expect(r.ok && r.dados.porcoes).toBeNull()
    expect(r.ok && r.dados.tempo_preparo_min).toBeNull()
  })

  it('recusa o que é obrigatório e o que estoura limite, com mensagem', () => {
    expect(validarReceita({ ...form, titulo: '  ' })).toEqual({ ok: false, erro: 'Informe o nome da receita.' })
    expect(validarReceita({ ...form, ingredientes: '\n \n' })).toEqual({ ok: false, erro: 'Informe ao menos um ingrediente.' })
    expect(validarReceita({ ...form, preparo: ' ' })).toEqual({ ok: false, erro: 'Descreva o modo de preparo.' })
    expect(validarReceita({ ...form, titulo: 'x'.repeat(121) }).ok).toBe(false)
    expect(validarReceita({ ...form, preparo: 'x'.repeat(8001) }).ok).toBe(false)
    expect(validarReceita({ ...form, ingredientes: 'x'.repeat(161) }).ok).toBe(false)
    expect(validarReceita({ ...form, ingredientes: Array.from({ length: 81 }, (_, i) => `i${i}`).join('\n') }).ok).toBe(false)
  })

  it('porções e tempo precisam ser inteiros dentro da faixa do banco', () => {
    for (const porcoes of ['0', '201', '1,5', 'abc', '-1']) expect(validarReceita({ ...form, porcoes }).ok, porcoes).toBe(false)
    for (const tempo of ['0', '1441', '2.5', 'x']) expect(validarReceita({ ...form, tempo }).ok, tempo).toBe(false)
    expect(validarReceita({ ...form, porcoes: '200', tempo: '1440' }).ok).toBe(true)
  })
})

describe('ingredientes', () => {
  it('lê o jsonb com tolerância e respeita os limites', () => {
    expect(normalizarIngredientes('x')).toEqual([])
    expect(normalizarIngredientes([{ texto: ' a ' }, 'b', 3, null, { texto: '' }, { nome: 'c' }])).toEqual([{ texto: 'a' }, { texto: 'b' }])
    expect(normalizarIngredientes(Array.from({ length: 100 }, (_, i) => `i${i}`))).toHaveLength(80)
  })
  it('ida e volta com a caixa de texto', () => {
    expect(ingredientesParaTexto(ingredientesDeTexto('a\r\n\nb'))).toBe('a\nb')
  })
})

describe('formatarTempo', () => {
  it('minutos e horas', () => {
    expect(formatarTempo(45)).toBe('45 min')
    expect(formatarTempo(60)).toBe('1 h')
    expect(formatarTempo(90)).toBe('1 h 30 min')
    expect(formatarTempo(null)).toBe('')
    expect(formatarTempo(0)).toBe('')
  })
})

const receita: Receita = {
  id: 'r1', titulo: 'Panqueca <b>', porcoes: 2, tempo_preparo_min: 20, ingredientes: [{ texto: '1 banana' }, { texto: '2 ovos' }],
  modo_preparo: 'Misture & frite', observacoes: 'Sem açúcar', created_at: '2026-11-16T10:00:00Z',
}

describe('receitaDaLinha', () => {
  it('converte a linha do banco e usa padrões seguros', () => {
    const r = receitaDaLinha({ id: 'x', titulo: 'T', porcoes: null, ingredientes: [{ texto: 'a' }], modo_preparo: 'm', observacoes: '  ', created_at: 'c' })
    expect(r).toMatchObject({ id: 'x', porcoes: null, tempo_preparo_min: null, observacoes: null, ingredientes: [{ texto: 'a' }] })
  })
})

describe('anexo da receita no plano', () => {
  it('copia os dados (independente do banco de receitas) e sobrevive à ida e volta do jsonb', () => {
    const anexo = anexarReceita(receita)
    expect(anexo).toEqual({ id: 'r1', titulo: 'Panqueca <b>', porcoes: 2, tempoMin: 20, ingredientes: ['1 banana', '2 ovos'], preparo: 'Misture & frite' })
    const plano = planoVazio()
    plano.refeicoes[0].receita = anexo
    const volta = normalizarPlano(JSON.parse(JSON.stringify(plano)))
    expect(volta.refeicoes[0].receita).toEqual(anexo)
    expect(volta.refeicoes[1].receita).toBeUndefined()
  })

  it('plano antigo, sem receita, continua válido; anexo corrompido é descartado', () => {
    expect(normalizarAnexo(undefined)).toBeUndefined()
    expect(normalizarAnexo('texto')).toBeUndefined()
    expect(normalizarAnexo({ titulo: '  ' })).toBeUndefined()
    expect(normalizarAnexo({ titulo: 'A', ingredientes: 'x', porcoes: -1 })).toEqual({ id: '', titulo: 'A', porcoes: null, tempoMin: null, ingredientes: [], preparo: '' })
  })

  it('o impresso do plano traz a receita da refeição, com texto escapado', () => {
    const plano = planoVazio()
    plano.refeicoes[0].itens = [{ id: 'a', alimentoId: 'taco-3', gramas: 100 }]
    plano.refeicoes[0].receita = anexarReceita(receita)
    const html = htmlPlano({ clinica: 'C', paciente: 'P' }, plano, TACO)
    expect(html).toContain('Receita: Panqueca &lt;b&gt;')
    expect(html).toContain('2 porções')
    expect(html).toContain('preparo 20 min')
    expect(html).toContain('<li>1 banana</li>')
    expect(html).toContain('Misture &amp; frite')
    expect(html).not.toContain('<b>')
  })

  it('receita avulsa e lista de porções saem com conteúdo', () => {
    const html = htmlReceita({ clinica: 'C', paciente: 'P' }, { ...anexarReceita(receita), observacoes: 'Sem <açúcar>' })
    expect(html).toContain('Panqueca &lt;b&gt;')
    expect(html).toContain('Observações:')
    expect(html).toContain('Sem &lt;açúcar&gt;')
    const porcoes = htmlPorcoes({ clinica: 'C', paciente: 'P' }, TACO)
    expect(porcoes).toContain('Lista de porções equivalentes')
    expect(porcoes).toContain('Cereais, pães e tubérculos')
    expect(porcoes).toContain('1 porção = 150 kcal')
    expect(porcoes).toContain('aprox. 1 x pão francês (unidade)')
  })
})

describe('listas', () => {
  const outra: Receita = { ...receita, id: 'r2', titulo: 'Árvore de legumes', ingredientes: [{ texto: 'cenoura' }] }
  it('escolha vem por nome, sem alterar a lista original', () => {
    const lista = [receita, outra]
    expect(receitasParaEscolha(lista).map(r => r.id)).toEqual(['r2', 'r1'])
    expect(lista.map(r => r.id)).toEqual(['r1', 'r2'])
  })
  it('filtro ignora acento e procura no título e nos ingredientes', () => {
    expect(filtrarReceitas([receita, outra], 'arvore').map(r => r.id)).toEqual(['r2'])
    expect(filtrarReceitas([receita, outra], 'cenoura').map(r => r.id)).toEqual(['r2'])
    expect(filtrarReceitas([receita, outra], 'banana ovos').map(r => r.id)).toEqual(['r1'])
    expect(filtrarReceitas([receita, outra], '  ')).toHaveLength(2)
  })
})
