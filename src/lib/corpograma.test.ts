import { describe, expect, it } from 'vitest'
import {
  bodyTotals, evaColor, evaLevel, formatBodyTotal, isMeaningfulSession, mergeUndoAnnotations, modesForSpecialties, painHistory, painSummary,
  painTrend, parseEva, sessionMode, type BodyAnnotation, type BodySession,
} from './corpograma'

const ann = (type: string, qty = '', eva?: number): BodyAnnotation => ({ id: Math.random().toString(), x: 1, y: 1, view: 'frente', type, qty, note: '', ...(eva !== undefined ? { eva } : {}) })
const sess = (id: string, date: string, annotations: BodyAnnotation[], mode?: 'dor'): BodySession => ({ id, date, notes: '', annotations, ...(mode ? { mode } : {}) })

describe('EVA', () => {
  it('lê número ou texto de 0 a 10 e rejeita o resto', () => {
    expect(parseEva(7)).toBe(7)
    expect(parseEva('3')).toBe(3)
    expect(parseEva('6,4')).toBe(6)
    expect(parseEva(0)).toBe(0)
    expect(parseEva(10)).toBe(10)
    expect(parseEva(11)).toBeUndefined()
    expect(parseEva(-1)).toBeUndefined()
    expect(parseEva('')).toBeUndefined()
    expect(parseEva(null)).toBeUndefined()
    expect(parseEva('abc')).toBeUndefined()
  })
  it('classifica a intensidade nas faixas da escala', () => {
    expect([0, 1, 3, 4, 6, 7, 10].map(evaLevel)).toEqual(['sem', 'leve', 'leve', 'moderada', 'moderada', 'intensa', 'intensa'])
  })
  it('tem uma cor por valor e cinza sem valor', () => {
    const cores = Array.from({ length: 11 }, (_, i) => evaColor(i))
    expect(new Set(cores).size).toBe(11)
    expect(evaColor(undefined)).toBe('#6B7280')
    expect(evaColor(99)).toBe(evaColor(10))
  })
})

describe('modo da sessão e retrocompatibilidade', () => {
  it('sessão antiga, sem mode, é de tratamento', () => {
    expect(sessionMode({})).toBe('tratamento')
    expect(sessionMode({ mode: 'dor' })).toBe('dor')
  })
  it('sessão em branco não conta como alteração', () => {
    expect(isMeaningfulSession(sess('a', '2026-01-01', []))).toBe(false)
    expect(isMeaningfulSession({ ...sess('a', '2026-01-01', []), notes: ' ' })).toBe(false)
    expect(isMeaningfulSession({ ...sess('a', '2026-01-01', []), notes: 'dor' })).toBe(true)
    expect(isMeaningfulSession(sess('a', '2026-01-01', [ann('dor_aguda')]))).toBe(true)
  })
  it('escolhe os modos pela especialidade da clínica', () => {
    expect(modesForSpecialties(['estetica'])).toEqual(['tratamento'])
    expect(modesForSpecialties(['fisio'])).toEqual(['dor'])
    expect(modesForSpecialties(['estetica', 'fisio'])).toEqual(['tratamento', 'dor'])
    expect(modesForSpecialties(['odonto'])).toEqual(['tratamento'])
    expect(modesForSpecialties([])).toEqual(['tratamento', 'dor'])
    expect(modesForSpecialties(null)).toEqual(['tratamento', 'dor'])
  })
})

describe('soma do tratamento', () => {
  it('soma por tipo e unidade, junta sessão/sessões e conta os pontos sem número', () => {
    const { totals, semDose } = bodyTotals([
      ann('criolipolise', '10 sessões'), ann('criolipolise', '2 sessoes'), ann('criolipolise', '1 sessão'),
      ann('drenagem', '4'), ann('drenagem', '1'), ann('massagem', 'nível 3'), ann('radiofrequencia', ''),
      ann('radiofrequencia', '2 sessões'),
    ])
    expect(totals.map(t => `${t.tool}:${formatBodyTotal(t)}:${t.points}`)).toEqual([
      'criolipolise:13 sessões:3', 'radiofrequencia:2 sessões:1', 'drenagem:5:2',
    ])
    expect(semDose).toBe(2)
  })
  it('soma ampola e ampolas juntas e singulariza só na exibição', () => {
    const { totals } = bodyTotals([ann('carboxiterapia', '1 ampola'), ann('carboxiterapia', '2 ampolas'), ann('carboxiterapia', '1A')])
    expect(totals).toHaveLength(1)
    expect(totals[0]).toMatchObject({ unit: 'ampolas', total: 4, points: 3 })
    expect(formatBodyTotal(totals[0])).toBe('4 ampolas')
    expect(formatBodyTotal(bodyTotals([ann('carboxiterapia', '1 ampola')]).totals[0])).toBe('1 ampola')
  })
  it('singular quando o total é 1 e vírgula nos decimais', () => {
    expect(formatBodyTotal({ tool: 'x', unit: 'sessões', total: 1, points: 1 })).toBe('1 sessão')
    expect(formatBodyTotal({ tool: 'x', unit: 'ml', total: 0.5, points: 1 })).toBe('0,5 ml')
  })
  it('sem pontos, sem totais', () => {
    expect(bodyTotals([])).toEqual({ totals: [], semDose: 0 })
  })
})

describe('resumo e histórico da dor', () => {
  it('resume máxima, média e pontos sem EVA da sessão', () => {
    expect(painSummary([ann('dor_aguda', '', 8), ann('ponto_gatilho', '', 5), ann('dor_irradiada')])).toEqual({ points: 3, withEva: 2, max: 8, mean: 6.5, semEva: 1 })
    expect(painSummary([])).toEqual({ points: 0, withEva: 0, max: null, mean: null, semEva: 0 })
    expect(painSummary([ann('dor_aguda', '', 0)]).max).toBe(0)
  })
  it('histórico por data só com sessões de dor que têm EVA, em ordem cronológica', () => {
    const h = painHistory([
      sess('c', '2026-03-10', [ann('dor_aguda', '', 3), ann('ponto_gatilho', '', 2)], 'dor'),
      sess('a', '2026-01-05', [ann('dor_aguda', '', 8), ann('dor_irradiada', '', 6)], 'dor'),
      sess('t', '2026-02-01', [ann('criolipolise', '10 sessões')]),
      sess('v', '2026-02-02', [ann('dor_aguda')], 'dor'),
      sess('b', '2026-02-10', [ann('dor_aguda', '', 5)], 'dor'),
    ])
    expect(h.map(p => [p.id, p.max, p.mean])).toEqual([['a', 8, 7], ['b', 5, 5], ['c', 3, 2.5]])
  })
  it('mostra a tendência entre a primeira e a última', () => {
    const h = painHistory([sess('a', '2026-01-05', [ann('dor_aguda', '', 8)], 'dor'), sess('c', '2026-03-10', [ann('dor_aguda', '', 2)], 'dor')])
    expect(painTrend(h)).toEqual({ from: 8, to: 2, delta: -6, direction: 'melhora' })
    expect(painTrend(h.slice(0, 1))).toBeNull()
    expect(painTrend([{ ...h[0], max: 3 }, { ...h[1], max: 3 }])?.direction).toBe('estavel')
    expect(painTrend([{ ...h[0], max: 2 }, { ...h[1], max: 7 }])?.direction).toBe('piora')
  })
})

describe('mergeUndoAnnotations', () => {
  const a = (id: string, extra: Partial<BodyAnnotation> = {}): BodyAnnotation => ({ id, x: 1, y: 1, view: 'frente', type: 'dor', qty: '', note: '', ...extra })
  it('desfaz o EVA mas preserva a nota e a quantidade digitadas depois', () => {
    const snap = [a('1')]
    const now = [a('1', { eva: 7, note: 'irradia para a perna', qty: '3 sessões' })]
    expect(mergeUndoAnnotations(snap, now)).toEqual([a('1', { note: 'irradia para a perna', qty: '3 sessões' })])
  })
  it('restaura um ponto removido como estava no instantâneo', () => {
    const snap = [a('1', { note: 'antiga' }), a('2', { eva: 4 })]
    expect(mergeUndoAnnotations(snap, [a('1', { note: 'nova' })])).toEqual([a('1', { note: 'nova' }), a('2', { eva: 4 })])
  })
  it('descarta o ponto criado depois do instantâneo', () => {
    expect(mergeUndoAnnotations([a('1')], [a('1'), a('2')])).toEqual([a('1')])
  })
})
