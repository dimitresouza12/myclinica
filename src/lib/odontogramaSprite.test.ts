import { describe, expect, it } from 'vitest'
import { ALL_DECIDUOUS, ALL_TEETH, isUpperTooth } from './odontograma'
import { TOOTH_KINDS, kindScale, rootCount, toothKind } from './odontogramaGeometry'
import { FRONT_TILES, OCC_TILES, SPRITE, TILE_IDS, cervixOffset, frontView, occTileOf, occView, tileOf } from '@/components/prontuario/odontograma/shapes'

describe('sprite fotográfica dos dentes', () => {
  it('é uma grade 5 x 2 e cada coluna tem as duas vistas (frontal e oclusal)', () => {
    expect(SPRITE.cols).toBe(5)
    expect(SPRITE.rows).toBe(2)
    expect(TILE_IDS).toEqual(['ci', 'ca', 'pm', 'moU', 'moL'])
    TILE_IDS.forEach((id, c) => {
      expect(FRONT_TILES[id].col).toBe(c)
      expect(OCC_TILES[id].col).toBe(c)
    })
  })
  it('liga cada dente ao recorte certo: incisivos, canino, pré-molares e molar superior ou inferior', () => {
    expect(tileOf(toothKind(11), true)).toBe('ci')
    expect(tileOf(toothKind(12), true)).toBe('ci')
    expect(tileOf(toothKind(33), false)).toBe('ca')
    expect(tileOf(toothKind(14), true)).toBe('pm')
    expect(tileOf(toothKind(45), false)).toBe('pm')
    expect(tileOf(toothKind(16), true)).toBe('moU')
    expect(tileOf(toothKind(38), false)).toBe('moL')
    expect(tileOf(toothKind(85), false)).toBe('moL')
    expect(tileOf(toothKind(55), true)).toBe('moU')
  })
  it('a vista frontal tem as raízes que a lógica espera em cada dente e arcada', () => {
    for (const k of TOOTH_KINDS) for (const upper of [true, false]) expect(frontView(k, upper).roots.length).toBe(rootCount(k, upper))
  })
  it('o canal e o pino de cada raiz existem no desenho', () => {
    for (const k of TOOTH_KINDS) for (const upper of [true, false]) {
      for (const r of frontView(k, upper).roots) {
        expect(r.d.startsWith('M ')).toBe(true)
        expect(r.canal.startsWith('M ')).toBe(true)
        expect(r.pin).toHaveLength(4)
        expect(r.pin[3]).toBeGreaterThan(r.pin[1])
      }
    }
  })
  it('a vista oclusal é a do mesmo recorte e o centro cai dentro do contorno', () => {
    for (const k of TOOTH_KINDS) for (const upper of [true, false]) {
      const o = occView(k, upper), [x0, y0, x1, y1] = o.box
      expect(o.id).toBe(occTileOf(k, upper))
      expect(o.center[0]).toBeGreaterThan(x0); expect(o.center[0]).toBeLessThan(x1)
      expect(o.center[1]).toBeGreaterThan(y0); expect(o.center[1]).toBeLessThan(y1)
    }
  })
  it('a coroa está acima do colo e dentro da célula de 56 de largura', () => {
    for (const id of TILE_IDS) {
      const { crownBox: [x0, y0, x1, y1], crownH } = FRONT_TILES[id]
      expect(x0).toBeGreaterThanOrEqual(0)
      expect(x1).toBeLessThanOrEqual(56)
      expect(y0).toBe(0)
      expect(y1).toBeCloseTo(crownH, 5)
    }
  })
})

describe('canino na sprite', () => {
  it('a vista oclusal do canino usa a fatia arredondada do pré-molar; a frontal continua a do canino', () => {
    for (const n of [13, 23, 33, 43, 53, 63, 73, 83]) {
      const k = toothKind(n), up = isUpperTooth(n)
      expect(occTileOf(k, up)).toBe('pm')
      expect(tileOf(k, up)).toBe('ca')
    }
    expect(occTileOf('ci', true)).toBe('ci')
  })
  it('o canino é deslocado para o colo ficar na altura dos vizinhos; os outros dentes não', () => {
    // arcada de cima: para baixo (positivo); arcada de baixo: para cima (negativo)
    expect(cervixOffset(13)).toBeGreaterThan(0)
    expect(cervixOffset(23)).toBe(cervixOffset(13))
    expect(cervixOffset(33)).toBeLessThan(0)
    expect(cervixOffset(43)).toBe(cervixOffset(33))
    expect(cervixOffset(53)).toBeGreaterThan(0)
    expect(cervixOffset(83)).toBeLessThan(0)
    for (const n of [11, 12, 14, 16, 31, 36, 52]) expect(cervixOffset(n)).toBe(0)
  })
  it('depois do deslocamento o colo do canino fica entre o do lateral e o do pré-molar', () => {
    const colo = (n: number, up: boolean) => frontView(toothKind(n), up).crownH * kindScale(n).kx
    const lo = Math.min(colo(12, true), colo(14, true)), hi = Math.max(colo(12, true), colo(14, true))
    expect(colo(13, true) - cervixOffset(13)).toBeGreaterThan(lo - 1e-6)
    expect(colo(13, true) - cervixOffset(13)).toBeLessThan(hi + 1e-6)
  })
})

describe('escala dos dentes sobre a foto', () => {
  it('é uniforme (a foto não se deforma)', () => {
    for (const n of [...ALL_TEETH, ...ALL_DECIDUOUS]) { const s = kindScale(n); expect(s.kx).toBe(s.ky) }
  })
  it('laterais valem 0,88 do central superior e os dentes de baixo e de leite são menores', () => {
    expect(kindScale(11).kx).toBe(1)
    for (const n of [12, 22]) expect(kindScale(n).kx).toBe(0.88)
    expect(kindScale(41).kx).toBeLessThan(kindScale(11).kx)
    expect(kindScale(32).kx).toBeLessThan(kindScale(31).kx)
    expect(kindScale(51).kx).toBeLessThan(kindScale(41).kx)
    expect(kindScale(55).kx).toBeLessThan(kindScale(16).kx)
  })
})
