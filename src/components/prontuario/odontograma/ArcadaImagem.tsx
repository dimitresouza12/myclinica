'use client'
import { useEffect, useRef, useState } from 'react'
import styles from './arcadaImagem.module.css'

export interface ToothLook { color: string | null; ghost: boolean; planned?: boolean }

// Cada vista é uma imagem (WebP, fundo transparente) e um "mapa de dentes" do mesmo tamanho (PNG em tons de
// cinza: o valor de cada pixel é o número FDI do dente ali, 0 fora). O mapa diz qual dente foi clicado e onde
// pintar a cor da condição, sem desenhar contorno à mão. Gerados a partir das imagens em
// docs/odontograma (ver README de lá).
const VIEWS = {
  frente: [{ img: '/odontograma/frente.webp', map: '/odontograma/frente-dentes.png', label: '' }],
  cima: [
    { img: '/odontograma/superior.webp', map: '/odontograma/superior-dentes.png', label: 'Superior' },
    { img: '/odontograma/inferior.webp', map: '/odontograma/inferior-dentes.png', label: 'Inferior' },
  ],
} as const

export type ArcadaView = keyof typeof VIEWS

interface Props {
  view: ArcadaView
  looks: Record<number, ToothLook>
  selected: number | null
  hovered: number | null
  zoom: number
  onPick(num: number): void
  onHover(num: number | null): void
  onUnavailable(): void
}

/** Arcada com cada dente clicável, sobre as imagens fotorrealistas. Zoom pelo controle ao lado; aproximada, arrasta para mover. */
export function ArcadaImagem({ view, looks, selected, hovered, zoom, onPick, onHover, onUnavailable }: Props) {
  const scale = 1 + zoom * 1.2
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  // ao afastar tudo, volta ao centro
  const effPan = scale <= 1.001 ? { x: 0, y: 0 } : pan

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { x: e.clientX, y: e.clientY, px: effPan.x, py: effPan.y, moved: false }
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current
    if (!d || scale <= 1.001) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 6) return
    d.moved = true
    const box = boxRef.current
    const maxX = box ? (box.clientWidth * (scale - 1)) / 2 : 0
    const maxY = box ? (box.clientHeight * (scale - 1)) / 2 : 0
    setPan({ x: Math.max(-maxX, Math.min(maxX, d.px + dx)), y: Math.max(-maxY, Math.min(maxY, d.py + dy)) })
  }
  function onPointerUp() { setTimeout(() => { drag.current = null }, 0) }
  const wasDrag = () => !!drag.current?.moved

  return (
    <div
      ref={boxRef}
      className={styles.box}
      data-zoomed={scale > 1.001}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className={`${styles.inner} ${view === 'cima' ? styles.innerPair : ''}`} style={{ transform: `translate(${effPan.x}px, ${effPan.y}px) scale(${scale})` }}>
        {VIEWS[view].map(v => (
          <figure key={v.img} className={styles.fig}>
            <ArchCanvas
              img={v.img} map={v.map} looks={looks} selected={selected} hovered={hovered}
              onPick={n => { if (!wasDrag()) onPick(n) }} onHover={onHover} onUnavailable={onUnavailable}
            />
            {v.label && <figcaption>{v.label}</figcaption>}
          </figure>
        ))}
      </div>
    </div>
  )
}

interface Loaded { w: number; h: number; base: ImageData; labels: Uint8Array; pixels: Map<number, Uint32Array>; edges: Map<number, Uint32Array> }
const cache = new Map<string, Promise<Loaded>>()

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image()
    im.decoding = 'async'
    im.onload = () => res(im)
    im.onerror = rej
    im.src = src
  })
}

/** Lê a imagem e o mapa uma vez por página e separa, para cada dente, os pixels dele e os da borda. */
function load(img: string, map: string): Promise<Loaded> {
  const key = img + map
  if (!cache.has(key)) {
    cache.set(key, Promise.all([loadImage(img), loadImage(map)]).then(([im, mp]) => {
      const w = im.naturalWidth, h = im.naturalHeight
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      const ctx = c.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('sem canvas')
      ctx.drawImage(im, 0, 0)
      const base = ctx.getImageData(0, 0, w, h)
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(mp, 0, 0, w, h)
      const raw = ctx.getImageData(0, 0, w, h).data
      const labels = new Uint8Array(w * h)
      const lists = new Map<number, number[]>()
      const edgeLists = new Map<number, number[]>()
      for (let i = 0; i < w * h; i++) {
        const v = raw[i * 4]
        labels[i] = v
      }
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x
          const v = labels[i]
          if (!v) continue
          let l = lists.get(v); if (!l) { l = []; lists.set(v, l) }
          l.push(i)
          // faixa de 2 pixels por dentro da borda do dente
          const edge = x < 2 || y < 2 || x > w - 3 || y > h - 3 ||
            labels[i - 1] !== v || labels[i + 1] !== v || labels[i - w] !== v || labels[i + w] !== v ||
            labels[i - 2] !== v || labels[i + 2] !== v || labels[i - 2 * w] !== v || labels[i + 2 * w] !== v
          if (edge) { let e = edgeLists.get(v); if (!e) { e = []; edgeLists.set(v, e) } e.push(i) }
        }
      }
      const pixels = new Map<number, Uint32Array>()
      const edges = new Map<number, Uint32Array>()
      for (const [k, v] of lists) pixels.set(k, Uint32Array.from(v))
      for (const [k, v] of edgeLists) edges.set(k, Uint32Array.from(v))
      return { w, h, base, labels, pixels, edges }
    }))
  }
  return cache.get(key)!
}

const hex = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
const TEAL = [43, 196, 169]

function ArchCanvas({ img, map, looks, selected, hovered, onPick, onHover, onUnavailable }: {
  img: string; map: string; looks: Record<number, ToothLook>; selected: number | null; hovered: number | null
  onPick(n: number): void; onHover(n: number | null): void; onUnavailable(): void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [data, setData] = useState<Loaded | null>(null)
  const latest = useRef({ onUnavailable })
  useEffect(() => { latest.current = { onUnavailable } })

  useEffect(() => {
    let alive = true
    load(img, map).then(d => { if (alive) setData(d) }).catch(() => { if (alive) latest.current.onUnavailable() })
    return () => { alive = false }
  }, [img, map])

  // pinta: parte da imagem original e só mexe nos pixels dos dentes que têm algo a mostrar
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !data) return
    if (canvas.width !== data.w) { canvas.width = data.w; canvas.height = data.h }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const out = new ImageData(new Uint8ClampedArray(data.base.data), data.w, data.h)
    const px = out.data
    for (const [num, list] of data.pixels) {
      const look = looks[num]
      const sel = num === selected, hov = num === hovered
      if (!look?.color && !look?.ghost && !sel && !hov) continue
      const tint = look?.color ? hex(look.color) : null
      for (let k = 0; k < list.length; k++) {
        const o = list[k] * 4
        if (tint) {
          // tinge sem apagar a luz e a sombra do dente: metade da cor multiplicada sobre o esmalte
          // (o que só está no plano de tratamento fica com metade da força)
          const k = look?.planned ? 0.25 : 0.5
          for (let c = 0; c < 3; c++) px[o + c] = px[o + c] * (1 - k + k * tint[c] / 255)
        }
        // passar o mouse só clareia o dente; a cor da condição não muda de matiz
        if (hov && !sel) for (let c = 0; c < 3; c++) px[o + c] = Math.min(255, px[o + c] + 16)
        if (look?.ghost && !sel) px[o + 3] = px[o + 3] * 0.18
      }
      // a realizar: borda tracejada na cor da condição
      if (look?.planned && tint && !sel && !hov) {
        const edge = data.edges.get(num)
        if (edge) for (let k = 0; k < edge.length; k++) {
          const idx = edge[k], x = idx % data.w, y = (idx - x) / data.w
          if (((x + y) >> 3) & 1) continue
          const o = idx * 4
          px[o] = tint[0]; px[o + 1] = tint[1]; px[o + 2] = tint[2]; px[o + 3] = 255
        }
      }
      // contorno: o dente sob o mouse ganha um fio claro, o selecionado um fio mais forte
      if (sel || hov) {
        const edge = data.edges.get(num)
        if (edge) for (let k = 0; k < edge.length; k++) {
          const o = edge[k] * 4
          if (sel) { px[o] = 7; px[o + 1] = 122; px[o + 2] = 105 }
          else { px[o] = TEAL[0]; px[o + 1] = TEAL[1]; px[o + 2] = TEAL[2] }
          px[o + 3] = 255
        }
      }
    }
    ctx.putImageData(out, 0, 0)
  }, [data, looks, selected, hovered])

  function toothAt(e: React.PointerEvent | React.MouseEvent): number | null {
    const canvas = canvasRef.current
    if (!canvas || !data) return null
    const r = canvas.getBoundingClientRect()
    const x = Math.floor(((e.clientX - r.left) / r.width) * data.w)
    const y = Math.floor(((e.clientY - r.top) / r.height) * data.h)
    if (x < 0 || y < 0 || x >= data.w || y >= data.h) return null
    return data.labels[y * data.w + x] || null
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ cursor: hovered !== null ? 'pointer' : undefined }}
        onClick={e => { const n = toothAt(e); if (n) onPick(n) }}
        onPointerMove={e => { if (e.pointerType === 'mouse') onHover(toothAt(e)) }}
        onPointerLeave={() => onHover(null)}
      />
      {!data && <div className={styles.loading} aria-hidden="true"><span />Carregando a arcada…</div>}
    </>
  )
}
