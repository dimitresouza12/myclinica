// Quais conversas de WhatsApp pertencem a um paciente. Lógica pura (sem rede, sem React), usada pela
// rota /api/pacientes/[id]/conversas e testada em conversas.test.ts.
//
// A chave de comparação é a mesma da caixa de entrada (DDD + 8 últimos dígitos): ignora DDI 55, zero de
// tronco e o nono dígito, então "+55 85 99999-8888", "(85) 9999-8888" e "5585999998888@s.whatsapp.net"
// são o mesmo contato.

import { phoneKeys } from '@/lib/whatsapp/phone'

export interface ConversationLite {
  id: string
  phone_key: string
  patient_id: string | null
  last_message_at: string
}

/** Chaves de telefone do cadastro do paciente (o campo pode ter mais de um número). Vazio se não for telefone BR. */
export function patientPhoneKeys(phone: string | null | undefined): string[] {
  return phoneKeys(phone)
}

/**
 * Conversas do paciente:
 *  - as já vinculadas a ele (patient_id), mesmo que o telefone do cadastro tenha mudado ou a conversa seja
 *    por @lid (sem telefone);
 *  - as ainda SEM vínculo cujo telefone bate com o do cadastro.
 * Conversa vinculada a OUTRO paciente nunca entra, mesmo com o mesmo telefone (família que divide o número):
 * evita mostrar a conversa de uma pessoa no prontuário de outra.
 */
export function selectPatientConversations<T extends ConversationLite>(patientId: string, keys: readonly string[], rows: readonly T[]): T[] {
  const set = new Set(keys)
  return rows
    .filter(c => c.patient_id === patientId || (c.patient_id == null && set.has(c.phone_key)))
    .sort((a, b) => Date.parse(b.last_message_at) - Date.parse(a.last_message_at))
}

/** Conversa para responder: a de atividade mais recente. */
export function primaryConversation<T extends ConversationLite>(rows: readonly T[]): T | null {
  let best: T | null = null
  for (const r of rows) if (!best || Date.parse(r.last_message_at) > Date.parse(best.last_message_at)) best = r
  return best
}
