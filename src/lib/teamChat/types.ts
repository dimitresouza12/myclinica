// Tipos manuais do Chat da equipe. As tabelas team_* vêm da migração 20261120_chat_equipe.sql e ainda
// não estão nos tipos gerados do Supabase; este arquivo é o contrato que o app usa até lá.

export type TeamChannelKind = 'general' | 'area' | 'direct' | 'group'

export interface TeamChannel {
  id: string
  clinic_id: string
  kind: TeamChannelKind
  specialty_type: string | null
  /** direct não tem nome: o título é o do outro participante */
  name: string | null
  direct_key: string | null
  created_by: string | null
  archived_at: string | null
  created_at: string
}

export interface TeamChannelMember {
  channel_id: string
  clinic_user_id: string
  last_read_at: string
  muted: boolean
}

export interface TeamMessage {
  id: string
  channel_id: string
  clinic_id: string
  sender_clinic_user_id: string | null
  /** vazio quando a mensagem foi apagada (ou quando é só anexo, sem legenda) */
  body: string
  /** a mensagem tem foto ou áudio (a linha do anexo vem de team_message_attachments) */
  has_attachment: boolean
  reply_to_id: string | null
  created_at: string
  edited_at: string | null
  deleted_at: string | null
}

/** Estado local de uma mensagem enviada por mim: ainda indo ou que falhou (some quando o servidor confirma). */
export type TeamSendState = 'sending' | 'failed'

export type TeamAttachmentKind = 'image' | 'audio'

/** Linha de team_message_attachments. O arquivo vive no bucket privado `team-chat` por 15 dias. */
export interface TeamAttachment {
  id: string
  message_id: string
  channel_id: string
  clinic_id: string
  kind: TeamAttachmentKind
  storage_path: string
  mime: string
  size_bytes: number
  width: number | null
  height: number | null
  duration_ms: number | null
  expires_at: string
  expired_at: string | null
  created_at: string
}

/** Anexo ainda no aparelho de quem enviou (antes ou durante o envio): o arquivo local aparece na bolha. */
export interface TeamLocalAttachment {
  kind: TeamAttachmentKind
  /** arquivo comprimido; a bolha cria (e libera) o link de objeto (blob:) a partir dele */
  blob: Blob
  width: number | null
  height: number | null
  duration_ms: number | null
}

export interface TeamMessageView extends TeamMessage {
  /** só em mensagem local, antes da confirmação do servidor */
  sendState?: TeamSendState
  sendError?: string
  /** anexo do servidor. undefined = ainda não consultado; null = consultado e a mensagem não tem anexo */
  attachment?: TeamAttachment | null
  /** anexo local de uma mensagem minha em envio (ou recém-enviada): mostra o arquivo sem baixar de novo */
  localAttachment?: TeamLocalAttachment
}

/** Retorno de team_members_directory(). */
export interface TeamDirectoryEntry {
  clinic_user_id: string
  display_name: string
  role: string
  areas: string[]
  is_me: boolean
  /** foto de perfil (data URL webp); ausente enquanto a coluna/RPC não existir */
  avatar_data?: string | null
}

/** Retorno de team_unread_counts(). */
export interface TeamUnreadRow {
  channel_id: string
  unread: number
}

/** Cache das mensagens de um canal: ordem cronológica e se ainda há histórico mais antigo. */
export interface TeamMessagesCache {
  messages: TeamMessageView[]
  hasMore: boolean
}

/** Última mensagem de um canal. */
export type TeamLastMessage = Pick<TeamMessage, 'id' | 'channel_id' | 'sender_clinic_user_id' | 'body' | 'created_at' | 'deleted_at' | 'has_attachment'> & {
  /** tipo do anexo, quando a mensagem tem um (undefined: ainda não consultado) */
  attachment_kind?: TeamAttachmentKind | null
}

/**
 * Última mensagem por canal. Canal ausente = ainda não carregado; `null` = carregado e sem nenhuma mensagem
 * (só esse caso permite esconder um canal alheio da lista).
 */
export type TeamLastMessages = Record<string, TeamLastMessage | null>

/** Pedido para abrir um canal já rolando até uma mensagem (resultado de busca). `nonce` distingue dois pedidos iguais seguidos. */
export interface TeamJumpRequest {
  channelId: string
  messageId: string
  nonce: number
}
