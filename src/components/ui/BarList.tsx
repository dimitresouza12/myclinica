import styles from './barList.module.css'

export interface BarItem {
  label: string
  value: number
}

interface Props {
  items: BarItem[]
  format: (n: number) => string
  /** base das barras; sem isso, a soma dos itens (cada barra mostra a parcela do total) */
  total?: number
  /** texto quando não há itens */
  empty?: string
}

/** Ranking em barras finas: nome e valor numa linha, barra de 4px embaixo (categorias, procedimentos, convênios). */
export function BarList({ items, format, total, empty = 'Sem dados no período.' }: Props) {
  if (items.length === 0) return <p className={styles.empty}>{empty}</p>
  const base = total ?? items.reduce((s, i) => s + i.value, 0)
  return (
    <ul className={styles.list}>
      {items.map(i => (
        <li key={i.label}>
          <div className={styles.row}><span>{i.label}</span><b>{format(i.value)}</b></div>
          <div className={styles.track}><i style={{ width: `${base > 0 ? Math.min(100, Math.max(2, (i.value / base) * 100)) : 0}%` }} /></div>
        </li>
      ))}
    </ul>
  )
}
