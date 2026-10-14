// "Conversar" a partir de um lead do CRM. Só no servidor (service role).
//
// Se o lead já tem conversa, devolve o id dela. Se não tem (lead cadastrado à mão), confere no
// WhatsApp se o número existe e abre a conversa, para a tela Mensagens poder enviar a primeira mensagem.

import { getAdminClient } from '@/lib/supabaseAdmin'
import { checkNumbers } from './evolution'
import { whatsappCandidates } from './phone'
import { connectedInstanceFor } from './connection'
import { ensureConversation } from './conversations'

export type OpenChatResult =
  | { ok: true; conversationId: string }
  | { ok: false; status: number; error: string }

export async function openLeadConversation(clinicId: string, leadId: string): Promise<OpenChatResult> {
  const admin = getAdminClient()

  const { data: lead } = await admin.from('crm_leads')
    .select('id, phone, phone_key, patient_id')
    .eq('id', leadId).eq('clinic_id', clinicId).maybeSingle()
  if (!lead) return { ok: false, status: 404, error: 'Lead não encontrado.' }

  const key = lead.phone_key as string | null
  if (!key) return { ok: false, status: 409, error: 'Este lead não tem telefone. Informe o telefone para conversar.' }

  const { data: conv } = await admin.from('whatsapp_conversations')
    .select('id, patient_id').eq('clinic_id', clinicId).eq('phone_key', key).maybeSingle()
  if (conv) {
    // lead já virou paciente: a conversa passa a refletir isso sem esperar a próxima checagem
    if (lead.patient_id && !conv.patient_id) {
      await admin.from('whatsapp_conversations').update({ patient_id: lead.patient_id, updated_at: new Date().toISOString() }).eq('id', conv.id)
    }
    return { ok: true, conversationId: conv.id as string }
  }

  if (key.startsWith('lid:')) {
    return { ok: false, status: 409, error: 'Este contato escondeu o número no WhatsApp. Só dá para responder por uma conversa que ele iniciou.' }
  }

  const instance = await connectedInstanceFor(clinicId)
  if (!instance) return { ok: false, status: 409, error: 'O WhatsApp da clínica não está conectado. Reconecte em Configurações.' }

  const digits = String(lead.phone ?? '').replace(/\D/g, '')
  const candidates = key.startsWith('raw:') ? (digits ? [digits] : []) : whatsappCandidates(lead.phone as string | null)
  if (candidates.length === 0) return { ok: false, status: 409, error: 'O telefone deste lead não parece válido.' }

  const found = (await checkNumbers(instance, candidates)).find(c => c.exists)
  if (!found) return { ok: false, status: 422, error: 'Esse número não tem WhatsApp.' }

  const jid = found.jid ?? `${found.number}@s.whatsapp.net`
  const { row } = await ensureConversation(clinicId, { phoneKey: key, jid, pushName: null }, new Date())
  if (lead.patient_id && !row.patient_id) {
    await admin.from('whatsapp_conversations').update({ patient_id: lead.patient_id, updated_at: new Date().toISOString() }).eq('id', row.id)
  }
  return { ok: true, conversationId: row.id }
}
