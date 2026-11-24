// Contexto de uma conversa para o n8n decidir se responde (GET /api/automacao/conversa-contexto) e as
// travas de "um humano já assumiu" usadas por /responder. Só no servidor (service role).
//
// Humano = quem escreveu pelo sistema (origin 'sistema') ou pelo celular da clínica (origin 'celular').
// Respostas automáticas (origin 'automatico') não contam.

import { getAdminClient } from '@/lib/supabaseAdmin'
import { isOutsideOpeningHours, openingFromRow } from './horario'

export const HUMAN_ORIGINS = ['sistema', 'celular'] as const

export class ConversaError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

export interface ConversaRow {
  id: string
  phone_key: string
  jid: string
  lid: string | null
  patient_id: string | null
  last_message_at: string | null
  last_inbound_at: string | null
}

const COLS = 'id, phone_key, jid, lid, patient_id, last_message_at, last_inbound_at'

/** A conversa SÓ se for desta clínica; null caso contrário (não revela se existe em outra). */
export async function lerConversa(clinicId: string, conversationId: string): Promise<ConversaRow | null> {
  const { data, error } = await getAdminClient()
    .from('whatsapp_conversations')
    .select(COLS)
    .eq('id', conversationId)
    .eq('clinic_id', clinicId)
    .maybeSingle()
  if (error) throw new ConversaError('Erro ao ler a conversa.', 500)
  return (data as ConversaRow | null) ?? null
}

/** Quando um humano escreveu por último nesta conversa, ou null. */
export async function ultimaSaidaHumana(clinicId: string, conversationId: string): Promise<string | null> {
  const { data, error } = await getAdminClient()
    .from('whatsapp_messages')
    .select('created_at')
    .eq('clinic_id', clinicId)
    .eq('conversation_id', conversationId)
    .eq('direction', 'out')
    .in('origin', [...HUMAN_ORIGINS])
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw new ConversaError('Erro ao ler as mensagens.', 500)
  return ((data ?? [])[0]?.created_at as string | undefined) ?? null
}

/**
 * Um humano respondeu DEPOIS da última mensagem do contato (que é o que foi repassado ao n8n)?
 * Sem mensagem do contato registrada, qualquer saída humana na conversa conta.
 */
export function humanoAssumiu(conv: Pick<ConversaRow, 'last_inbound_at'>, saidaHumana: string | null): boolean {
  if (!saidaHumana) return false
  if (!conv.last_inbound_at) return true
  return new Date(saidaHumana).getTime() >= new Date(conv.last_inbound_at).getTime()
}

/** Quantas confirmações aguardando resposta a lista olha (mesmo limite de handleIncoming). */
const PENDENTES_LIMITE = 5

/**
 * Consultas com confirmação aguardando resposta deste telefone: a MESMA busca que handleIncoming usa para
 * casar a resposta (status 'enviado', kind 'confirmacao', consulta no futuro). Chaves lid:/raw: não casam com
 * consulta. Ids sem repetição, da confirmação mais recente para a mais antiga.
 */
export async function confirmacoesPendentes(clinicId: string, phoneKey: string, now: Date): Promise<string[]> {
  if (!phoneKey || phoneKey.startsWith('lid:') || phoneKey.startsWith('raw:')) return []
  const { data, error } = await getAdminClient()
    .from('appointment_confirmations')
    .select('appointment_id')
    .eq('clinic_id', clinicId)
    .eq('phone_key', phoneKey)
    .eq('status', 'enviado')
    .eq('kind', 'confirmacao')
    .gt('appointment_at', now.toISOString())
    .order('sent_at', { ascending: false })
    .limit(PENDENTES_LIMITE)
  if (error) throw new ConversaError('Erro ao ler as confirmações.', 500)
  return [...new Set(((data ?? []) as { appointment_id: string }[]).map(r => r.appointment_id))]
}

/** Há confirmação de consulta aguardando resposta deste telefone? */
export async function temConfirmacaoPendente(clinicId: string, phoneKey: string, now: Date): Promise<boolean> {
  return (await confirmacoesPendentes(clinicId, phoneKey, now)).length > 0
}

/** Campos de consulta pendente para o n8n: um só id vira `appointmentId`; mais de um, `appointmentId` nulo e a lista. */
export function camposPendentes(ids: string[]): { appointmentId: string | null; appointmentIds: string[] } {
  return { appointmentId: ids.length === 1 ? ids[0] : null, appointmentIds: ids }
}

/**
 * Agora é horário de atendimento da clínica? Mesma regra do "fora do horário" (opening_hours no fuso de
 * clinic_whatsapp.timezone). Sem fuso conhecido usa o de Brasília; fuso inválido conta como dentro do horário.
 */
export async function dentroDoHorario(clinicId: string, now: Date): Promise<boolean> {
  const admin = getAdminClient()
  const [wa, sched] = await Promise.all([
    admin.from('clinic_whatsapp').select('timezone').eq('clinic_id', clinicId).maybeSingle(),
    admin.from('clinic_schedule_settings').select('opening_hours').eq('clinic_id', clinicId).maybeSingle(),
  ])
  if (wa.error || sched.error) throw new ConversaError('Erro ao ler o horário da clínica.', 500)
  const tz = (wa.data as { timezone?: string } | null)?.timezone ?? 'America/Sao_Paulo'
  return !isOutsideOpeningHours(now, tz, openingFromRow(sched.data as { opening_hours?: unknown } | null))
}

export interface ConversaContexto {
  phoneKey: string
  ehPaciente: boolean
  ultimaSaidaHumanaEm: string | null
  ultimaMensagemEm: string | null
  temConsultaPendenteConfirmacao: boolean
  /** A consulta da confirmação pendente; nulo quando não há ou há mais de uma (então veja `appointmentIds`). */
  appointmentId: string | null
  /** Todas as consultas com confirmação pendente deste telefone (vazia quando não há). */
  appointmentIds: string[]
  /** Agora é horário de atendimento da clínica? */
  dentroDoHorario: boolean
}

/** Só estes campos: nada de nome, telefone completo, texto de mensagem nem dado da consulta (só ids). */
export async function contextoDaConversa(clinicId: string, conversationId: string, now: Date = new Date()): Promise<ConversaContexto | null> {
  const conv = await lerConversa(clinicId, conversationId)
  if (!conv) return null
  const [saida, pendentes, dentro] = await Promise.all([
    ultimaSaidaHumana(clinicId, conv.id),
    confirmacoesPendentes(clinicId, conv.phone_key, now),
    dentroDoHorario(clinicId, now),
  ])
  return {
    phoneKey: conv.phone_key,
    ehPaciente: conv.patient_id !== null,
    ultimaSaidaHumanaEm: saida ? new Date(saida).toISOString() : null,
    ultimaMensagemEm: conv.last_message_at ? new Date(conv.last_message_at).toISOString() : null,
    temConsultaPendenteConfirmacao: pendentes.length > 0,
    ...camposPendentes(pendentes),
    dentroDoHorario: dentro,
  }
}
