import { describe, expect, it } from 'vitest'
import { ALL_DECIDUOUS, ALL_TEETH, UPPER, LOWER } from './odontograma'
import {
  TOOTH_KINDS, bracketWires, faceLabel, frontScale, isAnterior, isFlippedY, isMirroredX, kindScale, mainRoot, mapPoint,
  mesialSide, occlusalScale, rootCount, rootName, scalePath, toothKind,
} from './odontogramaGeometry'
import { FRONT, OCCLUSAL, centerPath, shapeRootCount, wedgePaths } from '@/components/prontuario/odontograma/shapes'

describe('grupo anatômico de cada dente', () => {
  it('permanentes: incisivos, canino, pré-molares e molares pelo último dígito', () => {
    expect(ALL_TEETH.filter(n => n % 10 === 1).every(n => toothKind(n) === 'ci')).toBe(true)
    expect(toothKind(13)).toBe('ca')
    expect(toothKind(24)).toBe('pm1')
    expect(toothKind(35)).toBe('pm2')
    expect(toothKind(46)).toBe('mo1')
    expect(toothKind(17)).toBe('mo2')
    expect(toothKind(38)).toBe('mo3')
  })
  it('decíduos: sem pré-molares, 4 e 5 são molares decíduos', () => {
    expect(toothKind(51)).toBe('dci')
    expect(toothKind(63)).toBe('dca')
    expect(toothKind(74)).toBe('dmo1')
    expect(toothKind(85)).toBe('dmo2')
    expect(ALL_DECIDUOUS.some(n => ['pm1', 'pm2'].includes(toothKind(n)))).toBe(false)
  })
  it('dentes da frente são anteriores (face incisal)', () => {
    expect(isAnterior(11)).toBe(true)
    expect(isAnterior(53)).toBe(true)
    expect(isAnterior(14)).toBe(false)
    expect(faceLabel(11, 'o')).toBe('Incisal')
    expect(faceLabel(36, 'o')).toBe('Oclusal')
    expect(faceLabel(14, 'l')).toBe('Palatina')
    expect(faceLabel(34, 'l')).toBe('Lingual')
  })
})

describe('raízes', () => {
  it('molar superior tem 3 raízes e o inferior 2; pré-molar 1 superior tem 2', () => {
    expect(rootCount('mo1', true)).toBe(3)
    expect(rootCount('mo1', false)).toBe(2)
    expect(rootCount('mo3', true)).toBe(3)
    expect(rootCount('dmo2', false)).toBe(2)
    expect(rootCount('pm1', true)).toBe(2)
    expect(rootCount('pm1', false)).toBe(1)
    expect(rootCount('ci', true)).toBe(1)
    expect(rootCount('ca', false)).toBe(1)
  })
  it('o desenho de cada grupo tem exatamente o número de raízes da lógica', () => {
    for (const k of TOOTH_KINDS) for (const upper of [true, false]) expect(shapeRootCount(k, upper)).toBe(rootCount(k, upper))
  })
  it('a raiz do pino existe no desenho', () => {
    for (const k of TOOTH_KINDS) for (const upper of [true, false]) expect(mainRoot(k, upper)).toBeLessThan(rootCount(k, upper))
  })
  it('nomeia as raízes', () => {
    expect(rootName('mo1', true, 1)).toBe('Palatina')
    expect(rootName('mo1', false, 0)).toBe('Distal')
    expect(rootName('ci', true, 0)).toBe('Única')
  })
})

describe('espelhamento dos quadrantes', () => {
  it('quadrantes da direita da tela (2, 3, 6, 7) são espelhados na horizontal; a arcada de baixo na vertical', () => {
    expect([11, 41, 51, 81].some(isMirroredX)).toBe(false)
    expect([21, 31, 61, 71].every(isMirroredX)).toBe(true)
    expect([11, 21, 51, 61].some(isFlippedY)).toBe(false)
    expect([41, 31, 81, 71].every(isFlippedY)).toBe(true)
  })
  it('o mesial sempre aponta para a linha média', () => {
    expect(mesialSide(11)).toBe('right')
    expect(mesialSide(21)).toBe('left')
    expect(mesialSide(41)).toBe('right')
    expect(mesialSide(31)).toBe('left')
  })
  it('11 e 21 ficam simétricos em torno da linha média (x = 448 numa arcada de 16 colunas)', () => {
    const mid = 8 * 56
    const mesialEdge = FRONT.ci.crown.match(/L 40,0\.6 C 44,0\.6 46\.6,2\.4 46,6/) ? 46 : 46
    const p11 = mapPoint(mesialEdge, 6, frontScale(11), { x: 7 * 56 + 28, y: 0 })
    const p21 = mapPoint(mesialEdge, 6, frontScale(21), { x: 8 * 56 + 28, y: 0 })
    expect(mid - p11.x).toBeCloseTo(p21.x - mid, 6)
    expect(p11.y).toBe(p21.y)
  })
  it('arcada de baixo é o espelho vertical da de cima, com a mesma escala horizontal', () => {
    const up = frontScale(11), lo = frontScale(41)
    expect(up.sx).toBe(1)
    expect(up.sy).toBeLessThan(0)
    expect(lo.sy).toBeGreaterThan(0)
    expect(frontScale(36).sx).toBeLessThan(0)
    expect(occlusalScale(11).sy).toBeGreaterThan(0)
    expect(occlusalScale(41).sy).toBeLessThan(0)
    expect(Math.abs(occlusalScale(41).sx)).toBe(Math.abs(occlusalScale(41).sy))
  })
  it('quadrantes simétricos têm a mesma escala', () => {
    for (let p = 1; p <= 8; p++) {
      expect(kindScale(10 + p)).toEqual(kindScale(20 + p))
      expect(kindScale(40 + p)).toEqual(kindScale(30 + p))
    }
    for (let p = 1; p <= 5; p++) expect(kindScale(50 + p)).toEqual(kindScale(60 + p))
  })
})

describe('contornos das faces oclusais', () => {
  const nums = (d: string) => (d.match(/-?\d*\.?\d+/g) ?? []).map(Number)
  it('a zona central fica toda dentro da caixa do contorno e é menor que ele', () => {
    for (const k of TOOTH_KINDS) {
      const { box: [x0, y0, x1, y1] } = OCCLUSAL[k]
      const c = nums(centerPath(k))
      for (let i = 0; i < c.length; i += 2) {
        expect(c[i]).toBeGreaterThan(x0); expect(c[i]).toBeLessThan(x1)
        expect(c[i + 1]).toBeGreaterThan(y0); expect(c[i + 1]).toBeLessThan(y1)
      }
    }
  })
  it('scalePath escala os pontos em torno do centro e mantém os comandos', () => {
    expect(scalePath('M 10,10 L 30,10 L 30,30 Z', 20, 20, 0.5)).toBe('M 15 15 L 25 15 L 25 25 Z')
  })
  it('cada grupo tem quatro triângulos (vestibular, lingual, mesial, distal) que partem do centro', () => {
    for (const k of TOOTH_KINDS) {
      const w = wedgePaths(k)
      expect(Object.keys(w).sort()).toEqual(['d', 'l', 'm', 'v'])
      const [cx, cy] = OCCLUSAL[k].center
      for (const d of Object.values(w)) expect(d.startsWith(`M ${cx},${cy} L`)).toBe(true)
    }
  })
  it('vestibular fica acima do centro e lingual abaixo; mesial à direita e distal à esquerda', () => {
    const [cx, cy] = OCCLUSAL.mo1.center
    const mean = (d: string) => { const n = nums(d); const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1); return { x: xs.reduce((a, b) => a + b) / xs.length, y: ys.reduce((a, b) => a + b) / ys.length } }
    const w = wedgePaths('mo1')
    expect(mean(w.v).y).toBeLessThan(cy)
    expect(mean(w.l).y).toBeGreaterThan(cy)
    expect(mean(w.m).x).toBeGreaterThan(cx)
    expect(mean(w.d).x).toBeLessThan(cx)
  })
})

describe('fio ortodôntico', () => {
  const has = (...ns: number[]) => (n: number) => ns.includes(n)
  it('liga só dentes vizinhos que têm braquete', () => {
    expect(bracketWires(UPPER, has(13, 12, 11, 21, 22))).toEqual([[13, 12], [12, 11], [11, 21], [21, 22]])
  })
  it('um dente presente sem braquete interrompe o fio', () => {
    expect(bracketWires(LOWER, has(43, 42, 41, 32, 33))).toEqual([[43, 42], [42, 41], [32, 33]])
  })
  it('dente isolado não gera fio', () => {
    expect(bracketWires(UPPER, has(14))).toEqual([])
    expect(bracketWires(UPPER, has())).toEqual([])
  })
  it('o fio passa por cima do dente ausente', () => {
    expect(bracketWires(UPPER, has(13, 11), n => n === 12)).toEqual([[13, 11]])
    expect(bracketWires(UPPER, has(13, 11))).toEqual([])
  })
})
