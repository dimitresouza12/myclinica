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
  const user = useAuthStore(s => s.user)
  const dismissOnboardingItem = useAuthStore(s => s.dismissOnboardingItem)
  const { data: counts } = useOnboardingCounts(clinic?.id)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  // O checklist de fundador (procedimentos, equipe, logo...) é ação de
  // admin — um não-admin logando pela primeira vez não consegue cumprir
  // nenhum desses itens, então nem mostramos a lista pra ele.
  const isAdmin = user?.role === 'admin' || user?.isSuperAdmin
  // Cargo clínico (dentista/médico/profissional) — recepção e auxiliar não
  // contam aqui, são apoio, não quem atende o paciente na agenda.
  const clinicalRoleLabel = getSpecialtyConfig(clinic?.type).roles
    .find(r => !['recepcao', 'auxiliar', 'admin'].includes(r.value))?.label ?? 'profissionais'

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
    // Quem disse no cadastro que trabalha sozinho não precisa ver isso —
    // não faz sentido pedir pra cadastrar equipe pra quem não tem.
    ...(clinic?.founderHasTeam === false ? [] : [{
      key: 'team',
      label: `Cadastre sua equipe (${clinicalRoleLabel.toLowerCase()}) — só deixa a pessoa agendável, não cria login`,
      done: (counts?.professionalsCount ?? 0) > 0,
      href: '/equipe',
      cta: 'Ir para Equipe',
    }]),
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

  // Quem disse que tem equipe precisa dar acesso a ela — "cadastrado em 2
  // usuários" (o próprio admin conta como 1) é o sinal de que já rolou.
  if (clinic?.founderHasTeam === true) {
    const teamAccessItem: OnboardingItem = {
      key: 'team_access',
      label: 'Dê acesso ao restante da equipe',
      done: (counts?.activeUsersCount ?? 0) > 1,
      href: '/configuracoes?tab=equipe',
      cta: 'Ir para Equipe em Configurações',
    }
    // Dono que não atende (delegou tudo) provavelmente é quem vai montar a
    // clínica pra outra pessoa usar — esse item entra primeiro pra ele.
    if (clinic?.founderIsProfessional === false) items.unshift(teamAccessItem)
    else items.push(teamAccessItem)
  }

  const visible = clinic && isAdmin
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

  return { clinic, visible, dismiss, savingKey, isAdmin }
}
