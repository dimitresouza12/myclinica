'use client'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Portal } from '@/components/ui/Portal'
import { SearchInput } from '@/components/ui/SearchInput'
import { appointmentsLabel, countLabel, filterByName, shownCount } from '@/lib/agenda/professionalFilter'
import styles from './professionalChips.module.css'

export interface ChipProfessional { id: string; name: string; initials: string; color: string; count: number }

interface Props {
  professionals: ChipProfessional[]
  /** multi: marca quem aparece na agenda; single: um profissional por vez, para trocar a coluna */
  mode: 'multi' | 'single'
  hiddenIds?: Set<string>
  onToggle?: (id: string) => void
  /** só no modo single: profissional da coluna aberta */
  selectedId?: string | null
  onSelect?: (id: string) => void
  /** só no modo multi: volta a mostrar todos */
  onShowAll?: () => void
  /** só no modo multi: desmarca todos (a agenda fica sem profissional até marcar alguém) */
  onClearAll?: () => void
  /** só no modo multi: deixa só este profissional na agenda */
  onOnly?: (id: string) => void
}

/** Até este número de linhas os botões ficam soltos, sem popover: um botão com lista seria mais trabalho que útil. */
const SIMPLE_MAX = 3
const PANEL_WIDTH = 320
const SHEET_QUERY = '(max-width: 640px)'

/** Filtro de profissionais da agenda: um botão que abre a lista com busca (várias colunas no desktop; troca de coluna no celular). */
export function ProfessionalChips(props: Props) {
  return props.professionals.length <= SIMPLE_MAX ? <SimpleChips {...props} /> : <FilterPopover {...props} />
}

function Avatar({ p, className }: { p: ChipProfessional; className: string }) {
  return <span className={className} style={{ background: p.color }} aria-hidden="true">{p.initials}</span>
}

/** Poucos profissionais: os botões ficam à vista, como antes, mas sem faixa própria. */
function SimpleChips({ professionals, mode, hiddenIds, onToggle, selectedId, onSelect, onShowAll, onClearAll }: Props) {
  const hidden = hiddenIds ?? new Set<string>()
  const anyHidden = mode === 'multi' && professionals.some(p => hidden.has(p.id))
  const allHidden = professionals.length > 0 && professionals.every(p => hidden.has(p.id))
  return (
    <div className={styles.inline} role="group" aria-label={mode === 'multi' ? 'Profissionais na agenda' : 'Profissional da agenda'}>
      {mode === 'multi' && (
        <button type="button" className={styles.all} onClick={onShowAll} disabled={!anyHidden}>
          Todos
        </button>
      )}
      {mode === 'multi' && onClearAll && (
        <button type="button" className={styles.all} onClick={onClearAll} disabled={allHidden}>
          Nenhum
        </button>
      )}
      {professionals.map(p => {
        const on = mode === 'multi' ? !hidden.has(p.id) : selectedId === p.id
        return (
          <button
            key={p.id || 'none'}
            type="button"
            className={styles.chip}
            data-on={on}
            aria-pressed={on}
            title={mode === 'multi' ? `${on ? 'Ocultar' : 'Mostrar'} ${p.name}` : `Ver ${p.name}`}
            onClick={() => (mode === 'multi' ? onToggle?.(p.id) : onSelect?.(p.id))}
          >
            <Avatar p={p} className={styles.avatar} />
            <span className={styles.name}>{p.name}</span>
            <span className={styles.count}>{p.count}</span>
          </button>
        )
      })}
    </div>
  )
}

function FilterPopover({ professionals, mode, hiddenIds, onToggle, selectedId, onSelect, onShowAll, onClearAll, onOnly }: Props) {
  const multi = mode === 'multi'
  const hidden = useMemo(() => hiddenIds ?? new Set<string>(), [hiddenIds])
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [sheet, setSheet] = useState(false)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; maxHeight: number }>({ left: 12, top: 0, maxHeight: 400 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  // o painel só entra no DOM depois do Portal montar: o foco espera esse nó existir
  const [panelNode, setPanelNode] = useState<HTMLDivElement | null>(null)
  const setPanel = useCallback((node: HTMLDivElement | null) => { panelRef.current = node; setPanelNode(node) }, [])
  const dialogId = useId()

  // "Sem profissional" sem consulta no período não entra na conta: senão o total mudaria ao ocultá-lo
  const counted = useMemo(() => professionals.filter(p => p.id !== '' || p.count > 0), [professionals])
  const total = counted.length
  const shown = shownCount(counted, hidden)
  const filtered = multi && shown < total
  const anyHidden = professionals.some(p => hidden.has(p.id))
  const allHidden = professionals.length > 0 && professionals.every(p => hidden.has(p.id))
  const selected = professionals.find(p => p.id === selectedId) ?? professionals[0]
  const rows = useMemo(() => filterByName(professionals, query), [professionals, query])

  function close(returnFocus = true) {
    setOpen(false)
    setQuery('')
    if (returnFocus) triggerRef.current?.focus()
  }

  function openPanel() {
    setSheet(window.matchMedia(SHEET_QUERY).matches)
    setOpen(true)
  }

  // posição no desktop: embaixo do botão (ou em cima, se faltar lugar), sem passar da tela
  useEffect(() => {
    if (!open || sheet) return
    function place() {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(PANEL_WIDTH, window.innerWidth - 24)
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))
      const below = window.innerHeight - rect.bottom - 18
      const above = rect.top - 18
      if (below < 300 && above > below) setPos({ left, bottom: window.innerHeight - rect.top + 6, maxHeight: Math.min(480, above) })
      else setPos({ left, top: rect.bottom + 6, maxHeight: Math.min(480, below) })
    }
    place()
    function onScroll(e: Event) { if (!panelRef.current?.contains(e.target as Node)) place() }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', place)
    }
  }, [open, sheet])

  // clique fora e Esc
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return
      close(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  // foco: no campo de busca no desktop; no painel no celular, para não abrir o teclado sozinho
  useEffect(() => {
    if (!open) return
    if (!panelNode) return
    const el = sheet ? panelNode : panelNode.querySelector<HTMLElement>('input[type="search"]')
    el?.focus({ preventScroll: true })
  }, [open, sheet, panelNode])

  // Tab não sai do painel enquanto ele está aberto
  function onPanelKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? [])
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === panelRef.current)) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
  }

  const triggerLabel = multi ? 'Profissionais' : selected?.name ?? 'Profissional'

  return (
    <div className={styles.popWrap}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        data-active={filtered}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-label={multi ? `Profissionais: ${countLabel(shown, total)} na agenda` : `Profissional da agenda: ${triggerLabel}`}
        onClick={() => (open ? close() : openPanel())}
      >
        {multi ? <Icon name="filter" size={15} aria-hidden="true" /> : selected && <Avatar p={selected} className={styles.triggerAvatar} />}
        <span className={styles.triggerText}>{triggerLabel}</span>
        {multi && <span className={styles.triggerCount}>{countLabel(shown, total)}</span>}
        <Icon name="chevronDown" size={14} className={styles.chevron} aria-hidden="true" />
      </button>

      {open && (
        <Portal>
          {sheet && <div className={styles.backdrop} onClick={() => close()} aria-hidden="true" />}
          <div
            ref={setPanel}
            id={dialogId}
            role="dialog"
            aria-label={multi ? 'Filtrar profissionais da agenda' : 'Escolher profissional da agenda'}
            tabIndex={-1}
            className={sheet ? styles.sheet : styles.panel}
            style={sheet ? undefined : { left: pos.left, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight, width: Math.min(PANEL_WIDTH, window.innerWidth - 24) }}
            onKeyDown={onPanelKeyDown}
          >
            <div className={styles.head}>
              <strong className={styles.title}>{multi ? 'Profissionais na agenda' : 'Profissional da agenda'}</strong>
              {multi && <span className={styles.headCount}>{countLabel(shown, total)}</span>}
            </div>
            <div className={styles.search}>
              <SearchInput value={query} onChange={setQuery} placeholder="Buscar profissional" />
            </div>

            {multi && (
              <div className={styles.bulk}>
                <button type="button" className={styles.bulkBtn} onClick={onShowAll} disabled={!anyHidden}>Mostrar todos</button>
                <button type="button" className={styles.bulkBtn} onClick={onClearAll} disabled={allHidden || !onClearAll}>Desmarcar todos</button>
              </div>
            )}

            <ul className={styles.list} role={multi ? 'list' : 'radiogroup'} aria-label="Profissionais">
              {rows.length === 0 && <li className={styles.empty}>Nenhum profissional encontrado</li>}
              {rows.map(p => {
                const on = multi ? !hidden.has(p.id) : selectedId === p.id
                const info = (
                  <>
                    <Avatar p={p} className={styles.rowAvatar} />
                    <span className={styles.who}>
                      <span className={styles.rowName}>{p.name}</span>
                      <span className={styles.rowCount}>{appointmentsLabel(p.count)}</span>
                    </span>
                  </>
                )
                return (
                  <li key={p.id || 'none'} className={styles.row} data-on={on} data-off={multi && !on} role={multi ? undefined : 'presentation'}>
                    {multi ? (
                      <>
                        <label className={styles.rowMain}>
                          <input type="checkbox" className={styles.check} checked={on} onChange={() => onToggle?.(p.id)} />
                          <span className={styles.box} aria-hidden="true" />
                          {info}
                        </label>
                        {onOnly && (
                          <button type="button" className={styles.only} onClick={() => onOnly(p.id)} aria-label={`Mostrar só ${p.name}`}>
                            Só este
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={on}
                        className={styles.rowMain}
                        onClick={() => { onSelect?.(p.id); close() }}
                      >
                        {info}
                        {on && <Icon name="check" size={16} className={styles.tick} aria-hidden="true" />}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>

            <div className={styles.foot}>
              <button type="button" className={styles.footDone} onClick={() => close()}>Concluir</button>
            </div>
          </div>
        </Portal>
      )}
    </div>
  )
}
