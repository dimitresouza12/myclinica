// Planos que incluem integrações WhatsApp / CRM / IA
const WHATSAPP_PLANS = ['completo_plus'] as const

export function hasWhatsApp(plan: string | null | undefined): boolean {
  return WHATSAPP_PLANS.includes(plan as typeof WHATSAPP_PLANS[number])
}

// Espelha o default do trigger enforce_clinic_user_limit() no banco —
// null = ilimitado. Usado só para dar a mensagem certa antes de chamar a
// RPC; quem garante o limite de verdade é o trigger.
const PLAN_DEFAULT_USERS: Record<string, number | null> = {
  essencial: 1,
  basico: 1,
  avancado: 3,
  completo: null,
  completo_plus: null,
  plus: null,
}

export function userLimitFor(plan: string | null | undefined, maxUsersOverride: number | null | undefined): number | null {
  if (maxUsersOverride != null) return maxUsersOverride
  // Cuidado: `??` trata null e undefined igual, então `PLAN_DEFAULT_USERS[p] ?? 1`
  // trocaria o null intencional (plano sem limite) por 1. Precisa checar
  // a chave em vez de confiar no valor.
  const key = plan ?? ''
  return key in PLAN_DEFAULT_USERS ? PLAN_DEFAULT_USERS[key] : 1
}
