import type { ReactNode } from 'react'
import styles from './card.module.css'

interface Props {
  title?: ReactNode
  /** à direita do título: link, pílulas de período, menu "⋯" */
  actions?: ReactNode
  className?: string
  children?: ReactNode
  /** sem o respiro interno, para listas que encostam nas bordas */
  flush?: boolean
}

/** Superfície padrão das abas: branca (preta no escuro), cantos de 22px, sem borda no claro. */
export function Card({ title, actions, className, children, flush }: Props) {
  return (
    <section className={[styles.card, flush && styles.flush, className].filter(Boolean).join(' ')}>
      {(title || actions) && (
        <header className={styles.head}>
          {title && <h2 className={styles.title}>{title}</h2>}
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

interface MoreProps {
  label: string
  onClick?: () => void
  expanded?: boolean
}

/** Botão "⋯" do canto dos cartões. O menu em si fica com quem usa. */
export function MoreButton({ label, onClick, expanded }: MoreProps) {
  return (
    <button type="button" className={styles.more} aria-label={label} aria-haspopup="menu" aria-expanded={expanded} onClick={onClick}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
      </svg>
    </button>
  )
}
