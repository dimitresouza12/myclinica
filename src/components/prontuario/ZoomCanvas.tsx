'use client'
// Tela cheia com zoom para marcar o faceograma e o corpograma com precisão.
//
// É só uma visão maior do MESMO estado: quem usa passa o desenho (children), o painel de ferramentas (panel)
// e duas funções, selecionar um ponto existente e marcar um novo. Todas as coordenadas que saem daqui estão no
// viewBox do desenho (o mesmo sistema dos pontos já gravados); a conversão pixel -> viewBox usa a inversa
// da transformação de zoom/pan (src/lib/zoomView.ts).
//
// Toque: um toque curto posiciona uma mira e "Marcar aqui" confirma (assim o dedo não esconde o ponto e dá
// para ajustar antes de fixar). Um dedo arrastando faz pan, dois dedos fazem pinça, toque duplo dá zoom.
// Mouse: clique marca direto (com ~0,25 s de espera para distinguir do duplo clique), arrastar faz pan, roda dá zoom.
// touch-action: none vale SÓ no quadro do desenho (.viewport), nunca em regra ampla.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Portal } from '@/components/ui/Portal'
import { Icon } from '@/components/ui/Icon'
import { useScrollLock } from '@/hooks/useScrollLock'
import {
  centerOf, distance, fitFrame, fitView, insideBox, markerScale, panBy, pinchView, pxPerUnit, refitView,
  roundCoord, screenToViewBox, viewBoxToScreen, visibleViewBox, zoomAt, zoomToRect, MAX_ZOOM, MIN_ZOOM,
  type Frame, type Pt, type Rect, type View,
} from '@/lib/zoomView'
import styles from './ZoomCanvas.module.css'

export interface ZoomShortcut { key: string; label: string; rect: Rect }

export interface ZoomCtx {
  /** Escala dos marcadores: multiplique o tamanho de cada marcador por isto (mantém o tamanho visual em qualquer zoom). */
  k: number
  /** Pixels da tela por unidade do viewBox. */
  ppu: number
  /** clientX/clientY de um evento -> coordenada do viewBox (para arrastar um ponto). */
  toViewBox: (clientX: number, clientY: number) => Pt
}

interface ZoomCanvasProps {
  open: boolean
  onClose: () => void
  /** Nome da janela, para leitor de tela e para o título da barra. */
  title: string
  vw: number
  vh: number
  /** Tamanho desejado dos marcadores, em pixels da tela por unidade do viewBox. */
  markerPx: number
  /** Raio de toque para pegar um ponto existente, em pixels. */
  hitPx?: number
  shortcuts?: ZoomShortcut[]
  /** Muda quando o desenho troca (ex.: Frente para Costas): volta para "Ajustar". */
  resetKey?: string
  /** Ferramentas e editor do ponto (o mesmo estado da tela normal). */
  panel: ReactNode
  /** Toque ou clique em (x, y): devolve true se pegou um ponto existente (selecionou ou fechou a seleção). */
  onSelectAt: (x: number, y: number, radius: number) => boolean
  /** Marcar um ponto novo em (x, y), com uma casa decimal. */
  onPlace: (x: number, y: number) => void
  /** O conteúdo do SVG (imagem e marcadores), em coordenadas do viewBox. */
  children: (ctx: ZoomCtx) => ReactNode
}

/** Botão que abre a tela cheia. Fica no canto do desenho: o pai precisa de position: relative. */
export function ExpandButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={styles.expand} onClick={onClick}
      aria-label="Abrir em tela cheia para marcar com mais precisão" title="Tela cheia">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
      </svg>
      <span>Tela cheia</span>
    </button>
  )
}

// o conteúdo do SVG é renderizado aqui, como componente, para que o ctx chegue como props
function Slot({ render, ctx }: { render: (ctx: ZoomCtx) => ReactNode; ctx: ZoomCtx }) {
  return <>{render(ctx)}</>
}

export function ZoomCanvas(props: ZoomCanvasProps) {
  if (!props.open) return null
  return <Portal><Overlay {...props} /></Portal>
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const SLOP = { touch: 8, other: 5, owned: 5 }
const DOUBLE_TAP_MS = 320
const DOUBLE_TAP_PX = 30
const MOUSE_COMMIT_MS = 260
const PAD = 8

type Gesture =
  | { mode: 'none' }
  | { mode: 'single'; id: number; sx: number; sy: number; view: View; moved: boolean; owned: boolean; type: string; t0: number }
  | { mode: 'pinch'; start: { view: View; mid: Pt; dist: number } }

interface Pending { x: number; y: number; touch: boolean }

function Overlay(props: ZoomCanvasProps) {
  const { onClose, title, vw, vh, markerPx, hitPx = 20, shortcuts, resetKey, panel, children } = props
  useScrollLock(true)

  const overlayRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [frame, setFrame] = useState<Frame>({ cw: 0, ch: 0, bw: 0, bh: 0 })
  const [view, setView] = useState<View>({ s: 1, x: 0, y: 0 })
  const [pending, setPendingState] = useState<Pending | null>(null)
  const [panning, setPanning] = useState(false)

  // espelhos para os manipuladores de evento (que rodam fora do ciclo de render)
  const frameRef = useRef(frame)
  const viewRef = useRef(view)
  const pendingRef = useRef<Pending | null>(null)
  const propsRef = useRef(props)
  const ptrs = useRef(new Map<number, Pt>())
  const gesture = useRef<Gesture>({ mode: 'none' })
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null)
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => { propsRef.current = props })

  const apply = useCallback((v: View) => { viewRef.current = v; setView(v) }, [])
  const setPending = useCallback((p: Pending | null) => { pendingRef.current = p; setPendingState(p) }, [])
  const stopTimer = useCallback(() => { if (commitTimer.current) { clearTimeout(commitTimer.current); commitTimer.current = null } }, [])
  useEffect(() => stopTimer, [stopTimer])

  // mede o quadro e acompanha mudanças de tamanho (girar o aparelho, abrir o editor do ponto)
  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      const next = fitFrame(r.width, r.height, vw, vh, PAD)
      const prev = frameRef.current
      frameRef.current = next
      setFrame(next)
      apply(prev.bw > 0 ? refitView(viewRef.current, prev, next) : fitView(next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [vw, vh, apply])

  // trocar de desenho (Frente/Costas) volta para "Ajustar" e some com a mira
  const firstReset = useRef(true)
  useEffect(() => {
    if (firstReset.current) { firstReset.current = false; return }
    stopTimer(); lastTap.current = null
    setPending(null)
    apply(fitView(frameRef.current))
  }, [resetKey, apply, setPending, stopTimer])

  // foco entra na janela e volta para quem abriu; Esc fecha; Tab não escapa da janela
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    overlayRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (document.querySelector('[role="alertdialog"]')) return
      if (e.key === 'Escape') { e.stopPropagation(); propsRef.current.onClose(); return }
      if (e.key !== 'Tab') return
      const root = overlayRef.current
      if (!root) return
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null)
      if (items.length === 0) { e.preventDefault(); return }
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); opener?.focus?.() }
  }, [])

  const local = useCallback((clientX: number, clientY: number): Pt => {
    const r = viewportRef.current!.getBoundingClientRect()
    return { x: clientX - r.left, y: clientY - r.top }
  }, [])

  const toViewBox = useCallback((clientX: number, clientY: number): Pt => {
    const p = local(clientX, clientY)
    return screenToViewBox(viewRef.current, frameRef.current, vw, p.x, p.y)
  }, [local, vw])

  // roda do mouse e pinça do trackpad (ctrl + roda): precisa de listener nativo para poder cancelar o scroll
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const p = local(e.clientX, e.clientY)
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      const factor = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0018))
      apply(zoomAt(viewRef.current, p.x, p.y, viewRef.current.s * factor, frameRef.current))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [apply, local])

  function commitPending() {
    stopTimer()
    const p = pendingRef.current
    if (!p) return
    setPending(null)
    propsRef.current.onPlace(p.x, p.y)
  }

  function zoomStep(factor: number) {
    const f = frameRef.current
    apply(zoomAt(viewRef.current, f.cw / 2, f.ch / 2, viewRef.current.s * factor, f))
  }

  function tap(p: Pt, type: string) {
    const f = frameRef.current, v = viewRef.current
    const pt = screenToViewBox(v, f, vw, p.x, p.y)
    if (!insideBox(pt, vw, vh)) return
    if (propsRef.current.onSelectAt(pt.x, pt.y, hitPx / pxPerUnit(v, f, vw))) {
      stopTimer(); setPending(null); lastTap.current = null
      return
    }
    const now = performance.now()
    const lt = lastTap.current
    if (lt && now - lt.t < DOUBLE_TAP_MS && Math.hypot(lt.x - p.x, lt.y - p.y) < DOUBLE_TAP_PX) {
      // toque duplo: amplia (ou volta ao ajuste se já está bem perto) sem marcar nada
      lastTap.current = null
      stopTimer()
      if (type !== 'touch') setPending(null)
      apply(v.s < 3 ? zoomAt(v, p.x, p.y, 3, f) : fitView(f))
      return
    }
    lastTap.current = { t: now, x: p.x, y: p.y }
    const touch = type === 'touch'
    setPending({ x: roundCoord(pt.x), y: roundCoord(pt.y), touch })
    stopTimer()
    if (!touch) commitTimer.current = setTimeout(commitPending, MOUSE_COMMIT_MS)
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const own = (e.target as Element).closest?.('[data-zc-drag]')?.getAttribute('data-zc-drag')
    // o ponto arrastável (faceograma) cuida do próprio arraste; aqui só não se deixa panoramizar por baixo dele
    const owned = own === 'all' || (own === 'mouse' && e.pointerType !== 'touch')
    const p = local(e.clientX, e.clientY)
    ptrs.current.set(e.pointerId, p)
    if (ptrs.current.size === 1) {
      gesture.current = { mode: 'single', id: e.pointerId, sx: p.x, sy: p.y, view: viewRef.current, moved: false, owned, type: e.pointerType, t0: performance.now() }
    } else if (ptrs.current.size === 2 && gesture.current.mode === 'single' && !gesture.current.owned && !owned) {
      const [a, b] = [...ptrs.current.values()]
      gesture.current = { mode: 'pinch', start: { view: viewRef.current, mid: centerOf(a, b), dist: distance(a, b) } }
      stopTimer(); lastTap.current = null
      setPanning(true)
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!ptrs.current.has(e.pointerId)) return
    const p = local(e.clientX, e.clientY)
    ptrs.current.set(e.pointerId, p)
    const g = gesture.current
    if (g.mode === 'pinch') {
      const [a, b] = [...ptrs.current.values()]
      apply(pinchView(g.start, centerOf(a, b), distance(a, b), frameRef.current))
      return
    }
    if (g.mode !== 'single' || g.id !== e.pointerId) return
    if (!g.moved) {
      const slop = g.owned ? SLOP.owned : g.type === 'touch' ? SLOP.touch : SLOP.other
      if (Math.hypot(p.x - g.sx, p.y - g.sy) < slop) return
      g.moved = true
      stopTimer()
      if (!g.owned) {
        setPanning(true)
        if (g.type !== 'touch') { try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* sem captura, o arraste segue enquanto o ponteiro estiver sobre o quadro */ } }
      }
    }
    if (g.owned) return
    apply(panBy(g.view, p.x - g.sx, p.y - g.sy, frameRef.current))
  }

  function endPointer(e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) {
    if (!ptrs.current.has(e.pointerId)) return
    const p = local(e.clientX, e.clientY)
    ptrs.current.delete(e.pointerId)
    const g = gesture.current
    if (g.mode === 'pinch') {
      if (ptrs.current.size === 1) {
        // sobrou um dedo: segue como pan, sem contar como toque
        const [id, pt] = [...ptrs.current.entries()][0]
        gesture.current = { mode: 'single', id, sx: pt.x, sy: pt.y, view: viewRef.current, moved: true, owned: false, type: 'touch', t0: performance.now() }
      } else {
        gesture.current = { mode: 'none' }
        setPanning(false)
      }
      return
    }
    if (g.mode === 'single' && g.id === e.pointerId) {
      gesture.current = { mode: 'none' }
      setPanning(false)
      if (!cancelled && !g.moved && performance.now() - g.t0 < 600) tap(p, g.type)
    }
  }

  function onOverlayKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement
    if (t.closest('input, textarea, select, [contenteditable="true"]')) return
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomStep(1.5) }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomStep(1 / 1.5) }
    else if (e.key === '0') { e.preventDefault(); apply(fitView(frameRef.current)) }
    else if (e.key === 'Enter' && pendingRef.current && (t === e.currentTarget)) { e.preventDefault(); commitPending() }
  }

  const ready = frame.bw > 0
  const ppu = ready ? pxPerUnit(view, frame, vw) : 1
  const vb = ready ? visibleViewBox(view, frame, vw) : { x: 0, y: 0, w: vw, h: vh }
  const ctx: ZoomCtx = { k: markerScale(ppu, markerPx), ppu, toViewBox }
  const reticle = pending && ready ? viewBoxToScreen(view, frame, vw, pending.x, pending.y) : null

  return (
    <div ref={overlayRef} className={styles.overlay} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
      onKeyDown={onOverlayKeyDown}>
      <header className={styles.bar}>
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.zoomCtl} role="group" aria-label="Zoom">
          <button type="button" className={styles.iconBtn} onClick={() => zoomStep(1 / 1.5)} disabled={view.s <= MIN_ZOOM + 1e-6}
            aria-label="Diminuir o zoom" title="Diminuir o zoom"><Icon name="minus" size={18} /></button>
          <span className={styles.zoomPct} aria-live="polite">{Math.round(view.s * 100)}%</span>
          <button type="button" className={styles.iconBtn} onClick={() => zoomStep(1.5)} disabled={view.s >= MAX_ZOOM - 1e-6}
            aria-label="Aumentar o zoom" title="Aumentar o zoom"><Icon name="plus" size={18} /></button>
          <button type="button" className={styles.textBtn} onClick={() => apply(fitView(frameRef.current))}
            title="Mostrar o desenho inteiro" aria-label="Ajustar: mostrar o desenho inteiro">Ajustar</button>
        </div>
        <button type="button" className={`${styles.textBtn} ${styles.closeBtn}`} onClick={onClose} aria-label="Fechar tela cheia" title="Fechar (Esc)">
          <Icon name="close" size={16} /> Fechar
        </button>
      </header>

      <div className={styles.body}>
        <div className={styles.stage}>
          {shortcuts && shortcuts.length > 0 && (
            <div className={styles.chips} data-hscroll role="group" aria-label="Ir para a região">
              {shortcuts.map(s => (
                <button key={s.key} type="button" className={styles.chip}
                  aria-label={`Ampliar ${s.label}`}
                  onClick={() => { stopTimer(); apply(zoomToRect(s.rect, frameRef.current, vw, vh)) }}>
                  {s.label}
                </button>
              ))}
            </div>
          )}

          <div className={styles.viewportWrap}>
            <div ref={viewportRef}
              className={`${styles.viewport} ${panning ? styles.panning : ''}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={e => endPointer(e, false)}
              onPointerCancel={e => endPointer(e, true)}
              // os toques são tratados nos eventos de ponteiro acima; o clique nativo só duplicaria a ação
              onClickCapture={e => { e.stopPropagation(); e.preventDefault() }}
              onContextMenu={e => e.preventDefault()}>
              {ready && (
                <svg className={styles.svg} width={frame.cw} height={frame.ch}
                  viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}>
                  <Slot render={children} ctx={ctx} />
                </svg>
              )}
            </div>
            {reticle && pending && (
              <span className={styles.reticle} style={{ left: reticle.x, top: reticle.y }} aria-hidden="true" />
            )}
            <p className={styles.hint} aria-hidden="true">
              <span className={styles.hintFine}>Clique para marcar · arraste para mover · roda ou + e − para ampliar · duplo clique amplia</span>
              <span className={styles.hintCoarse}>Toque para mirar · arraste move · pinça amplia</span>
            </p>
            {pending?.touch && (
              <div className={styles.confirm} role="group" aria-label="Confirmar a marcação">
                <button type="button" className={styles.confirmOk} onClick={commitPending}>Marcar aqui</button>
                <button type="button" className={styles.confirmNo} onClick={() => setPending(null)}>Cancelar</button>
              </div>
            )}
          </div>
        </div>

        <div className={styles.panel}>{panel}</div>
      </div>
    </div>
  )
}

