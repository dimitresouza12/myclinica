import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import styles from './emptyState.module.css'

interface Props {
  /** ícone do conjunto de Icon.tsx (opcional) */
  icon?: IconName
  title: string
  description?: ReactNode
  /** ação opcional, normalmente um <Button> */
  action?: ReactNode
  /** versão baixa, para dentro de cartões e listas pequenas */
  compact?: boolean
  className?: string
}

/** Estado vazio: o que falta, por quê, e o que fazer a seguir. */
export function EmptyState({ icon, title, description, action, compact = false, className }: Props) {
  return (
    <div className={[styles.root, compact ? styles.compact : '', className].filter(Boolean).join(' ')}>
      {icon && (
        <span className={styles.icon} aria-hidden="true">
          <Icon name={icon} size={compact ? 20 : 24} />
        </span>
      )}
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.text}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
