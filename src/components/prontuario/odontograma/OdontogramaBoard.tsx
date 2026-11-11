'use client'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { DEFAULT_STATUS, isDeciduous, isUpperTooth, quadrantName, statusColor, type SurfaceKey, type ToothData } from '@/lib/odontograma'
import { bracketWires, toothKind } from '@/lib/odontogramaGeometry'
import { parseZoneToken, statusNoun, toothAlterations, type ToolDef, type Zone } from '@/lib/odontogramaTools'
import { toothPositionName } from '@/lib/odontograma'
import { ODO, url } from './OdoDefs'
import { CELL_W, FRONT_DEFAULT_ZONE, FRONT_H, FrontHit, FrontVisual, OCC_H, OCCLUSAL_DEFAULT_ZONE, OcclusalHit, OcclusalVisual, ToothPhoto, Wire, bracketPoint } from './ToothDraw'
import { frontView } from './shapes'
import styles from './odontogramaBoard.module.css'

// Linhas da grade (y do topo de cada uma, em unidades do viewBox)
const ROW_TOP = { fU: 0, oU: 118, nU: 178, nL: 204, oL: 230, fL: 290 } as const
const NUM_H = 24
const BOARD_H = ROW_TOP.fL + FRONT_H
const MID_Y = 203

const cellId = (row: number, col: number) => `${row}-${col}`
const EMPTY: ToothData = { status: DEFAULT_STATUS, surfaces: { v: 'higido', l: 'higido', m: 'higido', d: 'higido', o: 'higido' } }

export interface ArchBoardProps {
  upper: number[]
  lower: number[]
  teeth: Record<number, ToothData>
  tool: ToolDef
  selected: number | null
  /** modo histórico: dentes que aparecem no histórico ganham realce */
  touched?: Set<number>
  /** largura mínima de cada coluna em px; abaixo disso a arcada rola dentro do contêiner */
  minCol: number
  /** largura máxima de cada coluna em px: a página larga não estica os dentes (padrão: igual a minCol, conjunto centralizado) */
  maxCol?: number
  /** título da arcada, no cabeçalho */
  title: string
  label: string
  onZone(n: number, zone: Zone): void
  onNumber(n: number): void
}

/** Uma arcada completa: 5 linhas (vestibular em cima, oclusal em cima, números, oclusal embaixo, vestibular embaixo) por coluna. */
export function ArchBoard({ upper, lower, teeth, tool, selected, touched, minCol, maxCol = minCol, title, label, onZone, onNumber }: ArchBoardProps) {
  const cols = upper.length
  const W = cols * CELL_W
  const svgRef = useRef<SVGSVGElement>(null)
  const [cur, setCur] = useState({ row: 2, col: 0, zone: 'num' })
  const [hover, setHover] = useState<number | null>(null)
  // no toque não há "passar o mouse": o toque no dente mostra a mesma linha de informação por alguns segundos
  const touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (touchTimer.current) clearTimeout(touchTimer.current) }, [])
  const dataOf = (n: number) => teeth[n] ?? EMPTY
  const absent = (n: number) => dataOf(n).status === 'ausente'

  const targetOf = (e: { target: EventTarget }) => (e.target as Element).closest?.('[data-tooth]') as SVGElement | null

  const activate = useCallback((el: SVGElement) => {
    const n = Number(el.getAttribute('data-tooth'))
    const token = el.getAttribute('data-zone')
    if (token === 'num') { onNumber(n); return }
    const zone = parseZoneToken(token)
    if (zone) onZone(n, zone)
  }, [onNumber, onZone])

  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    const el = targetOf(e)
    if (!el) return
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(el); return }
    const [r, c] = (el.getAttribute('data-cell') ?? '2-0').split('-').map(Number)
    const zonesOf = (row: number, col: number) => Array.from(svgRef.current?.querySelectorAll<SVGElement>(`[data-cell="${cellId(row, col)}"]`) ?? [])
    // Page Down / Page Up andam pelas zonas (faces, raízes, coroa) do dente em foco: a célula tem uma parada de Tab só
    if (e.key === 'PageDown' || e.key === 'PageUp') {
      const zones = zonesOf(r, c)
      const i = zones.indexOf(el)
      const next = zones[i + (e.key === 'PageDown' ? 1 : -1)]
      if (!next) return
      e.preventDefault()
      next.focus()
      return
    }
    const delta: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }
    const d = delta[e.key]
    if (!d) return
    const row = Math.max(0, Math.min(5, r + d[0])), col = Math.max(0, Math.min(cols - 1, c + d[1]))
    e.preventDefault()
    // cai na mesma zona (mesma face, mesma raiz) do dente vizinho; se ela não existe lá, na zona padrão da linha
    const zones = zonesOf(row, col)
    const token = el.getAttribute('data-zone')
    const fallback = row === 0 || row === 5 ? FRONT_DEFAULT_ZONE : row === 1 || row === 4 ? OCCLUSAL_DEFAULT_ZONE : 'num'
    const next = zones.find(z => z.getAttribute('data-zone') === token) ?? zones.find(z => z.getAttribute('data-zone') === fallback) ?? zones[0]
    next?.focus()
  }

  const hoverData = hover !== null ? dataOf(hover) : null
  const hoverText = hover !== null && hoverData ? (() => {
    const marks = toothAlterations(hoverData)
    return `${hover} · ${toothPositionName(hover)} · ${quadrantName(hover)}${isDeciduous(hover) ? ' · decíduo' : ''}${marks.length ? ` · ${marks.map(statusNoun).join(', ')}` : ' · sem alteração'}`
  })() : null

  const bracketPairs = (list: number[], top: number) =>
    bracketWires(list, n => !!dataOf(n).bracket, absent).map(([a, b]) => {
      const ia = list.indexOf(a), ib = list.indexOf(b)
      const pa = bracketPoint(a, ia * CELL_W + CELL_W / 2, top), pb = bracketPoint(b, ib * CELL_W + CELL_W / 2, top)
      return { key: `${a}-${b}`, x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y }
    })
  const wiresU = bracketPairs(upper, ROW_TOP.fU)
  const wiresL = bracketPairs(lower, ROW_TOP.fL)

  const colBg = (n: number, i: number, isUpper: boolean) => {
    const state = selected === n ? 'sel' : hover === n ? 'hover' : touched?.has(n) ? 'touched' : null
    if (!state) return null
    return <rect key={`bg${n}`} className={styles.colBg} data-state={state} x={i * CELL_W + 1} y={isUpper ? 0 : MID_Y + 1} width={CELL_W - 2} height={isUpper ? MID_Y : BOARD_H - MID_Y - 1} rx="14" />
  }

  const ghostX = (n: number, i: number, isUpper: boolean) => {
    if (!absent(n)) return null
    const cx = i * CELL_W + CELL_W / 2
    const y0 = isUpper ? 14 : ROW_TOP.oL + 4
    const y1 = isUpper ? ROW_TOP.oU + OCC_H - 4 : BOARD_H - 14
    return <path key={`x${n}`} className={styles.absentX} d={`M ${cx - 17} ${y0} L ${cx + 17} ${y1} M ${cx + 17} ${y0} L ${cx - 17} ${y1}`} />
  }

  const numberCell = (n: number, i: number, rowTop: number, row: number) => {
    const cx = i * CELL_W + CELL_W / 2
    const d = dataOf(n)
    const marks = toothAlterations(d)
    const main = marks[0]
    const isSel = selected === n
    const dot = main ? statusColor(main) : d.note?.trim() ? '#0891b2' : null
    return (
      <g key={`n${n}`}>
        <rect
          className={styles.numPill} data-sel={isSel || undefined} data-marked={!!main || undefined}
          x={cx - 17} y={rowTop + 1} width="34" height={NUM_H - 2} rx={(NUM_H - 2) / 2}
          role="button" tabIndex={cur.row === row && cur.col === i ? 0 : -1}
          aria-label={`Dente ${n}, ${toothPositionName(n)}, abrir histórico e observações`}
          data-tooth={n} data-zone="num" data-cell={cellId(row, i)}
        />
        <text className={styles.numText} data-sel={isSel || undefined} x={cx} y={rowTop + NUM_H / 2 + 4.6} textAnchor="middle">{n}</text>
        {dot && <circle cx={cx + 14} cy={rowTop + 5} r="3" fill={dot} className={styles.numDot} />}
      </g>
    )
  }

  const toolStyle = { '--odo-tool': tool.color } as CSSProperties
  const minWidth = cols * minCol

  return (
    <div className={styles.archWrap} style={toolStyle}>
      <div className={styles.sideRow}>
        <span className={styles.sideLabel}>Direito do paciente</span>
        <span className={styles.archTitle} data-hover={hoverText ? 'true' : undefined} aria-hidden={hoverText ? 'true' : undefined}>{hoverText ?? title}</span>
        <span className={styles.sideLabel}>Esquerdo</span>
      </div>
      <div className={styles.scroller} data-hscroll>
        <svg
          ref={svgRef}
          className={styles.board}
          viewBox={`0 0 ${W} ${BOARD_H}`}
          style={{ minWidth, maxWidth: Math.max(minWidth, cols * maxCol) }}
          role="group"
          aria-label={`${label} Setas trocam de dente; Page Down e Page Up trocam de face ou raiz dentro do dente.`}
          data-tool={tool.key}
          onClick={e => { const el = targetOf(e); if (el) activate(el as SVGElement) }}
          onKeyDown={onKeyDown}
          onFocus={e => {
            const el = targetOf(e)
            const c = el?.getAttribute('data-cell')
            if (c) { const [row, col] = c.split('-').map(Number); const zone = el?.getAttribute('data-zone') ?? ''; setCur(p => (p.row === row && p.col === col && p.zone === zone ? p : { row, col, zone })) }
          }}
          onPointerOver={e => {
            if (e.pointerType !== 'mouse') return
            const el = targetOf(e)
            const n = el ? Number(el.getAttribute('data-tooth')) : null
            setHover(h => (h === n ? h : n))
          }}
          onPointerLeave={e => { if (e.pointerType === 'mouse') setHover(null) }}
          onPointerDown={e => {
            if (e.pointerType === 'mouse') return
            const el = targetOf(e)
            if (!el) return
            setHover(Number(el.getAttribute('data-tooth')))
            if (touchTimer.current) clearTimeout(touchTimer.current)
            touchTimer.current = setTimeout(() => setHover(null), 3500)
          }}
        >
          {/* fundo: colunas em destaque e divisórias de quadrantes */}
          <g>
            {upper.map((n, i) => colBg(n, i, true))}
            {lower.map((n, i) => colBg(n, i, false))}
            <line className={styles.midline} x1={W / 2} y1="6" x2={W / 2} y2={BOARD_H - 6} />
            <line className={styles.midlineH} x1="10" y1={MID_Y} x2={W - 10} y2={MID_Y} />
          </g>

          <g filter={url(ODO.shadow)}>
            {upper.map((n, i) => <FrontVisual key={n} n={n} data={dataOf(n)} cx={i * CELL_W + CELL_W / 2} top={ROW_TOP.fU} />)}
          </g>
          <g filter={url(ODO.shadow)}>
            {upper.map((n, i) => <OcclusalVisual key={n} n={n} data={dataOf(n)} cx={i * CELL_W + CELL_W / 2} top={ROW_TOP.oU} />)}
          </g>
          <g filter={url(ODO.shadow)}>
            {lower.map((n, i) => <OcclusalVisual key={n} n={n} data={dataOf(n)} cx={i * CELL_W + CELL_W / 2} top={ROW_TOP.oL} />)}
          </g>
          <g filter={url(ODO.shadow)}>
            {lower.map((n, i) => <FrontVisual key={n} n={n} data={dataOf(n)} cx={i * CELL_W + CELL_W / 2} top={ROW_TOP.fL} />)}
          </g>

          {/* fio ortodôntico sobre os braquetes de dentes vizinhos */}
          <g>
            {[...wiresU, ...wiresL].map(w => <Wire key={w.key} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} />)}
          </g>

          <g>{upper.map((n, i) => ghostX(n, i, true))}{lower.map((n, i) => ghostX(n, i, false))}</g>

          <g>
            {upper.map((n, i) => numberCell(n, i, ROW_TOP.nU, 2))}
            {lower.map((n, i) => numberCell(n, i, ROW_TOP.nL, 3))}
          </g>

          {/* zonas clicáveis por cima de tudo */}
          <g>
            {upper.map((n, i) => (
              <FrontHit key={`fu${n}`} n={n} data={dataOf(n)} cx={i * CELL_W + CELL_W / 2} top={ROW_TOP.fU} cell={cellId(0, i)} tabbable={cur.row === 0 && cur.col === i} tabZone={cur.row === 0 && cur.col === i ? cur.zone : null} />
            ))}
            {upper.map((n, i) => (
              <OcclusalHit key={`ou${n}`} n={n} data={dataOf(n)} cx={i * CELL_W + CELL_W / 2} top={ROW_TOP.oU} cell={cellId(1, i)} tabbable={cur.row === 1 && cur.col === i} tabZone={cur.row === 1 && cur.col === i ? cur.zone : null} />
            ))}
            {lower.map((n, i) => (
              <OcclusalHit key={`ol${n}`} n={n} data={dataOf(n)} cx={i * CELL_W + CELL_W / 2} top={ROW_TOP.oL} cell={cellId(4, i)} tabbable={cur.row === 4 && cur.col === i} tabZone={cur.row === 4 && cur.col === i ? cur.zone : null} />
            ))}
            {lower.map((n, i) => (
              <FrontHit key={`fl${n}`} n={n} data={dataOf(n)} cx={i * CELL_W + CELL_W / 2} top={ROW_TOP.fL} cell={cellId(5, i)} tabbable={cur.row === 5 && cur.col === i} tabZone={cur.row === 5 && cur.col === i ? cur.zone : null} />
            ))}
          </g>
        </svg>
      </div>
    </div>
  )
}

// ── Figuras avulsas (painel do dente, miniaturas) ───────────────
/** Dente em vista frontal, sozinho. */
export function FrontFigure({ n, data, className }: { n: number; data: ToothData; className?: string }) {
  return (
    <svg className={`${styles.fig} ${className ?? ''}`} viewBox={`0 0 ${CELL_W} ${FRONT_H}`} aria-hidden="true">
      <g filter={url(ODO.shadow)}><FrontVisual n={n} data={data} cx={CELL_W / 2} top={0} /></g>
    </svg>
  )
}

/** Dente em vista oclusal, sozinho, com as cinco faces clicáveis (a face escolhida fica marcada). */
export function OcclusalFigure({ n, data, activeFace, onFace, className }: {
  n: number; data: ToothData; activeFace: SurfaceKey | null; onFace(f: SurfaceKey): void; className?: string
}) {
  return (
    <svg
      className={`${styles.fig} ${styles.figOcc} ${className ?? ''}`} viewBox={`0 0 ${CELL_W} ${OCC_H}`} role="group" aria-label={`Faces do dente ${n}`}
      onClick={e => {
        const el = (e.target as Element).closest('[data-zone]')
        const z = parseZoneToken(el?.getAttribute('data-zone'))
        if (z?.kind === 'face') onFace(z.face)
      }}
      onKeyDown={e => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        const z = parseZoneToken((e.target as Element).getAttribute('data-zone'))
        if (z?.kind === 'face') { e.preventDefault(); onFace(z.face) }
      }}
    >
      <g filter={url(ODO.shadow)}><OcclusalVisual n={n} data={data} cx={CELL_W / 2} top={0} /></g>
      <OcclusalHit n={n} data={data} cx={CELL_W / 2} top={0} cell="p" tabbable activeFace={activeFace} />
    </svg>
  )
}

/** Miniatura da coroa (recorte da foto), para os cartões da análise e o cabeçalho do painel. */
export function ToothThumbSvg({ n, data }: { n: number; data: ToothData }) {
  const view = frontView(toothKind(n), isUpperTooth(n))
  const main = toothAlterations(data)[0]
  const ink = main && main !== 'ausente' ? statusColor(main) : 'var(--odo-line)'
  return (
    <svg viewBox="-3 -3 62 58" className={styles.thumbFig} aria-hidden="true">
      <g clipPath={url(ODO.clipCrown(view.id))}><ToothPhoto col={view.col} row={0} base={[view.crown]} /></g>
      {main && main !== 'ausente' && <path d={view.crown} fill={statusColor(main)} opacity="0.3" />}
      <path d={view.crown} fill="none" stroke={ink} strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  )
}
