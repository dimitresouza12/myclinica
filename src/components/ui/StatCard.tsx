import type { ReactNode } from 'react'
import { Card } from './Card'
import { Sparkline } from './Sparkline'
import styles from './statCard.module.css'

interface Delta {
  /** ex.: "+12%", "+6" */
  label: string
  /** variação ruim fica em pílula vermelha suave; o resto em pílula escura */
  bad?: boolean
  /** com ação, a pílula vira botão (ex.: "Ver produtos") */
  onClick?: () => void
}

interface Props {
  title: ReactNode
  value: ReactNode
  delta?: Delta
  /** linha de apoio embaixo do número */
  hint?: ReactNode
  spark?: { values: number[]; label: string }
  actions?: ReactNode
  /** número menor para valores longos (ex.: dinheiro) */
  compact?: boolean
  className?: string
}

/** Indicador: título, número grande em peso leve, variação em pílula e mini gráfico opcional. */
export function StatCard({ title, value, delta, hint, spark, actions, compact, className }: Props) {
  return (
    <Card title={title} actions={actions} className={[styles.stat, className].filter(Boolean).join(' ')}>
      <div className={styles.row}>
        <div className={styles.main}>
          <div className={styles.line}>
            <span className={[styles.value, compact && styles.compact].filter(Boolean).join(' ')}>{value}</span>
            {delta && (delta.onClick
              ? <button type="button" className={[styles.delta, styles.deltaBtn, delta.bad && styles.bad].filter(Boolean).join(' ')} onClick={delta.onClick}>{delta.label}</button>
              : <span className={[styles.delta, delta.bad && styles.bad].filter(Boolean).join(' ')}>{delta.label}</span>)}
          </div>
          {hint && <div className={styles.hint}>{hint}</div>}
        </div>
        {spark && <Sparkline values={spark.values} label={spark.label} className={styles.spark} />}
      </div>
    </Card>
  )
}
