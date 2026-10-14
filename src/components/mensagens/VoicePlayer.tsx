'use client'
import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { formatDuration, waveBars } from '@/lib/whatsapp/media'
import styles from './Inbox.module.css'

const SPEEDS = [1, 1.5, 2]
const BAR_COUNT = 40

interface Props {
  url: string
  /** id da mensagem: dá o desenho das barras quando o áudio não traz onda */
  seed: string
  wave: string | null
  /** duração informada na mensagem (o navegador nem sempre sabe a duração de áudio gravado) */
  seconds: number | null
  /** áudio enviado por nós (cores da bolha enviada) */
  outgoing: boolean
}

/** Player de mensagem de voz no estilo do WhatsApp: botão de tocar, barrinhas que vão se preenchendo, tempo e velocidade. */
export function VoicePlayer({ url, seed, wave, seconds, outgoing }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const barsRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)
  const [playing, setPlaying] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(seconds ?? 0)
  const [speed, setSpeed] = useState(1)
  const bars = waveBars(wave, seed, BAR_COUNT)

  /** Fração tocada (0 a 1). Áudio gravado no navegador (WebM) não informa a duração: vale a da mensagem. */
  function fraction(a: HTMLAudioElement): number {
    const d = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : (seconds ?? 0)
    return d > 0 ? Math.min(1, a.currentTime / d) : 0
  }

  // O preenchimento da onda e a bolinha acompanham o áudio quadro a quadro, direto no estilo (sem renderizar o React 60 vezes por segundo).
  function paint() {
    const a = audioRef.current
    if (a && barsRef.current) barsRef.current.style.setProperty('--p', String(fraction(a)))
  }
  function startLoop() {
    cancelAnimationFrame(rafRef.current)
    const tick = () => { paint(); rafRef.current = requestAnimationFrame(tick) }
    rafRef.current = requestAnimationFrame(tick)
  }
  function stopLoop() { cancelAnimationFrame(rafRef.current); paint() }
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  function toggle() {
    const a = audioRef.current
    if (!a) return
    if (a.paused) {
      // só um áudio toca por vez
      document.querySelectorAll('audio').forEach(o => { if (o !== a) o.pause() })
      // o botão responde na hora; se o navegador recusar, volta
      setPlaying(true)
      void a.play().catch(() => setPlaying(false))
    } else a.pause()
  }

  function seekTo(frac: number) {
    const a = audioRef.current
    const d = Number.isFinite(a?.duration) && (a?.duration ?? 0) > 0 ? a!.duration : (seconds ?? duration)
    if (!a || d <= 0) return
    a.currentTime = Math.max(0, Math.min(d, frac * d))
    setCurrent(a.currentTime)
    paint()
  }

  function onBarsClick(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    seekTo((e.clientX - r.left) / r.width)
  }

  function onBarsKey(e: React.KeyboardEvent) {
    const a = audioRef.current
    const frac = a ? fraction(a) : 0
    const d = Math.max(duration, 1)
    if (e.key === 'ArrowRight') { e.preventDefault(); seekTo(frac + 5 / d) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); seekTo(frac - 5 / d) }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle() }
  }

  function cycleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]
    setSpeed(next)
    if (audioRef.current) audioRef.current.playbackRate = next
  }

  const shown = playing || current > 0 ? current : duration

  return (
    <div className={`${styles.vp} ${outgoing ? styles.vpOut : ''}`}>
      <audio
        ref={audioRef}
        src={url}
        preload="auto"
        onPlay={() => { setPlaying(true); startLoop() }}
        onPause={() => { setPlaying(false); setBuffering(false); stopLoop() }}
        onEnded={() => { setPlaying(false); setCurrent(0); stopLoop() }}
        onTimeUpdate={e => setCurrent(e.currentTarget.currentTime)}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onLoadedMetadata={e => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setDuration(d) }}
      />
      <button type="button" className={`${styles.vpPlay} ${buffering ? styles.vpBuffering : ''}`} onClick={toggle} aria-label={playing ? 'Pausar áudio' : 'Tocar áudio'}>
        <Icon name={playing ? 'pause' : 'play'} size={18} />
      </button>
      <div className={styles.vpMain}>
        <div
          ref={barsRef}
          className={styles.vpBars}
          role="slider"
          tabIndex={0}
          aria-label="Posição do áudio"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(current)}
          aria-valuetext={`${formatDuration(current)} de ${formatDuration(duration)}`}
          onClick={onBarsClick}
          onKeyDown={onBarsKey}
        >
          <span className={styles.vpLayer} aria-hidden="true">
            {bars.map((h, i) => <span key={i} className={styles.vpBar} style={{ height: `${Math.round(h * 100)}%` }} />)}
          </span>
          <span className={`${styles.vpLayer} ${styles.vpLayerOn}`} aria-hidden="true">
            {bars.map((h, i) => <span key={i} className={styles.vpBar} style={{ height: `${Math.round(h * 100)}%` }} />)}
          </span>
          <span className={styles.vpDot} aria-hidden="true" />
        </div>
        <span className={styles.vpTime}>{formatDuration(shown) || '0:00'}</span>
      </div>
      {(playing || speed !== 1) && (
        <button type="button" className={styles.vpSpeed} onClick={cycleSpeed} aria-label={`Velocidade ${speed}x. Tocar para mudar`}>
          {speed === 1.5 ? '1,5' : speed}x
        </button>
      )}
    </div>
  )
}
