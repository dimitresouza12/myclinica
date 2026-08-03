'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { useOnboardingCounts } from '@/hooks/useClinicData'
import { getSpecialtyConfig } from '@/lib/specialtyConfig'
import type { Procedure } from '@/types'

export interface OnboardingItem {
  key: string
  label: string
  done: boolean
  href: string
  cta: string
}

// Lógica compartilhada entre o card do dashboard e o modal de boas-vindas —
// os dois mostram exatamente os mesmos itens/estado, só a apresentação muda.
export function useOnboardingItems(procedures: Procedure[], patientsCount: number) {
  const clinic = useAuthStore(s => s.clinic)
  const dismissOnboardingItem = useAuthStore(s => s.dismissOnboardingItem)
  const { data: counts } = useOnboardingCounts(clinic?.id)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const clinicalRoleLabel = getSpecialtyConfig(clinic?.type).roles.find(r => r.value !== 'recepcao' && r.value !== 'admin')?.label ?? 'profissionais'

  const activeProcedures = procedures.filter(p => p.is_active)
  const pendingPriceCount = activeProcedures.filter(p => p.price === 0 && !p.is_free).length
  const pricingDone = activeProcedures.length > 0 && pendingPriceCount === 0

  const items: OnboardingItem[] = [
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
      label: `Cadastre sua equipe (${clinicalRoleLabel.toLowerCase()})`,
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
      done: !!clinic?.logo,
      href: '/configuracoes',
      cta: 'Ir para Configurações',
    },
  ]

  const visible = clinic
    ? items.filter(i => !i.done && !(clinic.onboardingDismissed ?? []).includes(i.key))
    : []

  async function dismiss(key: string) {
    if (!clinic) return
    setSavingKey(key)
    dismissOnboardingItem(key)
    const next = Array.from(new Set([...(clinic.onboardingDismissed ?? []), key]))
    await supabase.from('clinics').update({ onboarding_dismissed: next }).eq('id', clinic.id)
    setSavingKey(null)
  }

  return { clinic, visible, dismiss, savingKey }
}
