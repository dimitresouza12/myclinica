// Textos e agrupamentos do Chat da equipe. Funções puras (sem React, sem rede).
import { CLINIC_TYPE_LABELS, specialtyRoleLabel } from '@/lib/specialtyConfig'
import type { ClinicType } from '@/types'
import { attachmentPreview } from './attachments'
import { plainText } from './richText'
import type {
  TeamChannel, TeamChannelKind, TeamChannelMember, TeamDirectoryEntry, TeamLastMessage, TeamLastMessages, TeamMessageView,
} from './types'

const ROLE_FALLBACK: Record<string, string> = {
  admin: 'Administrador',
  recepcao: 'Recepção',
  auxiliar: 'Auxiliar',
  dentista: 'Dentista',
  medico: 'Médico',
  profissional: 'Profissional',
}

const isClinicType = (v: string): v is ClinicType => v in CLINIC_TYPE_LABELS

/** Cargo para mostrar ao lado do nome: o da especialidade quando existe, senão o cargo genérico. */
export function memberRoleLabel(m: Pick<TeamDirectoryEntry, 'role' | 'areas'>): string {
  const staff = m.role === 'recepcao' || m.role === 'auxiliar' || m.role === 'admin'
  const area = m.areas.find(isClinicType)
  if (!staff && area) return specialtyRoleLabel(area)
  return ROLE_FALLBACK[m.role] ?? m.role
}

/** Minúsculas e sem acento, para a busca. */
export function normalizeSearch(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Por que o login não pode escrever neste canal (null: pode). */
export type ReadOnlyReason = 'archived' | 'admin' | null

export interface ChannelView {
  channel: TeamChannel
  title: string
  subtitle: string
  /** nome de quem aparece no avatar (direct: o outro; demais: o título) */
  avatarName: string
  /** conversa direta minha: id (clinic_user_id) do outro participante, para o indicador de online */
  otherUserId: string | null
  members: TeamChannelMember[]
  isMember: boolean
  readOnly: ReadOnlyReason
  muted: boolean
  unread: number
  last: TeamLastMessage | null
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function buildChannelViews(args: {
  channels: TeamChannel[]
  /** quem está em cada canal visível (pode chegar depois dos canais) */
  members: TeamChannelMember[]
  /** só as linhas do próprio login: em que canais estou e quais silenciei */
  mine: TeamChannelMember[]
  directory: TeamDirectoryEntry[]
  unread: Record<string, number>
  /** ausente = ainda não carregado; null = canal sem nenhuma mensagem */
  last: TeamLastMessages
  meId: string | null
}): ChannelView[] {
  const { channels, members, mine: myRows, directory, unread, last, meId } = args
  const names = new Map(directory.map(d => [d.clinic_user_id, d]))
  const myByChannel = new Map(myRows.map(m => [m.channel_id, m]))
  const byChannel = new Map<string, TeamChannelMember[]>()
  for (const m of members) {
    const list = byChannel.get(m.channel_id)
    if (list) list.push(m); else byChannel.set(m.channel_id, [m])
  }

  const out: ChannelView[] = []
  for (const c of channels) {
    const mem = byChannel.get(c.id) ?? []
    const mine = myByChannel.get(c.id)
    const lastMsg = last[c.id]
    // só some da lista o que é realmente vazio: conversa alheia (administrador) sem mensagem, ou canal arquivado sem mensagem.
    // Enquanto a última mensagem ainda não chegou (undefined), o canal continua visível.
    if (!mine && lastMsg === null) continue
    if (c.archived_at && lastMsg === null) continue

    let title = c.name ?? 'Conversa'
    let subtitle = ''
    let avatarName = title
    let otherUserId: string | null = null
    if (c.kind === 'direct') {
      const others = mem.filter(m => m.clinic_user_id !== meId)
      const people = (mine ? others : mem).map(m => names.get(m.clinic_user_id))
      const label = (p: TeamDirectoryEntry | undefined) => p?.display_name ?? 'Colega desativado'
      title = mem.length === 0 ? 'Conversa' : mine ? label(people[0]) : people.map(label).join(' e ') || 'Conversa'
      avatarName = people[0] ? label(people[0]) : title
      otherUserId = mine ? others[0]?.clinic_user_id ?? null : null
      subtitle = mine && people[0] ? memberRoleLabel(people[0]) : 'Conversa entre colegas'
    } else if (c.kind === 'general') {
      subtitle = `Toda a equipe · ${plural(mem.length, 'pessoa', 'pessoas')}`
    } else if (c.kind === 'area') {
      subtitle = `Área · ${plural(mem.length, 'pessoa', 'pessoas')}`
    } else {
      subtitle = plural(mem.length, 'participante', 'participantes')
    }
    if (c.archived_at) subtitle += ' · Arquivada'

    out.push({
      channel: c, title, subtitle, avatarName, otherUserId, members: mem, isMember: !!mine,
      readOnly: c.archived_at ? 'archived' : mine ? null : 'admin',
      muted: !!mine?.muted, unread: unread[c.id] ?? 0, last: lastMsg ?? null,
    })
  }
  return out
}

/** Filtro por tipo da lista de conversas. "Áreas" inclui o canal Geral. */
export type ChannelFilter = 'all' | 'direct' | 'group' | 'area'

export const CHANNEL_FILTERS: { value: ChannelFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'direct', label: 'Diretas' },
  { value: 'group', label: 'Grupos' },
  { value: 'area', label: 'Áreas' },
]

/** Ordem dos tipos entre conversas sem mensagem: Geral, Áreas, Diretas, Grupos. */
const KIND_ORDER: Record<TeamChannelKind, number> = { general: 0, area: 1, direct: 2, group: 3 }

export function matchesChannelFilter(kind: TeamChannelKind, filter: ChannelFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'area') return kind === 'area' || kind === 'general'
  return kind === filter
}

/**
 * Lista única estilo WhatsApp: aplica o filtro de tipo e a busca por nome (`query` já normalizada com normalizeSearch)
 * e ordena pela mensagem mais recente, de todos os tipos juntos. Conversas sem mensagem vão para o fim, por tipo
 * (Geral, Áreas, Diretas, Grupos) e depois por nome.
 */
export function arrangeChannelViews(views: ChannelView[], filter: ChannelFilter, query = ''): ChannelView[] {
  const time = (v: ChannelView) => (v.last ? Date.parse(v.last.created_at) : NaN)
  return views
    .filter(v => matchesChannelFilter(v.channel.kind, filter) && (!query || normalizeSearch(v.title).includes(query)))
    .sort((a, b) => {
      const ta = time(a)
      const tb = time(b)
      const hasA = !Number.isNaN(ta)
      const hasB = !Number.isNaN(tb)
      if (hasA && hasB && ta !== tb) return tb - ta
      if (hasA !== hasB) return hasA ? -1 : 1
      if (!hasA && !hasB && a.channel.kind !== b.channel.kind) return KIND_ORDER[a.channel.kind] - KIND_ORDER[b.channel.kind]
      return a.title.localeCompare(b.title, 'pt-BR')
    })
}

/** Não lidas por chip do filtro (só conversas não silenciadas). */
export function unreadByFilter(views: ChannelView[]): Record<ChannelFilter, number> {
  const out: Record<ChannelFilter, number> = { all: 0, direct: 0, group: 0, area: 0 }
  for (const v of views) {
    if (v.muted || v.unread <= 0) continue
    out.all += v.unread
    const key: ChannelFilter = v.channel.kind === 'general' ? 'area' : v.channel.kind
    out[key] += v.unread
  }
  return out
}

/** Resumo de uma linha para a lista: "Você: texto", "Nome: texto" (em canais com mais gente) ou "Mensagem apagada". */
export function lastPreview(v: ChannelView, meId: string | null, directory: TeamDirectoryEntry[]): string {
  const m = v.last
  if (!m) return 'Nenhuma mensagem ainda'
  if (m.deleted_at) return 'Mensagem apagada'
  // sem texto e com anexo: "Foto" ou "Áudio" (nunca vazio)
  const text = plainText(m.body).replace(/\s+/g, ' ').trim() || (m.has_attachment ? attachmentPreview(m.attachment_kind) : '')
  const short = text.length > 90 ? `${text.slice(0, 89)}…` : text
  if (m.sender_clinic_user_id && m.sender_clinic_user_id === meId) return `Você: ${short}`
  if (v.channel.kind === 'direct') return short
  const who = directory.find(d => d.clinic_user_id === m.sender_clinic_user_id)?.display_name.split(' ')[0]
  return who ? `${who}: ${short}` : short
}

/** Texto curto para a citação de uma mensagem respondida. */
export function quotePreview(m: Pick<TeamMessageView, 'body' | 'deleted_at' | 'has_attachment' | 'attachment' | 'localAttachment'>): string {
  if (m.deleted_at) return 'Mensagem apagada'
  const kind = m.attachment?.kind ?? m.localAttachment?.kind
  const text = plainText(m.body).replace(/\s+/g, ' ').trim() || (m.has_attachment ? attachmentPreview(kind) : '')
  return text.length > 120 ? `${text.slice(0, 119)}…` : text
}
