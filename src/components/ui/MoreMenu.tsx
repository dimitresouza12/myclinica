'use client'
import { useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from './Icon'
import { Portal } from './Portal'
import card from './card.module.css'
import styles from './moreMenu.module.css'

export interface MoreMenuItem {
  label: string
  icon?: IconName
  onClick: () => void
  /** ação destrutiva: texto em vermelho */
  danger?: boolean
}

interface Props {
  /** nome do botão para leitor de tela, ex.: "Ações de Ana Souza" */
  label: string
  items: MoreMenuItem[]
}

const ITEM_H = 44
const PAD = 12

/** Botão "⋯" com menu de ações. O menu abre num Portal, então não é cortado por tabelas com rolagem. */
export function MoreMenu({ label, items }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function place() {
      const r = triggerRef.current?.getBoundingClientRect()
      if (!r) return
      const h = items.length * ITEM_H + PAD
      const up = r.bottom + 6 + h > window.innerHeight
      setPos({ top: Math.max(up ? r.top - 6 - h : r.bottom + 6, 12), right: Math.max(window.innerWidth - r.right, 12) })
    }
    place()
    function outside(e: MouseEvent) {
      const t = e.target as Node
      if (!triggerRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false)
    }
    function key(e: KeyboardEvent) { if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus() } }
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', key)
    }
  }, [open, items.length])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={card.more}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
      {open && (
        <Portal>
          <div ref={menuRef} role="menu" className={styles.menu} style={{ top: pos.top, right: pos.right }}>
            {items.map(it => (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                className={it.danger ? `${styles.item} ${styles.danger}` : styles.item}
                onClick={() => { setOpen(false); it.onClick() }}
              >
                {it.icon && <Icon name={it.icon} size={15} />}
                {it.label}
              </button>
            ))}
          </div>
        </Portal>
      )}
    </>
  )
}
