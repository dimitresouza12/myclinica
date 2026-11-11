import { describe, it, expect } from 'vitest'
import { rehydrateMap, rehydrateValue } from './fichaRehydrate'

describe('rehydrateMap', () => {
  it('mantém o campo editado e atualiza o que não foi mexido', () => {
    const base = { a: 'x', b: 'y' }
    const next = { a: 'novo-a', b: 'novo-b' }
    const current = { a: 'x', b: 'digitado' }
    expect(rehydrateMap(base, next, current)).toEqual({ a: 'novo-a', b: 'digitado' })
  })
  it('sem edição, espelha o valor novo (inclusive chave removida)', () => {
    expect(rehydrateMap({ a: '1', b: '2' }, { a: '1' }, { a: '1', b: '2' })).toEqual({ a: '1' })
  })
  it('preserva campo criado pelo usuário que não existe no banco', () => {
    expect(rehydrateMap({}, {}, { extra: 'oi' })).toEqual({ extra: 'oi' })
  })
})

describe('rehydrateValue', () => {
  it('texto e listas: edita mantém, intacto atualiza', () => {
    expect(rehydrateValue('a', 'b', 'a')).toBe('b')
    expect(rehydrateValue('a', 'b', 'meu')).toBe('meu')
    expect(rehydrateValue([{ id: 1 }], [{ id: 2 }], [{ id: 1 }])).toEqual([{ id: 2 }])
    expect(rehydrateValue([{ id: 1 }], [{ id: 2 }], [{ id: 1 }, { id: 3 }])).toEqual([{ id: 1 }, { id: 3 }])
  })
})
