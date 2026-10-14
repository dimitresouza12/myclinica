// Identidade do contato: a mesma pessoa não pode virar duas conversas nem dois leads. Só no servidor.
//
// O WhatsApp pode identificar um contato pelo telefone ("5585…@s.whatsapp.net") ou por um código interno
// ("<id>@lid"), e o mesmo contato aparece de um jeito numa mensagem e de outro na seguinte. Aqui:
//  - guardamos a ligação @lid ↔ telefone na conversa (coluna `lid`);
//  - mensagem só com @lid, de um @lid já conhecido, cai na conversa do telefone;
//  - quando o telefone de um @lid que já era um contato separado é descoberto, as duas conversas
//    (e os dois leads) são juntadas numa só.

import { getAdminClient } from '@/lib/supabaseAdmin'
import { normalizeBrPhone } from './phone'

/** Telefone para guardar no lead: nacional para brasileiro, dígitos com DDI para exterior. */
export function leadPhoneFor(jid: string, key: string): string {
  const digits = jid.split('@')[0].replace(/\D/g, '')
  return key.startsWith('raw:') ? digits : (normalizeBrPhone(digits) || digits)
}

/** Mensagem só com @lid: se esse código já foi visto junto de um telefone, devolve a conversa dele. */
export async function conversationForLid(clinicId: string, lidId: string): Promise<{ phone_key: string; jid: string } | null> {
  const { data } = await getAdminClient().from('whatsapp_conversations')
    .select('phone_key, jid').eq('clinic_id', clinicId).eq('lid', lidId).limit(1).maybeSingle()
  return data ? { phone_key: data.phone_key as string, jid: data.jid as string } : null
}

interface LeadRow {
  id: string
  name: string | null
  interest: string | null
  estimated_value: number | null
  notes: string | null
  assigned_to: string | null
  next_contact_at: string | null
}

const FILLABLE = ['name', 'interest', 'estimated_value', 'notes', 'assigned_to', 'next_contact_at'] as const

/** O lead do @lid passa a ser o lead do telefone: renomeia a chave, ou junta se o do telefone já existe. */
async function mergeLead(clinicId: string, fromKey: string, toKey: string, phone: string): Promise<void> {
  const admin = getAdminClient()
  const cols = 'id, name, interest, estimated_value, notes, assigned_to, next_contact_at'
  const { data: from } = await admin.from('crm_leads').select(cols).eq('clinic_id', clinicId).eq('phone_key', fromKey).maybeSingle()
  if (!from) return
  const { data: to } = await admin.from('crm_leads').select(cols).eq('clinic_id', clinicId).eq('phone_key', toKey).maybeSingle()

  if (!to) {
    const { error } = await admin.from('crm_leads').update({ phone_key: toKey, phone }).eq('id', (from as LeadRow).id)
    if (!error) return
    // alguém criou o lead do telefone no meio tempo: cai na junção abaixo
    const { data: again } = await admin.from('crm_leads').select(cols).eq('clinic_id', clinicId).eq('phone_key', toKey).maybeSingle()
    if (!again) return
    return mergeInto(again as LeadRow, from as LeadRow)
  }
  return mergeInto(to as LeadRow, from as LeadRow)

  async function mergeInto(target: LeadRow, source: LeadRow) {
    // fica o lead do telefone; o que só o outro tinha (nome, observações…) é aproveitado
    const fill: Record<string, unknown> = {}
    for (const k of FILLABLE) if (target[k] == null && source[k] != null) fill[k] = source[k]
    if (Object.keys(fill).length > 0) await admin.from('crm_leads').update(fill).eq('id', target.id)
    await admin.from('crm_leads').delete().eq('id', source.id)
  }
}

/**
 * O telefone de um @lid foi descoberto. Se esse @lid já era um contato separado, junta tudo na conversa do telefone.
 * Idempotente: sem conversa do @lid, não faz nada.
 */
export async function adoptLidConversation(clinicId: string, lidId: string, key: string, jid: string): Promise<void> {
  const lidKey = `lid:${lidId}`
  if (key === lidKey) return
  const admin = getAdminClient()
  const now = new Date().toISOString()

  const lidCols = 'id, unread_count, last_message_at, last_message_preview, last_message_direction, last_inbound_at'
  const { data: lidConv } = await admin.from('whatsapp_conversations').select(lidCols).eq('clinic_id', clinicId).eq('phone_key', lidKey).maybeSingle()
  if (!lidConv) return

  const phone = leadPhoneFor(jid, key)
  const findTarget = () => admin.from('whatsapp_conversations')
    .select('id, unread_count, last_message_at, last_inbound_at').eq('clinic_id', clinicId).eq('phone_key', key).maybeSingle()

  let { data: target } = await findTarget()

  if (!target) {
    // não há conversa do telefone: a do @lid simplesmente passa a ser dela
    const { error } = await admin.from('whatsapp_conversations').update({ phone_key: key, jid, lid: lidId, updated_at: now }).eq('id', lidConv.id)
    if (!error) { await mergeLead(clinicId, lidKey, key, phone); return }
    // a conversa do telefone nasceu no meio tempo: segue para juntar
    target = (await findTarget()).data
    if (!target) return
  }

  // as duas existem: as mensagens vão para a conversa do telefone e a do @lid some
  await admin.from('whatsapp_messages').update({ conversation_id: target.id }).eq('conversation_id', lidConv.id)

  const lidNewer = Date.parse(lidConv.last_message_at as string) > Date.parse(target.last_message_at as string)
  const patch: Record<string, unknown> = {
    unread_count: (target.unread_count as number) + (lidConv.unread_count as number),
    lid: lidId,
    updated_at: now,
  }
  if (lidNewer) {
    patch.last_message_at = lidConv.last_message_at
    patch.last_message_preview = lidConv.last_message_preview
    patch.last_message_direction = lidConv.last_message_direction
  }
  const inbounds = [target.last_inbound_at, lidConv.last_inbound_at].filter((x): x is string => !!x)
  if (inbounds.length > 0) patch.last_inbound_at = inbounds.sort().at(-1)
  await admin.from('whatsapp_conversations').update(patch).eq('id', target.id)
  await admin.from('whatsapp_conversations').delete().eq('id', lidConv.id)

  await mergeLead(clinicId, lidKey, key, phone)
}
