'use client'
import styles from './pillTabs.module.css'

export interface PillOption<T extends string> {
  value: T
  label: string
  count?: number
}

interface Props<T extends string> {
  options: PillOption<T>[]
  value: T
  onChange: (value: T) => void
  /** nome do grupo para leitor de tela, ex.: "Período" */
  label: string
  className?: string
}

/** Seletor em pílula (período, filtros, abas de relatório). A opção ativa fica em fundo escuro. */
export function PillTabs<T extends string>({ options, value, onChange, label, className }: Props<T>) {
  return (
    <div role="group" aria-label={label} className={[styles.pills, className].filter(Boolean).join(' ')}>
      {options.map(o => {
        const on = o.value === value
        return (
          <button key={o.value} type="button" aria-pressed={on} className={on ? `${styles.pill} ${styles.on}` : styles.pill} onClick={() => onChange(o.value)}>
            {o.label}
            {o.count !== undefined && <span className={styles.count}>{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
