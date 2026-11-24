'use client'
import type { Clinic } from '@/types'
import { computeClinicStatus, CLINIC_STATUS_LABELS, type ComputedClinicStatus } from '@/lib/clinicStatus'
import styles from './admin.module.css'

const STATUS_CLASS: Record<ComputedClinicStatus, string> = {
  active:        styles.statusActive,
  trial:         styles.statusTrial,
  trial_expired: styles.statusTrialExpired,
  suspended:     styles.statusSuspended,
  awaiting_first_charge: styles.statusAwaiting,
}

interface Props {
  clinic: Pick<Clinic, 'trial_ends_at' | 'billing_paid' | 'billing_overdue_since'> & Partial<Pick<Clinic, 'billing_first_due'>>
}

export function StatusBadge({ clinic }: Props) {
  const status = computeClinicStatus(clinic)
  return <span className={`${styles.statusPill} ${STATUS_CLASS[status]}`}>{CLINIC_STATUS_LABELS[status]}</span>
}
