import { describe, expect, it } from 'vitest'
import { avaliacaoTemConteudo, avaliacaoVazia, errosBloqueantes, normalizarAvaliacao, resumirAvaliacao, seriesDeEvolucao, variacao } from './avaliacao'

const ctx = { nascimento: '1996-03-10', data: '2026-06-01' } // 30 anos

describe('resumo da avaliação', () => {
  it('calcula IMC, RCQ, TMB, GET e macros de uma avaliação completa', () => {
    const d = { ...avaliacaoVazia('M'), peso: '80', altura: '180', cintura: '90', quadril: '100', fonteComposicao: 'manual' as const, pctGorduraManual: '20', equacaoTmb: 'mifflin' as const, fatorAtividade: '1.55', proteinaGkg: '2', lipidioGkg: '1' }
    const r = resumirAvaliacao(d, ctx)
    expect(r.idade).toBe(30)
    expect(r.imc).toBeCloseTo(24.69, 2)
    expect(r.imcClasse?.id).toBe('eutrofia')
    expect(r.rcq).toBeCloseTo(0.9, 5)
    expect(r.massaGordaKg).toBe(16)
    expect(r.massaMagraKg).toBe(64)
    expect(r.tmb).toBeCloseTo(1780, 5)
    expect(r.get).toBeCloseTo(2759, 5)
    expect(r.metaKcal).toBe(2759)
    expect(r.macros?.proteinaG).toBe(160)
    expect(Object.keys(r.erros)).toEqual([])
  })
  it('ajuste calórico entra na meta e nunca deixa negativa', () => {
    const d = { ...avaliacaoVazia('M'), peso: '80', altura: '180', equacaoTmb: 'mifflin' as const, fatorAtividade: '1.55', ajusteKcal: '-500' }
    expect(resumirAvaliacao(d, ctx).metaKcal).toBe(2259)
  })
  it('% de gordura pelas dobras (Pollock 3 + Siri) e massa magra para o Cunningham', () => {
    const d = { ...avaliacaoVazia('M'), peso: '80', altura: '180', dobras: { peitoral: '10', abdominal: '20', coxa: '15' }, equacaoTmb: 'cunningham' as const }
    const r = resumirAvaliacao(d, ctx)
    expect(r.pctGordura).toBeCloseTo(13.6, 1)
    expect(r.somatorioDobras).toBe(45)
    expect(r.massaMagraKg).toBeCloseTo(80 * (1 - r.pctGordura! / 100), 1)
    expect(r.tmb).toBeCloseTo(500 + 22 * r.massaMagraKg!, 1)
  })
  it('informa as dobras que faltam e não calcula com dado incompleto', () => {
    const d = { ...avaliacaoVazia('M'), peso: '80', dobras: { peitoral: '10' } }
    const r = resumirAvaliacao(d, ctx)
    expect(r.pctGordura).toBeNull()
    expect(r.faltamDobras).toEqual(['Abdominal', 'Coxa'])
  })
  it('sem sexo, pede o sexo e não calcula TMB', () => {
    const d = { ...avaliacaoVazia(null), peso: '80', altura: '180', dobras: { peitoral: '10' } }
    const r = resumirAvaliacao(d, ctx)
    expect(r.faltamDobras).toEqual(['Sexo'])
    expect(r.tmb).toBeNull()
  })
  it('valor fora da faixa gera erro e fica fora dos cálculos', () => {
    const d = { ...avaliacaoVazia('M'), peso: '720', altura: '180', dobras: { peitoral: '500' } }
    const r = resumirAvaliacao(d, ctx)
    expect(r.erros.peso).toMatch(/fora do esperado/)
    expect(r.erros['dobra:peitoral']).toMatch(/fora do esperado/)
    expect(r.pesoKg).toBeNull()
    expect(r.imc).toBeNull()
  })
  it('usa a idade digitada quando não há nascimento', () => {
    const d = { ...avaliacaoVazia('F'), idadeManual: '40', peso: '60', altura: '165', equacaoTmb: 'fao_oms' as const }
    const r = resumirAvaliacao(d, { nascimento: null, data: '2026-06-01' })
    expect(r.idade).toBe(40)
    expect(r.tmb).toBeCloseTo(1351, 5)
  })
  it('massa gorda informada vira % de gordura', () => {
    const d = { ...avaliacaoVazia('F'), peso: '60', fonteComposicao: 'manual' as const, massaGordaManual: '15' }
    expect(resumirAvaliacao(d, ctx).pctGordura).toBe(25)
  })
})

describe('registro e evolução', () => {
  it('um registro em branco não conta como conteúdo', () => {
    expect(avaliacaoTemConteudo(avaliacaoVazia('M'))).toBe(false)
    expect(avaliacaoTemConteudo({ ...avaliacaoVazia('M'), peso: '80' })).toBe(true)
  })
  it('normaliza JSON antigo ou quebrado', () => {
    const n = normalizarAvaliacao({ peso: 72.5, protocolo: 'xyz', equacaoTmb: 'foo', dobras: { triceps: 12, coxa: '' } })
    expect(n.peso).toBe('72.5')
    expect(n.protocolo).toBe('pollock3')
    expect(n.equacaoTmb).toBe('mifflin')
    expect(n.dobras).toEqual({ triceps: '12' })
    expect(normalizarAvaliacao(null).v).toBe(1)
  })
  it('monta as séries em ordem de data, uma avaliação por ponto, sem sobrescrever', () => {
    const mk = (id: string, data: string, peso: string, cintura: string, pct: string) => ({
      id, data, dados: { ...avaliacaoVazia('F'), peso, cintura, fonteComposicao: 'manual' as const, pctGorduraManual: pct },
    })
    const s = seriesDeEvolucao([mk('b', '2026-05-01', '70', '82', '30'), mk('a', '2026-04-01', '75', '88', '33'), mk('c', '2026-06-01', '68', '80', '28')], null)
    expect(s.peso.map(p => p.data)).toEqual(['2026-04-01', '2026-05-01', '2026-06-01'])
    expect(s.peso.map(p => p.valor)).toEqual([75, 70, 68])
    expect(s.cintura.map(p => p.valor)).toEqual([88, 82, 80])
    expect(s.massaGorda.map(p => p.valor)).toEqual([24.8, 21, 19])
    expect(s.massaMagra[2].valor).toBe(49)
    expect(variacao(s.peso)).toBe(-7)
    expect(variacao([s.peso[0]])).toBeNull()
  })
})

describe('erros que bloqueiam o salvamento', () => {
  it('conta só erros de campos visíveis', () => {
    const d = { ...avaliacaoVazia('F'), peso: '720', dobras: { triceps: '900' } }
    const r = resumirAvaliacao(d, ctx)
    expect(errosBloqueantes(r.erros, d, true)).toEqual(expect.arrayContaining(['peso', 'dobra:triceps']))
    // fonte manual: dobra inválida está oculta e não bloqueia
    const m = { ...d, fonteComposicao: 'manual' as const }
    expect(errosBloqueantes(resumirAvaliacao(m, ctx).erros, m, true)).toEqual(['peso'])
  })
  it('idade digitada inválida só bloqueia sem data de nascimento', () => {
    const d = { ...avaliacaoVazia('F'), peso: '70', idadeManual: '500' }
    const erros = resumirAvaliacao(d, { nascimento: null, data: '2026-06-01' }).erros
    expect(errosBloqueantes(erros, d, false)).toEqual(['idadeManual'])
    expect(errosBloqueantes(erros, d, true)).toEqual([])
  })
  it('avaliação válida não tem erro bloqueante', () => {
    const d = { ...avaliacaoVazia('M'), peso: '80', altura: '180' }
    expect(errosBloqueantes(resumirAvaliacao(d, ctx).erros, d, true)).toEqual([])
  })
})
