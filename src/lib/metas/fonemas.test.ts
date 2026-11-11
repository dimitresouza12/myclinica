import { describe, expect, it } from 'vitest'
import { alteracoes, cellKey, cycleCell, nextMarca, resumoFonemico, sanitizeCells, TODAS_CONSOANTES } from './fonemas'

describe('quadro', () => {
  it('tem 19 consoantes sem repetição', () => {
    expect(TODAS_CONSOANTES).toHaveLength(19)
    expect(new Set(TODAS_CONSOANTES.map(c => c.ipa)).size).toBe(19)
  })
})

describe('ciclo de marcação', () => {
  it('vazio, correto, substituído, omitido, distorcido e volta ao vazio', () => {
    let m = nextMarca(undefined)
    expect(m).toBe('c')
    m = nextMarca(m); expect(m).toBe('s')
    m = nextMarca(m); expect(m).toBe('o')
    m = nextMarca(m); expect(m).toBe('d')
    expect(nextMarca(m)).toBeUndefined()
  })
  it('não altera o mapa original e remove a chave ao zerar', () => {
    const a = {}
    const b = cycleCell(a, 'p', 'ini')
    expect(a).toEqual({})
    expect(b).toEqual({ 'p|ini': 'c' })
    let c = b
    for (let i = 0; i < 4; i++) c = cycleCell(c, 'p', 'ini')
    expect(c).toEqual({})
  })
})

describe('resumoFonemico', () => {
  it('sem marcação: PCC nulo', () => {
    expect(resumoFonemico({}).pcc).toBeNull()
  })
  it('calcula corretas sobre avaliadas', () => {
    const cells = {
      [cellKey('p', 'ini')]: 'c', [cellKey('b', 'ini')]: 'c', [cellKey('t', 'med')]: 's',
      [cellKey('ɾ', 'med')]: 'o', [cellKey('ʃ', 'fin')]: 'd', [cellKey('s', 'fin')]: 'c',
    } as const
    const r = resumoFonemico(cells)
    expect(r).toMatchObject({ avaliadas: 6, corretas: 3, omitidas: 1, substituidas: 1, distorcidas: 1, pcc: 50 })
  })
  it('filtra por posição', () => {
    const cells = { [cellKey('p', 'ini')]: 'c', [cellKey('b', 'ini')]: 'o', [cellKey('t', 'fin')]: 'c' } as const
    expect(resumoFonemico(cells, 'ini').pcc).toBe(50)
    expect(resumoFonemico(cells, 'fin').pcc).toBe(100)
    expect(resumoFonemico(cells, 'med').pcc).toBeNull()
  })
  it('arredonda a uma casa', () => {
    const cells = { [cellKey('p', 'ini')]: 'c', [cellKey('b', 'ini')]: 'c', [cellKey('t', 'ini')]: 'o' } as const
    expect(resumoFonemico(cells).pcc).toBe(66.7)
  })
})

describe('sanitizeCells', () => {
  it('descarta lixo vindo do banco', () => {
    expect(sanitizeCells({ 'p|ini': 'c', 'x|ini': 'c', 'p|zzz': 'c', 'b|med': 'q', 't|fin': 'o' })).toEqual({ 'p|ini': 'c', 't|fin': 'o' })
    expect(sanitizeCells(null)).toEqual({})
    expect(sanitizeCells('abc')).toEqual({})
  })
  it('lista só as alterações', () => {
    expect(alteracoes({ 'p|ini': 'c', 'b|med': 's' })).toEqual([{ ipa: 'b', pos: 'med', marca: 's' }])
  })
})
