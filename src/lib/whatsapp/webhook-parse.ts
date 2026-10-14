// Lê o corpo que a Evolution manda ao webhook. Funções puras (sem rede, sem banco),
// para o formato dos eventos poder ser testado com amostras reais.
//
// A Evolution manda TUDO que a clínica recebe e envia; aqui só extraímos o que
// importa e descartamos o resto antes de qualquer processamento.

import { isIndividualJid, isLidJid, phoneKeyFromJid } from './phone'
import { extractMediaInfo, type MediaInfo } from './media'

export type EvolutionEvent = 'messages.upsert' | 'messages.update' | 'connection.update' | 'other'

export interface ParsedEnvelope {
  event: EvolutionEvent
  instance: string | null
  data: unknown
}

/** "MESSAGES_UPSERT", "messages.upsert" → 'messages.upsert'. */
export function normalizeEvent(raw: unknown): EvolutionEvent {
  const e = String(raw ?? '').toLowerCase().replace(/_/g, '.')
  if (e === 'messages.upsert') return 'messages.upsert'
  if (e === 'messages.update') return 'messages.update'
  if (e === 'connection.update') return 'connection.update'
  return 'other'
}

export function parseEnvelope(body: unknown): ParsedEnvelope {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  return {
    event: normalizeEvent(b.event),
    instance: typeof b.instance === 'string' ? b.instance : null,
    data: b.data,
  }
}

export interface IncomingText {
  messageId: string | null
  jid: string
  /** Chave de telefone (DDD + 8 últimos dígitos) quando dá para descobrir; '' se não. */
  phoneKey: string
  viaLid: boolean
  text: string
}

interface MsgKey { remoteJid?: string; remoteJidAlt?: string; fromMe?: boolean; id?: string; senderPn?: string }

function pickText(message: unknown): string {
  const m = (message && typeof message === 'object' ? message : {}) as Record<string, unknown>
  if (typeof m.conversation === 'string') return m.conversation
  const ext = m.extendedTextMessage as { text?: unknown } | undefined
  if (ext && typeof ext.text === 'string') return ext.text
  // mensagem temporária / de visualização: o texto vem aninhado
  const eph = (m.ephemeralMessage as { message?: unknown } | undefined)?.message
  if (eph) return pickText(eph)
  return ''
}

/**
 * Extrai uma mensagem de TEXTO recebida de um contato individual.
 * Devolve null para: enviada pela própria clínica, grupo/transmissão/status,
 * mídia sem texto, ou formato desconhecido.
 */
export function extractIncomingText(data: unknown): IncomingText | null {
  const item = Array.isArray(data) ? data[0] : data
  if (!item || typeof item !== 'object') return null
  const d = item as { key?: MsgKey; message?: unknown; messageType?: unknown }
  const key = d.key
  if (!key || key.fromMe) return null

  const jid = key.remoteJid
  if (!jid || !isIndividualJid(jid)) return null

  const text = pickText(d.message).trim()
  if (!text) return null

  const viaLid = isLidJid(jid)
  let phoneKey = ''
  if (!viaLid) {
    phoneKey = phoneKeyFromJid(jid)
  } else {
    // Com identificador interno (@lid) a Evolution costuma trazer o telefone em outro campo.
    const alt = key.remoteJidAlt ?? key.senderPn
    phoneKey = alt ? phoneKeyFromJid(alt.includes('@') ? alt : `${alt}@s.whatsapp.net`) : ''
  }

  return { messageId: key.id ?? null, jid, phoneKey, viaLid, text }
}

export interface ConnectionUpdate { state: 'open' | 'close' | 'connecting' | null }

export function extractConnectionUpdate(data: unknown): ConnectionUpdate {
  const item = Array.isArray(data) ? data[0] : data
  const s = (item as { state?: unknown } | null | undefined)?.state
  return { state: s === 'open' || s === 'close' || s === 'connecting' ? s : null }
}

// ── mensagens de qualquer tipo, para a tela Mensagens ───────────────────────

export type MessageKind = 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'other'

export interface InboundMessage {
  messageId: string | null
  /** identificador para RESPONDER: o do telefone quando se sabe, senão o @lid */
  jid: string
  /** DDD + 8 dígitos; 'raw:<dígitos>' do exterior; 'lid:<id>' quando só existe o identificador interno */
  phoneKey: string
  /** id do @lid quando a mensagem veio identificada por ele (mesmo que o telefone também tenha vindo) */
  lidId: string | null
  fromMe: boolean
  kind: MessageKind
  /** texto, ou legenda da mídia */
  body: string
  /** nome que o contato usa no WhatsApp (só quando a mensagem é DELE) */
  pushName: string | null
  timestamp: Date | null
  /** dados do arquivo quando a mensagem é imagem, áudio, vídeo, documento ou figurinha */
  media: MediaInfo | null
  /** a mensagem como a Evolution mandou ({ key, message }): guardada para baixar o arquivo de novo */
  raw: { key: unknown; message: unknown }
}

/** Mensagens que não são conteúdo da conversa: reação, ação do protocolo, troca de chaves. */
const NON_CONTENT = ['reactionMessage', 'protocolMessage', 'senderKeyDistributionMessage', 'messageContextInfo']

const KIND_BY_KEY: Array<[string, MessageKind]> = [
  ['imageMessage', 'image'], ['audioMessage', 'audio'], ['videoMessage', 'video'],
  ['documentMessage', 'document'], ['documentWithCaptionMessage', 'document'], ['stickerMessage', 'sticker'],
  ['ptvMessage', 'video'],
]

function classify(message: unknown): { kind: MessageKind; body: string } | null {
  const m = (message && typeof message === 'object' ? message : {}) as Record<string, unknown>

  // texto vem primeiro (inclui o aninhado em mensagem temporária)
  const text = pickText(m)
  if (text.trim()) return { kind: 'text', body: text.trim() }

  const eph = (m.ephemeralMessage as { message?: unknown } | undefined)?.message
  if (eph) return classify(eph)
  const viewOnce = ((m.viewOnceMessage ?? m.viewOnceMessageV2) as { message?: unknown } | undefined)?.message
  if (viewOnce) return classify(viewOnce)

  for (const [key, kind] of KIND_BY_KEY) {
    const part = m[key] as { caption?: unknown; message?: { documentMessage?: { caption?: unknown } } } | undefined
    if (part && typeof part === 'object') {
      const caption = typeof part.caption === 'string' ? part.caption
        : typeof part.message?.documentMessage?.caption === 'string' ? part.message.documentMessage.caption : ''
      return { kind, body: caption.trim() }
    }
  }

  if (m.contactMessage || m.contactsArrayMessage || m.locationMessage || m.liveLocationMessage) return { kind: 'other', body: '' }

  const keys = Object.keys(m).filter(k => !NON_CONTENT.includes(k))
  return keys.length > 0 ? { kind: 'other', body: '' } : null
}

function toDate(ts: unknown): Date | null {
  const n = typeof ts === 'number' ? ts
    : typeof ts === 'string' ? Number(ts)
    : ts && typeof ts === 'object' && 'low' in ts ? Number((ts as { low: unknown }).low) : NaN
  if (!Number.isFinite(n) || n <= 0) return null
  // a Evolution manda em segundos; aceita milissegundos por segurança
  const d = new Date(n > 1e12 ? n : n * 1000)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Extrai uma mensagem de conversa INDIVIDUAL (enviada ou recebida), de qualquer tipo.
 * Descarta grupo, transmissão, status, reação e ação interna do WhatsApp.
 */
export function extractMessage(data: unknown): InboundMessage | null {
  const item = Array.isArray(data) ? data[0] : data
  if (!item || typeof item !== 'object') return null
  const d = item as { key?: MsgKey; message?: unknown; pushName?: unknown; messageTimestamp?: unknown }
  const key = d.key
  if (!key) return null

  const remote = key.remoteJid
  if (!remote || !isIndividualJid(remote)) return null

  const content = classify(d.message)
  if (!content) return null

  let jid = remote
  let phoneKey = ''
  const lidId = isLidJid(remote) ? remote.split('@')[0] : null
  if (!isLidJid(remote)) {
    // número fora do padrão brasileiro (contato do exterior) não tem chave de telefone: usa os dígitos como estão
    phoneKey = phoneKeyFromJid(remote) || `raw:${remote.split('@')[0]}`
  } else {
    const alt = key.remoteJidAlt ?? key.senderPn
    if (alt) {
      const altJid = alt.includes('@') ? alt : `${alt}@s.whatsapp.net`
      // telefone brasileiro vira a chave DDD+8; de outro país, os dígitos como estão
      phoneKey = phoneKeyFromJid(altJid) || (isIndividualJid(altJid) ? `raw:${altJid.split('@')[0]}` : '')
      if (phoneKey) jid = altJid
    }
    if (!phoneKey) phoneKey = `lid:${remote.split('@')[0]}`
  }
  if (!phoneKey) return null

  const fromMe = !!key.fromMe
  return {
    messageId: key.id ?? null,
    jid,
    phoneKey,
    fromMe,
    lidId,
    kind: content.kind,
    body: content.body,
    pushName: !fromMe && typeof d.pushName === 'string' && d.pushName.trim() ? d.pushName.trim() : null,
    timestamp: toDate(d.messageTimestamp),
    media: content.kind === 'text' || content.kind === 'other' ? null : extractMediaInfo(d.message),
    raw: { key: d.key, message: d.message },
  }
}
