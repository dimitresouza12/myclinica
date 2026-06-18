// Planos que incluem integrações WhatsApp / CRM / IA
const WHATSAPP_PLANS = ['completo_plus'] as const

export function hasWhatsApp(plan: string | null | undefined): boolean {
  return WHATSAPP_PLANS.includes(plan as typeof WHATSAPP_PLANS[number])
}
