// Ligação entre as conversas do WhatsApp e o funil de leads (CRM). Só no servidor (service role).
//
// Regras, de propósito poucas e previsíveis:
//  - Contato novo que NÃO é paciente vira lead, uma única vez (na criação da conversa). Se a clínica
//    apagar o lead, ele não volta na próxima mensagem.
//  - Depois disso, cada mensagem aplica as regras de src/lib/crm/automation.ts (stageOnMessage): a clínica
//    responde → Em conversa; o contato volta depois de Perdido → Novo. Mensagem automática (confirmação
//    de consulta) não conta como conversa.
//  - Agendado, Compareceu e o resto vêm da agenda e do silêncio (src/lib/crm/sync.ts).

import { getAdminClient } from '@/lib/supabaseAdmin'
import { isLidJid, normalizeBrPhone } from './phone'
import { stageOnMessage } from '../crm/automation'
import type { Stage } from '../crm/model'

interface NewConversation {
  phone_key: string
  jid: string
  contact_name: string | null
  patient_id: string | null
}

/** Cria o lead de um contato desconhecido. Idempotente: a UNIQUE (clinic_id, phone_key) segura repetição. */
export async function createLeadForNewConversation(clinicId: string, conv: NewConversation, startedByClinic: boolean): Promise<boolean> {
  if (conv.patient_id) return false // paciente cadastrado não é lead

  const hasPhone = !isLidJid(conv.jid) && !conv.phone_key.startsWith('lid:')
  // telefone brasileiro guardado no formato nacional (como o cadastro manual); do exterior, os dígitos com DDI
  const digits = conv.jid.split('@')[0]
  const phone = !hasPhone ? null : conv.phone_key.startsWith('raw:') ? digits : (normalizeBrPhone(digits) || digits)
  const { data } = await getAdminClient().from('crm_leads').upsert({
    clinic_id: clinicId,
    name: conv.contact_name,
    phone,
    phone_key: conv.phone_key,
    stage: startedByClinic ? 'em_conversa' : 'novo',
    source: 'whatsapp',
    stage_source: 'auto',
    stage_note: startedByClinic ? 'A clínica iniciou a conversa no WhatsApp' : 'Contato novo no WhatsApp',
  }, { onConflict: 'clinic_id,phone_key', ignoreDuplicates: true }).select('id')
  return !!data && data.length > 0
}

/**
 * Chegou ou saiu uma mensagem de conversa: aplica as regras de etapa ao lead desse telefone, se houver.
 * O UPDATE confere a etapa que lemos: se uma pessoa moveu o cartão no meio tempo, não sobrescreve.
 */
export async function onLeadMessage(clinicId: string, phoneKey: string, direction: 'in' | 'out'): Promise<void> {
  const admin = getAdminClient()
  const { data: lead } = await admin.from('crm_leads').select('id, stage')
    .eq('clinic_id', clinicId).eq('phone_key', phoneKey).maybeSingle()
  if (!lead) return
  const change = stageOnMessage(lead.stage as Stage, direction)
  if (!change) return
  await admin.from('crm_leads')
    .update({ stage: change.stage, stage_source: 'auto', stage_note: change.note, lost_reason: null })
    .eq('id', lead.id).eq('stage', lead.stage)
}

/** Nome do contato quando o lead nasceu sem nome e o WhatsApp passou a informar. */
export async function fillLeadName(clinicId: string, phoneKey: string, name: string): Promise<void> {
  await getAdminClient().from('crm_leads')
    .update({ name })
    .eq('clinic_id', clinicId)
    .eq('phone_key', phoneKey)
    .is('name', null)
}
