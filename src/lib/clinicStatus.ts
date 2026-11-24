import type { Clinic } from '@/types'
import { hojeBrasil } from '@/lib/brasilDate'

export type ComputedClinicStatus = 'active' | 'trial' | 'trial_expired' | 'suspended' | 'awaiting_first_charge'

/** Dias depois da 1ª cobrança combinada em que o acesso ainda segue liberado (tempo do Asaas cobrar e o webhook chegar). */
export const PRIMEIRA_COBRANCA_TOLERANCIA_DIAS = 2

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Soma dias a um dia "AAAA-MM-DD" (calendário puro, sem fuso). */
function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/**
 * Clínica que já cadastrou o cartão no fim do teste e aguarda a primeira cobrança combinada: tem
 * billing_first_due, ainda não pagou e hoje (Brasília) não passou de billing_first_due + 2 dias.
 * Enquanto vale, o modal de "teste encerrado" não aparece. Passada a tolerância sem pagamento,
 * volta a ser false e o bloqueio retorna.
 */
export function primeiraCobrancaCombinada(
  clinic: { billing_first_due?: string | null; billing_paid?: boolean | null },
  now: Date = new Date(),
): boolean {
  if (clinic.billing_paid) return false
  const due = (clinic.billing_first_due ?? '').slice(0, 10)
  if (!DAY_RE.test(due)) return false
  return hojeBrasil(now) <= addDays(due, PRIMEIRA_COBRANCA_TOLERANCIA_DIAS)
}

/**
 * Passou do dia da 1ª cobrança combinada + tolerância e a clínica segue sem pagar: tem billing_first_due,
 * !billing_paid e hoje (Brasília) > billing_first_due + 2 dias. Decisão só por data, sem depender do webhook
 * nem de billing_overdue_since. É o complemento de primeiraCobrancaCombinada para quem tem a data.
 */
export function primeiraCobrancaVencida(
  clinic: { billing_first_due?: string | null; billing_paid?: boolean | null },
  now: Date = new Date(),
): boolean {
  if (clinic.billing_paid) return false
  const due = (clinic.billing_first_due ?? '').slice(0, 10)
  if (!DAY_RE.test(due)) return false
  return hojeBrasil(now) > addDays(due, PRIMEIRA_COBRANCA_TOLERANCIA_DIAS)
}

/**
 * Único ponto de verdade para o "status" de uma clínica — deriva do período
 * de teste e da cobrança, os mesmos dados que o PaymentLateBanner usa para
 * decidir se bloqueia o cliente. Evita ter um campo "status" manual que
 * pode dizer uma coisa enquanto o comportamento real do app é outra.
 */
export function computeClinicStatus(
  clinic: Pick<Clinic, 'trial_ends_at' | 'billing_paid' | 'billing_overdue_since'> & Partial<Pick<Clinic, 'billing_first_due'>>,
  now: Date = new Date(),
): ComputedClinicStatus {
  if (clinic.billing_overdue_since) return 'suspended'

  if (clinic.trial_ends_at) {
    const expired = now.getTime() > new Date(clinic.trial_ends_at).getTime()
    if (expired) {
      if (clinic.billing_paid) return 'active'
      return primeiraCobrancaCombinada(clinic, now) ? 'awaiting_first_charge' : 'trial_expired'
    }
    return 'trial'
  }

  return 'active'
}

export const CLINIC_STATUS_LABELS: Record<ComputedClinicStatus, string> = {
  active: 'Ativa',
  trial: 'Trial',
  trial_expired: 'Trial expirado',
  suspended: 'Suspensa (atraso)',
  awaiting_first_charge: 'Aguardando 1ª cobrança',
}
