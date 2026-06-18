'use client'
import type { ClinicStatus } from '@/types'
import styles from './admin.module.css'

const STATUS_MAP: Record<ClinicStatus, { label: string; cls: string }> = {
  active:    { label: 'Ativa',    cls: styles.statusActive },
  inactive:  { label: 'Inativa',  cls: styles.statusInactive },
  suspended: { label: 'Suspensa', cls: styles.statusSuspended },
  pending:   { label: 'Pendente', cls: styles.statusPending },
  trial:     { label: 'Trial',    cls: styles.statusTrial },
}

export function StatusBadge({ status }: { status: ClinicStatus }) {
  const { label, cls } = STATUS_MAP[status] ?? STATUS_MAP.inactive
  return <span className={`${styles.statusPill} ${cls}`}>{label}</span>
}
