import type { ReactNode } from 'react'
import { PageTitle } from '@/components/layout/PageTitle'
import styles from './pageHeader.module.css'

interface Props {
  title: string
  subtitle?: ReactNode
  /** botões e seletores à direita; o primário por último */
  actions?: ReactNode
}

/** Cabeçalho de aba: título, linha de contexto e ações. No celular o título vai para a barra de cima (PageTitle). */
export function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <div className={styles.header}>
      <PageTitle title={title} subtitle={subtitle} />
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  )
}
