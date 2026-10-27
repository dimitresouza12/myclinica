'use client'
import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { useAuthStore } from '@/store/auth'
import { useNextAppointment, useLeadFor } from '@/hooks/useContactContext'
import { shortAppointmentLabel } from '@/lib/whatsapp/bubble'
import { STAGES } from '@/lib/crm/model'
import type { WaConversation } from '@/hooks/useWhatsAppInbox'
import styles from './Inbox.module.css'

/**
 * Contexto do contato no cabeçalho da conversa: a próxima consulta do paciente (abre a agenda)
 * ou a etapa do lead no funil (abre o CRM). Sem dado, não aparece.
 */
export function ContextChip({ conversation, timezone, className }: { conversation: WaConversation; timezone: string; className?: string }) {
  const clinicId = useAuthStore(s => s.clinic?.id)
  const isPatient = !!conversation.patient_id
  const { data: next, isLoading } = useNextAppointment(conversation.patient_id ?? null)
  const { data: lead } = useLeadFor(clinicId, conversation.phone_key ?? null, !isPatient)

  if (isPatient) {
    if (isLoading) return null
    const text = next
      ? `Próxima consulta: ${shortAppointmentLabel(new Date(next.scheduled_at), timezone)}${next.professional_name ? ` com ${next.professional_name}` : ''}`
      : 'Sem consulta marcada'
    return (
      <Link className={`${styles.ctxChip} ${className ?? ''}`} href="/agenda" title={text}>
        <Icon name="calendar" size={14} /><span>{text}</span>
      </Link>
    )
  }

  if (!lead) return null
  const stage = STAGES.find(x => x.key === lead.stage)?.label ?? lead.stage
  return (
    <Link className={`${styles.ctxChip} ${className ?? ''}`} href="/crm" title={`Etapa no funil: ${stage}`}>
      <Icon name="crm" size={14} /><span>Etapa: {stage}</span>
    </Link>
  )
}
