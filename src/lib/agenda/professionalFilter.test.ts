import { describe, expect, it } from 'vitest'
import { allHiddenIds, appointmentsLabel, countLabel, filterByName, noneSelected, normalizeSearch, shownCount } from './professionalFilter'

const pros = [
  { id: 'a', name: 'Dra. Ana Beatriz Souza' },
  { id: 'b', name: 'Dr. José Carlos Lima' },
  { id: 'c', name: 'Dra. Marina Ângelo' },
  { id: '', name: 'Sem profissional' },
]

describe('normalizeSearch', () => {
  it('tira acento, caixa e espaços nas pontas', () => {
    expect(normalizeSearch('  JOSÉ ')).toBe('jose')
    expect(normalizeSearch('Ângelo')).toBe('angelo')
  })
})

describe('filterByName', () => {
  it('busca vazia devolve todos', () => {
    expect(filterByName(pros, '')).toHaveLength(4)
    expect(filterByName(pros, '   ')).toHaveLength(4)
  })
  it('ignora acento e caixa', () => {
    expect(filterByName(pros, 'jose').map(p => p.id)).toEqual(['b'])
    expect(filterByName(pros, 'ANGELO').map(p => p.id)).toEqual(['c'])
  })
  it('exige todas as palavras, em qualquer ordem', () => {
    expect(filterByName(pros, 'carlos jose').map(p => p.id)).toEqual(['b'])
    expect(filterByName(pros, 'ana lima')).toEqual([])
  })
  it('acha o item sem profissional', () => {
    expect(filterByName(pros, 'sem prof').map(p => p.id)).toEqual([''])
  })
})

describe('shownCount', () => {
  it('conta só os que não estão ocultos', () => {
    expect(shownCount(pros, new Set())).toBe(4)
    expect(shownCount(pros, new Set(['a', '']))).toBe(2)
  })
})

describe('countLabel', () => {
  it('formata "x de y"', () => {
    expect(countLabel(21, 21)).toBe('21 de 21')
    expect(countLabel(3, 21)).toBe('3 de 21')
    expect(countLabel(0, 21)).toBe('0 de 21')
  })
})

describe('appointmentsLabel', () => {
  it('trata zero, singular e plural', () => {
    expect(appointmentsLabel(0)).toBe('Sem consultas')
    expect(appointmentsLabel(1)).toBe('1 consulta')
    expect(appointmentsLabel(7)).toBe('7 consultas')
  })
})

describe('allHiddenIds', () => {
  it('oculta todos os profissionais e o "sem profissional"', () => {
    const hidden = allHiddenIds(pros)
    expect([...hidden].sort()).toEqual(['', 'a', 'b', 'c'])
    expect(shownCount(pros, hidden)).toBe(0)
    expect(countLabel(shownCount(pros, hidden), pros.length)).toBe('0 de 4')
  })
})

describe('noneSelected', () => {
  it('só é verdade quando todos estão ocultos', () => {
    expect(noneSelected(pros, allHiddenIds(pros))).toBe(true)
    expect(noneSelected(pros, new Set(['a', 'b', 'c']))).toBe(false)
    expect(noneSelected(pros, new Set())).toBe(false)
  })
  it('um profissional só não tem filtro', () => {
    expect(noneSelected([{ id: 'a' }], new Set(['a']))).toBe(false)
    expect(noneSelected([], new Set())).toBe(false)
  })
})
