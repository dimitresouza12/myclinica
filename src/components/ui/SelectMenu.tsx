'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from './Icon'
import { Portal } from './Portal'
import styles from './selectMenu.module.css'

export interface SelectOption {
  value: string
  label: string
  /** Título do grupo: aparece uma vez, antes da primeira opção que o traz (opções do mesmo grupo ficam juntas) */
  group?: string
  disabled?: boolean
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  className?: string
  /** Liga o campo a um <label htmlFor> */
  id?: string
  /** Nome para leitor de tela quando não há <label> ligado */
  ariaLabel?: string
  disabled?: boolean
  /** Texto quando nenhuma opção bate com o valor */
  placeholder?: string
  /** `pill` (padrão): controle compacto de filtro. `field`: ocupa a largura toda, no padrão dos campos de formulário. */
  variant?: 'pill' | 'field'
}

/** Substitui <select> nativo: mesmo padrão visual do MonthPicker/DatePicker (botão + lista em Portal), em vez do
 *  menu do sistema, que não segue o tema do app e varia entre navegadores. Segue o padrão "select-only combobox":
 *  o foco fica no botão; setas, Home, End, Enter, Espaço, Esc, Tab e digitar a inicial funcionam. */
export function SelectMenu({ value, onChange, options, className, id, ariaLabel, disabled = false, placeholder = 'Selecionar', variant = 'pill' }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const typeahead = useRef({ text: '', at: 0 })
  const listId = useId()

  const selectedIndex = options.findIndex(o => o.value === value)
  const current = selectedIndex >= 0 ? options[selectedIndex] : undefined

  function openMenu() {
    if (disabled) return
    setActive(selectedIndex >= 0 ? selectedIndex : options.findIndex(o => !o.disabled))
    setOpen(true)
  }

  function choose(i: number) {
    const o = options[i]
    if (!o || o.disabled) return
    onChange(o.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  function move(from: number, step: 1 | -1): number {
    let i = from
    for (let n = 0; n < options.length; n++) {
      i = (i + step + options.length) % options.length
      if (!options[i].disabled) return i
    }
    return from
  }

  useEffect(() => {
    if (!open) return
    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const POPOVER_HEIGHT = Math.min(options.length * 44 + 16, 280)
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

  // mantém a opção destacada à vista ao navegar pelas setas
  useEffect(() => {
    if (!open || active < 0) return
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, listId])

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return
    const k = e.key
    if (!open) {
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') { e.preventDefault(); openMenu() }
      return
    }
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); return }   // fecha só a lista, não o modal por trás
    if (k === 'Tab') { setOpen(false); return }
    if (k === 'ArrowDown') { e.preventDefault(); setActive(a => move(a, 1)); return }
    if (k === 'ArrowUp') { e.preventDefault(); setActive(a => move(a, -1)); return }
    if (k === 'Home') { e.preventDefault(); setActive(options.findIndex(o => !o.disabled)); return }
    if (k === 'End') {
      e.preventDefault()
      for (let i = options.length - 1; i >= 0; i--) if (!options[i].disabled) { setActive(i); break }
      return
    }
    if (k === 'Enter' || k === ' ') { e.preventDefault(); choose(active); return }
    if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now()
      const t = typeahead.current
      t.text = now - t.at > 700 ? k.toLowerCase() : t.text + k.toLowerCase()
      t.at = now
      const from = t.text.length > 1 ? active - 1 : active
      for (let n = 1; n <= options.length; n++) {
        const i = (from + n + options.length) % options.length
        if (!options[i].disabled && options[i].label.toLowerCase().startsWith(t.text)) { setActive(i); break }
      }
    }
  }

  const shownEmpty = !current || current.value === ''

  return (
    <div className={`${styles.wrap} ${variant === 'field' ? styles.field : ''} ${className ?? ''}`}>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        className={styles.trigger}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className={shownEmpty ? styles.placeholder : undefined}>{current?.label ?? (value || placeholder)}</span>
        <Icon name="chevronDown" size={14} className={styles.chevron} />
      </button>
      {open && (
        <Portal>
          <div
            ref={popoverRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            className={styles.popover}
            style={{ top: coords.top, left: coords.left, minWidth: coords.width }}
          >
            {options.map((o, i) => {
              const header = o.group && o.group !== options[i - 1]?.group ? o.group : null
              return (
                <div key={`${o.value}-${i}`} role="presentation">
                  {header && <div role="presentation" className={styles.groupLabel}>{header}</div>}
                  <div
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={o.value === value}
                    aria-disabled={o.disabled || undefined}
                    className={`${styles.option} ${o.value === value ? styles.optionActive : ''} ${i === active ? styles.optionHover : ''} ${o.disabled ? styles.optionDisabled : ''}`}
                    onMouseEnter={() => !o.disabled && setActive(i)}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => choose(i)}
                  >
                    {o.label}
                    {o.value === value && <Icon name="check" size={14} />}
                  </div>
                </div>
              )
            })}
          </div>
        </Portal>
      )}
    </div>
  )
}
