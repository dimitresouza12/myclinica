'use client'
import { useRef, useState } from 'react'
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
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(seconds ?? 0)
  const [speed, setSpeed] = useState(1)
  const bars = waveBars(wave, seed, BAR_COUNT)
  const progress = duration > 0 ? Math.min(1, current / duration) : 0

  function toggle() {
    const a = audioRef.current
    if (!a) return
    if (a.paused) {
      // só um áudio toca por vez
      document.querySelectorAll('audio').forEach(o => { if (o !== a) o.pause() })
      void a.play().catch(() => setPlaying(false))
    } else a.pause()
  }

  function seekTo(fraction: number) {
    const a = audioRef.current
    if (!a || duration <= 0) return
    a.currentTime = Math.max(0, Math.min(duration, fraction * duration))
    setCurrent(a.currentTime)
  }

  function onBarsClick(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    seekTo((e.clientX - r.left) / r.width)
  }

  function onBarsKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowRight') { e.preventDefault(); seekTo(progress + 5 / Math.max(duration, 1)) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); seekTo(progress - 5 / Math.max(duration, 1)) }
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
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrent(0) }}
        onTimeUpdate={e => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={e => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setDuration(d) }}
      />
      <button type="button" className={styles.vpPlay} onClick={toggle} aria-label={playing ? 'Pausar áudio' : 'Tocar áudio'}>
        <Icon name={playing ? 'pause' : 'play'} size={18} />
      </button>
      <div className={styles.vpMain}>
        <div
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
          {bars.map((h, i) => (
            <span key={i} className={`${styles.vpBar} ${(i + 0.5) / BAR_COUNT <= progress ? styles.vpBarOn : ''}`} style={{ height: `${Math.round(h * 100)}%` }} />
          ))}
          <span className={styles.vpDot} style={{ left: `${progress * 100}%` }} aria-hidden="true" />
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
