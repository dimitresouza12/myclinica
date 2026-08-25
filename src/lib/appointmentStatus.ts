import type { AppointmentStatus } from '@/types'

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  faltou: 'Faltou',
  bloqueado: 'Bloqueado',
}
