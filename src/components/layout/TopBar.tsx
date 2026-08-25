'use client'
import styles from './TopBar.module.css'
import type { AuthClinic } from '@/types'
import { Icon } from '@/components/ui/Icon'

interface Props {
  clinic: AuthClinic
  onMenuToggle: () => void
}

export function TopBar({ clinic, onMenuToggle }: Props) {
  return (
    <header className={styles.bar}>
      <button className={styles.menuBtn} onClick={onMenuToggle} aria-label="Menu">
        <Icon name="menu" size={20} />
      </button>
      {/* Alvo de portal — páginas podem injetar seu título aqui pra aproveitar
          a linha do menu no mobile em vez de abrir uma linha própria abaixo.
          Só vira visível em telas ≤768px (ver TopBar.module.css); em desktop
          fica sempre vazio e sem efeito, já que cada página mantém seu próprio
          cabeçalho ali. */}
      <div id="topbar-title-slot" className={styles.titleSlot} />
      <div className={styles.right}>
        {clinic.logo && (
          <img src={clinic.logo} alt={clinic.name} className={styles.logo} />
        )}
      </div>
    </header>
  )
}
