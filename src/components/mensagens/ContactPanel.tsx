'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/usePermissions'
import { PatientFormModal } from '@/components/pacientes/PatientFormModal'
import { whatsappApi } from '@/components/configuracoes/whatsappApi'
import { toInputValue } from '@/lib/phoneFormat'
import { STAGES, SOURCES, formatMoney, followUpLabel } from '@/lib/crm/model'
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

function useLeadFor(clinicId: string | undefined, phoneKey: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['wa-lead', clinicId, phoneKey],
    queryFn: async () => {
      if (!clinicId || !phoneKey) return null
      const { data } = await supabase.from('crm_leads')
        .select('stage, stage_note, interest, estimated_value, source, next_contact_at, notes')
        .eq('clinic_id', clinicId).eq('phone_key', phoneKey).maybeSingle()
      return (data as { stage: string; stage_note: string | null; interest: string | null; estimated_value: number | null; source: string; next_contact_at: string | null; notes: string | null } | null) ?? null
    },
    enabled: !!clinicId && !!phoneKey && enabled,
    staleTime: 30_000,
  })
}

function usePatientInfo(patientId: string | null) {
  return useQuery({
    queryKey: ['wa-patient', patientId],
    queryFn: async () => {
      if (!patientId) return null
      const [{ data: p }, { data: last }] = await Promise.all([
        supabase.from('patients').select('email, convenio, birth_date').eq('id', patientId).maybeSingle(),
        supabase.from('appointments').select('scheduled_at, procedure_name').eq('patient_id', patientId).eq('status', 'concluido')
          .order('scheduled_at', { ascending: false }).limit(1),
      ])
      return {
        email: (p?.email as string | null) ?? null,
        convenio: (p?.convenio as string | null) ?? null,
        last: (last?.[0] as { scheduled_at: string; procedure_name: string | null } | undefined) ?? null,
      }
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
  const { data: lead } = useLeadFor(clinicId, conversation?.phone_key ?? null, !conversation?.patient_id)
  const { data: patient } = usePatientInfo(conversation?.patient_id ?? null)
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
          {(patient?.email || patient?.convenio || patient?.last) && (
            <>
              <h4 className={styles.h4}>Cadastro</h4>
              <dl className={styles.kv}>
                {patient?.email && <div><dt>E-mail</dt><dd>{patient.email}</dd></div>}
                {patient?.convenio && <div><dt>Convênio</dt><dd>{patient.convenio}</dd></div>}
                {patient?.last && <div><dt>Última consulta</dt><dd>{new Date(patient.last.scheduled_at).toLocaleDateString('pt-BR')}</dd></div>}
              </dl>
            </>
          )}
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
          {lead && (
            <>
              <h4 className={styles.h4}>No funil de vendas</h4>
              <dl className={styles.kv}>
                <div><dt>Etapa</dt><dd>{STAGES.find(x => x.key === lead.stage)?.label ?? lead.stage}</dd></div>
                {lead.interest && <div><dt>Interesse</dt><dd>{lead.interest}</dd></div>}
                {lead.estimated_value != null && <div><dt>Valor estimado</dt><dd>{formatMoney(Number(lead.estimated_value))}</dd></div>}
                <div><dt>Origem</dt><dd>{SOURCES.find(x => x.key === lead.source)?.label ?? lead.source}</dd></div>
                {lead.next_contact_at && <div><dt>Retomar</dt><dd>{followUpLabel(lead.next_contact_at, new Date())}</dd></div>}
              </dl>
              {lead.stage_note && <p className={styles.hint}>{lead.stage_note}</p>}
              {lead.notes && <p className={styles.hint}>{lead.notes}</p>}
            </>
          )}
          <p className={styles.hint}>
            Esse contato ainda não está cadastrado. Quando você cadastrar o paciente com este telefone, a conversa passa a aparecer como paciente.
          </p>
          <div className={styles.stack}>
            {canRegister && clinicId
              ? <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setRegistering(true)}><Icon name="patients" size={16} />Cadastrar paciente</button>
              : <span className={styles.hint}>Você não tem permissão para cadastrar pacientes.</span>}
            <Link className={styles.btn} href="/crm"><Icon name="crm" size={16} />Abrir no CRM</Link>
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
