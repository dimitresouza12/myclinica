// Geometria dos dentes do odontograma. O desenho é uma foto (sprite em /public/teeth-sprites.webp, ver spriteShapes.ts)
// e este arquivo liga cada dente ao recorte certo dela: coroa e raízes (vista frontal) e contorno (vista oclusal) são os
// contornos da própria foto, então a camada clicável e as marcações ficam exatamente por cima dela.
//
// Convenção: cada grupo é desenhado uma vez, no quadrante esquerdo da tela, com o mesial para a direita. Os outros
// quadrantes e a arcada de baixo são o mesmo desenho espelhado por transform (ver lib/odontogramaGeometry.ts).
// Vista frontal (vestibular): x=28 é o eixo do dente, y=0 a borda incisal/oclusal e y cresce rumo ao ápice.
// Vista oclusal: (28, 28) é o centro da célula, vestibular para cima, mesial para a direita.
// Só comandos absolutos M, L, C, Q e Z: scalePath() depende disso.

import { isUpperTooth } from '@/lib/odontograma'
import { TOOTH_KINDS, kindScale, rootCount, scalePath, toothKind, type ToothKind } from '@/lib/odontogramaGeometry'
import { FRONT_TILES, OCC_TILES, SPRITE, TILE_IDS, type FrontTile, type SpriteRoot, type TileId } from './spriteShapes'

export { FRONT_TILES, OCC_TILES, SPRITE, TILE_IDS }
export type { TileId }
export type RootShape = SpriteRoot

export interface FrontShape {
  crown: string
  /** linha cervical (junção coroa-raiz) */
  cervix: string
  /** y do colo, no eixo do dente */
  crownH: number
  /** caixa da coroa: x0, y0, x1, y1 */
  crownBox: [number, number, number, number]
  /** centro do braquete */
  bracket: [number, number]
  upper: RootShape[]
  lower: RootShape[]
}

export interface OcclusalShape {
  outline: string
  /** caixa que contém o contorno: x0, y0, x1, y1 */
  box: [number, number, number, number]
  /** centro das zonas */
  center: [number, number]
  /** tamanho da zona central em relação ao contorno */
  centerScale: number
}

/** O que a tela precisa para desenhar a vista frontal de um dente: o recorte da foto e as formas da camada clicável. */
export interface FrontView {
  /** recorte da foto (também é o id dos recortes de clipPath em OdoDefs) */
  id: TileId
  col: number
  crown: string
  cervix: string
  crownH: number
  crownBox: [number, number, number, number]
  bracket: [number, number]
  roots: RootShape[]
}
export interface OccView extends OcclusalShape { id: TileId; col: number }

/** Qual recorte da foto desenha o grupo. Molares: superior (3 raízes) ou inferior (2 raízes); decíduos usam o recorte do permanente do mesmo tipo. */
export function tileOf(kind: ToothKind, upper: boolean): TileId {
  switch (kind) {
    case 'ci': case 'li': case 'dci': case 'dli': return 'ci'
    case 'ca': case 'dca': return 'ca'
    case 'pm1': case 'pm2': return 'pm'
    default: return upper ? 'moU' : 'moL'
  }
}

/**
 * Recorte da vista oclusal. O canino usa o do pré-molar: o losango pontiagudo do canino destoava da fileira, e o do
 * pré-molar é arredondado como os vizinhos (a escala menor está em occlusalScale).
 */
export function occTileOf(kind: ToothKind, upper: boolean): TileId {
  return kind === 'ca' || kind === 'dca' ? 'pm' : tileOf(kind, upper)
}

/** Raízes do desenho: o pré-molar superior 1 tem duas (a foto mostra uma só, então ela é dividida ao meio). */
function rootsOf(kind: ToothKind, upper: boolean): RootShape[] {
  const t = FRONT_TILES[tileOf(kind, upper)]
  return kind === 'pm1' && upper && t.roots2 ? t.roots2 : t.roots
}

const viewOf = (id: TileId, t: FrontTile, roots: RootShape[]): FrontView => ({
  id, col: t.col, crown: t.crown, cervix: t.cervix, crownH: t.crownH, crownBox: t.crownBox, bracket: t.bracket, roots,
})

/** Vista frontal de um dente na arcada indicada (superior ou inferior). */
export function frontView(kind: ToothKind, upper: boolean): FrontView {
  const id = tileOf(kind, upper)
  return viewOf(id, FRONT_TILES[id], rootsOf(kind, upper))
}

/** Vista oclusal de um dente na arcada indicada. */
export function occView(kind: ToothKind, upper: boolean): OccView {
  const id = occTileOf(kind, upper)
  return { id, ...OCC_TILES[id] }
}

/**
 * Deslocamento vertical (unidades da tela, já com o sinal certo para a arcada) que põe o colo do canino na mesma altura
 * do colo dos vizinhos (média entre o lateral e o 1º pré-molar, ou o 1º molar decíduo). A coroa do canino da foto é mais
 * alta que a dos vizinhos; sem isso a linha coroa-raiz fica degrau na fileira. Zero para os outros dentes.
 */
export function cervixOffset(n: number): number {
  const kind = toothKind(n)
  if (kind !== 'ca' && kind !== 'dca') return 0
  const upper = isUpperTooth(n)
  const colo = (m: number) => frontView(toothKind(m), upper).crownH * kindScale(m).kx
  const target = (colo(n - 1) + colo(n + 1)) / 2
  const own = colo(n)
  return (upper ? -1 : 1) * (target - own)
}

/**
 * Forma frontal de cada grupo. `crown`, `cervix` e `bracket` são os da arcada superior; no molar inferior a coroa é
 * outra foto, por isso o desenho usa frontView(). `upper` e `lower` já trazem as raízes certas de cada arcada.
 */
export const FRONT: Record<ToothKind, FrontShape> = Object.fromEntries(TOOTH_KINDS.map(k => {
  const t = FRONT_TILES[tileOf(k, true)]
  return [k, { crown: t.crown, cervix: t.cervix, crownH: t.crownH, crownBox: t.crownBox, bracket: t.bracket, upper: rootsOf(k, true), lower: rootsOf(k, false) }]
})) as Record<ToothKind, FrontShape>

export const OCCLUSAL: Record<ToothKind, OcclusalShape> = Object.fromEntries(TOOTH_KINDS.map(k => {
  const { outline, box, center, centerScale } = OCC_TILES[occTileOf(k, true)]
  return [k, { outline, box, center, centerScale }]
})) as Record<ToothKind, OcclusalShape>

/** Contorno da zona central: o contorno do dente reduzido em torno do centro. */
export const centerPathOf = (o: OcclusalShape) => scalePath(o.outline, o.center[0], o.center[1], o.centerScale)
export const centerPath = (k: ToothKind, upper = true) => centerPathOf(occView(k, upper))

/**
 * Triângulos das quatro faces periféricas (vestibular em cima, lingual embaixo, mesial à direita, distal à
 * esquerda): do centro às diagonais da caixa do dente, esticadas para passar do contorno. Recortados pelo
 * contorno e pelo anel (contorno menos zona central), cada um vira o contorno orgânico da sua face.
 */
export function wedgePathsOf(o: OcclusalShape): Record<'v' | 'l' | 'm' | 'd', string> {
  const { box: [x0, y0, x1, y1], center: [cx, cy] } = o
  const far = (x: number, y: number) => `${+(cx + (x - cx) * 2.2).toFixed(1)},${+(cy + (y - cy) * 2.2).toFixed(1)}`
  const c = `${cx},${cy}`
  const tl = far(x0, y0), tr = far(x1, y0), bl = far(x0, y1), br = far(x1, y1)
  return {
    v: `M ${c} L ${tl} L ${tr} Z`,
    l: `M ${c} L ${bl} L ${br} Z`,
    m: `M ${c} L ${tr} L ${br} Z`,
    d: `M ${c} L ${tl} L ${bl} Z`,
  }
}
export const wedgePaths = (k: ToothKind, upper = true) => wedgePathsOf(occView(k, upper))

/** Dentes cujo desenho tem esse número de raízes na arcada: usado nos testes para manter shapes e lógica de acordo. */
export function shapeRootCount(kind: ToothKind, upper: boolean): number {
  return FRONT[kind][upper ? 'upper' : 'lower'].length
}
export const ALL_KINDS_CHECK = TOOTH_KINDS.every(k => [true, false].every(u => shapeRootCount(k, u) === rootCount(k, u)))
