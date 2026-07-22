import type { Clinic } from '@/types'

export type ComputedClinicStatus = 'active' | 'trial' | 'trial_expired' | 'suspended'

/**
 * Único ponto de verdade para o "status" de uma clínica — deriva do período
 * de teste e da cobrança, os mesmos dados que o PaymentLateBanner usa para
 * decidir se bloqueia o cliente. Evita ter um campo "status" manual que
 * pode dizer uma coisa enquanto o comportamento real do app é outra.
 */
export function computeClinicStatus(
  clinic: Pick<Clinic, 'trial_ends_at' | 'billing_paid' | 'billing_overdue_since'>
): ComputedClinicStatus {
  if (clinic.billing_overdue_since) return 'suspended'

  if (clinic.trial_ends_at) {
    const expired = Date.now() > new Date(clinic.trial_ends_at).getTime()
    if (expired) return clinic.billing_paid ? 'active' : 'trial_expired'
    return 'trial'
  }

  return 'active'
}

export const CLINIC_STATUS_LABELS: Record<ComputedClinicStatus, string> = {
  active: 'Ativa',
  trial: 'Trial',
  trial_expired: 'Trial expirado',
  suspended: 'Suspensa (atraso)',
}
