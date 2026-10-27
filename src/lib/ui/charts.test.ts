import { describe, expect, it } from 'vitest'
import { gaugeArc, scalePoints, smoothPath } from './charts'

describe('smoothPath', () => {
  it('retorna vazio sem pontos', () => {
    expect(smoothPath([])).toBe('')
  })

  it('um ponto só vira um M', () => {
    expect(smoothPath([[4, 8]])).toBe('M4,8')
  })

  it('dois pontos viram uma curva que termina no segundo', () => {
    const d = smoothPath([[0, 10], [30, 10]])
    expect(d.startsWith('M0,10 C')).toBe(true)
    expect(d.endsWith(' 30,10')).toBe(true)
  })

  it('tem um segmento C para cada par de pontos vizinhos', () => {
    const d = smoothPath([[0, 0], [10, 5], [20, 0], [30, 5]])
    expect(d.match(/C/g)).toHaveLength(3)
  })

  it('série plana continua plana (pontos de controle na mesma altura)', () => {
    const d = smoothPath([[0, 7], [10, 7], [20, 7]])
    const ys = d.replace(/[MC]/g, ' ').trim().split(/\s+/).map(p => Number(p.split(',')[1]))
    expect(ys.every(y => y === 7)).toBe(true)
  })

  it('arredonda as coordenadas para 2 casas', () => {
    expect(smoothPath([[0, 0], [1 / 3, 2 / 3]])).not.toMatch(/\d\.\d{3,}/)
  })
})

describe('scalePoints', () => {
  it('retorna vazio sem valores', () => {
    expect(scalePoints([], 100, 40, 4)).toEqual([])
  })

  it('distribui na largura e põe o maior no topo e o menor embaixo', () => {
    const pts = scalePoints([0, 5, 10], 100, 40, 4)
    expect(pts.map(p => p[0])).toEqual([4, 50, 96])
    expect(pts[0][1]).toBe(36)
    expect(pts[2][1]).toBe(4)
    expect(pts[1][1]).toBe(20)
  })

  it('série constante fica no meio da altura', () => {
    const pts = scalePoints([3, 3, 3], 100, 40, 4)
    expect(pts.every(p => p[1] === 20)).toBe(true)
  })

  it('um valor só fica no centro', () => {
    expect(scalePoints([9], 100, 40, 4)).toEqual([[50, 20]])
  })

  it('ignora valores não finitos tratando-os como zero', () => {
    const pts = scalePoints([Number.NaN, 10], 100, 40, 0)
    expect(pts[0][1]).toBe(40)
    expect(pts[1][1]).toBe(0)
  })
})

describe('gaugeArc', () => {
  it('limita a fração entre 0 e 1', () => {
    expect(gaugeArc(-1).fraction).toBe(0)
    expect(gaugeArc(3).fraction).toBe(1)
    expect(gaugeArc(Number.NaN).fraction).toBe(0)
  })

  it('zero termina na ponta esquerda e um na direita', () => {
    const zero = gaugeArc(0)
    const full = gaugeArc(1)
    expect(zero.end).toEqual([zero.cx - zero.r, zero.cy])
    expect(full.end[0]).toBeCloseTo(full.cx + full.r)
    expect(full.end[1]).toBeCloseTo(full.cy)
  })

  it('metade termina no topo', () => {
    const half = gaugeArc(0.5)
    expect(half.end[0]).toBeCloseTo(half.cx)
    expect(half.end[1]).toBeCloseTo(half.cy - half.r)
  })

  it('a trilha é sempre a meia-lua inteira', () => {
    expect(gaugeArc(0.2).track).toBe(gaugeArc(0.9).track)
  })
})
