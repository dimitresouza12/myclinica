import type { ReactNode } from 'react'
import styles from './statusDot.module.css'

export type StatusTone = 'ok' | 'wait' | 'now' | 'warn' | 'bad' | 'idle'

interface Props {
  tone: StatusTone
  children: ReactNode
  className?: string
}

/** Status como ponto colorido com texto. O texto sempre aparece: a cor nunca fala sozinha. */
export function StatusDot({ tone, children, className }: Props) {
  return <span className={[styles.dot, styles[tone], className].filter(Boolean).join(' ')}>{children}</span>
}
