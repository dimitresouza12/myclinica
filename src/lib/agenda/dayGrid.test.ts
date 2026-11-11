import { describe, expect, it } from 'vitest'
import { columnWidth, fitsWithoutScroll, gridTemplate, parseDensity, parseHidden, pickSingleId, prefKey, sanitizeHidden, serializeHidden } from './dayGrid'

describe('gridTemplate', () => {
  it('horas fixas e colunas que dividem o espaço com mínimo de 140px', () => {
    expect(gridTemplate(3)).toBe('56px repeat(3, minmax(140px, 1fr))')
  })
  it('nunca gera zero colunas', () => {
    expect(gridTemplate(0)).toBe('56px repeat(1, minmax(140px, 1fr))')
  })
})

describe('columnWidth e fitsWithoutScroll', () => {
  it('poucos profissionais: dividem o espaço todo', () => {
    expect(columnWidth(1056, 2)).toBe(500)
    expect(fitsWithoutScroll(1056, 2)).toBe(true)
  })
  it('muitos profissionais: trava em 140px e passa a rolar', () => {
    expect(columnWidth(1000, 12)).toBe(140)
    expect(fitsWithoutScroll(1000, 12)).toBe(false)
  })
  it('limite exato cabe sem rolar', () => {
    expect(fitsWithoutScroll(56 + 5 * 140, 5)).toBe(true)
    expect(fitsWithoutScroll(56 + 5 * 140 - 1, 5)).toBe(false)
  })
  it('uma coluna no celular ocupa o que sobra', () => {
    expect(columnWidth(375, 1)).toBe(319)
  })
})

describe('parseDensity', () => {
  it('aceita só compacta; o resto vira normal', () => {
    expect(parseDensity('compacta')).toBe('compacta')
    expect(parseDensity('normal')).toBe('normal')
    expect(parseDensity(null)).toBe('normal')
    expect(parseDensity('zoom')).toBe('normal')
  })
})

describe('pickSingleId', () => {
  it('mantém a escolhida enquanto existir', () => {
    expect(pickSingleId(['a', 'b'], 'b')).toBe('b')
  })
  it('cai na primeira se a escolhida sumiu ou não há escolha', () => {
    expect(pickSingleId(['a', 'b'], 'x')).toBe('a')
    expect(pickSingleId(['a', 'b'], null)).toBe('a')
  })
  it('sem colunas, nada', () => {
    expect(pickSingleId([], 'a')).toBeNull()
  })
  it('a coluna "sem profissional" ("") é escolha válida', () => {
    expect(pickSingleId(['a', ''], '')).toBe('')
  })
})

describe('sanitizeHidden', () => {
  it('descarta profissional que não existe mais e mantém o sem profissional', () => {
    expect([...sanitizeHidden(['a', 'velho', ''], ['a', 'b', 'c'])].sort()).toEqual(['', 'a'])
  })
  it('se tudo estiver oculto, volta a mostrar todos', () => {
    expect(sanitizeHidden(['a', 'b', ''], ['a', 'b']).size).toBe(0)
  })
  it('lixo no armazenamento vira filtro vazio', () => {
    expect(sanitizeHidden('a', ['a']).size).toBe(0)
    expect(sanitizeHidden([1, null, 'a'], ['a', 'b']).has('a')).toBe(true)
  })
})

describe('parseHidden e serializeHidden', () => {
  it('ida e volta', () => {
    const raw = serializeHidden(new Set(['b', 'a']))
    expect(raw).toBe('["a","b"]')
    expect([...parseHidden(raw, ['a', 'b', 'c'])]).toEqual(['a', 'b'])
  })
  it('JSON quebrado ou ausente não derruba', () => {
    expect(parseHidden('{', ['a']).size).toBe(0)
    expect(parseHidden(null, ['a']).size).toBe(0)
  })
})

describe('prefKey', () => {
  it('separa por usuário e por clínica', () => {
    expect(prefKey('density', 'u1', 'c1')).toBe('agenda.density:c1:u1')
    expect(prefKey('hidden', 'u1', 'c1')).not.toBe(prefKey('hidden', 'u2', 'c1'))
    expect(prefKey('hidden', null)).toBe('agenda.hidden:-:-')
  })
})
