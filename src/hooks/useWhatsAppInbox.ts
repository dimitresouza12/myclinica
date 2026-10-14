import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { whatsappApi } from '@/components/configuracoes/whatsappApi'

export interface WaConversation {
  id: string
  clinic_id: string
  phone_key: string
  jid: string
  contact_name: string | null
  patient_id: string | null
  last_message_at: string
  last_message_preview: string | null
  last_message_direction: 'in' | 'out' | null
  unread_count: number
  /** foto de perfil do contato no WhatsApp (pode ser null ou ter expirado: a tela cai nas iniciais) */
  avatar_url: string | null
  patients: { id: string; name: string; avatar_url: string | null } | null
}

export interface WaMessage {
  id: string
  conversation_id: string
  direction: 'in' | 'out'
  kind: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'other'
  body: string | null
  origin: 'contato' | 'sistema' | 'celular' | 'automatico'
  sent_by_name: string | null
  created_at: string
  /** só em mensagem com arquivo */
  media_status: 'pending' | 'ready' | 'failed' | 'expired' | null
  media_mime: string | null
  media_name: string | null
  media_size: number | null
  media_seconds: number | null
  /** miniatura JPEG em base64 (sem prefixo) */
  media_thumb: string | null
  /** onda do áudio (base64, até 64 valores de 0 a 100) */
  media_wave: string | null
  /** só em mensagem enviada: sent | delivered | read (vazio = ainda sem confirmação) */
  delivery_status: 'sent' | 'delivered' | 'read' | null
  /** uma reação por pessoa */
  reactions: { contato?: string; clinica?: string } | null
  deleted_at: string | null
  edited_at: string | null
}

/** Foto para mostrar: a do WhatsApp; senão a do cadastro do paciente; senão nenhuma (a tela usa as iniciais). */
export function conversationPhoto(c: Pick<WaConversation, 'avatar_url' | 'patients'>): string | null {
  return c.avatar_url || c.patients?.avatar_url || null
}

export function useConversations(clinicId: string | undefined) {
  return useQuery({
    queryKey: ['wa-convs', clinicId],
    queryFn: async () => {
      if (!clinicId) return []
      const { data, error } = await supabase
        .from('whatsapp_conversations')
        .select('id, clinic_id, phone_key, jid, contact_name, patient_id, last_message_at, last_message_preview, last_message_direction, unread_count, avatar_url, patients(id, name, avatar_url)')
        .eq('clinic_id', clinicId)
        .order('last_message_at', { ascending: false })
        .limit(300)
      if (error) throw error
      return (data ?? []) as unknown as WaConversation[]
    },
    enabled: !!clinicId,
    staleTime: 15_000,
    // rede de segurança caso o Realtime esteja fora: a lista se atualiza sozinha de tempos em tempos
    refetchInterval: 30_000,
  })
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ['wa-msgs', conversationId],
    queryFn: async () => {
      if (!conversationId) return []
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('id, conversation_id, direction, kind, body, origin, sent_by_name, created_at, media_status, media_mime, media_name, media_size, media_seconds, media_thumb, media_wave, delivery_status, reactions, deleted_at, edited_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(500)
      if (error) throw error
      return (data ?? []) as WaMessage[]
    },
    enabled: !!conversationId,
    staleTime: 10_000,
    refetchInterval: 30_000,
  })
}

/** Soma das mensagens não lidas (contador do menu lateral). */
export function useUnreadTotal(clinicId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['wa-unread', clinicId],
    queryFn: async () => {
      if (!clinicId) return 0
      const { data } = await supabase.from('whatsapp_conversations').select('unread_count').eq('clinic_id', clinicId).gt('unread_count', 0)
      return (data ?? []).reduce((n, r) => n + (r.unread_count as number), 0)
    },
    enabled: !!clinicId && enabled,
    staleTime: 20_000,
    refetchInterval: 60_000,
  })
}

/** Realtime: qualquer mudança nas conversas ou mensagens da clínica atualiza as telas abertas. */
export function useWhatsAppRealtime(clinicId: string | undefined, enabled: boolean) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!clinicId || !enabled) return
    const refreshLists = () => {
      qc.invalidateQueries({ queryKey: ['wa-convs', clinicId] })
      qc.invalidateQueries({ queryKey: ['wa-unread', clinicId] })
    }
    const channel = supabase
      .channel(`wa-${clinicId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations', filter: `clinic_id=eq.${clinicId}` }, refreshLists)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_messages', filter: `clinic_id=eq.${clinicId}` }, (payload) => {
        const convId = (payload.new as { conversation_id?: string } | undefined)?.conversation_id
        if (convId) qc.invalidateQueries({ queryKey: ['wa-msgs', convId] })
        refreshLists()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [clinicId, enabled, qc])
}

/**
 * Links temporários dos arquivos já disponíveis na conversa (uma chamada só para todos). Os links duram
 * 15 minutos; a consulta é refeita antes disso e quando chega arquivo novo.
 */
export function useMediaUrls(conversationId: string | null, messages: WaMessage[]) {
  const ids = messages.filter(m => m.media_status === 'ready').slice(-60).map(m => m.id)
  return useQuery({
    queryKey: ['wa-media', conversationId, ids.join(',')],
    queryFn: async () => {
      if (ids.length === 0) return {} as Record<string, string>
      const r = await whatsappApi<{ urls: Record<string, string> }>('/api/whatsapp/media/urls', { method: 'POST', body: { messageIds: ids } })
      return r.urls
    },
    enabled: !!conversationId && ids.length > 0,
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
    placeholderData: prev => prev,
  })
}

export interface QuickReplyRow { id: string; title: string; body: string }

/** Respostas rápidas da clínica (textos prontos). */
export function useQuickReplies(clinicId: string | undefined) {
  return useQuery({
    queryKey: ['wa-quick', clinicId],
    queryFn: async () => {
      if (!clinicId) return []
      const { data, error } = await supabase.from('whatsapp_quick_replies').select('id, title, body').eq('clinic_id', clinicId).order('title')
      if (error) throw error
      return (data ?? []) as QuickReplyRow[]
    },
    enabled: !!clinicId,
    staleTime: 60_000,
  })
}

/** Cria ou atualiza uma resposta rápida. Devolve a mensagem de erro, ou null se deu certo. */
export async function saveQuickReply(clinicId: string, input: { id?: string; title: string; body: string }): Promise<string | null> {
  const row = { title: input.title.trim(), body: input.body.trim() }
  const { error } = input.id
    ? await supabase.from('whatsapp_quick_replies').update(row).eq('id', input.id).eq('clinic_id', clinicId)
    : await supabase.from('whatsapp_quick_replies').insert({ ...row, clinic_id: clinicId })
  if (!error) return null
  return error.code === '23505' ? 'Já existe uma resposta com esse nome.' : 'Não foi possível salvar. Tente de novo.'
}

export async function deleteQuickReply(clinicId: string, id: string): Promise<string | null> {
  const { error } = await supabase.from('whatsapp_quick_replies').delete().eq('id', id).eq('clinic_id', clinicId)
  return error ? 'Não foi possível excluir. Tente de novo.' : null
}

/** Arquivo ou áudio que ainda está sendo enviado (ou que falhou): aparece na conversa na hora, antes de o servidor confirmar. */
export interface OutboxItem {
  id: string
  convId: string
  kind: 'image' | 'document' | 'audio'
  name: string
  caption: string
  seconds: number | null
  /** onda do áudio gravado */
  wave?: string | null
  size: number
  /** miniatura local da imagem enviada */
  previewUrl: string | null
  status: 'sending' | 'failed'
  error: string
  retry: () => Promise<void>
  dispose: () => void
}
