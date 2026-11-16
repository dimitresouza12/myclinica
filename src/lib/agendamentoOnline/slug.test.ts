import { describe, expect, it } from 'vitest'
import { isValidSlug, slugProblem, slugify } from './slug'

describe('slugify', () => {
  it('tira acento, baixa a caixa e usa hífen', () => {
    expect(slugify('Clínica Sorriso & Saúde')).toBe('clinica-sorriso-saude')
    expect(slugify('  Dr. João  Silva  ')).toBe('dr-joao-silva')
  })
  it('corta em 40 sem deixar hífen no fim', () => {
    const s = slugify('a'.repeat(39) + ' bbbbbb')
    expect(s.length).toBeLessThanOrEqual(40)
    expect(s.endsWith('-')).toBe(false)
  })
  it('texto sem letra nem número vira vazio', () => {
    expect(slugify('???')).toBe('')
  })
})

describe('isValidSlug / slugProblem', () => {
  it('aceita o formato da tabela', () => {
    expect(isValidSlug('clinica-sorriso')).toBe(true)
    expect(isValidSlug('abc')).toBe(true)
    expect(isValidSlug('a'.repeat(40))).toBe(true)
  })
  it('recusa curto, longo, maiúscula, acento, hífen nas pontas e caracteres soltos', () => {
    for (const bad of ['ab', 'a'.repeat(41), 'Clinica', 'clínica', '-abc', 'abc-', 'a b c', 'a/b/c', '../x', 'a_b_c', '']) {
      expect(isValidSlug(bad)).toBe(false)
    }
    expect(isValidSlug(null)).toBe(false)
    expect(isValidSlug(42)).toBe(false)
  })
  it('a mensagem concorda com a regra', () => {
    expect(slugProblem('')).toMatch(/Escolha/)
    expect(slugProblem('ab')).toMatch(/pelo menos 3/)
    expect(slugProblem('Abc')).toMatch(/minúsculas/)
    expect(slugProblem('-abc')).toMatch(/hífen/)
    expect(slugProblem('clinica-ok')).toBeNull()
    for (const s of ['clinica-ok', 'abc', 'x1y2']) expect(isValidSlug(s)).toBe(slugProblem(s) === null)
  })
})
