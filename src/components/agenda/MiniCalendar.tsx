'use client'
import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { localDayKey } from '@/lib/dashboard/metrics'
import { monthGrid } from '@/lib/agenda/view'
import styles from './miniCalendar.module.css'

interface Props {
  /** mês exibido de início; para seguir o foco da agenda, troque a `key` do componente */
  month: Date
  /** período em destaque [início, fim); nulo na visão Mês */
  highlight: { start: Date; end: Date } | null
  /** dias (AAAA-MM-DD) com consulta: ganham um ponto */
  marked: Set<string>
  onPick: (day: Date) => void
}

const DOW = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

/** Calendário do mês com ponto nos dias com consulta. Navegar nos meses aqui não muda a agenda; clicar num dia, sim. */
export function MiniCalendar({ month, highlight, marked, onPick }: Props) {
  const [shown, setShown] = useState(() => new Date(month.getFullYear(), month.getMonth(), 1))
  const days = monthGrid(shown.getFullYear(), shown.getMonth())
  const todayKey = localDayKey(new Date())
  const hs = highlight?.start.getTime() ?? 0
  const he = highlight?.end.getTime() ?? 0
  const label = shown.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const step = (n: number) => setShown(s => new Date(s.getFullYear(), s.getMonth() + n, 1))

  return (
    <div className={styles.cal}>
      <div className={styles.head}>
        <h3 className={styles.title}>{label}</h3>
        <div className={styles.nav}>
          <button type="button" className={styles.navBtn} onClick={() => step(-1)} aria-label="Mês anterior"><Icon name="chevronLeft" size={14} /></button>
          <button type="button" className={styles.navBtn} onClick={() => step(1)} aria-label="Próximo mês"><Icon name="chevronRight" size={14} /></button>
        </div>
      </div>
      <div className={styles.grid} role="grid" aria-label={label}>
        {DOW.map((d, i) => <span key={i} className={styles.dow} aria-hidden="true">{d}</span>)}
        {days.map(d => {
          const key = localDayKey(d)
          const inMonth = d.getMonth() === shown.getMonth()
          const t = d.getTime()
          const inRange = !!highlight && t >= hs && t < he
          const cls = [styles.day, !inMonth && styles.out, inRange && styles.on, key === todayKey && styles.today].filter(Boolean).join(' ')
          return (
            <button key={key} type="button" className={cls} onClick={() => onPick(d)}
              aria-label={`${d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}${marked.has(key) ? ', com consultas' : ''}`}
              aria-current={key === todayKey ? 'date' : undefined}>
              <span>{d.getDate()}</span>
              {marked.has(key) && <i className={styles.dot} aria-hidden="true" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
