// Eventos que mexem numa mensagem que já existe: reação, apagar, editar e tique de entrega/leitura.
// Funções puras (sem rede, sem banco).

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const first = (data: unknown): unknown => (Array.isArray(data) ? data[0] : data)

export type MessageEvent =
  | { type: 'reaction'; targetId: string; emoji: string; fromMe: boolean }
  | { type: 'revoke'; targetId: string }
  | { type: 'edit'; targetId: string; text: string }

/**
 * Reação, mensagem apagada ou editada, vindas como mensagem nova do WhatsApp (messages.upsert).
 * Devolve null para qualquer outra coisa.
 */
export function extractMessageEvent(data: unknown): MessageEvent | null {
  const item = first(data)
  if (!isObj(item) || !isObj(item.message) || !isObj(item.key)) return null
  const fromMe = item.key.fromMe === true
  const m = item.message

  if (isObj(m.reactionMessage)) {
    const key = m.reactionMessage.key
    const targetId = isObj(key) && typeof key.id === 'string' ? key.id : ''
    if (!targetId) return null
    const text = typeof m.reactionMessage.text === 'string' ? m.reactionMessage.text.trim() : ''
    return { type: 'reaction', targetId, emoji: text.slice(0, 16), fromMe }
  }

  if (isObj(m.protocolMessage)) {
    const p = m.protocolMessage
    const targetId = isObj(p.key) && typeof p.key.id === 'string' ? p.key.id : ''
    if (!targetId) return null
    const t = p.type
    if (t === 0 || t === 'REVOKE') return { type: 'revoke', targetId }
    if (t === 14 || t === 'MESSAGE_EDIT') {
      const e = isObj(p.editedMessage) ? p.editedMessage : {}
      const text = typeof e.conversation === 'string' ? e.conversation
        : isObj(e.extendedTextMessage) && typeof e.extendedTextMessage.text === 'string' ? e.extendedTextMessage.text : ''
      return text.trim() ? { type: 'edit', targetId, text: text.trim() } : null
    }
  }
  return null
}

export type DeliveryStatus = 'sent' | 'delivered' | 'read'

const STATUS_BY_NAME: Record<string, DeliveryStatus> = {
  SERVER_ACK: 'sent', DELIVERY_ACK: 'delivered', READ: 'read', PLAYED: 'read',
}
const RANK: Record<DeliveryStatus, number> = { sent: 1, delivered: 2, read: 3 }

export interface StatusUpdate { messageId: string; status: DeliveryStatus }

/** Atualização de status (evento messages.update) de uma mensagem ENVIADA pela clínica. */
export function extractStatusUpdate(data: unknown): StatusUpdate | null {
  const item = first(data)
  if (!isObj(item)) return null
  const key = isObj(item.key) ? item.key : null
  const messageId = typeof item.keyId === 'string' ? item.keyId : key && typeof key.id === 'string' ? key.id : ''
  const fromMe = item.fromMe === true || key?.fromMe === true
  const status = STATUS_BY_NAME[String(item.status ?? '').toUpperCase()]
  if (!messageId || !fromMe || !status) return null
  return { messageId, status }
}

/** O status só avança (lida não volta a ser entregue, mesmo que o aviso chegue fora de ordem). */
export function upgradeStatus(current: DeliveryStatus | null | undefined, next: DeliveryStatus): DeliveryStatus {
  return current && RANK[current] >= RANK[next] ? current : next
}

export const STATUS_LABEL: Record<DeliveryStatus, string> = { sent: 'Enviada', delivered: 'Entregue', read: 'Lida' }

export type Reactions = { contato?: string; clinica?: string }

/** Uma reação por pessoa; texto vazio remove a reação dela. */
export function applyReaction(current: unknown, who: 'contato' | 'clinica', emoji: string): Reactions {
  const base: Reactions = isObj(current) ? { ...(current as Reactions) } : {}
  if (emoji) base[who] = emoji
  else delete base[who]
  return base
}

const EDIT_WINDOW_MS = 15 * 60_000
const DELETE_WINDOW_MS = 48 * 3_600_000

/** O WhatsApp só deixa editar texto nos primeiros 15 minutos. */
export function canEditMessage(m: { kind: string; direction: string; created_at: string; deleted_at?: string | null }, now: Date): boolean {
  return m.kind === 'text' && m.direction === 'out' && !m.deleted_at && now.getTime() - new Date(m.created_at).getTime() <= EDIT_WINDOW_MS
}

/** Apagar para todos vale por cerca de 2 dias. */
export function canDeleteForEveryone(m: { direction: string; created_at: string; deleted_at?: string | null }, now: Date): boolean {
  return m.direction === 'out' && !m.deleted_at && now.getTime() - new Date(m.created_at).getTime() <= DELETE_WINDOW_MS
}
