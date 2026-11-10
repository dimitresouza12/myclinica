import type { ReactNode } from 'react'
import styles from './badge.module.css'

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand'

interface Props {
  tone?: BadgeTone
  children: ReactNode
  /** ponto colorido antes do texto (padrão true). A cor nunca fala sozinha: o texto é obrigatório */
  dot?: boolean
  className?: string
}

/** Etiqueta compacta de status ou categoria. Mesma linguagem do StatusDot, em pílula com fundo suave. */
export function Badge({ tone = 'neutral', children, dot = true, className }: Props) {
  return (
    <span className={[styles.badge, styles[tone], dot ? styles.withDot : '', className].filter(Boolean).join(' ')}>
      {children}
    </span>
  )
}
