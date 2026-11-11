// Matemática de zoom e arraste da tela cheia do faceograma e do corpograma (ZoomCanvas).
//
// Modelo: o "quadro" (viewport) mede cw x ch pixels. A arte (viewBox vw x vh) cabe inteira nele,
// centralizada, num retângulo-base de bw x bh pixels (zoom 1). `View` diz onde esse retângulo está:
//   (x, y) = posição do canto superior esquerdo do retângulo-base dentro do quadro, `s` = zoom.
// Um ponto (ux, uy) do viewBox cai em pixel (x + ux * ppu, y + uy * ppu), com ppu = s * bw / vw.
// Os pontos gravados continuam nas coordenadas do viewBox; aqui só se converte pixel <-> viewBox.

export const MIN_ZOOM = 1
export const MAX_ZOOM = 6

export interface Frame { cw: number; ch: number; bw: number; bh: number }
export interface View { s: number; x: number; y: number }
export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export const clampZoom = (s: number): number => (Number.isFinite(s) ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s)) : MIN_ZOOM)

/** Retângulo-base: a maior arte vw x vh que cabe no quadro cw x ch, com `pad` pixels de folga. */
export function fitFrame(cw: number, ch: number, vw: number, vh: number, pad = 0): Frame {
  const w = Math.max(0, cw), h = Math.max(0, ch)
  const aw = Math.max(0, w - 2 * pad), ah = Math.max(0, h - 2 * pad)
  if (aw === 0 || ah === 0 || vw <= 0 || vh <= 0) return { cw: w, ch: h, bw: 0, bh: 0 }
  const k = Math.min(aw / vw, ah / vh)
  return { cw: w, ch: h, bw: vw * k, bh: vh * k }
}

// Arte menor que o quadro: fica centralizada. Maior: não deixa sobrar borda vazia.
function clampAxis(pos: number, size: number, container: number): number {
  if (size <= container) return (container - size) / 2
  return Math.min(0, Math.max(container - size, pos))
}

export function clampView(v: View, f: Frame): View {
  const s = clampZoom(v.s)
  return { s, x: clampAxis(v.x, f.bw * s, f.cw), y: clampAxis(v.y, f.bh * s, f.ch) }
}

/** Zoom 1, arte inteira e centralizada. */
export const fitView = (f: Frame): View => clampView({ s: 1, x: 0, y: 0 }, f)

/** Pixels do quadro por unidade do viewBox. */
export const pxPerUnit = (v: View, f: Frame, vw: number): number => (v.s * f.bw) / vw

/** Muda o zoom mantendo parado o ponto (px, py) do quadro (cursor, ou o centro da pinça). */
export function zoomAt(v: View, px: number, py: number, nextScale: number, f: Frame): View {
  const s = clampZoom(nextScale)
  const r = s / v.s
  return clampView({ s, x: px - (px - v.x) * r, y: py - (py - v.y) * r }, f)
}

export const panBy = (v: View, dx: number, dy: number, f: Frame): View => clampView({ s: v.s, x: v.x + dx, y: v.y + dy }, f)

/** Pixel do quadro (relativo ao canto do quadro) -> coordenada do viewBox. Pode cair fora de 0..vw. */
export function screenToViewBox(v: View, f: Frame, vw: number, px: number, py: number): Pt {
  const ppu = pxPerUnit(v, f, vw)
  return { x: (px - v.x) / ppu, y: (py - v.y) / ppu }
}

/** Coordenada do viewBox -> pixel do quadro. Inversa de screenToViewBox. */
export function viewBoxToScreen(v: View, f: Frame, vw: number, ux: number, uy: number): Pt {
  const ppu = pxPerUnit(v, f, vw)
  return { x: v.x + ux * ppu, y: v.y + uy * ppu }
}

/** Trecho do viewBox visível no quadro: serve de `viewBox` do SVG, que assim redesenha nítido em qualquer zoom. */
export function visibleViewBox(v: View, f: Frame, vw: number): Rect {
  const ppu = pxPerUnit(v, f, vw)
  return { x: -v.x / ppu, y: -v.y / ppu, w: f.cw / ppu, h: f.ch / ppu }
}

export interface PinchStart { view: View; mid: Pt; dist: number }

/** Pinça: o ponto do desenho que estava sob o meio dos dedos continua sob o meio, e o zoom segue a distância. */
export function pinchView(start: PinchStart, mid: Pt, dist: number, f: Frame): View {
  if (!(start.dist > 0) || !(dist > 0)) return start.view
  const s = clampZoom(start.view.s * (dist / start.dist))
  const r = s / start.view.s
  return clampView({ s, x: mid.x - (start.mid.x - start.view.x) * r, y: mid.y - (start.mid.y - start.view.y) * r }, f)
}

/** Enquadra uma região (em unidades do viewBox) no quadro, com `margin` de folga (fração). */
export function zoomToRect(rect: Rect, f: Frame, vw: number, vh: number, margin = 0.1): View {
  if (rect.w <= 0 || rect.h <= 0 || f.bw <= 0) return fitView(f)
  const kx = f.bw / vw, ky = f.bh / vh
  const rw = rect.w * kx, rh = rect.h * ky
  const s = clampZoom(Math.min((f.cw * (1 - margin)) / rw, (f.ch * (1 - margin)) / rh))
  const cx = (rect.x + rect.w / 2) * kx, cy = (rect.y + rect.h / 2) * ky
  return clampView({ s, x: f.cw / 2 - cx * s, y: f.ch / 2 - cy * s }, f)
}

/** O quadro mudou de tamanho (ex.: abriu o painel de edição): mantém no centro o mesmo ponto da arte. */
export function refitView(v: View, from: Frame, to: Frame): View {
  if (from.bw <= 0 || from.bh <= 0 || to.bw <= 0) return clampView({ s: v.s, x: 0, y: 0 }, to)
  const fx = (from.cw / 2 - v.x) / (v.s * from.bw)
  const fy = (from.ch / 2 - v.y) / (v.s * from.bh)
  return clampView({ s: v.s, x: to.cw / 2 - fx * v.s * to.bw, y: to.ch / 2 - fy * v.s * to.bh }, to)
}

/** Fator de escala dos marcadores para ocuparem `targetPx` pixels por unidade do viewBox, em qualquer zoom. */
export const markerScale = (ppu: number, targetPx: number): number => (ppu > 0 ? targetPx / ppu : 1)

export const insideBox = (p: Pt, vw: number, vh: number): boolean => p.x >= 0 && p.x <= vw && p.y >= 0 && p.y <= vh

/** Uma casa decimal: no zoom máximo um pixel vale bem menos que uma unidade do viewBox. */
export const roundCoord = (n: number): number => Math.round(n * 10) / 10

export const centerOf = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
export const distance = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y)
