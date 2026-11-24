// Textos e regras da página "Plano & Faturamento", sem React, para testar. Reusa o status único de clinicStatus.ts.
import { computeClinicStatus, primeiraCobrancaCombinada, type ComputedClinicStatus } from '@/lib/clinicStatus'
import { formatBrl, formatDiaBr } from '@/lib/cartaoCheckout'

export interface ClinicaPlano {
  trialEndsAt: string | null
  billingPaid: boolean
  billingOverdueSince: string | null
  billingFirstDue?: string | null
  asaasSubscriptionId: string | null
}

export type TomBadge = 'ok' | 'info' | 'warn' | 'bad'

export interface SituacaoPlano {
  status: ComputedClinicStatus
  badge: string
  tom: TomBadge
  frase: string
}

function diasAte(iso: string, now: Date): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000))
}

/** Selo e frase explicativa da situação, derivados do mesmo status que decide o bloqueio do acesso. */
export function situacaoDoPlano(c: ClinicaPlano, now: Date = new Date()): SituacaoPlano {
  const status = computeClinicStatus({
    trial_ends_at: c.trialEndsAt,
    billing_paid: c.billingPaid,
    billing_overdue_since: c.billingOverdueSince,
    billing_first_due: c.billingFirstDue ?? null,
  }, now)
  const due = (c.billingFirstDue ?? '').slice(0, 10)
  switch (status) {
    case 'active':
      return { status, badge: 'Ativa', tom: 'ok', frase: 'Sua assinatura está em dia. O acesso à clínica está liberado.' }
    case 'trial': {
      const d = c.trialEndsAt ? diasAte(c.trialEndsAt, now) : 0
      const quando = d === 0 ? 'termina hoje' : d === 1 ? 'termina amanhã' : `termina em ${d} dias`
      return { status, badge: 'Teste grátis', tom: 'info', frase: `Você está no período de teste, que ${quando}. Cadastre o cartão antes do fim do teste para não perder o acesso.` }
    }
    case 'awaiting_first_charge':
      return {
        status, badge: 'Aguardando 1ª cobrança', tom: 'info',
        frase: due ? `Seu cartão está cadastrado. A primeira cobrança será em ${formatDiaBr(due)}. Até lá o acesso segue liberado.` : 'Seu cartão está cadastrado. O acesso segue liberado até a primeira cobrança.',
      }
    case 'suspended':
      return { status, badge: 'Pagamento em atraso', tom: 'bad', frase: 'Há uma cobrança em atraso. Regularize o pagamento para manter o acesso à clínica.' }
    case 'trial_expired':
      return {
        status, badge: 'Teste encerrado', tom: 'bad',
        frase: c.asaasSubscriptionId
          ? 'O período de teste acabou e ainda não há pagamento confirmado. Regularize para liberar o acesso.'
          : 'O período de teste acabou. Assine para continuar usando a clínica.',
      }
  }
}

/** "Assinar agora" só para quem não tem cartão/assinatura nem 1ª cobrança combinada, e não está pago. */
export function podeAssinarAgora(c: ClinicaPlano, now: Date = new Date()): boolean {
  if (c.billingPaid) return false
  if (c.asaasSubscriptionId) return false
  if (primeiraCobrancaCombinada({ billing_first_due: c.billingFirstDue ?? null, billing_paid: c.billingPaid }, now)) return false
  return true
}

/** Texto do aviso da promoção de 50% (só quando existe billing_promo_full_value). */
export function avisoPromo(firstValue: number, fullValue: number): string {
  return `Desconto de 50% na primeira mensalidade: ${formatBrl(firstValue)} em vez de ${formatBrl(fullValue)}. A partir da segunda, o valor é ${formatBrl(fullValue)}.`
}
