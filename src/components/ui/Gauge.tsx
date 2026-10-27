'use client'
import { useId, type ReactNode } from 'react'
import { gaugeArc } from '@/lib/ui/charts'
import styles from './gauge.module.css'

interface Props {
  /** de 0 a 1 (valores fora disso são limitados) */
  value: number
  /** texto para leitor de tela, ex.: "Meta do mês: 68% atingido" */
  label: string
  /** número no centro da meia-lua */
  children?: ReactNode
  className?: string
}

/** Medidor em meia-lua com degradê teal e ponto no fim. */
export function Gauge({ value, label, children, className }: Props) {
  const id = useId().replace(/:/g, '')
  const g = gaugeArc(value)
  return (
    <div className={[styles.gauge, className].filter(Boolean).join(' ')}>
      <svg viewBox="0 0 200 112" role="img" aria-label={label}>
        <defs>
          <linearGradient id={`gauge-${id}`} x1="0" x2="1">
            <stop offset="0" className={styles.stopA} />
            <stop offset="1" className={styles.stopB} />
          </linearGradient>
        </defs>
        <path className={styles.track} d={g.track} />
        {g.fraction > 0 && <path className={styles.arc} d={g.arc} stroke={`url(#gauge-${id})`} />}
        <circle className={styles.knob} cx={g.end[0]} cy={g.end[1]} r={7} />
      </svg>
      {children && <div className={styles.value}>{children}</div>}
    </div>
  )
}
