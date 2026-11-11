'use client'
import type { CSSProperties } from 'react'
import { TOOLS, TOOL_BY_KEY, type ToolDef, type ToolKey } from '@/lib/odontogramaTools'
import { Icon } from '@/components/ui/Icon'
import styles from './odontogramaToolbar.module.css'

/** Ícones das ferramentas (o pacote do projeto não tem ícones odontológicos). Traço de 1.7 em grade 24. */
const ICON_PATHS: Partial<Record<ToolKey, string>> = {
  select: 'M5 3l14 7-6 2-2 6z',
  carie: 'M12 3c-3 0-5 2-5 5 0 2 1 3 1 6 0 3 1.4 7 2.5 7 1 0 .8-3 1.5-3s.5 3 1.5 3c1.1 0 2.5-4 2.5-7 0-3 1-4 1-6 0-3-2-5-5-5zM12 9v3',
  restauracao: 'M5 5h14v14H5zM9 9h6v6H9z',
  canal: 'M8 3c0 6 .8 12 3 18M16 3c0 6-.8 12-3 18M12 8v8',
  pino: 'M8 3h8M12 3v18M10 9h4M10.6 13h2.8M11.2 17h1.6',
  aparelho: 'M3 12h4M17 12h4M8 7h8v10H8zM8 12h8M8 9.5h8',
  coroa: 'M4 18h16M4 18L3 7l5 4 4-6 4 6 5-4-1 11',
  ausente: 'M6 6l12 12M18 6L6 18',
  implante: 'M8 3h8M9 6.5h6M12 6.5V21M8.5 10l7 1.6M8.5 14l7 1.6M9 18l6 1.2',
  tratamento: 'M12 2a10 10 0 100 20 10 10 0 000-20zM12 6v6l4 2',
  fraturado: 'M13 2L5 14h6l-1 8 8-12h-6z',
  selante: 'M12 3c3 4 6 7 6 11a6 6 0 01-12 0c0-4 3-7 6-11z',
  extracao: 'M12 20V6M6 12l6-6 6 6M5 20h14',
  protese: 'M3 18v-5a9 9 0 0118 0v5M8 18v-5M16 18v-5M12 18v-7',
  limpar: 'M20 20H9l-5-5 9-9 7 7-6 6zM9 20l-5-5',
}

export function ToolIcon({ k, size = 18 }: { k: ToolKey; size?: number }) {
  const d = ICON_PATHS[k]
  if (!d) return <Icon name="check" size={size} />
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

interface Props {
  tool: ToolKey
  onTool(k: ToolKey): void
  planned: boolean
  onPlanned(v: boolean): void
  /** sem edição (modo histórico): só selecionar */
  readOnly?: boolean
}

const ORDER: ToolKey[] = ['select', 'carie', 'restauracao', 'canal', 'pino', 'aparelho', 'coroa', 'ausente']
const MORE: ToolKey[] = ['implante', 'tratamento', 'fraturado', 'selante', 'extracao', 'protese']

/** Barra de ferramentas clínicas, fixa no topo da arcada. A ferramenta ativa vale até trocar. */
export function ToolBar({ tool, onTool, planned, onPlanned, readOnly }: Props) {
  const active = TOOL_BY_KEY[tool]
  const btn = (t: ToolDef, small?: boolean) => {
    const on = tool === t.key
    return (
      <button
        key={t.key} type="button" aria-pressed={on} disabled={readOnly && t.key !== 'select'}
        className={`${styles.tool} ${small ? styles.toolSmall : ''} ${on ? styles.toolOn : ''}`}
        style={{ '--tool': t.color } as CSSProperties}
        onClick={() => onTool(t.key)}
      >
        <ToolIcon k={t.key} size={small ? 16 : 18} />
        <span>{t.label}</span>
      </button>
    )
  }
  return (
    <div className={styles.wrap}>
      <div className={styles.bar} role="toolbar" aria-label="Ferramentas clínicas">
        <div className={styles.tools} data-hscroll>
          {ORDER.map(k => btn(TOOL_BY_KEY[k]))}
          <span className={styles.sep} aria-hidden="true" />
          {MORE.map(k => btn(TOOL_BY_KEY[k], true))}
          <span className={styles.sep} aria-hidden="true" />
          {btn(TOOLS.find(t => t.key === 'limpar')!)}
        </div>
        <div className={styles.seg} role="group" aria-label="Situação do que for marcado">
          {([[false, 'Existente'], [true, 'A realizar']] as const).map(([v, label]) => (
            <button key={label} type="button" aria-pressed={planned === v} disabled={readOnly} className={`${styles.segBtn} ${planned === v ? styles.segOn : ''}`} onClick={() => onPlanned(v)}>{label}</button>
          ))}
        </div>
      </div>
      <p className={styles.hint} aria-live="polite" style={{ '--tool': active.color } as CSSProperties}>
        <span className={styles.hintDot} aria-hidden="true" />
        <b>{active.label}.</b> {readOnly ? 'No modo histórico só dá para escolher o dente.' : `${active.hint}${active.mode !== 'select' && active.mode !== 'limpar' && planned ? ' Será marcado como a realizar.' : ''}`}
      </p>
    </div>
  )
}
