// Fonte única de preço/rótulo/limite de plano. Antes disso, essa mesma
// tabela estava duplicada solta em 8 arquivos (planGates, login/page,
// ClinicEditModal, AdminClinicas, asaas/checkout, trial-expirado,
// PaymentLateBanner, configuracoes/page) — qualquer mudança de preço tinha
// que ser feita em todos, e uma cópia sempre ficava pra trás. Mesmo padrão
// de consolidação que specialtyConfig.tsx já usa pras áreas clínicas.
//
// 'avancado' (R$119,90, até 3 usuários) foi aposentado — o Completo ocupou
// o lugar dele (mesmo preço aproximado, mas limite por PROFISSIONAL, não
// por login) e um novo "Ilimitado" abriu acima. Clínicas antigas em
// 'avancado' foram migradas pra 'completo' (ver migration da Bloco C).

export type SellablePlan = 'essencial' | 'completo' | 'ilimitado' | 'completo_plus'

export interface PlanCatalogEntry {
  label: string
  price: string
  priceValue: number
  // Quantas linhas em `professionals` a clínica pode ter (com ou sem login
  // vinculado) — null = sem limite. Recepção/auxiliar não entram nessa
  // conta, só quem é de fato um profissional cadastrado.
  professionalLimit: number | null
  description: string
  color: string
}

export const PLAN_CATALOG: Record<SellablePlan, PlanCatalogEntry> = {
  essencial: {
    label: 'Essencial',
    price: 'R$ 99,90/mês',
    priceValue: 99.90,
    professionalLimit: 1,
    description: 'Agenda, prontuário e financeiro básico para 1 profissional.',
    color: '#0D9488',
  },
  completo: {
    label: 'Completo',
    price: 'R$ 129,90/mês',
    priceValue: 129.90,
    professionalLimit: 3,
    description: 'Tudo do Essencial + equipe, relatórios avançados e até 3 profissionais.',
    color: '#7c3aed',
  },
  ilimitado: {
    label: 'Ilimitado',
    price: 'R$ 169,90/mês',
    priceValue: 169.90,
    professionalLimit: null,
    description: 'Tudo do Completo + profissionais ilimitados e multi-clínica.',
    color: '#0891b2',
  },
  completo_plus: {
    label: 'Ilimitado + IA',
    price: 'R$ 199,90/mês',
    priceValue: 199.90,
    professionalLimit: null,
    description: 'Tudo do Ilimitado + atendente virtual com IA e CRM via WhatsApp.',
    color: '#F59E0B',
  },
}

export const SELLABLE_PLANS = Object.keys(PLAN_CATALOG) as SellablePlan[]

export function isSellablePlan(plan: string | null | undefined): plan is SellablePlan {
  return !!plan && plan in PLAN_CATALOG
}

// Fallback pra plano legado/desconhecido (ex: 'avancado' num registro antigo
// que ainda não foi migrado, ou 'basico'/'plus' de uma era anterior).
export function getPlanEntry(plan: string | null | undefined): PlanCatalogEntry {
  return isSellablePlan(plan) ? PLAN_CATALOG[plan] : PLAN_CATALOG.essencial
}

// Limite de profissionais efetivo pra uma clínica: override por clínica
// (clinics.max_users, mesmo campo usado hoje) vence o padrão do plano.
export function professionalLimitFor(plan: string | null | undefined, maxProfessionalsOverride: number | null | undefined): number | null {
  if (maxProfessionalsOverride != null) return maxProfessionalsOverride
  return getPlanEntry(plan).professionalLimit
}
