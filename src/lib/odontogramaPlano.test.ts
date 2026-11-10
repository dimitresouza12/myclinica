import { describe, expect, it } from 'vitest'
import { budgetDescription, plannedMarks, suggestProcedure, toothMarks, type PlanTooth } from './odontograma'

const base = (): PlanTooth => ({ status: 'higido', surfaces: { v: 'higido', l: 'higido', m: 'higido', d: 'higido', o: 'higido' } })

describe('marcações do plano', () => {
  it('separa existente de a realizar, no dente e nas faces', () => {
    const t = { ...base(), status: 'cariado', surfaces: { ...base().surfaces, o: 'restaurado' }, planned: { o: true } as PlanTooth['planned'] }
    expect(toothMarks(21, t)).toEqual([
      { tooth: 21, key: 'all', status: 'cariado', planned: false },
      { tooth: 21, key: 'o', status: 'restaurado', planned: true },
    ])
    expect(plannedMarks({ 21: t })).toHaveLength(1)
  })
  it('ignora flag de a realizar em marcação hígida', () => {
    expect(toothMarks(11, { ...base(), planned: { all: true } })).toEqual([])
  })
  it('descreve o item do orçamento', () => {
    expect(budgetDescription({ tooth: 21, key: 'all', status: 'coroa', planned: true })).toBe('Coroa no dente 21')
    expect(budgetDescription({ tooth: 16, key: 'o', status: 'restaurado', planned: true })).toBe('Restauração no dente 16 (face oclusal)')
  })
  it('sugere o procedimento do cadastro pelo nome, sem acento e só ativos', () => {
    const procs = [{ name: 'Limpeza', is_active: true }, { name: 'Prótese total', is_active: false }, { name: 'Protese parcial', is_active: true }, { name: 'Restauração resina', is_active: true }]
    expect(suggestProcedure('restaurado', procs)?.name).toBe('Restauração resina')
    expect(suggestProcedure('protese', procs)?.name).toBe('Protese parcial')
    expect(suggestProcedure('selante', procs)).toBeNull()
  })
})
