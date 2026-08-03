'use client'
import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { Portal } from './Portal'
import { formatMonthLabel } from '@/lib/utils'
import styles from './monthPicker.module.css'

const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

interface Props {
  value: string // 'YYYY-MM'
  onChange: (value: string) => void
  className?: string
}

/** Substitui <input type="month"> — o picker nativo renderiza os segmentos
 *  de data com a fonte do sistema (parece monoespaçada) e o ícone de
 *  calendário não segue o tema teal do app. Popover próprio, mesmo padrão
 *  visual dos outros dropdowns customizados (Procedimentos/Equipe).
 *  Renderiza via Portal porque vários lugares que usam esse componente
 *  (ex: seções com overflow:hidden pra clipar cantos arredondados) cortariam
 *  um popover posicionado localmente. */
export function MonthPicker({ value, onChange, className }: Props) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const [year, month] = value.split('-').map(Number)
  const [viewYear, setViewYear] = useState(year)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setViewYear(year) }, [year])

  useEffect(() => {
    if (!open) return
    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const POPOVER_WIDTH = 220
      const POPOVER_HEIGHT = 230
      const left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 12)
      // Abre pra cima quando não sobra espaço embaixo (ex: trigger perto do
      // rodapé de um modal) — senão o popover fica cortado pela viewport.
      const openUpward = rect.bottom + 6 + POPOVER_HEIGHT > window.innerHeight
      const top = openUpward ? rect.top - 6 - POPOVER_HEIGHT : rect.bottom + 6
      setCoords({ top: Math.max(top, 12), left: Math.max(left, 12) })
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
  }, [open])

  function selectMonth(monthIndex: number) {
    onChange(`${viewYear}-${String(monthIndex + 1).padStart(2, '0')}`)
    setOpen(false)
  }

  const label = formatMonthLabel(value)

  return (
    <div className={`${styles.wrap} ${className ?? ''}`}>
      <button type="button" ref={triggerRef} className={styles.trigger} onClick={() => setOpen(o => !o)}>
        <Icon name="calendar" size={15} />
        <span>{label.charAt(0).toUpperCase() + label.slice(1)}</span>
        <Icon name="chevronDown" size={14} className={styles.chevron} />
      </button>
      {open && (
        <Portal>
          <div ref={popoverRef} className={styles.popover} style={{ top: coords.top, left: coords.left }}>
            <div className={styles.yearRow}>
              <button type="button" className={styles.yearBtn} onClick={() => setViewYear(v => v - 1)}>
                <Icon name="chevronLeft" size={14} />
              </button>
              <span className={styles.yearLabel}>{viewYear}</span>
              <button type="button" className={styles.yearBtn} onClick={() => setViewYear(v => v + 1)}>
                <Icon name="chevronRight" size={14} />
              </button>
            </div>
            <div className={styles.monthGrid}>
              {MONTHS_PT.map((m, i) => (
                <button
                  key={m}
                  type="button"
                  className={`${styles.monthBtn} ${viewYear === year && i === month - 1 ? styles.monthBtnActive : ''}`}
                  onClick={() => selectMonth(i)}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </Portal>
      )}
    </div>
  )
}
