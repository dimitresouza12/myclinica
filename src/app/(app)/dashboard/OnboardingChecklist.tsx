'use client'
import Link from 'next/link'
import type { Procedure } from '@/types'
import { Icon } from '@/components/ui/Icon'
import { useOnboardingItems } from './useOnboardingItems'
import styles from './dashboard.module.css'

interface Props {
  procedures: Procedure[]
  patientsCount: number
}

// Card de "primeiros passos" no topo do dashboard. Cada item é derivado de
// dados reais (nunca fica desatualizado sozinho) — mas também pode ser
// dispensado manualmente com "Já feito", pra quem já resolveu por fora ou só
// quer parar de ver o aviso. Só aparece durante o trial: clínica antiga que
// nunca subiu logo, por exemplo, não deve ver checklist do nada meses depois.
export function OnboardingChecklist({ procedures, patientsCount }: Props) {
  const { clinic, visible, dismiss, savingKey } = useOnboardingItems(procedures, patientsCount)

  if (!clinic || clinic.status !== 'trial' || visible.length === 0) return null

  return (
    <div className={styles.onboardingCard}>
      <div className={styles.onboardingHeader}>
        <span className={styles.onboardingHeaderIcon}><Icon name="checkCircle" size={16} /></span>
        <h2 className={styles.onboardingTitle}>Primeiros passos</h2>
        <span className={styles.onboardingCount}>{visible.length}</span>
      </div>
      <div className={styles.onboardingList}>
        {visible.map(item => (
          <div key={item.key} className={styles.onboardingItem}>
            <span className={styles.onboardingItemLabel}>{item.label}</span>
            <div className={styles.onboardingItemActions}>
              <Link href={item.href} className={styles.onboardingBtnPrimary}>{item.cta}</Link>
              <button
                className={styles.onboardingBtnDone}
                onClick={() => dismiss(item.key)}
                disabled={savingKey === item.key}
              >
                {savingKey === item.key ? 'Salvando...' : 'Já feito'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
