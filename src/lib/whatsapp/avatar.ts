// Foto de perfil dos contatos (tela Mensagens e CRM). Só no servidor (service role).
//
// A foto vem da Evolution como URL da CDN do WhatsApp, que expira depois de alguns dias. Por isso
// guardamos a URL e perguntamos de novo de tempos em tempos (a cada mensagem do contato, se a
// última consulta tem mais de 12h). Contato sem foto, ou que a esconde, fica sem foto: a tela mostra as iniciais.
// Nada é baixado nem copiado: o navegador carrega a imagem direto da CDN do WhatsApp.

import { getAdminClient } from '@/lib/supabaseAdmin'
import { fetchProfilePicture } from './evolution'
import { isLidJid } from './phone'

const FRESH_MS = 12 * 60 * 60 * 1000

interface AvatarConv {
  id: string
  jid: string
  avatar_checked_at: string | null
}

export function isAvatarStale(checkedAt: string | null, now = Date.now()): boolean {
  return !checkedAt || now - new Date(checkedAt).getTime() > FRESH_MS
}

/** Número para a Evolution: o telefone (sem @) ou, se só há o identificador interno, o jid inteiro. */
function numberFor(jid: string): string {
  return isLidJid(jid) ? jid : jid.split('@')[0]
}

/**
 * Atualiza a foto da conversa se a última consulta estiver velha. Nunca lança: foto é detalhe,
 * não pode derrubar o webhook. Se a Evolution falhar, a foto anterior é mantida e só se adia a próxima tentativa.
 */
export async function refreshAvatar(instance: string, conv: AvatarConv): Promise<void> {
  if (!isAvatarStale(conv.avatar_checked_at)) return
  const admin = getAdminClient()
  const checked = new Date().toISOString()
  try {
    const url = await fetchProfilePicture(instance, numberFor(conv.jid))
    await admin.from('whatsapp_conversations').update({ avatar_url: url, avatar_checked_at: checked }).eq('id', conv.id)
  } catch (e) {
    console.warn('[whatsapp/avatar]', e instanceof Error ? e.message : e)
    await admin.from('whatsapp_conversations').update({ avatar_checked_at: checked }).eq('id', conv.id)
  }
}
