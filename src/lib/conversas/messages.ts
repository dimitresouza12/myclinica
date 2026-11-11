// Apresentação das mensagens de WhatsApp dentro do prontuário: ordenação, páginas, agrupamento por dia,
// rótulo de mídia e tempo relativo. Lógica pura (sem rede, sem React, sem relógio próprio).

import { dayKey, dayLabel } from '@/lib/whatsapp/inbox'

export type MsgKind = 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'other'

export interface ChatMessage {
  id: string
  created_at: string
  kind: MsgKind
  body: string | null
  direction: 'in' | 'out'
  deleted_at?: string | null
}

export const PAGE_SIZE = 40
export const MAX_PAGE_SIZE = 100

/** Tamanho de página pedido na query string: inteiro entre 1 e MAX_PAGE_SIZE; fora disso, o padrão. */
export function clampLimit(raw: string | null | undefined): number {
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) return PAGE_SIZE
  return Math.min(n, MAX_PAGE_SIZE)
}

/** Cursor de paginação (ISO) pedido na query string; null se ausente ou inválido. */
export function parseCursor(raw: string | null | undefined): string | null {
  if (!raw) return null
  const t = Date.parse(raw)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

/** Ordem cronológica (a mais antiga primeiro); empate pelo id para a ordem não pular entre cargas. */
export function sortAscending<T extends { id: string; created_at: string }>(msgs: readonly T[]): T[] {
  return [...msgs].sort((a, b) => {
    const d = Date.parse(a.created_at) - Date.parse(b.created_at)
    return d !== 0 ? d : a.id.localeCompare(b.id)
  })
}

/** Junta páginas (podem se sobrepor), tira as repetidas por id e devolve em ordem cronológica. */
export function mergePages<T extends { id: string; created_at: string }>(pages: readonly (readonly T[])[]): T[] {
  const byId = new Map<string, T>()
  for (const p of pages) for (const m of p) byId.set(m.id, m)
  return sortAscending([...byId.values()])
}

const MEDIA_LABEL: Record<MsgKind, string> = {
  text: '', image: 'Imagem', audio: 'Áudio', video: 'Vídeo', document: 'Documento', sticker: 'Figurinha', other: 'Mensagem',
}

/** Rótulo de uma mensagem que não é texto ("Imagem", "Áudio", "Documento"…); vazio para texto. */
export function mediaLabel(kind: MsgKind): string {
  return MEDIA_LABEL[kind] ?? MEDIA_LABEL.other
}

/** O que mostrar no balão: texto (ou legenda), com o rótulo da mídia quando houver. */
export function messageText(m: Pick<ChatMessage, 'kind' | 'body' | 'deleted_at'>): { label: string; text: string } {
  if (m.deleted_at) return { label: '', text: 'Mensagem apagada' }
  return { label: mediaLabel(m.kind), text: (m.body ?? '').trim() }
}

export interface DayGroup<T> { key: string; label: string; messages: T[] }

/** Agrupa mensagens (já em ordem cronológica) por dia no fuso da clínica: Hoje, Ontem, dia da semana ou dd/mm/aaaa. */
export function groupByDay<T extends { created_at: string }>(msgs: readonly T[], now: Date, timeZone: string): DayGroup<T>[] {
  const groups: DayGroup<T>[] = []
  for (const m of msgs) {
    const d = new Date(m.created_at)
    const key = dayKey(d, timeZone)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.messages.push(m)
    else groups.push({ key, label: dayLabel(d, now, timeZone), messages: [m] })
  }
  return groups
}

/** "agora", "há 5 min", "há 3 h", "ontem", "há 4 dias" e, depois de 30 dias, a data (dd/mm/aaaa). */
export function relativeTime(date: Date, now: Date, timeZone: string): string {
  const diff = now.getTime() - date.getTime()
  if (diff < 60_000) return 'agora'
  const min = Math.floor(diff / 60_000)
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  // dias de calendário no fuso da clínica, não blocos de 24 h
  const [ay, am, ad] = dayKey(date, timeZone).split('-').map(Number)
  const [ny, nm, nd] = dayKey(now, timeZone).split('-').map(Number)
  const days = Math.round((Date.UTC(ny, nm - 1, nd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
  if (days <= 1) return 'ontem'
  if (days <= 30) return `há ${days} dias`
  return `${String(ad).padStart(2, '0')}/${String(am).padStart(2, '0')}/${ay}`
}

/** Erro do PostgREST/Postgres para tabela inexistente (migração ainda não aplicada). */
export function isMissingTable(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205'
}
