'use client'
import type { Clinic } from '@/types'
import { computeClinicStatus, CLINIC_STATUS_LABELS, type ComputedClinicStatus } from '@/lib/clinicStatus'
import { Badge, type BadgeTone } from '@/components/ui/Badge'

const STATUS_TONE: Record<ComputedClinicStatus, BadgeTone> = {
  active:        'success',
  trial:         'info',
  trial_expired: 'warning',
  suspended:     'danger',
  awaiting_first_charge: 'warning',
}

interface Props {
  clinic: Pick<Clinic, 'trial_ends_at' | 'billing_paid' | 'billing_overdue_since'> & Partial<Pick<Clinic, 'billing_first_due'>>
}

export function StatusBadge({ clinic }: Props) {
  const status = computeClinicStatus(clinic)
  return <Badge tone={STATUS_TONE[status]}>{CLINIC_STATUS_LABELS[status]}</Badge>
}
