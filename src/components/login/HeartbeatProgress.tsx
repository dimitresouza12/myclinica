import type { CSSProperties } from 'react'
import styles from './heartbeatProgress.module.css'

/**
 * Progresso em linha de batimento: um pulso por etapa, que se desenha até a etapa atual.
 * `step` vai de 1 até `total`; `total + 1` desenha a linha inteira ("pronto"). Decorativo (aria-hidden):
 * quem informa a etapa é o texto ao lado.
 */
export function HeartbeatProgress({ total, step, className }: { total: number; step: number; className?: string }) {
  const unit = 480 / total
  const lead = Math.round(unit * 0.38)
  const tail = Math.round(unit - 24 - lead)
  // um único subtraço: o tracejado recomeça a cada "M", e o desenho precisa ser contínuo
  const d = `M0 12${`h${lead}l6-8l8 17l6-13l4 5h${tail}`.repeat(total)}`
  const visible = (s: number) => (s > total ? total : s - 1 + 0.7)
  const to = total - visible(step)
  const from = step <= 1 ? total : total - visible(step - 1)
  return (
    <svg className={`${styles.hb} ${className ?? ''}`} viewBox="0 0 480 22" preserveAspectRatio="none" aria-hidden="true">
      <path className={styles.bg} d={d} />
      <path
        key={step}
        className={styles.fg}
        pathLength={total}
        d={d}
        style={{ '--from': from, '--to': to, strokeDasharray: `${total} ${total}` } as CSSProperties}
      />
    </svg>
  )
}
