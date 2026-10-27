'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { Portal } from './Portal'
import styles from './datePicker.module.css'

const WEEKDAYS_PT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const MONTHS_PT_LONG = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Props {
  value: string // 'YYYY-MM-DD' ou ''
  onChange: (value: string) => void
  className?: string
  placeholder?: string
  /** Liga o campo a um <label htmlFor> */
  id?: string
  /** Nome para leitor de tela quando não há <label> ligado */
  ariaLabel?: string
  disabled?: boolean
  /** 'YYYY-MM-DD': dias antes de min ou depois de max ficam desabilitados */
  min?: string
  max?: string
}

/** Substitui <input type="date"> pelo mesmo padrão visual do MonthPicker —
 *  popover próprio (calendário de verdade) em vez do controle nativo do
 *  navegador, que renderiza diferente em cada SO e não segue o tema do app. */
export function DatePicker({ value, onChange, className, placeholder = 'Selecionar data', id, ariaLabel, disabled = false, min, max }: Props) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  // Valida o formato antes de usar — um valor malformado (ex: datetime
  // combinado sem a parte da data ainda preenchida) não deve derrubar a
  // página inteira, só cai no placeholder como se estivesse vazio.
  const rawParsed = value ? value.split('-').map(Number) : null
  const parsed = rawParsed && rawParsed.length === 3 && rawParsed.every(n => Number.isFinite(n)) ? rawParsed : null
  const today = new Date()
  const [viewYear, setViewYear] = useState(parsed ? parsed[0] : today.getFullYear())
  const [viewMonth, setViewMonth] = useState(parsed ? parsed[1] - 1 : today.getMonth())
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const pendingDay = useRef<number | null>(null)

  useEffect(() => {
    if (!parsed) return
    setViewYear(parsed[0])
    setViewMonth(parsed[1] - 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => {
    if (!open) return
    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      // mesma largura do CSS (356 px, no máximo a tela menos 24 px)
      const POPOVER_WIDTH = Math.min(356, window.innerWidth - 24)
      const POPOVER_HEIGHT = 366
      const left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 12)
      const openUpward = rect.bottom + 6 + POPOVER_HEIGHT > window.innerHeight
      const top = openUpward ? rect.top - 6 - POPOVER_HEIGHT : rect.bottom + 6
      setCoords({ top: Math.min(Math.max(top, 12), Math.max(12, window.innerHeight - POPOVER_HEIGHT - 12)), left: Math.max(left, 12) })
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

  // O calendário vive num Portal (só existe um render depois de abrir): o foco entra por ref de callback,
  // no dia selecionado, em hoje ou no primeiro dia habilitado.
  const setGrid = useCallback((el: HTMLDivElement | null) => {
    gridRef.current = el
    if (!el) return
    const target = el.querySelector<HTMLElement>('[data-sel="1"]:not(:disabled)')
      ?? el.querySelector<HTMLElement>('[data-today="1"]:not(:disabled)')
      ?? el.querySelector<HTMLElement>('button:not(:disabled)')
    target?.focus({ preventScroll: true })
  }, [])

  // seta que cruza o mês: depois de o calendário trocar, o foco vai para o dia certo
  useEffect(() => {
    const day = pendingDay.current
    if (day === null) return
    pendingDay.current = null
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${day}"]:not(:disabled)`)?.focus()
  }, [viewMonth, viewYear])

  function closeAndFocus() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  // Esc fecha só o calendário (não o modal por trás); Tab devolve o foco ao campo; setas andam pelos dias
  function onPopoverKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeAndFocus(); return }
    if (e.key === 'Tab') { e.preventDefault(); closeAndFocus(); return }
    const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -7 : e.key === 'ArrowDown' ? 7 : 0
    if (!step) return
    const el = document.activeElement as HTMLElement | null
    const day = Number(el?.dataset.day)
    if (!day) return
    e.preventDefault()
    const target = gridRef.current?.querySelector<HTMLElement>(`[data-day="${day + step}"]:not(:disabled)`)
    if (target) { target.focus(); return }
    const dim = new Date(viewYear, viewMonth + 1, 0).getDate()
    const prevDim = new Date(viewYear, viewMonth, 0).getDate()
    pendingDay.current = step > 0 ? day + step - dim : prevDim + day + step
    changeMonth(step > 0 ? 1 : -1)
  }

  function changeMonth(delta: number) {
    let m = viewMonth + delta
    let y = viewYear
    if (m < 0) { m = 11; y -= 1 }
    if (m > 11) { m = 0; y += 1 }
    setViewMonth(m)
    setViewYear(y)
  }

  function selectDay(day: number) {
    const mm = String(viewMonth + 1).padStart(2, '0')
    const dd = String(day).padStart(2, '0')
    onChange(`${viewYear}-${mm}-${dd}`)
    closeAndFocus()
  }

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const label = parsed
    ? `${String(parsed[2]).padStart(2, '0')} de ${MONTHS_PT_LONG[parsed[1] - 1].toLowerCase()} de ${parsed[0]}`
    : placeholder

  const isTodayISO = todayISO()

  return (
    <div className={`${styles.wrap} ${className ?? ''}`}>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (open && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false) } }}
      >
        <Icon name="calendar" size={15} />
        <span className={parsed ? undefined : styles.placeholder}>{label}</span>
        <Icon name="chevronDown" size={14} className={styles.chevron} />
      </button>
      {open && (
        <Portal>
          <div ref={popoverRef} role="dialog" aria-label="Escolher data" className={styles.popover} style={{ top: coords.top, left: coords.left }} onKeyDown={onPopoverKeyDown}>
            <div className={styles.monthRow}>
              <button type="button" className={styles.navBtn} onClick={() => changeMonth(-1)} aria-label="Mês anterior">
                <Icon name="chevronLeft" size={14} />
              </button>
              <span className={styles.monthLabel}>{MONTHS_PT_LONG[viewMonth]} {viewYear}</span>
              <button type="button" className={styles.navBtn} onClick={() => changeMonth(1)} aria-label="Próximo mês">
                <Icon name="chevronRight" size={14} />
              </button>
            </div>
            <div className={styles.weekdaysRow}>
              {WEEKDAYS_PT.map((w, i) => <span key={i}>{w}</span>)}
            </div>
            <div className={styles.daysGrid} ref={setGrid}>
              {cells.map((day, i) => {
                if (day === null) return <span key={`blank-${i}`} />
                const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const isSelected = dateStr === value
                const isToday = dateStr === isTodayISO
                const outOfRange = (!!min && dateStr < min) || (!!max && dateStr > max)
                return (
                  <button
                    key={day}
                    type="button"
                    data-day={day}
                    data-sel={isSelected ? '1' : undefined}
                    data-today={isToday ? '1' : undefined}
                    disabled={outOfRange}
                    aria-pressed={isSelected}
                    aria-label={`${day} de ${MONTHS_PT_LONG[viewMonth].toLowerCase()} de ${viewYear}`}
                    className={`${styles.dayBtn} ${isSelected ? styles.dayBtnActive : ''} ${isToday && !isSelected ? styles.dayBtnToday : ''}`}
                    onClick={() => selectDay(day)}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          </div>
        </Portal>
      )}
    </div>
  )
}
