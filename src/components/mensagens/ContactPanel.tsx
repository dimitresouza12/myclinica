'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/usePermissions'
import { PatientFormModal } from '@/components/pacientes/PatientFormModal'
import { whatsappApi } from '@/components/configuracoes/whatsappApi'
import { toInputValue } from '@/lib/phoneFormat'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/ui/Icon'
import { contactDisplayName, formatJidPhone } from '@/lib/whatsapp/inbox'
import { Avatar } from '@/components/ui/Avatar'
import { conversationPhoto } from '@/hooks/useWhatsAppInbox'
import type { WaConversation } from '@/hooks/useWhatsAppInbox'
import styles from './Inbox.module.css'

function useNextAppointment(patientId: string | null) {
  return useQuery({
    queryKey: ['wa-next-appt', patientId],
    queryFn: async () => {
      if (!patientId) return null
      const { data } = await supabase
        .from('appointments')
        .select('scheduled_at, procedure_name, status')
        .eq('patient_id', patientId)
        .in('status', ['agendado', 'confirmado'])
        .gt('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(1)
      return (data?.[0] as { scheduled_at: string; procedure_name: string | null; status: string } | undefined) ?? null
    },
    enabled: !!patientId,
    staleTime: 60_000,
  })
}

/** Telefone brasileiro do contato, no formato do campo (DDD + número), ou '' se o contato não tem número utilizável (@lid, exterior). */
function phoneForForm(jid: string): string {
  if (jid.includes('@lid') || jid.startsWith('lid:') || jid.startsWith('raw:')) return ''
  const d = jid.split('@')[0].replace(/\D/g, '')
  return d.startsWith('55') && (d.length === 12 || d.length === 13) ? toInputValue(d.slice(2)) : ''
}

export function ContactPanel({ conversation, open }: { conversation: WaConversation | null; open: boolean }) {
  const { data: next } = useNextAppointment(conversation?.patient_id ?? null)
  const clinicId = useAuthStore(s => s.clinic?.id)
  const qc = useQueryClient()
  const { canEdit: canRegister } = usePermissions('pacientes')
  const [registering, setRegistering] = useState(false)
  if (!conversation) return <aside className={`${styles.pane} ${styles.info} ${open ? styles.infoOpen : ''}`} aria-label="Ficha do contato" />

  const c = conversation
  const name = contactDisplayName({ patientName: c.patients?.name, contactName: c.contact_name, jid: c.jid })

  return (
    <aside className={`${styles.pane} ${styles.info} ${open ? styles.infoOpen : ''}`} aria-label="Ficha do contato">
      <div className={styles.idBox}>
        <Avatar url={conversationPhoto(c)} name={name} size={56} className={styles.avatar} />
        <b>{name}</b>
        <span>{formatJidPhone(c.jid)}</span>
        <span className={`${styles.kind} ${c.patient_id ? styles.kindPatient : styles.kindLead}`} style={{ margin: 0 }}>
          {c.patient_id ? 'Paciente cadastrado' : 'Lead, ainda não é paciente'}
        </span>
      </div>

      {c.patient_id ? (
        <>
          <h4 className={styles.h4}>Próxima consulta</h4>
          <dl className={styles.kv}>
            <div>
              <dt>Data</dt>
              <dd>{next ? new Date(next.scheduled_at).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Nenhuma marcada'}</dd>
            </div>
            {next?.procedure_name && <div><dt>Procedimento</dt><dd>{next.procedure_name}</dd></div>}
            {next && <div><dt>Situação</dt><dd>{next.status === 'confirmado' ? 'Confirmada' : 'Agendada'}</dd></div>}
          </dl>
          <h4 className={styles.h4}>Ações</h4>
          <div className={styles.stack}>
            <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/agenda"><Icon name="calendar" size={16} />Abrir a agenda</Link>
            <Link className={styles.btn} href={`/pacientes?patient=${c.patient_id}`}><Icon name="patients" size={16} />Abrir prontuário</Link>
          </div>
        </>
      ) : (
        <>
          <p className={styles.hint}>
            Esse contato ainda não está cadastrado. Quando você cadastrar o paciente com este telefone, a conversa passa a aparecer como paciente.
          </p>
          <div className={styles.stack}>
            {canRegister && clinicId
              ? <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setRegistering(true)}><Icon name="patients" size={16} />Cadastrar paciente</button>
              : <span className={styles.hint}>Você não tem permissão para cadastrar pacientes.</span>}
          </div>
          {registering && clinicId && (
            <PatientFormModal
              patient={null}
              clinicId={clinicId}
              initial={{ name: c.contact_name ?? '', phone: phoneForForm(c.jid) }}
              onClose={() => setRegistering(false)}
              onSaved={() => {
                setRegistering(false)
                // liga já a conversa (e o lead) ao paciente novo, sem esperar a próxima mensagem
                whatsappApi('/api/whatsapp/conversations/link-patient', { method: 'POST', body: { conversationId: c.id } })
                  .catch(() => { /* o vínculo se completa na próxima mensagem */ })
                  .finally(() => {
                    qc.invalidateQueries({ queryKey: ['wa-convs', clinicId] })
                    qc.invalidateQueries({ queryKey: ['crm-leads', clinicId] })
                  })
              }}
            />
          )}
        </>
      )}
    </aside>
  )
}
