'use client'
import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { Portal } from './Portal'
import styles from './selectMenu.module.css'

export interface SelectOption {
  value: string
  label: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  className?: string
}

/** Substitui <select> nativo — mesmo padrão visual do MonthPicker/DatePicker
 *  (trigger + popover via Portal) em vez do dropdown do sistema operacional,
 *  que não segue o tema do app e varia muito entre navegadores. */
export function SelectMenu({ value, onChange, options, className }: Props) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const POPOVER_HEIGHT = Math.min(options.length * 40 + 16, 280)
      const openUpward = rect.bottom + 6 + POPOVER_HEIGHT > window.innerHeight
      const top = openUpward ? rect.top - 6 - POPOVER_HEIGHT : rect.bottom + 6
      setCoords({ top: Math.max(top, 12), left: rect.left, width: rect.width })
    }
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    function handleClick(e: MouseEvent) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        popoverRef.current && !popoverRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
      document.removeEventListener('mousedown', handleClick)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const current = options.find(o => o.value === value)

  return (
    <div className={`${styles.wrap} ${className ?? ''}`}>
      <button type="button" ref={triggerRef} className={styles.trigger} onClick={() => setOpen(o => !o)}>
        <span>{current?.label ?? value}</span>
        <Icon name="chevronDown" size={14} className={styles.chevron} />
      </button>
      {open && (
        <Portal>
          <div ref={popoverRef} className={styles.popover} style={{ top: coords.top, left: coords.left, minWidth: coords.width }}>
            {options.map(o => (
              <button
                key={o.value}
                type="button"
                className={`${styles.option} ${o.value === value ? styles.optionActive : ''}`}
                onClick={() => { onChange(o.value); setOpen(false) }}
              >
                {o.label}
                {o.value === value && <Icon name="check" size={14} />}
              </button>
            ))}
          </div>
        </Portal>
      )}
    </div>
  )
}
