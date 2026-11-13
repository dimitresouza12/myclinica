'use client'
import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { formatDuration } from '@/lib/whatsapp/media'
import { MAX_AUDIO_MS, audioLimitLabel } from '@/lib/teamChat/attachments'
import type { LevelMeter } from './useTeamVoiceRecorder'
import styles from './ChatEquipe.module.css'

const BARS = 30

interface Props {
  /** starting: esperando o navegador liberar o microfone */
  phase: 'starting' | 'recording'
  startedAt: number | null
  /** limite de duração do formato gravado (padrão 5 minutos; 90 s no Safari) */
  maxMs?: number
  meter: LevelMeter
  onCancel: () => void
  onSend: () => void
}

/**
 * Barra de gravação no lugar do campo de escrever (como no WhatsApp): lixeira à esquerda, ponto vermelho pulsando, cronômetro,
 * barras que seguem o volume do microfone e enviar à direita. Quem desenha o volume é esta barra (re-renderiza ~12 vezes por
 * segundo), então o resto do campo de escrever não é redesenhado.
 */
export function RecordingBar({ phase, startedAt, maxMs = MAX_AUDIO_MS, meter, onCancel, onSend }: Props) {
  const [elapsed, setElapsed] = useState(0)
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0))
  const groupRef = useRef<HTMLDivElement>(null)

  // o foco vai para o grupo (não para um botão): um Enter a mais não envia nem cancela sem querer
  useEffect(() => { groupRef.current?.focus() }, [])

  useEffect(() => {
    if (startedAt === null) return
    const id = setInterval(() => setElapsed(Math.min(maxMs, Date.now() - startedAt)), 250)
    return () => clearInterval(id)
  }, [startedAt, maxMs])

  useEffect(() => meter.subscribe(level => setLevels(prev => [...prev.slice(1), level])), [meter])

  const recording = phase === 'recording'

  return (
    <div
      ref={groupRef}
      className={styles.recBar}
      role="group"
      aria-label="Gravando áudio"
      tabIndex={-1}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onCancel() } }}
    >
      <button type="button" className={styles.recCancel} onClick={onCancel} aria-label="Cancelar gravação" title="Cancelar gravação">
        <Icon name="trash" size={20} />
      </button>
      <span className={styles.recDot} aria-hidden="true" data-on={recording} />
      {/* o cronômetro é só visual (aria-live desligado): anunciar a cada segundo atrapalha; o aviso de início está no outro status */}
      <span className={styles.recTimer} role="status" aria-live="off">
        {recording ? (maxMs < MAX_AUDIO_MS ? `${formatDuration(elapsed / 1000)} / ${formatDuration(maxMs / 1000)}` : formatDuration(elapsed / 1000)) : 'Aguardando o microfone'}
      </span>
      <span className={styles.recWave} aria-hidden="true">
        {levels.map((l, i) => <span key={i} className={styles.recWaveBar} style={{ height: `${Math.round(10 + l * 90)}%` }} />)}
      </span>
      <button type="button" className={styles.send} onClick={onSend} disabled={!recording} aria-label="Enviar áudio" title="Enviar áudio">
        <Icon name="send" size={18} />
      </button>
      <span className={styles.srOnly} role="status">{recording ? `Gravando áudio. Limite de ${audioLimitLabel(maxMs)}.` : 'Aguardando a permissão do microfone.'}</span>
    </div>
  )
}
