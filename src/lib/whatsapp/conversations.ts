// Conversas e mensagens da tela "Mensagens". Só no servidor (service role): o navegador lê pelas
// políticas de RLS e NUNCA grava; guardar, enviar e zerar o contador de não lidas passam por aqui.

import { after } from 'next/server'
import { getAdminClient } from '@/lib/supabaseAdmin'
import { extractMessage, type InboundMessage } from './webhook-parse'
import { previewFor } from './inbox'
import { phoneKeys, phoneKeyFromJid, isLidJid } from './phone'
import { sendText, sendMedia, sendVoice, deleteForEveryone, editText } from './evolution'
import { connectedInstanceFor } from './connection'
import { createLeadForNewConversation, onLeadMessage, fillLeadName } from './leads'
import { refreshAvatar, lookupAvatarNow, type AvatarLookup } from './avatar'
import { adoptLidConversation, conversationForLid } from './identity'
import { downloadMessageMedia, newMediaPath, putMedia, removeMedia } from './media-store'
import { expiryFrom, storedMime, type MediaKind } from './media'
import { extractMessageEvent, applyReaction, upgradeStatus, canEditMessage, canDeleteForEveryone, type MessageEvent, type StatusUpdate, type DeliveryStatus } from './message-events'

export type MessageOrigin = 'contato' | 'sistema' | 'celular' | 'automatico'

export interface ConvRow {
  id: string
  clinic_id: string
  phone_key: string
  jid: string
  contact_name: string | null
  patient_id: string | null
  patient_checked_at: string | null
  unread_count: number
  last_message_at: string
  avatar_checked_at: string | null
  lid: string | null
}

const CONV_COLS = 'id, clinic_id, phone_key, jid, contact_name, patient_id, patient_checked_at, unread_count, last_message_at, avatar_checked_at, lid'
const RECHECK_PATIENT_MS = 60 * 60 * 1000

/** Chave da conversa a partir de um jid (telefone BR, exterior ou identificador interno). */
export function conversationKeyFromJid(jid: string): string {
  if (isLidJid(jid)) return `lid:${jid.split('@')[0]}`
  return phoneKeyFromJid(jid) || `raw:${jid.split('@')[0]}`
}

/** Paciente da clínica com esse telefone (ignora DDI e nono dígito), ou null. */
async function matchPatientId(clinicId: string, key: string): Promise<string | null> {
  if (key.startsWith('lid:') || key.startsWith('raw:')) return null
  const { data } = await getAdminClient()
    .from('patients')
    .select('id, phone')
    .eq('clinic_id', clinicId)
    .eq('is_active', true)
    .not('phone', 'is', null)
    .limit(20000)
  // o campo de telefone do paciente pode ter mais de um número: vale se QUALQUER um bater
  const hit = (data ?? []).find(p => phoneKeys(p.phone as string).includes(key))
  return (hit?.id as string | undefined) ?? null
}

/**
 * Acha ou cria a conversa. Vincula ao paciente na criação e, enquanto não há vínculo, a cada hora.
 * `created` diz se esta chamada foi quem a criou (é o gatilho para nascer o lead no CRM).
 */
export async function ensureConversation(clinicId: string, m: { phoneKey: string; jid: string; pushName: string | null; lidId?: string | null; authoritative?: boolean; avatar?: AvatarLookup | null }, firstMessageAt: Date): Promise<{ row: ConvRow; created: boolean }> {
  const admin = getAdminClient()

  let { data: conv } = await admin.from('whatsapp_conversations').select(CONV_COLS)
    .eq('clinic_id', clinicId).eq('phone_key', m.phoneKey).maybeSingle()

  const created = !conv
  if (!conv) {
    await admin.from('whatsapp_conversations')
      // nasce com o horário da própria mensagem (e não "agora"): senão a primeira mensagem, que tem
      // horário em segundos, parece mais antiga que a conversa e o resumo da lista fica vazio
      .upsert({
        clinic_id: clinicId, phone_key: m.phoneKey, jid: m.jid, contact_name: m.pushName, last_message_at: firstMessageAt.toISOString(),
        // a foto já vem junto: a conversa aparece na tela com ela
        ...(m.avatar ? { avatar_url: m.avatar.url, avatar_checked_at: m.avatar.checkedAt } : {}),
      }, { onConflict: 'clinic_id,phone_key', ignoreDuplicates: true })
    const r = await admin.from('whatsapp_conversations').select(CONV_COLS).eq('clinic_id', clinicId).eq('phone_key', m.phoneKey).single()
    conv = r.data
  }
  const row = conv as ConvRow

  const patch: Record<string, unknown> = {}
  // prefere responder pelo telefone: se a conversa estava só com @lid e agora temos o telefone
  if (isLidJid(row.jid) && !isLidJid(m.jid)) patch.jid = m.jid
  // o jid de uma mensagem que o contato ENVIOU é o que o WhatsApp dele aceita: se o telefone dele aparece
  // com o 9 numa mensagem e sem o 9 em outra, as respostas passam a ir para o que ele de fato usa
  else if (m.authoritative && !isLidJid(m.jid) && m.jid !== row.jid) patch.jid = m.jid
  // lembra o @lid deste contato: mensagens futuras só com o @lid caem nesta mesma conversa
  if (m.lidId && m.lidId !== row.lid) patch.lid = m.lidId
  if (m.pushName && m.pushName !== row.contact_name) patch.contact_name = m.pushName
  if (m.avatar && (m.avatar.url || !row.avatar_checked_at)) { patch.avatar_url = m.avatar.url; patch.avatar_checked_at = m.avatar.checkedAt; row.avatar_checked_at = m.avatar.checkedAt }

  const stale = !row.patient_checked_at || Date.now() - new Date(row.patient_checked_at).getTime() > RECHECK_PATIENT_MS
  if (!row.patient_id && stale) {
    patch.patient_id = await matchPatientId(clinicId, m.phoneKey)
    patch.patient_checked_at = new Date().toISOString()
  }

  if (Object.keys(patch).length > 0) {
    await admin.from('whatsapp_conversations').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', row.id)
    Object.assign(row, patch)
  }
  return { row, created }
}

/** Atualiza o resumo da conversa só se a mensagem for a mais recente. */
async function touchConversation(conv: ConvRow, msg: { at: Date; direction: 'in' | 'out'; preview: string }, unreadDelta: number) {
  const newest = new Date(msg.at).getTime() >= new Date(conv.last_message_at).getTime()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (newest) {
    patch.last_message_at = msg.at.toISOString()
    patch.last_message_preview = msg.preview
    patch.last_message_direction = msg.direction
  }
  if (unreadDelta > 0) patch.unread_count = conv.unread_count + unreadDelta
  if (msg.direction === 'in') patch.last_inbound_at = msg.at.toISOString()
  await getAdminClient().from('whatsapp_conversations').update(patch).eq('id', conv.id)
}

// ── entrada: tudo que passa pela conexão da clínica ─────────────────────────

export type StoreOutcome = 'guardada' | 'duplicada' | 'ignorada' | 'sem_clinica'

/** Guarda a mensagem (recebida, ou enviada pelo celular da clínica) numa conversa individual. */
export async function storeIncoming(instance: string, data: unknown): Promise<StoreOutcome> {
  const admin = getAdminClient()

  // reação, mensagem apagada ou editada: mexe numa mensagem que já existe, não cria outra
  const event = extractMessageEvent(data)
  if (event) {
    const { data: w } = await admin.from('clinic_whatsapp').select('clinic_id').eq('instance_name', instance).maybeSingle()
    if (!w) return 'sem_clinica'
    await applyMessageEvent(w.clinic_id as string, event)
    return 'guardada'
  }

  let m = extractMessage(data)
  if (!m) return 'ignorada'

  const { data: wa } = await admin.from('clinic_whatsapp').select('clinic_id').eq('instance_name', instance).maybeSingle()
  if (!wa) return 'sem_clinica'
  const clinicId = wa.clinic_id as string

  // a mesma pessoa não pode virar duas conversas: o @lid é ligado ao telefone (e vice-versa)
  if (m.lidId) {
    if (m.phoneKey.startsWith('lid:')) {
      const known = await conversationForLid(clinicId, m.lidId)
      if (known) m = { ...m, phoneKey: known.phone_key, jid: known.jid }
    } else {
      await adoptLidConversation(clinicId, m.lidId, m.phoneKey, m.jid)
    }
  }

  const at = m.timestamp ?? new Date()

  // foto do contato: busca já, antes de a conversa existir na tela (só para mensagem DELE; a foto fresca não é buscada de novo)
  let avatar: AvatarLookup | null = null
  if (!m.fromMe) {
    const { data: known } = await admin.from('whatsapp_conversations').select('avatar_checked_at')
      .eq('clinic_id', clinicId).eq('phone_key', m.phoneKey).maybeSingle()
    avatar = await lookupAvatarNow(instance, m.jid, (known?.avatar_checked_at as string | null | undefined) ?? null)
  }

  const { row: conv, created } = await ensureConversation(clinicId, { ...m, authoritative: !m.fromMe, avatar }, at)
  const direction = m.fromMe ? 'out' : 'in'

  // contato novo e desconhecido → lead no CRM (uma vez só); contato antigo: completa o nome se faltava
  if (created) await createLeadForNewConversation(clinicId, conv, m.fromMe)
  else if (m.pushName) await fillLeadName(clinicId, conv.phone_key, m.pushName)

  const row = {
    clinic_id: clinicId,
    conversation_id: conv.id,
    direction,
    kind: m.kind,
    body: m.body || null,
    origin: m.fromMe ? 'celular' : 'contato',
    provider_message_id: m.messageId,
    created_at: at.toISOString(),
    // o arquivo é baixado logo depois (abaixo); até lá a conversa mostra "baixando"
    ...(m.media ? {
      media_status: 'pending', media_mime: m.media.mime, media_name: m.media.name,
      media_size: m.media.size, media_seconds: m.media.seconds, media_thumb: m.media.thumb,
    } : {}),
  }

  // A Evolution pode repetir o evento, e uma mensagem enviada pelo sistema volta como eco:
  // a UNIQUE (clinic_id, provider_message_id) faz a repetida entrar zero vezes.
  const { data: inserted } = m.messageId
    ? await admin.from('whatsapp_messages').upsert(row, { onConflict: 'clinic_id,provider_message_id', ignoreDuplicates: true }).select('id')
    : await admin.from('whatsapp_messages').insert(row).select('id')

  if (!inserted || inserted.length === 0) return 'duplicada'

  if (m.media) {
    // guarda o que é preciso para baixar o arquivo (também depois, se a primeira tentativa falhar) e baixa sem atrasar o webhook
    const messageId = inserted[0].id as string
    await admin.from('whatsapp_media_source').upsert({ message_id: messageId, clinic_id: clinicId, raw: m.raw }, { onConflict: 'message_id' })
    after(() => downloadMessageMedia(messageId))
  }

  await touchConversation(conv, { at, direction, preview: previewFor(m.kind, m.body) }, direction === 'in' ? 1 : 0)
  // as regras do funil (a clínica respondeu, o contato voltou) e a foto de perfil, sem atrasar a resposta ao webhook
  await onLeadMessage(clinicId, conv.phone_key, direction)
  // se a busca imediata não deu (Evolution lenta), tenta de novo depois da resposta
  if (direction === 'in' && !avatar) after(() => refreshAvatar(instance, conv))
  return 'guardada'
}

// ── eventos sobre mensagens que já existem ──────────────────────────────────

/** Apaga o arquivo guardado de uma mensagem e o que serviria para baixá-lo de novo. */
async function dropMessageMedia(messageId: string, path: string | null) {
  if (path) await removeMedia([path])
  await getAdminClient().from('whatsapp_media_source').delete().eq('message_id', messageId)
}

/** Reação, apagada para todos ou editada: aplica na mensagem da clínica que tem esse id do WhatsApp. */
async function applyMessageEvent(clinicId: string, ev: MessageEvent): Promise<void> {
  const admin = getAdminClient()
  const { data: msg } = await admin.from('whatsapp_messages').select('id, reactions, media_path')
    .eq('clinic_id', clinicId).eq('provider_message_id', ev.targetId).maybeSingle()
  if (!msg) return // a mensagem original não está aqui (anterior à conexão): nada a fazer

  if (ev.type === 'reaction') {
    const reactions = applyReaction(msg.reactions, ev.fromMe ? 'clinica' : 'contato', ev.emoji)
    await admin.from('whatsapp_messages').update({ reactions }).eq('id', msg.id)
  } else if (ev.type === 'revoke') {
    await admin.from('whatsapp_messages').update({
      deleted_at: new Date().toISOString(), body: null, media_status: null, media_path: null, media_thumb: null,
    }).eq('id', msg.id)
    await dropMessageMedia(msg.id as string, msg.media_path as string | null)
  } else {
    await admin.from('whatsapp_messages').update({ body: ev.text, edited_at: new Date().toISOString() }).eq('id', msg.id)
  }
}

/** Tique de entrega/leitura (evento messages.update). O status só avança. */
export async function applyStatusUpdate(instance: string, u: StatusUpdate): Promise<void> {
  const admin = getAdminClient()
  const { data: wa } = await admin.from('clinic_whatsapp').select('clinic_id').eq('instance_name', instance).maybeSingle()
  if (!wa) return
  const { data: msg } = await admin.from('whatsapp_messages').select('id, delivery_status')
    .eq('clinic_id', wa.clinic_id as string).eq('provider_message_id', u.messageId).eq('direction', 'out').maybeSingle()
  if (!msg) return
  const next = upgradeStatus(msg.delivery_status as DeliveryStatus | null, u.status)
  if (next !== msg.delivery_status) await admin.from('whatsapp_messages').update({ delivery_status: next }).eq('id', msg.id)
}

type OwnMessageRow = { id: string; kind: string; direction: string; created_at: string; deleted_at: string | null; provider_message_id: string | null; media_path: string | null; conv: { jid: string } }

/** Mensagem da própria clínica, ainda editável/apagável, e a instância conectada para agir sobre ela. */
async function loadOwnMessage(clinicId: string, messageId: string): Promise<{ msg: OwnMessageRow; instance: string } | { error: { status: number; error: string } }> {
  const { data } = await getAdminClient().from('whatsapp_messages')
    .select('id, kind, direction, created_at, deleted_at, provider_message_id, media_path, conv:whatsapp_conversations(jid)')
    .eq('id', messageId).eq('clinic_id', clinicId).maybeSingle()
  const msg = data as unknown as OwnMessageRow | null
  if (!msg || msg.direction !== 'out') return { error: { status: 404, error: 'Mensagem não encontrada.' } }
  if (!msg.provider_message_id) return { error: { status: 409, error: 'Esta mensagem não pode ser alterada pelo WhatsApp.' } }
  const instance = await connectedInstanceFor(clinicId)
  if (!instance) return { error: { status: 409, error: 'O WhatsApp da clínica não está conectado. Reconecte em Configurações.' } }
  return { msg, instance }
}

/** Apaga para todos uma mensagem enviada pela clínica (até cerca de 2 dias depois). */
export async function deleteOwnMessage(p: { clinicId: string; messageId: string }): Promise<SendResult> {
  const r = await loadOwnMessage(p.clinicId, p.messageId)
  if ('error' in r) return { ok: false, ...r.error }
  if (!canDeleteForEveryone(r.msg, new Date())) return { ok: false, status: 409, error: 'Já passou o prazo para apagar esta mensagem para todos.' }
  await deleteForEveryone(r.instance, { id: r.msg.provider_message_id!, remoteJid: r.msg.conv.jid })
  await getAdminClient().from('whatsapp_messages').update({
    deleted_at: new Date().toISOString(), body: null, media_status: null, media_path: null, media_thumb: null,
  }).eq('id', r.msg.id)
  await dropMessageMedia(r.msg.id, r.msg.media_path)
  return { ok: true }
}

/** Edita o texto de uma mensagem enviada pela clínica (até 15 minutos depois). */
export async function editOwnMessage(p: { clinicId: string; messageId: string; text: string }): Promise<SendResult> {
  const r = await loadOwnMessage(p.clinicId, p.messageId)
  if ('error' in r) return { ok: false, ...r.error }
  if (!canEditMessage(r.msg, new Date())) return { ok: false, status: 409, error: 'O WhatsApp só deixa editar nos primeiros 15 minutos, e só mensagens de texto.' }
  await editText(r.instance, { id: r.msg.provider_message_id!, remoteJid: r.msg.conv.jid, text: p.text })
  await getAdminClient().from('whatsapp_messages').update({ body: p.text, edited_at: new Date().toISOString() }).eq('id', r.msg.id)
  return { ok: true }
}

// ── saída: mensagens enviadas pelo sistema ──────────────────────────────────

/**
 * Registra uma mensagem que o SISTEMA enviou (resposta da caixa de entrada ou mensagem automática).
 * Se o eco do webhook chegou antes e entrou como "celular", este registro corrige a origem.
 */
export async function recordOutgoing(p: {
  clinicId: string; jid: string; text: string; providerMessageId: string | null
  origin: Extract<MessageOrigin, 'sistema' | 'automatico'>; userId?: string | null; userName?: string | null
  /** quando a mensagem leva um arquivo: `text` é a legenda e o arquivo já está guardado em `path` */
  media?: { kind: Extract<MediaKind, 'image' | 'document' | 'audio'>; mime: string; name: string | null; size: number; path: string; seconds?: number | null }
}): Promise<void> {
  const admin = getAdminClient()
  const at = new Date()
  const { row: conv } = await ensureConversation(p.clinicId, { phoneKey: conversationKeyFromJid(p.jid), jid: p.jid, pushName: null }, at)
  const row = {
    clinic_id: p.clinicId,
    conversation_id: conv.id,
    direction: 'out' as const,
    kind: p.media?.kind ?? ('text' as const),
    body: p.text || null,
    origin: p.origin,
    sent_by: p.userId ?? null,
    sent_by_name: p.userName ?? null,
    provider_message_id: p.providerMessageId,
    created_at: at.toISOString(),
    ...(p.media ? {
      media_status: 'ready', media_mime: p.media.mime, media_name: p.media.name, media_size: p.media.size,
      media_seconds: p.media.seconds ?? null, media_path: p.media.path, media_expires_at: expiryFrom(at).toISOString(),
    } : {}),
  }
  if (p.providerMessageId) {
    // sem ignoreDuplicates: se o eco já entrou, atualiza origem e autor
    await admin.from('whatsapp_messages').upsert(
      { ...row, created_at: undefined },
      { onConflict: 'clinic_id,provider_message_id' },
    ).select('id')
  } else {
    await admin.from('whatsapp_messages').insert(row)
  }
  await touchConversation(conv, { at, direction: 'out', preview: previewFor(p.media?.kind ?? 'text', p.text) }, 0)
  // resposta de uma pessoa da equipe conta como conversa; mensagem automática (confirmação de consulta) não
  if (p.origin === 'sistema') await onLeadMessage(p.clinicId, conv.phone_key, 'out')
}

export type SendResult = { ok: true } | { ok: false; status: number; error: string }

/** Envia uma resposta digitada na caixa de entrada. */
export async function sendFromInbox(p: { clinicId: string; conversationId: string; text: string; userId: string; userName: string }): Promise<SendResult> {
  const admin = getAdminClient()
  const { data: conv } = await admin.from('whatsapp_conversations').select('id, jid')
    .eq('id', p.conversationId).eq('clinic_id', p.clinicId).maybeSingle()
  if (!conv) return { ok: false, status: 404, error: 'Conversa não encontrada.' }

  const instance = await connectedInstanceFor(p.clinicId)
  if (!instance) return { ok: false, status: 409, error: 'O WhatsApp da clínica não está conectado. Reconecte em Configurações.' }

  const jid = conv.jid as string
  const to = isLidJid(jid) ? jid : jid.split('@')[0]
  const sent = await sendText(instance, to, p.text)

  await recordOutgoing({
    clinicId: p.clinicId, jid, text: p.text, providerMessageId: sent.messageId,
    origin: 'sistema', userId: p.userId, userName: p.userName,
  })
  return { ok: true }
}

/** Envia imagem, documento ou mensagem de voz pela caixa de entrada (legenda opcional, só para imagem e documento). O arquivo já foi conferido pela rota. */
export async function sendMediaFromInbox(p: {
  clinicId: string; conversationId: string; userId: string; userName: string
  bytes: Buffer; name: string; mime: string; kind: 'image' | 'document' | 'audio'; caption: string; seconds?: number | null
}): Promise<SendResult> {
  const admin = getAdminClient()
  const { data: conv } = await admin.from('whatsapp_conversations').select('id, jid')
    .eq('id', p.conversationId).eq('clinic_id', p.clinicId).maybeSingle()
  if (!conv) return { ok: false, status: 404, error: 'Conversa não encontrada.' }

  const instance = await connectedInstanceFor(p.clinicId)
  if (!instance) return { ok: false, status: 409, error: 'O WhatsApp da clínica não está conectado. Reconecte em Configurações.' }

  // guarda a cópia antes de enviar: se o envio falhar, a cópia é descartada
  const path = newMediaPath(p.clinicId, p.conversationId)
  await putMedia(path, p.bytes, storedMime(p.kind, p.mime))

  const jid = conv.jid as string
  const to = isLidJid(jid) ? jid : jid.split('@')[0]
  let sent
  try {
    sent = p.kind === 'audio'
      ? await sendVoice(instance, to, p.bytes.toString('base64'))
      : await sendMedia(instance, to, { mediatype: p.kind, mimetype: p.mime, fileName: p.name, base64: p.bytes.toString('base64'), caption: p.caption })
  } catch (e) {
    await removeMedia([path])
    throw e
  }

  await recordOutgoing({
    clinicId: p.clinicId, jid, text: p.caption, providerMessageId: sent.messageId,
    origin: 'sistema', userId: p.userId, userName: p.userName,
    media: { kind: p.kind, mime: p.mime, name: p.kind === 'audio' ? null : p.name, size: p.bytes.length, path, seconds: p.seconds ?? null },
  })
  return { ok: true }
}

/** Zera o contador de não lidas da conversa. */
export async function markConversationRead(clinicId: string, conversationId: string): Promise<boolean> {
  const { data } = await getAdminClient().from('whatsapp_conversations')
    .update({ unread_count: 0, updated_at: new Date().toISOString() })
    .eq('id', conversationId).eq('clinic_id', clinicId).select('id')
  return !!data && data.length > 0
}

export type { InboundMessage }
