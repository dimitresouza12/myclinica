// Processa a mensagem que o paciente respondeu. Só no servidor (service role).
//
// Nesta etapa NENHUMA conversa é guardada: se a mensagem não for resposta a uma
// confirmação que nós enviamos, ela é descartada aqui, sem gravar nada.

import { getAdminClient } from '@/lib/supabaseAdmin'
import { extractIncomingText } from './webhook-parse'
import { parseReply } from './reply'
import { sendText } from './evolution'
import { recordOutgoing } from './conversations'

export type IncomingOutcome =
  | 'ignorada'            // não é texto individual, ou da própria clínica
  | 'sem_clinica'         // instância desconhecida
  | 'sem_telefone'        // @lid sem telefone: não dá para casar com a consulta
  | 'sem_confirmacao'     // não há confirmação pendente para esse número
  | 'varias_pendentes'    // o mesmo telefone tem mais de uma confirmação aberta
  | 'ja_processada'       // outro evento igual já tratou
  | 'confirmada'
  | 'pediu_remarcacao'
  | 'respondeu'

interface PendingRow {
  id: string
  appointment_id: string
  to_jid: string | null
}

export async function handleIncoming(instance: string, data: unknown): Promise<IncomingOutcome> {
  const inc = extractIncomingText(data)
  if (!inc) return 'ignorada'

  const admin = getAdminClient()

  const { data: wa } = await admin
    .from('clinic_whatsapp')
    .select('clinic_id, reply_yes_text, reply_no_text')
    .eq('instance_name', instance)
    .maybeSingle()
  if (!wa) return 'sem_clinica'

  if (!inc.phoneKey) {
    console.warn('[whatsapp/webhook] resposta com identificador interno e sem telefone; não foi possível casar com a consulta')
    return 'sem_telefone'
  }

  const { data: pending } = await admin
    .from('appointment_confirmations')
    .select('id, appointment_id, to_jid')
    .eq('clinic_id', wa.clinic_id)
    .eq('phone_key', inc.phoneKey)
    .eq('status', 'enviado')
    .eq('kind', 'confirmacao')
    .gt('appointment_at', new Date().toISOString())
    .order('sent_at', { ascending: false })
    .limit(5)

  const rows = (pending ?? []) as PendingRow[]
  if (rows.length === 0) return 'sem_confirmacao'

  const now = new Date().toISOString()

  // Mais de uma consulta aguardando resposta no mesmo telefone (ex.: pai/mãe com dois filhos):
  // não dá para saber a qual a resposta se refere. Nada automático, a recepção resolve.
  if (rows.length > 1) {
    await admin.from('appointment_confirmations')
      .update({ status: 'respondeu', answered_at: now, updated_at: now })
      .in('id', rows.map(r => r.id))
      .eq('status', 'enviado')
    return 'varias_pendentes'
  }

  const row = rows[0]
  const intent = parseReply(inc.text)

  // A consulta ainda pode ser confirmada? (cancelada/concluída nunca é)
  const { data: appt } = await admin
    .from('appointments')
    .select('id, status')
    .eq('id', row.appointment_id)
    .eq('clinic_id', wa.clinic_id)
    .maybeSingle()
  const open = appt?.status === 'agendado' || appt?.status === 'confirmado'

  const target =
    !open || intent === 'ambigua' ? 'respondeu'
    : intent === 'sim' ? 'confirmado'
    : 'pediu_remarcacao'

  // "Reivindica" a confirmação: só quem conseguir virar o status processa.
  // Evento repetido da Evolution não confirma nem responde duas vezes.
  const { data: claimed } = await admin
    .from('appointment_confirmations')
    .update({ status: target, answered_at: now, updated_at: now })
    .eq('id', row.id)
    .eq('status', 'enviado')
    .select('id')
  if (!claimed || claimed.length === 0) return 'ja_processada'

  if (target === 'respondeu') return 'respondeu'

  if (target === 'confirmado') {
    // só sai de 'agendado'; se já estava confirmado, nada a fazer
    await admin.from('appointments')
      .update({ status: 'confirmado' })
      .eq('id', row.appointment_id)
      .eq('clinic_id', wa.clinic_id)
      .eq('status', 'agendado')
  }

  // resposta automática ao paciente (best effort: falhar aqui não desfaz a confirmação)
  const to = row.to_jid?.split('@')[0]
  const reply = target === 'confirmado' ? wa.reply_yes_text : wa.reply_no_text
  if (to && reply) {
    try {
      const sent = await sendText(instance, to, reply)
      await recordOutgoing({ clinicId: wa.clinic_id as string, jid: row.to_jid as string, text: reply, providerMessageId: sent.messageId, origin: 'automatico' })
    } catch (e) {
      console.warn('[whatsapp/webhook] não foi possível enviar a resposta automática', e instanceof Error ? e.message : e)
    }
  }

  return target === 'confirmado' ? 'confirmada' : 'pediu_remarcacao'
}
