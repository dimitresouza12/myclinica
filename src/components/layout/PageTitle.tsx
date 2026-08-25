'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './PageTitle.module.css'

interface Props {
  title: string
  subtitle?: ReactNode
  /** Não renderiza o bloco de desktop — usado em páginas que já têm seu
      próprio cabeçalho (Dashboard, Agenda) e só precisam do nome compacto
      no TopBar mobile, sem duplicar título nenhum no desktop. */
  mobileOnly?: boolean
}

// Título de página compartilhado: no desktop renderiza normal, no mobile
// (≤768px) é portado pro slot do TopBar (ao lado do botão de menu), pra
// aproveitar a linha que hoje fica só com o hamburguer. Ver TopBar.tsx.
export function PageTitle({ title, subtitle, mobileOnly }: Props) {
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null)
  useEffect(() => { setTitleSlot(document.getElementById('topbar-title-slot')) }, [])

  return (
    <>
      {!mobileOnly && (
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>{title}</h1>
          {subtitle && <p className={styles.sub}>{subtitle}</p>}
        </div>
      )}
      {/* Sem subtítulo aqui de propósito — no mobile os cards logo abaixo já
          mostram a mesma contagem/período, então repetir só ocupava espaço. */}
      {titleSlot && createPortal(
        <div className={styles.mobileTitleWrap}>
          <h1 className={styles.mobileTitle}>{title}</h1>
        </div>,
        titleSlot
      )}
    </>
  )
}
