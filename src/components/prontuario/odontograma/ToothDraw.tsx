import { memo, type ReactNode } from 'react'
import { DEFAULT_STATUS, statusColor, type SurfaceKey, type ToothData } from '@/lib/odontograma'
import { frontScale, kindScale, occlusalScale, toothKind } from '@/lib/odontogramaGeometry'
import { isUpperTooth } from '@/lib/odontograma'
import { zoneLabel, zoneToken, type Zone } from '@/lib/odontogramaTools'
import { SPRITE, cervixOffset, centerPathOf, frontView, occView, wedgePathsOf, type OccView, type TileId } from './shapes'
import { ODO, url } from './OdoDefs'
import { useSpriteFailed } from './spriteStatus'
import styles from './odontogramaBoard.module.css'

// Medidas da arcada (unidades do viewBox). Cada dente ocupa uma coluna de 56.
export const CELL_W = 56
export const FRONT_H = 116
export const OCC_H = 58
/** y da borda incisal dentro da caixa frontal: embaixo na arcada de cima (raízes para cima), em cima na de baixo. */
export const FRONT_EDGE_UP = 108
export const FRONT_EDGE_LOW = 8

const SIDE_FACES = ['v', 'l', 'm', 'd'] as const
/** Zona que recebe o foco ao entrar numa célula pelas setas, quando a zona de onde se veio não existe nela. */
export const FRONT_DEFAULT_ZONE = 'crown'
export const OCCLUSAL_DEFAULT_ZONE = 'face:o'

const WEDGES = new Map<TileId, Record<'v' | 'l' | 'm' | 'd', string>>()
const CENTERS = new Map<TileId, string>()
const DIVIDERS = new Map<TileId, string>()
function occParts(o: OccView) {
  if (!WEDGES.has(o.id)) {
    WEDGES.set(o.id, wedgePathsOf(o))
    CENTERS.set(o.id, centerPathOf(o))
    const { box: [x0, y0, x1, y1], center: [cx, cy] } = o
    const far = (x: number, y: number) => `${+(cx + (x - cx) * 2.2).toFixed(1)} ${+(cy + (y - cy) * 2.2).toFixed(1)}`
    DIVIDERS.set(o.id, [far(x0, y0), far(x1, y0), far(x0, y1), far(x1, y1)].map(p => `M ${cx} ${cy} L ${p}`).join(' '))
  }
  return { wedges: WEDGES.get(o.id)!, center: CENTERS.get(o.id)!, dividers: DIVIDERS.get(o.id)! }
}

/** Foto do dente: a fatia (coluna, linha) da sprite, no espaço local em que os contornos de shapes.ts foram medidos. */
const SPRITE_W = SPRITE.tileW * SPRITE.unit, SPRITE_H = SPRITE.tileH * SPRITE.unit
const FRONT_PHOTO = `translate(${+(28 - SPRITE_W / 2).toFixed(3)} ${+(-SPRITE.frontTop * SPRITE.unit).toFixed(3)}) scale(${SPRITE.unit})`
const OCC_PHOTO = `translate(${+(28 - SPRITE_W / 2).toFixed(3)} ${+(28 - SPRITE_H / 2).toFixed(3)}) scale(${SPRITE.unit})`
export function ToothPhoto({ col, row, opacity, base }: { col: number; row: 0 | 1; opacity?: number; base?: string[] }) {
  const failed = useSpriteFailed()
  // sprite não carregou: contorno vetorial discreto (mesmos caminhos das zonas clicáveis) no lugar da foto
  if (failed && base) {
    return (
      <g opacity={opacity} fill="var(--surface-2)" stroke="var(--odo-line)" strokeWidth="0.8" strokeLinejoin="round">
        {base.map((d, i) => <path key={i} d={d} vectorEffect="non-scaling-stroke" />)}
      </g>
    )
  }
  return <use href={`#${ODO.sprite(col, row)}`} width={SPRITE.tileW} height={SPRITE.tileH} transform={row === 0 ? FRONT_PHOTO : OCC_PHOTO} opacity={opacity} />
}

/** Aparência derivada dos dados do dente, igual para a vista frontal e a oclusal. */
function look(d: ToothData) {
  const st = d.status
  return {
    absent: st === 'ausente',
    whole: st !== DEFAULT_STATUS && st !== 'ausente' ? st : null,
    wholePlanned: !!d.planned?.all,
  }
}
/** Face marcada: translúcida o bastante para a foto continuar aparecendo por baixo. */
const faceOpacity = (planned: boolean) => (planned ? 0.3 : 0.55)

// ── Zonas clicáveis ─────────────────────────────────────────────
interface ZoneExtra { cell: string; tabbable: boolean; active?: boolean }

/**
 * Qual zona da célula é a parada de Tab (roving tabindex: uma só por célula ativa).
 * `tabZone` é a zona em que o foco estava; se a célula não tem essa zona, vale a padrão.
 * Sem `tabZone` (figura avulsa do painel, sem navegação por setas) toda zona da célula é parada de Tab.
 */
function tabStop(tokens: string[], fallback: string, tabbable: boolean, tabZone?: string | null): (token: string) => boolean {
  if (!tabbable) return () => false
  if (tabZone === undefined || tabZone === null) return () => true
  const stop = tokens.includes(tabZone) ? tabZone : fallback
  return token => token === stop
}
function zoneProps(n: number, zone: Zone, d: ToothData, x: ZoneExtra) {
  return {
    role: 'button' as const,
    tabIndex: x.tabbable ? 0 : -1,
    'aria-label': zoneLabel(n, zone, d),
    'data-tooth': n,
    'data-zone': zoneToken(zone),
    'data-cell': x.cell,
    ...(x.active ? { 'data-active': 'true' } : {}),
    className: styles.hit,
    vectorEffect: 'non-scaling-stroke' as const,
  }
}

// ── Peças metálicas ─────────────────────────────────────────────
/** Braquete: base de aço com canaleta e quatro aletas. Centrado em (0, 0). */
export function Bracket({ x, y, s, planned }: { x: number; y: number; s: number; planned?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={planned ? 0.5 : 1}>
      <rect x="-6" y="-4.8" width="12" height="9.6" rx="2" fill={url(ODO.steel)} stroke="#4B5563" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
      <rect x="-6" y="-4.8" width="2.8" height="2.6" rx="0.8" fill="#8A94A1" />
      <rect x="3.2" y="-4.8" width="2.8" height="2.6" rx="0.8" fill="#8A94A1" />
      <rect x="-6" y="2.2" width="2.8" height="2.6" rx="0.8" fill="#8A94A1" />
      <rect x="3.2" y="2.2" width="2.8" height="2.6" rx="0.8" fill="#8A94A1" />
      <rect x="-5" y="-0.9" width="10" height="1.8" rx="0.9" fill="#2B323B" />
      <path d="M -4.6,-3.4 L 4.6,-3.4" stroke="#fff" strokeOpacity="0.7" strokeWidth="0.9" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </g>
  )
}

/** Fio ortodôntico entre dois braquetes. */
export function Wire({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return (
    <g>
      <path d={`M ${x1} ${y1} L ${x2} ${y2}`} stroke="#6F7885" strokeWidth="2.4" strokeLinecap="round" fill="none" vectorEffect="non-scaling-stroke" />
      <path d={`M ${x1} ${y1 - 0.5} L ${x2} ${y2 - 0.5}`} stroke="#E4E9EE" strokeWidth="1" strokeLinecap="round" fill="none" vectorEffect="non-scaling-stroke" />
    </g>
  )
}

function Pin({ pin, planned }: { pin: [number, number, number, number]; planned: boolean }) {
  const [x1, y1, x2, y2] = pin
  const threads = [0.18, 0.34, 0.5, 0.66, 0.82].map(t => {
    const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t, w = 2.6 - 2 * t
    return `M ${(x - w).toFixed(2)} ${y.toFixed(2)} L ${(x + w).toFixed(2)} ${(y + 0.9).toFixed(2)}`
  }).join(' ')
  return (
    <g opacity={planned ? 0.5 : 1}>
      <path d={`M ${x1 - 3} ${y1 - 3} L ${x1 + 3} ${y1 - 3} L ${x1 + 2.6} ${y1} L ${x2 + 0.7} ${y2} L ${x2 - 0.7} ${y2} L ${x1 - 2.6} ${y1} Z`}
        fill={url(ODO.steel)} stroke="#4B5563" strokeWidth="0.7" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <path d={threads} stroke="#4B5563" strokeWidth="0.7" strokeOpacity="0.8" fill="none" vectorEffect="non-scaling-stroke" />
    </g>
  )
}

function Screw({ ch }: { ch: number }) {
  const rows = [6, 11, 16, 21, 26, 31, 36, 41].map(o => `M ${22 + o * 0.05} ${ch + o} L ${34 - o * 0.05} ${ch + o + 1.4}`).join(' ')
  return (
    <g>
      <path d={`M 22,${ch - 2} L 34,${ch - 2} L 32.4,${ch + 44} L 28,${ch + 51} L 23.6,${ch + 44} Z`} fill={url(ODO.steel)} stroke="#4B5563" strokeWidth="0.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <path d={rows} stroke="#4B5563" strokeWidth="0.9" fill="none" vectorEffect="non-scaling-stroke" />
      <path d={`M 24,${ch - 8} L 32,${ch - 8} L 33,${ch - 2} L 23,${ch - 2} Z`} fill={url(ODO.gold)} stroke="#8A6414" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
    </g>
  )
}

// ── Vista frontal (vestibular) ──────────────────────────────────
interface CellProps { n: number; data: ToothData; cx: number; top: number }
const frontTransform = (n: number, cx: number, top: number) => {
  const { sx, sy } = frontScale(n)
  // o canino é deslocado para o colo ficar alinhado ao dos vizinhos (cervixOffset)
  const edge = (isUpperTooth(n) ? top + FRONT_EDGE_UP : top + FRONT_EDGE_LOW) + cervixOffset(n)
  return { t: `translate(${cx} ${edge}) scale(${sx} ${sy}) translate(-28 0)`, edge, sy }
}

/** Centro do braquete na tela (para o fio e para a posição do braquete). */
export function bracketPoint(n: number, cx: number, top: number): { x: number; y: number; s: number } {
  const { edge, sy } = frontTransform(n, cx, top)
  return { x: cx, y: edge + frontView(toothKind(n), isUpperTooth(n)).bracket[1] * sy, s: Math.min(1, kindScale(n).kx + 0.1) }
}

/** Desenho (sem zonas clicáveis) da vista frontal: foto, canais, pino e as marcações de estado por cima dela. */
export const FrontVisual = memo(function FrontVisual({ n, data, cx, top }: CellProps) {
  const kind = toothKind(n), upper = isUpperTooth(n)
  const view = frontView(kind, upper)
  const roots = view.roots
  const { t } = frontTransform(n, cx, top)
  const { absent, whole, wholePlanned } = look(data)
  const implant = data.status === 'implante'
  const ch = view.crownH
  const [bx0, , bx1] = view.crownBox
  const mid = (bx0 + bx1) / 2, cw = bx1 - bx0
  const frontBase = [...roots.map(r => r.d), view.crown]
  const wholeColor = whole ? statusColor(whole) : null
  const dash = wholePlanned ? '4 3' : undefined
  const endoPlanned = !!data.planned?.endo, pinPlanned = !!data.planned?.pin

  const strip = (face: SurfaceKey, node: (color: string, o: number) => ReactNode) => {
    const s = data.surfaces[face]
    return s && s !== DEFAULT_STATUS ? node(statusColor(s), faceOpacity(!!data.planned?.[face])) : null
  }

  return (
    <g className={absent ? styles.ghost : undefined}>
      <g transform={t}>
        {implant ? (
          <>
            <g clipPath={url(ODO.clipRoots(view.id))} opacity="0.2"><ToothPhoto col={view.col} row={0} base={frontBase} /></g>
            <g clipPath={url(ODO.clipCrown(view.id))}><ToothPhoto col={view.col} row={0} base={frontBase} /></g>
            <Screw ch={ch} />
          </>
        ) : <ToothPhoto col={view.col} row={0} base={frontBase} />}
        {!implant && data.endo?.map(r => roots[r] && (
          <g key={`e${r}`} opacity={endoPlanned ? 0.55 : 1}>
            <path d={roots[r].canal} fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="4.4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <path d={roots[r].canal} fill="none" stroke="#EF4444" strokeWidth="2.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <path d={roots[r].canal} fill="none" stroke="#3B82F6" strokeWidth="1.1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </g>
        ))}
        {!implant && data.pin?.map(r => roots[r] && <Pin key={`p${r}`} pin={roots[r].pin} planned={pinPlanned} />)}

        <g clipPath={url(ODO.clipCrown(view.id))}>
          {wholeColor && <path d={view.crown} fill={wholeColor} opacity={wholePlanned ? 0.12 : 0.3} />}
          {strip('v', (c, o) => data.surfaces.v === 'restaurado'
            ? <rect x={mid - cw * 0.21} y={ch * 0.26} width={cw * 0.42} height={ch * 0.46} rx="6" fill={c} fillOpacity={o} stroke="#fff" strokeOpacity="0.7" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            : <ellipse cx={mid} cy={ch * 0.5} rx={cw * 0.28} ry={Math.max(11, ch * 0.34)} fill={url(ODO.stain(data.surfaces.v))} opacity={Math.min(1, o + 0.2)} />)}
          {strip('m', (c, o) => <rect x={bx1 - cw * 0.3} y="-2" width={cw * 0.3 + 4} height={ch + 8} fill={c} opacity={o} />)}
          {strip('d', (c, o) => <rect x={bx0 - 4} y="-2" width={cw * 0.3 + 4} height={ch + 8} fill={c} opacity={o} />)}
          {strip('o', (c, o) => <rect x={bx0 - 2} y="-2" width={cw + 4} height="9" fill={c} opacity={o} />)}
        </g>
        {data.status === 'coroa' && (
          <g>
            <path d={view.crown} fill={url(ODO.gold)} opacity={wholePlanned ? 0.16 : 0.3} />
            <path d={view.crown} fill="none" stroke={url(ODO.gold)} strokeWidth="2.6" strokeLinejoin="round" strokeDasharray={dash} vectorEffect="non-scaling-stroke" />
          </g>
        )}
        {data.status === 'extracao' && <path d={view.crown} fill="none" stroke="#b91c1c" strokeWidth="1.8" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
        {data.status === 'fraturado' && (
          <path d={`M ${mid - 8},2 L ${mid - 2},11 L ${mid - 6},19 L ${mid + 3},28 L ${mid - 2},${ch - 6}`} fill="none" stroke="#ea580c" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        )}
        {wholeColor && !['coroa', 'extracao', 'fraturado'].includes(data.status) && (
          <path d={view.crown} fill="none" stroke={wholeColor} strokeWidth="1.6" strokeDasharray={dash} vectorEffect="non-scaling-stroke" />
        )}
      </g>
      {data.bracket && !absent && (() => {
        const b = bracketPoint(n, cx, top)
        return <Bracket x={b.x} y={b.y} s={b.s} planned={!!data.planned?.bracket} />
      })()}
    </g>
  )
})

/** Zonas clicáveis da vista frontal: cada raiz e a coroa (contornos da própria foto). */
export const FrontHit = memo(function FrontHit({ n, data, cx, top, cell, tabbable, tabZone }: CellProps & { cell: string; tabbable: boolean; tabZone?: string | null }) {
  const kind = toothKind(n), upper = isUpperTooth(n)
  const view = frontView(kind, upper)
  const roots = view.roots
  const { t } = frontTransform(n, cx, top)
  const order = roots.map((_, i) => i).sort((a, b) => (roots[b].behind ? 1 : 0) - (roots[a].behind ? 1 : 0))
  const isStop = tabStop([...roots.map((_, i) => `root:${i}`), 'crown'], FRONT_DEFAULT_ZONE, tabbable, tabZone)
  return (
    <g transform={t}>
      {order.map(i => <path key={i} d={roots[i].d} {...zoneProps(n, { kind: 'root', root: i }, data, { cell, tabbable: isStop(`root:${i}`) })} />)}
      <path d={view.crown} {...zoneProps(n, { kind: 'crown' }, data, { cell, tabbable: isStop('crown') })} />
    </g>
  )
})

// ── Vista oclusal ───────────────────────────────────────────────
const occTransform = (n: number, cx: number, top: number) => {
  const { sx, sy } = occlusalScale(n)
  return `translate(${cx} ${top + OCC_H / 2}) scale(${sx} ${sy}) translate(-28 -28)`
}

export const OcclusalVisual = memo(function OcclusalVisual({ n, data, cx, top }: CellProps) {
  const view = occView(toothKind(n), isUpperTooth(n))
  const { wedges, center, dividers } = occParts(view)
  const { absent, whole, wholePlanned } = look(data)
  const faceColor = (f: SurfaceKey) => (data.surfaces[f] && data.surfaces[f] !== DEFAULT_STATUS ? statusColor(data.surfaces[f]) : null)
  return (
    <g className={absent ? styles.ghost : undefined}>
      <g transform={occTransform(n, cx, top)}>
        <ToothPhoto col={view.col} row={1} base={[view.outline]} />
        {whole && <path d={view.outline} fill={statusColor(whole)} opacity={wholePlanned ? 0.12 : 0.3} />}
        {SIDE_FACES.map(f => {
          const c = faceColor(f)
          return c ? <path key={f} d={wedges[f]} clipPath={url(ODO.clipRing(view.id))} fill={c} opacity={faceOpacity(!!data.planned?.[f])} /> : null
        })}
        {faceColor('o') && <path d={center} fill={faceColor('o')!} opacity={faceOpacity(!!data.planned?.o)} />}
        <path d={dividers} clipPath={url(ODO.clipRing(view.id))} fill="none" className={styles.divider} />
        <path d={center} fill="none" className={styles.divider} />
        {data.status === 'coroa' && <path d={view.outline} fill="none" stroke={url(ODO.gold)} strokeWidth="2.6" strokeLinejoin="round" strokeDasharray={wholePlanned ? '4 3' : undefined} vectorEffect="non-scaling-stroke" />}
        {data.status === 'extracao' && <path d={view.outline} fill="none" stroke="#b91c1c" strokeWidth="1.8" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
        {data.status === 'implante' && <circle cx={view.center[0]} cy={view.center[1]} r="4.5" fill={url(ODO.steel)} stroke="#4B5563" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />}
      </g>
    </g>
  )
})

/** Zonas clicáveis da vista oclusal: as quatro faces do contorno e o centro. */
export const OcclusalHit = memo(function OcclusalHit({ n, data, cx, top, cell, tabbable, tabZone, activeFace }: CellProps & { cell: string; tabbable: boolean; tabZone?: string | null; activeFace?: SurfaceKey | null }) {
  const view = occView(toothKind(n), isUpperTooth(n))
  const { wedges, center } = occParts(view)
  const isStop = tabStop(['face:v', 'face:l', 'face:m', 'face:d', 'face:o'], OCCLUSAL_DEFAULT_ZONE, tabbable, tabZone)
  return (
    <g transform={occTransform(n, cx, top)}>
      {SIDE_FACES.map(f => (
        <path key={f} d={wedges[f]} clipPath={url(ODO.clipRing(view.id))} {...zoneProps(n, { kind: 'face', face: f }, data, { cell, tabbable: isStop(`face:${f}`), active: activeFace === f })} />
      ))}
      <path d={center} {...zoneProps(n, { kind: 'face', face: 'o' }, data, { cell, tabbable: isStop('face:o'), active: activeFace === 'o' })} />
    </g>
  )
})
