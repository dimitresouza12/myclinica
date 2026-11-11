'use client'
import { useRef, useState } from 'react'
import { SLIDER_MAX, SLIDER_MIN, clampSlider, pointerToPercent, sliderKeyValue } from '@/lib/antesDepois'
import styles from './comparador.module.css'

export interface SliderSide { url: string; date: string; procedure?: string }

interface Props {
  before: SliderSide
  after: SliderSide
}

/**
 * Slider de revelação: a foto "Antes" fica por cima e é recortada da direita; arrastar (mouse/toque)
 * ou usar as setas move a divisória. Valor = % da largura em que o "Antes" aparece (0 a 100).
 */
export function ComparadorSlider({ before, after }: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [pos, setPos] = useState(50)
  const [failed, setFailed] = useState(false)

  function moveTo(clientX: number) {
    const el = stageRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos(pointerToPercent(clientX, r.left, r.width))
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    handleRef.current?.focus({ preventScroll: true })
    moveTo(e.clientX)
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (dragging.current) moveTo(e.clientX)
  }
  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    dragging.current = false
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const next = sliderKeyValue(pos, e.key, e.shiftKey)
    if (next === null) return
    e.preventDefault()
    setPos(next)
  }

  const value = Math.round(clampSlider(pos))

  return (
    <div className={styles.sliderWrap}>
      <div
        ref={stageRef}
        className={styles.stage}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* eslint-disable @next/next/no-img-element */}
        <img className={styles.img} src={after.url} alt={`Foto Depois, ${after.date}`} draggable={false} onError={() => setFailed(true)} />
        <img
          className={`${styles.img} ${styles.imgBefore}`}
          src={before.url}
          alt={`Foto Antes, ${before.date}`}
          draggable={false}
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
          onError={() => setFailed(true)}
        />
        {/* eslint-enable @next/next/no-img-element */}

        <div className={`${styles.tag} ${styles.tagBefore}`} aria-hidden="true">
          <strong>Antes</strong><span>{before.date}</span>
        </div>
        <div className={`${styles.tag} ${styles.tagAfter}`} aria-hidden="true">
          <strong>Depois</strong><span>{after.date}</span>
        </div>

        <div
          ref={handleRef}
          className={styles.handle}
          style={{ left: `${pos}%` }}
          role="slider"
          tabIndex={0}
          aria-label="Comparar Antes e Depois"
          aria-orientation="horizontal"
          aria-valuemin={SLIDER_MIN}
          aria-valuemax={SLIDER_MAX}
          aria-valuenow={value}
          aria-valuetext={`${value}% da foto Antes visível`}
          onKeyDown={onKeyDown}
        >
          <span className={styles.knob} aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l-6 6 6 6M15 6l6 6-6 6" /></svg>
          </span>
        </div>

        {failed && <p className={styles.imgError} role="alert">Não foi possível carregar uma das fotos. Feche e abra o prontuário para gerar o link de novo.</p>}
      </div>
      <p className={styles.hint}>Arraste a divisória ou use as setas do teclado (Shift para passos maiores).</p>
    </div>
  )
}
