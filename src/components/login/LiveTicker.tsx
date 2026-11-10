'use client'
import { useMemo, useState } from 'react'
import { buildDay, useShowcaseClock } from './showcaseData'
import styles from './liveTicker.module.css'

/**
 * Faixa "ao vivo" do login no celular: percorre uma lista longa de acontecimentos imaginários de uma clínica
 * (a lista muda a cada carregamento, ver showcaseData.ts). Cada um aparece, fica e sai; ao terminar a animação
 * entra o próximo. Decorativa (o leitor de tela fica com o título da página); com movimento reduzido mostra só o
 * primeiro, parado, porque a animação que avança a lista não roda.
 */
export function LiveTicker() {
  const clock = useShowcaseClock()
  const events = useMemo(() => (clock ? buildDay(clock.seed, clock.now).events : []), [clock])
  const [i, setI] = useState(0)
  const [when, what] = events.length ? events[i % events.length] : ['', '']
  return (
    <div className={styles.live} aria-hidden="true">
      <span className={styles.dot} />
      <span className={styles.label}>AO VIVO</span>
      <div className={styles.text}>
        {events.length > 0 && (
          <span key={i} onAnimationEnd={() => setI(n => n + 1)}><b>{when}</b> {what}</span>
        )}
      </div>
    </div>
  )
}
