'use client'
import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Portal } from '@/components/ui/Portal'
import styles from '@/components/ui/moreMenu.module.css'

interface Props {
  /** botão da foto: o menu abre logo abaixo dele */
  anchorRef: React.RefObject<HTMLElement | null>
  onChange: () => void
  onRemove: () => void
  onClose: () => void
}

const ITEM_H = 44
const PAD = 12
const COUNT = 2

/** Menu da foto do paciente (Trocar foto / Remover foto). Abre num Portal, ancorado ao botão da foto. */
export function AvatarMenu({ anchorRef, onChange, onRemove, onClose }: Props) {
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function place() {
      const r = anchorRef.current?.getBoundingClientRect()
      if (!r) return
      const h = COUNT * ITEM_H + PAD
      const up = r.bottom + 6 + h > window.innerHeight
      const maxLeft = window.innerWidth - 188
      setPos({ top: Math.max(up ? r.top - 6 - h : r.bottom + 6, 12), left: Math.max(Math.min(r.left, maxLeft), 12) })
    }
    place()
    function outside(e: MouseEvent) {
      const t = e.target as Node
      if (!anchorRef.current?.contains(t) && !menuRef.current?.contains(t)) onClose()
    }
    function key(e: KeyboardEvent) { if (e.key === 'Escape') { onClose(); anchorRef.current?.focus() } }
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
  }, [anchorRef, onClose])

  return (
    <Portal>
      <div ref={menuRef} role="menu" aria-label="Foto do paciente" className={styles.menu} style={{ top: pos.top, left: pos.left }}>
        <button type="button" role="menuitem" className={styles.item} onClick={onChange}>
          <Icon name="camera" size={15} />
          Trocar foto
        </button>
        <button type="button" role="menuitem" className={`${styles.item} ${styles.danger}`} onClick={onRemove}>
          <Icon name="trash" size={15} />
          Remover foto
        </button>
      </div>
    </Portal>
  )
}
