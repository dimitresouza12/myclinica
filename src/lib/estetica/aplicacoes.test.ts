import { describe, expect, it } from 'vitest'
import {
  agruparPorProduto, alertasDeLotes, doseTotal, estadoDoLote, mapearLote, mensagemDoErro, normalizarAplicacao, normalizarRegioes,
  normalizarUnidade, ordenarAplicacoes, ordenarParaEscolha, resumoRegioes, rotuloTermo, somaRegioes, sugerirBaixa, termosUteis, textoDose, validarAplicacao,
  type LoteDisponivel, type RascunhoAplicacao, type RegiaoAplicada,
} from './aplicacoes'

const HOJE = '2026-11-16'

function lote(p: Partial<LoteDisponivel> = {}): LoteDisponivel {
  return { lotId: 'l1', itemId: 'i1', produto: 'Toxina X', unidade: 'U', categoria: 'injetavel', lote: 'A123', validade: '2027-06-30', fabricante: 'Lab', saldo: 100, ...p }
}
const reg = (p: Partial<RegiaoAplicada> = {}): RegiaoAplicada => ({ id: 'r', regiao: 'Glabela', unidades: 10, x: 150, y: 82, ...p })
function rascunho(p: Partial<RascunhoAplicacao> = {}): RascunhoAplicacao {
  return { data: HOJE, lote: lote(), dose: 20, doseUnidade: 'U', baixa: 20, regioes: [reg()], observacoes: '', ...p }
}

describe('unidade e baixa', () => {
  it('normaliza escritas diferentes da mesma unidade', () => {
    expect(normalizarUnidade('unidades')).toBe('U')
    expect(normalizarUnidade(' UN ')).toBe('U')
    expect(normalizarUnidade('ML')).toBe('ml')
    expect(normalizarUnidade('Ampolas')).toBe('ampola')
    expect(normalizarUnidade('frasco')).toBe('frasco')
    expect(normalizarUnidade(null)).toBe('')
  })
  it('baixa = dose quando o produto é controlado na mesma unidade; senão sugere 1', () => {
    expect(sugerirBaixa(20, 'U', 'U')).toBe(20)
    expect(sugerirBaixa(20, 'U', 'unidades')).toBe(20)
    expect(sugerirBaixa(0.5, 'ml', 'ml')).toBe(0.5)
    expect(sugerirBaixa(20, 'U', 'frasco')).toBe(1)
    expect(sugerirBaixa(20, 'U', '')).toBe(1)
    expect(sugerirBaixa(0, 'U', 'U')).toBe(0)
    expect(sugerirBaixa(Number.NaN, 'U', 'U')).toBe(0)
  })
  it('formata a dose com vírgula', () => {
    expect(textoDose(0.5, 'ml')).toBe('0,5 ml')
    expect(textoDose(20, 'U')).toBe('20 U')
  })
})

describe('regiões', () => {
  it('lê o jsonb sem confiar no formato', () => {
    const r = normalizarRegioes([
      { id: 'a', regiao: '  Frontal ', unidades: '8,5', x: 150, y: 52 },
      { regiao: 'Sem dose', unidades: -3, x: 'abc' },
      null, 'lixo', 7,
    ])
    expect(r).toHaveLength(2)
    expect(r[0]).toEqual({ id: 'a', regiao: 'Frontal', unidades: 8.5, x: 150, y: 52 })
    expect(r[1].unidades).toBeNull()
    expect(r[1].x).toBeNull()
    expect(normalizarRegioes('x')).toEqual([])
    expect(normalizarRegioes(undefined)).toEqual([])
  })
  it('limita a 60 regiões', () => {
    expect(normalizarRegioes(Array.from({ length: 100 }, () => ({ regiao: 'x' })))).toHaveLength(60)
  })
  it('soma as regiões e escolhe a dose total', () => {
    const rs = [reg({ unidades: 10 }), reg({ unidades: 8.5 }), reg({ unidades: null })]
    expect(somaRegioes(rs)).toBe(18.5)
    expect(doseTotal(rs, 99)).toBe(18.5)
    expect(doseTotal([reg({ unidades: null })], 12)).toBe(12)
    expect(doseTotal([], Number.NaN)).toBe(0)
  })
  it('resume as regiões', () => {
    expect(resumoRegioes([reg(), reg({ regiao: 'Frontal', unidades: 8 }), reg({ regiao: '', unidades: null })], 'U')).toBe('Glabela 10 U, Frontal 8 U')
  })
})

describe('validade do lote', () => {
  it('vencido bloqueia, perto de vencer avisa', () => {
    expect(estadoDoLote('2026-11-15', HOJE)).toMatchObject({ bloqueado: true, tom: 'bloqueio' })
    expect(estadoDoLote('2026-11-16', HOJE)).toMatchObject({ bloqueado: false, tom: 'aviso', texto: 'Vence hoje' })
    expect(estadoDoLote('2026-12-10', HOJE)).toMatchObject({ bloqueado: false, tom: 'aviso' })
    expect(estadoDoLote('2027-06-30', HOJE)).toMatchObject({ bloqueado: false, tom: 'ok' })
    expect(estadoDoLote(null, HOJE)).toMatchObject({ bloqueado: false, tom: 'neutro' })
  })
  it('ordena: dentro da validade primeiro (vence antes, sai antes), vencidos no fim', () => {
    const lotes = [
      lote({ lotId: 'v', lote: 'V', validade: '2026-10-01' }),
      lote({ lotId: 'b', lote: 'B', validade: '2027-03-01' }),
      lote({ lotId: 'a', lote: 'A', validade: '2026-12-01' }),
      lote({ lotId: 's', lote: 'S', validade: null }),
    ]
    expect(ordenarParaEscolha(lotes, HOJE).map(l => l.lotId)).toEqual(['a', 'b', 's', 'v'])
  })
  it('conta vencidos e a vencer, ignorando lote sem saldo ou sem validade', () => {
    const r = alertasDeLotes([
      { validade: '2026-11-01', saldo: 5 },
      { validade: '2026-11-20', saldo: 3 },
      { validade: '2027-01-10', saldo: 2 },
      { validade: '2026-11-01', saldo: 0 },
      { validade: null, saldo: 9 },
    ], HOJE)
    expect(r.vencidos).toEqual({ lotes: 1, unidades: 5 })
    expect(r.ate30).toEqual({ lotes: 1, unidades: 3 })
    expect(r.ate60).toEqual({ lotes: 2, unidades: 5 })
    expect(r.ate90).toEqual({ lotes: 2, unidades: 5 })
  })
  it('agrupa por produto com injetáveis primeiro', () => {
    const g = agruparPorProduto([
      lote({ lotId: '1', itemId: 'c', produto: 'Creme', categoria: 'cosmetico' }),
      lote({ lotId: '2', itemId: 'z', produto: 'Zeta', categoria: 'injetavel' }),
      lote({ lotId: '3', itemId: 'z', produto: 'Zeta', categoria: 'injetavel', lote: 'B', validade: '2026-12-01' }),
      lote({ lotId: '4', itemId: 'a', produto: 'Alfa', categoria: 'injetavel' }),
    ], HOJE)
    expect(g.map(p => p.produto)).toEqual(['Alfa', 'Zeta', 'Creme'])
    expect(g[1].lotes.map(l => l.lotId)).toEqual(['3', '2'])
  })
})

describe('lote vindo do banco', () => {
  it('mapeia a linha da função', () => {
    expect(mapearLote({ lot_id: 'l', stock_item_id: 'i', produto: 'P', unidade: 'U', categoria: 'injetavel', lote: 'X1', validade: '2027-01-02', fabricante: null, saldo: '12.5' }))
      .toEqual({ lotId: 'l', itemId: 'i', produto: 'P', unidade: 'U', categoria: 'injetavel', lote: 'X1', validade: '2027-01-02', fabricante: null, saldo: 12.5 })
  })
  it('descarta linha sem o essencial', () => {
    expect(mapearLote(null)).toBeNull()
    expect(mapearLote({ lot_id: 'l', produto: 'P' })).toBeNull()
  })
})

describe('validarAplicacao', () => {
  it('aceita um rascunho completo', () => {
    expect(validarAplicacao(rascunho(), HOJE)).toBeNull()
  })
  it('exige lote', () => {
    expect(validarAplicacao(rascunho({ lote: null }), HOJE)).toMatch(/produto e o lote/)
  })
  it('bloqueia lote vencido, sem exceção', () => {
    expect(validarAplicacao(rascunho({ lote: lote({ validade: '2026-11-15' }) }), HOJE)).toMatch(/venceu em 15\/11\/2026/)
  })
  it('lote que vence hoje ainda vale', () => {
    expect(validarAplicacao(rascunho({ lote: lote({ validade: HOJE }) }), HOJE)).toBeNull()
  })
  it('recusa data futura ou inválida', () => {
    expect(validarAplicacao(rascunho({ data: '2026-11-17' }), HOJE)).toMatch(/data/)
    expect(validarAplicacao(rascunho({ data: '' }), HOJE)).toMatch(/data/)
  })
  it('exige dose e baixa positivas', () => {
    expect(validarAplicacao(rascunho({ dose: 0 }), HOJE)).toMatch(/dose/)
    expect(validarAplicacao(rascunho({ baixa: 0 }), HOJE)).toMatch(/baixar/)
  })
  it('recusa baixa maior que o saldo do lote', () => {
    expect(validarAplicacao(rascunho({ baixa: 101 }), HOJE)).toMatch(/tem só 100 U/)
  })
  it('região com dose precisa de nome', () => {
    expect(validarAplicacao(rascunho({ regioes: [reg({ regiao: ' ' })] }), HOJE)).toMatch(/nome à região/)
    expect(validarAplicacao(rascunho({ regioes: [reg({ regiao: '', unidades: null })] }), HOJE)).toBeNull()
  })
})

describe('erro do banco', () => {
  it('traduz os códigos da função', () => {
    expect(mensagemDoErro('lote_vencido')).toMatch(/vencido/)
    expect(mensagemDoErro('lote_insuficiente')).toMatch(/saldo/)
    expect(mensagemDoErro('estoque_insuficiente')).toMatch(/estoque/)
    expect(mensagemDoErro('ja_estornada')).toMatch(/estornada/)
    expect(mensagemDoErro('new row violates row-level security policy')).toMatch(/permissão/)
    expect(mensagemDoErro('qualquer coisa')).toMatch(/Tente de novo/)
    expect(mensagemDoErro(undefined)).toMatch(/Tente de novo/)
  })
})

describe('aplicação gravada', () => {
  const row = {
    id: 'a1', data: '2026-11-10', tipo: 'toxina', produto: 'Toxina X', fabricante: 'Lab', lote: 'A123', validade: '2027-06-30',
    dose: '20', dose_unidade: 'U', quantidade_baixa: 20, regioes: [{ id: 'r', regiao: 'Glabela', unidades: 20, x: 150, y: 82 }],
    observacoes: null, contract_id: null, lot_id: 'l1', profissional_nome: 'Dra. Ana', profissional_registro: '', estornada_em: null, estorno_motivo: null, created_at: '2026-11-10T14:00:00Z',
  }
  it('normaliza a linha', () => {
    const a = normalizarAplicacao(row)!
    expect(a.dose).toBe(20)
    expect(a.regioes).toHaveLength(1)
    expect(a.observacoes).toBe('')
    expect(a.contractId).toBeNull()
    expect(a.lotId).toBe('l1')
    expect(a.estornadaEm).toBeNull()
  })
  it('descarta linha quebrada', () => {
    expect(normalizarAplicacao({ ...row, id: '' })).toBeNull()
    expect(normalizarAplicacao({ ...row, data: 'ontem' })).toBeNull()
    expect(normalizarAplicacao({ ...row, dose: null })).toBeNull()
    expect(normalizarAplicacao(null)).toBeNull()
  })
  it('ordena a mais recente primeiro', () => {
    const a = normalizarAplicacao({ ...row, id: 'a', data: '2026-11-01' })!
    const b = normalizarAplicacao({ ...row, id: 'b', data: '2026-11-12' })!
    const c = normalizarAplicacao({ ...row, id: 'c', data: '2026-11-12', created_at: '2026-11-12T18:00:00Z' })!
    expect(ordenarAplicacoes([a, b, c]).map(x => x.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('termo de consentimento', () => {
  const t = (id: string, status: 'rascunho' | 'enviado' | 'assinado' | 'vencido' | 'cancelado', createdAt: string) => ({ id, title: `Termo ${id}`, status, createdAt })
  it('tira os cancelados e põe os assinados primeiro, o mais recente à frente', () => {
    const r = termosUteis([t('a', 'rascunho', '2026-11-01'), t('b', 'assinado', '2026-10-01'), t('c', 'cancelado', '2026-11-10'), t('d', 'assinado', '2026-11-05'), t('e', 'enviado', '2026-11-02')])
    expect(r.map(x => x.id)).toEqual(['d', 'b', 'e', 'a'])
  })
  it('rotula com a situação', () => {
    expect(rotuloTermo({ title: 'TCLE toxina', status: 'assinado' })).toBe('TCLE toxina (Assinado)')
  })
})
