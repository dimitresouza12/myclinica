// Cópia temporária dos arquivos do WhatsApp. Só no servidor (service role).
//
// Os arquivos ficam num bucket PRIVADO sem política: o navegador nunca chega neles direto. A rota de API
// confere a permissão do usuário e devolve um link assinado de poucos minutos.

import { randomUUID } from 'crypto'
import { getAdminClient } from '@/lib/supabaseAdmin'
import { fetchMediaBase64, instanceNameFor } from './evolution'
import { MAX_STORED_BYTES, MEDIA_SOURCE_TTL_DAYS, baseMime, expiryFrom, storedMime, type MediaKind } from './media'

const BUCKET = 'whatsapp-media'
const SIGNED_URL_SECONDS = 900
const CLEANUP_BATCH = 500

export function newMediaPath(clinicId: string, conversationId: string): string {
  return `${clinicId}/${conversationId}/${randomUUID()}`
}

export async function putMedia(path: string, bytes: Buffer, contentType: string): Promise<void> {
  const { error } = await getAdminClient().storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false })
  if (error) throw new Error(`Não foi possível guardar o arquivo: ${error.message}`)
}

export async function removeMedia(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  await getAdminClient().storage.from(BUCKET).remove(paths)
}

/** Link temporário para abrir o arquivo. Com `downloadAs`, o navegador baixa com esse nome. */
export async function signedMediaUrl(path: string, downloadAs?: string): Promise<string | null> {
  const { data, error } = await getAdminClient().storage.from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS, downloadAs ? { download: downloadAs } : undefined)
  return error || !data ? null : data.signedUrl
}

interface MediaMessageRow {
  id: string
  clinic_id: string
  conversation_id: string
  kind: MediaKind
  media_status: string | null
  media_mime: string | null
  media_size: number | null
}

/**
 * Baixa o arquivo de uma mensagem recebida (ou enviada pelo celular da clínica) e guarda a cópia.
 * Chamada logo depois que a mensagem entra, e de novo quando alguém pede "baixar de novo".
 * Nunca lança: qualquer falha deixa a mensagem como 'failed' e a conversa segue.
 */
export async function downloadMessageMedia(messageId: string): Promise<'ready' | 'failed' | 'skipped'> {
  const admin = getAdminClient()
  const { data } = await admin.from('whatsapp_messages')
    .select('id, clinic_id, conversation_id, kind, media_status, media_mime, media_size')
    .eq('id', messageId).maybeSingle()
  const msg = data as MediaMessageRow | null
  if (!msg || msg.media_status === 'ready' || msg.media_status === null) return 'skipped'

  const fail = async (): Promise<'failed'> => {
    await admin.from('whatsapp_messages').update({ media_status: 'failed' }).eq('id', messageId).neq('media_status', 'ready')
    return 'failed'
  }

  try {
    if (msg.media_size != null && msg.media_size > MAX_STORED_BYTES) return await fail()
    const { data: source } = await admin.from('whatsapp_media_source').select('raw').eq('message_id', messageId).maybeSingle()
    if (!source) return await fail()

    const file = await fetchMediaBase64(instanceNameFor(msg.clinic_id), source.raw as { key: unknown; message: unknown })
    const bytes = Buffer.from(file.base64, 'base64')
    if (bytes.length === 0 || bytes.length > MAX_STORED_BYTES) return await fail()

    const mime = baseMime(file.mimetype) ?? msg.media_mime
    const path = newMediaPath(msg.clinic_id, msg.conversation_id)
    await putMedia(path, bytes, storedMime(msg.kind, mime))

    const { data: done } = await admin.from('whatsapp_messages').update({
      media_status: 'ready', media_path: path, media_mime: mime, media_size: bytes.length,
      media_expires_at: expiryFrom(new Date()).toISOString(),
    }).eq('id', messageId).neq('media_status', 'ready').select('id')
    // outra chamada terminou primeiro: não deixa a cópia sobrando
    if (!done || done.length === 0) { await removeMedia([path]); return 'skipped' }
    return 'ready'
  } catch (e) {
    console.error('[whatsapp/media] baixar', e instanceof Error ? e.message : e)
    return await fail()
  }
}

/** "Baixar de novo": só para mensagem da própria clínica cuja cópia falhou ou foi removida. */
export async function retryMediaDownload(clinicId: string, messageId: string): Promise<'ready' | 'failed' | 'not_found' | 'busy'> {
  const admin = getAdminClient()
  const { data: msg } = await admin.from('whatsapp_messages').select('id, media_status')
    .eq('id', messageId).eq('clinic_id', clinicId).maybeSingle()
  if (!msg || !msg.media_status) return 'not_found'
  if (msg.media_status === 'pending' || msg.media_status === 'ready') return 'busy'
  // reserva a vez: duas pessoas clicando juntas baixam uma vez só
  const { data: taken } = await admin.from('whatsapp_messages').update({ media_status: 'pending' })
    .eq('id', messageId).in('media_status', ['failed', 'expired']).select('id')
  if (!taken || taken.length === 0) return 'busy'
  const r = await downloadMessageMedia(messageId)
  return r === 'ready' ? 'ready' : 'failed'
}

export interface CleanupResult { removedFiles: number; removedSources: number }

/** Limpeza diária: apaga as cópias vencidas (a mensagem fica, marcada como removida) e os dados antigos de download. */
export async function cleanupMedia(now = new Date()): Promise<CleanupResult> {
  const admin = getAdminClient()
  const { data: due } = await admin.from('whatsapp_messages').select('id, media_path')
    .eq('media_status', 'ready').lt('media_expires_at', now.toISOString()).limit(CLEANUP_BATCH)
  const rows = (due ?? []) as Array<{ id: string; media_path: string | null }>
  await removeMedia(rows.map(r => r.media_path).filter((p): p is string => !!p))
  if (rows.length > 0) {
    await admin.from('whatsapp_messages').update({ media_status: 'expired', media_path: null }).in('id', rows.map(r => r.id))
  }
  const cutoff = new Date(now.getTime() - MEDIA_SOURCE_TTL_DAYS * 86_400_000).toISOString()
  const { data: old } = await admin.from('whatsapp_media_source').delete().lt('created_at', cutoff).select('message_id')
  return { removedFiles: rows.length, removedSources: old?.length ?? 0 }
}
