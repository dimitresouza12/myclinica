import { describe, expect, it } from 'vitest'
import {
  MAX_ZOOM, MIN_ZOOM, centerOf, clampView, clampZoom, distance, fitFrame, fitView, insideBox, markerScale, panBy, pinchView,
  pxPerUnit, refitView, roundCoord, screenToViewBox, viewBoxToScreen, visibleViewBox, zoomAt, zoomToRect,
} from './zoomView'
import { FACE_SHORTCUTS, FACE_VH, FACE_VW } from './faceograma'
import { BODY_VH, BODY_VW, bodyShortcuts } from './corpograma'

const VW = 300, VH = 248
const wide = fitFrame(900, 600, VW, VH)   // quadro mais largo que a arte
const tall = fitFrame(375, 500, VW, VH)   // celular em pé
const near = (a: number, b: number, d = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(d)

describe('fitFrame', () => {
  it('cabe a arte inteira e mantém a proporção', () => {
    near(wide.bw / wide.bh, VW / VH)
    expect(wide.bh).toBeLessThanOrEqual(600)
    expect(wide.bw).toBeLessThanOrEqual(900)
    near(tall.bw, 375)
  })
  it('quadro vazio não gera NaN', () => {
    expect(fitFrame(0, 0, VW, VH)).toEqual({ cw: 0, ch: 0, bw: 0, bh: 0 })
  })
  it('respeita a folga', () => {
    near(fitFrame(400, 1000, VW, VH, 8).bw, 384)
  })
})

describe('clampView', () => {
  it('zoom 1 deixa a arte centralizada', () => {
    const v = fitView(wide)
    expect(v.s).toBe(1)
    near(v.x, (900 - wide.bw) / 2)
    near(v.y, (600 - wide.bh) / 2)
  })
  it('limita o zoom entre 1x e 6x', () => {
    expect(clampZoom(0.2)).toBe(MIN_ZOOM)
    expect(clampZoom(99)).toBe(MAX_ZOOM)
    expect(clampZoom(NaN)).toBe(MIN_ZOOM)
    expect(clampView({ s: 40, x: 0, y: 0 }, wide).s).toBe(MAX_ZOOM)
  })
  it('com zoom, não deixa sobrar borda vazia nos quatro lados', () => {
    const lo = clampView({ s: 3, x: 5000, y: 5000 }, wide)
    expect(lo.x).toBeLessThanOrEqual(0)
    expect(lo.y).toBeLessThanOrEqual(0)
    const hi = clampView({ s: 3, x: -99999, y: -99999 }, wide)
    near(hi.x + wide.bw * 3, wide.cw)
    near(hi.y + wide.bh * 3, wide.ch)
  })
  it('eixo menor que o quadro continua centralizado mesmo com zoom', () => {
    // celular em pé: a arte é larga, mas com zoom 1 sobra espaço em cima e embaixo
    const v = clampView({ s: 1, x: 0, y: -300 }, tall)
    near(v.y, (500 - tall.bh) / 2)
  })
  it('arrastar respeita o limite', () => {
    const z = zoomAt(fitView(wide), 450, 300, 4, wide)
    const moved = panBy(z, 1e6, 1e6, wide)
    expect(moved.x).toBeLessThanOrEqual(0)
    expect(moved.y).toBeLessThanOrEqual(0)
    expect(moved.s).toBe(z.s)
  })
})

describe('clique <-> coordenada do viewBox', () => {
  const views = [
    fitView(wide),
    zoomAt(fitView(wide), 200, 150, 2.5, wide),
    panBy(zoomAt(fitView(wide), 700, 400, MAX_ZOOM, wide), -120, 80, wide),
    zoomAt(fitView(tall), 100, 100, 3, tall),
  ]
  it('ida e volta devolve o mesmo ponto em qualquer zoom e pan', () => {
    for (const [i, v] of views.entries()) {
      const f = i === 3 ? tall : wide
      for (const [ux, uy] of [[0, 0], [150, 124], [299, 247], [37.5, 201.2]]) {
        const p = viewBoxToScreen(v, f, VW, ux, uy)
        const back = screenToViewBox(v, f, VW, p.x, p.y)
        near(back.x, ux, 1e-7); near(back.y, uy, 1e-7)
      }
    }
  })
  it('sem zoom é a regra proporcional de antes (clique no centro = centro do viewBox)', () => {
    const v = fitView(wide)
    const p = screenToViewBox(v, wide, VW, wide.cw / 2, wide.ch / 2)
    near(p.x, VW / 2); near(p.y, VH / 2)
  })
  it('o ponto sob o cursor não se mexe ao dar zoom', () => {
    const v0 = fitView(wide)
    const cursor = { x: 610, y: 210 }
    const before = screenToViewBox(v0, wide, VW, cursor.x, cursor.y)
    const v1 = zoomAt(v0, cursor.x, cursor.y, 5, wide)
    const after = screenToViewBox(v1, wide, VW, cursor.x, cursor.y)
    near(after.x, before.x, 1e-7); near(after.y, before.y, 1e-7)
  })
  it('o viewBox visível é o inverso dos cantos do quadro', () => {
    const v = views[2]
    const r = visibleViewBox(v, wide, VW)
    const tl = screenToViewBox(v, wide, VW, 0, 0)
    const br = screenToViewBox(v, wide, VW, wide.cw, wide.ch)
    near(r.x, tl.x); near(r.y, tl.y); near(r.x + r.w, br.x); near(r.y + r.h, br.y)
  })
  it('insideBox ignora toques fora da arte', () => {
    expect(insideBox({ x: 10, y: 10 }, VW, VH)).toBe(true)
    expect(insideBox({ x: -1, y: 10 }, VW, VH)).toBe(false)
    expect(insideBox({ x: 10, y: VH + 0.1 }, VW, VH)).toBe(false)
  })
  it('arredonda a uma casa decimal', () => {
    expect(roundCoord(12.3456)).toBe(12.3)
    expect(roundCoord(0.05)).toBe(0.1)
  })
})

describe('pinça', () => {
  it('dedos se afastando aumentam o zoom e o meio dos dedos continua sobre o mesmo ponto do desenho', () => {
    const v0 = zoomAt(fitView(wide), 450, 300, 2, wide)
    const mid0 = { x: 400, y: 280 }
    const anchor = screenToViewBox(v0, wide, VW, mid0.x, mid0.y)
    const v1 = pinchView({ view: v0, mid: mid0, dist: 100 }, mid0, 150, wide)
    near(v1.s, 3)
    const now = screenToViewBox(v1, wide, VW, mid0.x, mid0.y)
    near(now.x, anchor.x, 1e-7); near(now.y, anchor.y, 1e-7)
  })
  it('arrastar os dois dedos juntos faz pan', () => {
    const v0 = zoomAt(fitView(wide), 450, 300, 3, wide)
    const v1 = pinchView({ view: v0, mid: { x: 450, y: 300 }, dist: 80 }, { x: 430, y: 290 }, 80, wide)
    near(v1.s, 3)
    near(v1.x, clampView({ ...v0, x: v0.x - 20 }, wide).x)
  })
  it('respeita os limites 1x e 6x', () => {
    const v0 = zoomAt(fitView(wide), 450, 300, 2, wide)
    expect(pinchView({ view: v0, mid: { x: 1, y: 1 }, dist: 10 }, { x: 1, y: 1 }, 1000, wide).s).toBe(MAX_ZOOM)
    expect(pinchView({ view: v0, mid: { x: 1, y: 1 }, dist: 1000 }, { x: 1, y: 1 }, 1, wide).s).toBe(MIN_ZOOM)
  })
  it('distância zero não quebra', () => {
    const v0 = fitView(wide)
    expect(pinchView({ view: v0, mid: { x: 0, y: 0 }, dist: 0 }, { x: 0, y: 0 }, 50, wide)).toEqual(v0)
  })
  it('helpers de ponto', () => {
    expect(centerOf({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 })
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })
})

describe('zoomToRect (atalhos de região)', () => {
  it('centraliza a região e fica entre 1x e 6x', () => {
    const rect = { x: 100, y: 70, w: 100, h: 40 }
    const v = zoomToRect(rect, wide, VW, VH)
    expect(v.s).toBeGreaterThan(1)
    expect(v.s).toBeLessThanOrEqual(MAX_ZOOM)
    const c = viewBoxToScreen(v, wide, VW, 150, 90)
    near(c.x, wide.cw / 2, 1e-6); near(c.y, wide.ch / 2, 1e-6)
  })
  it('região minúscula não passa de 6x', () => {
    expect(zoomToRect({ x: 140, y: 100, w: 2, h: 2 }, wide, VW, VH).s).toBe(MAX_ZOOM)
  })
  it('região perto da borda não deixa borda vazia', () => {
    const v = zoomToRect({ x: 0, y: 0, w: 40, h: 40 }, wide, VW, VH)
    expect(v.x).toBeLessThanOrEqual(0)
    expect(v.y).toBeLessThanOrEqual(0)
    expect(visibleViewBox(v, wide, VW).x).toBeGreaterThanOrEqual(-1e-9)
  })
  it('região inválida volta para Ajustar', () => {
    expect(zoomToRect({ x: 0, y: 0, w: 0, h: 0 }, wide, VW, VH)).toEqual(fitView(wide))
  })
})

describe('refitView', () => {
  it('mantém no centro o mesmo ponto da arte quando o quadro encolhe', () => {
    const v0 = zoomAt(fitView(wide), 300, 200, 3, wide)
    const center0 = screenToViewBox(v0, wide, VW, wide.cw / 2, wide.ch / 2)
    const smaller = fitFrame(900, 380, VW, VH)
    const v1 = refitView(v0, wide, smaller)
    const center1 = screenToViewBox(v1, smaller, VW, smaller.cw / 2, smaller.ch / 2)
    near(center1.x, center0.x, 1e-6); near(center1.y, center0.y, 1e-6)
    expect(v1.s).toBe(3)
  })
})

describe('marcadores com tamanho visual constante', () => {
  it('escala inversa: pixels por unidade x escala = alvo, em qualquer zoom', () => {
    for (const s of [1, 2, 3.7, 6]) {
      const v = zoomAt(fitView(wide), 450, 300, s, wide)
      const ppu = pxPerUnit(v, wide, VW)
      near(markerScale(ppu, 1.5) * ppu, 1.5)
    }
    const v6 = zoomAt(fitView(wide), 450, 300, 6, wide)
    expect(markerScale(pxPerUnit(v6, wide, VW), 1.5)).toBeLessThan(markerScale(pxPerUnit(fitView(wide), wide, VW), 1.5))
  })
})

describe('atalhos de região', () => {
  it('faceograma: os seis atalhos, todos dentro do desenho', () => {
    expect(FACE_SHORTCUTS.map(s => s.label)).toEqual(['Testa', 'Olhos', 'Nariz', 'Bochecha', 'Lábios', 'Mento'])
    for (const s of FACE_SHORTCUTS) {
      expect(s.rect.x).toBeGreaterThanOrEqual(0)
      expect(s.rect.y).toBeGreaterThanOrEqual(0)
      expect(s.rect.x + s.rect.w).toBeLessThanOrEqual(FACE_VW)
      expect(s.rect.y + s.rect.h).toBeLessThanOrEqual(FACE_VH)
      expect(s.rect.w).toBeGreaterThan(0)
    }
  })
  it('faceograma: Olhos cobre os dois lados da linha média', () => {
    const r = FACE_SHORTCUTS.find(s => s.key === 'olhos')!.rect
    expect(r.x).toBeLessThan(150 - 28)
    expect(r.x + r.w).toBeGreaterThan(150 + 28)
  })
  it('corpograma: frente tem tronco e abdome, costas tem Costas e não tem abdome', () => {
    const front = bodyShortcuts('frente').map(s => s.label)
    const back = bodyShortcuts('costas').map(s => s.label)
    expect(front).toEqual(expect.arrayContaining(['Cabeça', 'Tronco', 'Abdome', 'Braço D', 'Braço E', 'Coxa D', 'Coxa E', 'Perna D', 'Perna E']))
    expect(front).not.toContain('Costas')
    expect(back).toContain('Costas')
    expect(back).not.toContain('Abdome')
  })
  it('corpograma: todos os retângulos ficam dentro do quadro e D/E trocam de lado nas costas', () => {
    for (const view of ['frente', 'costas'] as const) {
      for (const s of bodyShortcuts(view)) {
        expect(s.rect.x).toBeGreaterThanOrEqual(0)
        expect(s.rect.y).toBeGreaterThanOrEqual(0)
        expect(s.rect.x + s.rect.w).toBeLessThanOrEqual(BODY_VW + 1e-9)
        expect(s.rect.y + s.rect.h).toBeLessThanOrEqual(BODY_VH + 1e-9)
      }
    }
    const cx = (view: 'frente' | 'costas', label: string) => { const r = bodyShortcuts(view).find(s => s.label === label)!.rect; return r.x + r.w / 2 }
    expect(cx('frente', 'Braço D')).toBeLessThan(BODY_VW / 2)
    expect(cx('costas', 'Braço D')).toBeGreaterThan(BODY_VW / 2)
  })
})
