'use client'
import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { useOnboardingCounts } from '@/hooks/useClinicData'
import type { Procedure } from '@/types'
import { Icon } from '@/components/ui/Icon'
import styles from './dashboard.module.css'

interface ChecklistItem {
  key: string
  label: string
  done: boolean
  href: string
  cta: string
}

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
  const clinic = useAuthStore(s => s.clinic)
  const dismissOnboardingItem = useAuthStore(s => s.dismissOnboardingItem)
  const { data: counts } = useOnboardingCounts(clinic?.id)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  if (!clinic || clinic.status !== 'trial') return null

  const activeProcedures = procedures.filter(p => p.is_active)
  const pendingPriceCount = activeProcedures.filter(p => p.price === 0 && !p.is_free).length
  const pricingDone = activeProcedures.length > 0 && pendingPriceCount === 0

  const items: ChecklistItem[] = [
    {
      key: 'pricing',
      label: activeProcedures.length === 0
        ? 'Cadastre seus procedimentos e defina os preços'
        : `Defina o preço de ${pendingPriceCount} procedimento${pendingPriceCount > 1 ? 's' : ''}`,
      done: pricingDone,
      href: '/procedimentos',
      cta: 'Ir para Procedimentos',
    },
    {
      key: 'team',
      label: 'Cadastre sua equipe (dentistas, médicos...)',
      done: (counts?.professionalsCount ?? 0) > 0,
      href: '/equipe',
      cta: 'Ir para Equipe',
    },
    {
      key: 'patients',
      label: 'Cadastre seu primeiro paciente',
      done: patientsCount > 0,
      href: '/pacientes',
      cta: 'Ir para Pacientes',
    },
    {
      key: 'appointment',
      label: 'Crie seu primeiro agendamento',
      done: (counts?.appointmentsCount ?? 0) > 0,
      href: '/agenda',
      cta: 'Ir para Agenda',
    },
    {
      key: 'logo',
      label: 'Adicione a logo da sua clínica',
      done: !!clinic.logo,
      href: '/configuracoes',
      cta: 'Ir para Configurações',
    },
  ]

  const visible = items.filter(i => !i.done && !(clinic.onboardingDismissed ?? []).includes(i.key))
  if (visible.length === 0) return null

  async function handleDismiss(key: string) {
    if (!clinic) return
    setSavingKey(key)
    dismissOnboardingItem(key)
    const next = Array.from(new Set([...(clinic.onboardingDismissed ?? []), key]))
    await supabase.from('clinics').update({ onboarding_dismissed: next }).eq('id', clinic.id)
    setSavingKey(null)
  }

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
                onClick={() => handleDismiss(item.key)}
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
