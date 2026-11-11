import { describe, expect, it } from 'vitest'
import {
  COL_STEPS, FACE_BUTTONS, clampStep, columnWidths, defaultStep, loadStoredStep, parseStoredStep, saveStoredStep, shouldOpenFacePicker, sizeStorageKey,
} from './odontogramaView'
import { FACE_KEYS } from './odontograma'

function memoryStorage() {
  const data: Record<string, string> = {}
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v } }
}

describe('tamanho do tabuleiro', () => {
  it('o passo escolhido é a largura e o teto da coluna', () => {
    for (let i = 0; i < COL_STEPS.length; i++) {
      const { minCol, maxCol } = columnWidths(i)
      expect(minCol).toBe(COL_STEPS[i])
      expect(maxCol).toBe(minCol)
    }
  })
  it('na dentição mista a de leite é menor que a permanente', () => {
    const perm = columnWidths(1)
    const deci = columnWidths(1, true)
    expect(deci.maxCol).toBeLessThan(perm.maxCol)
    expect(deci.minCol).toBe(deci.maxCol)
  })
  it('passo fora da faixa é limitado', () => {
    expect(clampStep(-3)).toBe(0)
    expect(clampStep(99)).toBe(COL_STEPS.length - 1)
    expect(columnWidths(99).maxCol).toBe(COL_STEPS[COL_STEPS.length - 1])
  })
  it('o padrão em tela pequena é maior que no desktop (rola para os lados)', () => {
    expect(COL_STEPS[defaultStep(true)]).toBeGreaterThan(COL_STEPS[defaultStep(false)])
  })
  it('o teto padrão do desktop mantém os 16 dentes compactos', () => {
    expect(16 * columnWidths(defaultStep(false)).maxCol).toBeLessThanOrEqual(900)
  })
})

describe('preferência por usuário', () => {
  it('lê só passos válidos', () => {
    expect(parseStoredStep('2')).toBe(2)
    expect(parseStoredStep('0')).toBe(0)
    for (const bad of ['5', '-1', 'x', '', '1.5', null, undefined]) expect(parseStoredStep(bad as string | null)).toBeNull()
  })
  it('guarda por usuário e devolve o que guardou', () => {
    const s = memoryStorage()
    saveStoredStep('u1', 3, s)
    expect(s.data[sizeStorageKey('u1')]).toBe('3')
    expect(loadStoredStep('u1', s)).toBe(3)
    expect(loadStoredStep('u2', s)).toBeNull()
  })
  it('não lança com storage bloqueado', () => {
    const broken = { getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('cheio') } }
    expect(() => saveStoredStep('u1', 2, broken)).not.toThrow()
    expect(loadStoredStep('u1', broken)).toBeNull()
    expect(loadStoredStep('u1', null)).toBeNull()
  })
})

describe('vista ampliada de faces', () => {
  it('abre em qualquer aparelho de toque, pequeno ou grande, quando a ferramenta age numa face', () => {
    expect(shouldOpenFacePicker({ coarse: true, toolMode: 'face', zoneKind: 'face' })).toBe(true)
    expect(shouldOpenFacePicker({ coarse: true, toolMode: 'limpar', zoneKind: 'face' })).toBe(true)
  })
  it('com mouse não abre', () => {
    expect(shouldOpenFacePicker({ coarse: false, toolMode: 'face', zoneKind: 'face' })).toBe(false)
  })
  it('dente inteiro, canal, pino, aparelho e seleção continuam com um toque', () => {
    for (const toolMode of ['whole', 'canal', 'pino', 'aparelho', 'select']) {
      expect(shouldOpenFacePicker({ coarse: true, toolMode, zoneKind: 'face' })).toBe(false)
    }
  })
  it('coroa e raiz não abrem a vista de faces', () => {
    expect(shouldOpenFacePicker({ coarse: true, toolMode: 'face', zoneKind: 'crown' })).toBe(false)
    expect(shouldOpenFacePicker({ coarse: true, toolMode: 'limpar', zoneKind: 'root' })).toBe(false)
  })
  it('os botões cobrem as cinco faces, na ordem V L M D O', () => {
    expect(FACE_BUTTONS.map(b => b.letter).join('')).toBe('VLMDO')
    expect([...FACE_BUTTONS.map(b => b.face)].sort()).toEqual([...FACE_KEYS].sort())
  })
})
