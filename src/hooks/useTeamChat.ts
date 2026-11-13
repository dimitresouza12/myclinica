'use client'
// Chat da equipe: dados (React Query), tempo real e ações. O banco é o da migração 20261120_chat_equipe.sql.
//
// Realtime: a assinatura de team_messages fica numa única montagem, a da barra lateral (useTeamChatRealtime),
// porque ela está em todas as telas e é ela que alimenta o contador. A tela do chat não assina de novo: lê o
// que a assinatura grava no cache do React Query.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { create } from 'zustand'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { teamChatErrorMessage } from '@/lib/teamChat/errors'
import { escapeLike, patientSearchTerms, visibleTextHas } from '@/lib/teamChat/richText'
import { ATTACHMENT_TTL_DAYS, TEAM_BUCKET, baseMime, buildStoragePath } from '@/lib/teamChat/attachments'
import type {
  TeamAttachment, TeamAttachmentKind, TeamChannel, TeamChannelMember, TeamDirectoryEntry, TeamLastMessage, TeamLastMessages,
  TeamMessage, TeamMessagesCache, TeamMessageView, TeamUnreadRow,
} from '@/lib/teamChat/types'

/** Quantas mensagens vêm por página (as mais recentes primeiro; "carregar anteriores" busca mais). */
export const TEAM_PAGE_SIZE = 50

const MSG_COLS = 'id, channel_id, clinic_id, sender_clinic_user_id, body, has_attachment, reply_to_id, created_at, edited_at, deleted_at'
const CHANNEL_COLS = 'id, clinic_id, kind, specialty_type, name, direct_key, created_by, archived_at, created_at'
const MEMBER_COLS = 'channel_id, clinic_user_id, last_read_at, muted'
const ATT_COLS = 'id, message_id, channel_id, clinic_id, kind, storage_path, mime, size_bytes, width, height, duration_ms, expires_at, expired_at, created_at'
/** Ids por consulta de anexos: o filtro `in` vai na URL, então lotes pequenos. */
const ATT_BATCH = 50

// Toda chave começa pelo "escopo" (id do login + id da clínica): o cache de um login nunca é reaproveitado por outro.
const KEYS = {
  enabled: (s: string) => ['team-enabled', s] as const,
  directory: (s: string) => ['team-directory', s] as const,
  channels: (s: string) => ['team-channels', s] as const,
  mine: (s: string) => ['team-mine', s] as const,
  membersAll: (s: string) => ['team-members', s] as const,
  members: (s: string, idsKey: string) => ['team-members', s, idsKey] as const,
  unread: (s: string) => ['team-unread', s] as const,
  lastAll: (s: string) => ['team-last', s] as const,
  last: (s: string, channelId: string) => ['team-last', s, channelId] as const,
  msgs: (s: string, channelId: string | null) => ['team-msgs', s, channelId] as const,
  search: (s: string, channelId: string | null, term: string) => ['team-search', s, channelId ?? 'todas', term] as const,
  patients: (s: string, term: string) => ['team-patients', s, term] as const,
}

/** Escopo das chaves: login + clínica. */
function useScope(clinicId: string | undefined): string {
  const uid = useAuthStore(s => s.user?.id)
  return `${uid ?? 'sem-login'}:${clinicId ?? 'sem-clinica'}`
}

const ts = (iso: string) => Date.parse(iso)

// ── canal aberto na tela (para não contar como não lida a mensagem que chega com a conversa aberta) ──

interface TeamChatUi {
  activeChannelId: string | null
  setActive: (id: string | null) => void
}

export const useTeamChatUi = create<TeamChatUi>(set => ({
  activeChannelId: null,
  setActive: id => set({ activeChannelId: id }),
}))


// ── consultas ───────────────────────────────────────────────────────────────

/**
 * A clínica tem o chat habilitado (3 ou mais profissionais)? Vale 5 minutos. Erro conta como "não", mas a consulta
 * tenta de novo (2 vezes com espera crescente) e, enquanto estiver em erro, refaz a cada 30 s até dar certo.
 */
export function useTeamChatEnabled(clinicId: string | undefined, enabled = true) {
  const scope = useScope(clinicId)
  return useQuery({
    queryKey: KEYS.enabled(scope),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('team_chat_enabled', { p_clinic: clinicId })
      if (error) throw error
      return data === true
    },
    enabled: !!clinicId && enabled,
    staleTime: 5 * 60_000,
    retry: 2,
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 8000),
    refetchInterval: query => (query.state.status === 'error' ? 30_000 : false),
  })
}

/** Colegas ativos da clínica (nome, cargo e áreas). `is_me` marca o login atual. */
export function useTeamDirectory(clinicId: string | undefined, enabled = true) {
  const scope = useScope(clinicId)
  return useQuery({
    queryKey: KEYS.directory(scope),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('team_members_directory')
      if (error) throw error
      return (data ?? []) as TeamDirectoryEntry[]
    },
    enabled: !!clinicId && enabled,
    staleTime: 2 * 60_000,
    retry: 1,
  })
}

/** Canais que o login pode ver (a RLS decide). Quem está em cada um vem de useTeamChannelMembers. */
export function useTeamChannels(clinicId: string | undefined, enabled = true) {
  const scope = useScope(clinicId)
  return useQuery({
    queryKey: KEYS.channels(scope),
    queryFn: async (): Promise<TeamChannel[]> => {
      const { data, error } = await supabase
        .from('team_channels')
        .select(CHANNEL_COLS)
        .eq('clinic_id', clinicId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as TeamChannel[]
    },
    enabled: !!clinicId && enabled,
    staleTime: 60_000,
    retry: 1,
  })
}

/** Só as linhas do próprio login em team_channel_members: em que canais estou e quais silenciei. É o que a barra lateral usa. */
export function useTeamMyMemberships(clinicId: string | undefined, meId: string | null, enabled = true) {
  const scope = useScope(clinicId)
  return useQuery({
    queryKey: KEYS.mine(scope),
    queryFn: async (): Promise<TeamChannelMember[]> => {
      const { data, error } = await supabase.from('team_channel_members').select(MEMBER_COLS).eq('clinic_user_id', meId!)
      if (error) throw error
      return (data ?? []) as TeamChannelMember[]
    },
    enabled: !!clinicId && !!meId && enabled,
    staleTime: 60_000,
    retry: 1,
  })
}

const MEMBER_BATCH = 100
const MEMBER_PAGE = 1000

/**
 * Quem está em cada canal visível (para título de conversa direta e contagem de pessoas), só para a tela do chat.
 * Busca por lotes de 100 canais e pagina de 1000 em 1000 linhas, para não esbarrar no limite da API.
 */
export function useTeamChannelMembers(clinicId: string | undefined, channelIds: string[], enabled = true) {
  const scope = useScope(clinicId)
  const ids = useMemo(() => channelIds.slice().sort(), [channelIds])
  const idsKey = ids.join(',')
  return useQuery({
    queryKey: KEYS.members(scope, idsKey),
    queryFn: async (): Promise<TeamChannelMember[]> => {
      const batches: string[][] = []
      for (let i = 0; i < ids.length; i += MEMBER_BATCH) batches.push(ids.slice(i, i + MEMBER_BATCH))
      const perBatch = await Promise.all(batches.map(async batch => {
        const rows: TeamChannelMember[] = []
        for (let from = 0; ; from += MEMBER_PAGE) {
          const { data, error } = await supabase
            .from('team_channel_members')
            .select(MEMBER_COLS)
            .in('channel_id', batch)
            .order('channel_id')
            .order('clinic_user_id')
            .range(from, from + MEMBER_PAGE - 1)
          if (error) throw error
          const page = (data ?? []) as TeamChannelMember[]
          rows.push(...page)
          if (page.length < MEMBER_PAGE) break
        }
        return rows
      }))
      return perBatch.flat()
    },
    enabled: !!clinicId && enabled && ids.length > 0,
    staleTime: 60_000,
    placeholderData: prev => prev,
    retry: 1,
  })
}

/** Não lidas por canal (só canais em que sou membro). */
export function useTeamUnread(clinicId: string | undefined, enabled = true) {
  const scope = useScope(clinicId)
  return useQuery({
    queryKey: KEYS.unread(scope),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('team_unread_counts')
      if (error) throw error
      const out: Record<string, number> = {}
      for (const r of (data ?? []) as TeamUnreadRow[]) out[r.channel_id] = Number(r.unread)
      return out
    },
    enabled: !!clinicId && enabled,
    staleTime: 15_000,
    // rede de segurança caso o Realtime esteja fora
    refetchInterval: 60_000,
    retry: 1,
  })
}

const lastCombine = (results: { data: TeamLastMessage | null | undefined }[]) => results.map(r => r.data)

/**
 * Última mensagem de cada canal, uma consulta por canal (limit 1), em paralelo: não depende de quantas mensagens
 * a clínica trocou. Canal ainda não carregado fica fora do resultado; canal sem mensagem vem como null.
 */
export function useTeamLastMessages(clinicId: string | undefined, channelIds: string[], enabled = true): TeamLastMessages {
  const scope = useScope(clinicId)
  const datas = useQueries({
    queries: channelIds.map(channelId => ({
      queryKey: KEYS.last(scope, channelId),
      queryFn: async (): Promise<TeamLastMessage | null> => {
        const { data, error } = await supabase
          .from('team_messages')
          .select('id, channel_id, sender_clinic_user_id, body, has_attachment, created_at, deleted_at')
          .eq('channel_id', channelId)
          .order('created_at', { ascending: false })
          .limit(1)
        if (error) throw error
        const row = ((data ?? [])[0] as TeamLastMessage | undefined) ?? null
        // mensagem sem texto: só pode ser anexo; o tipo dá a prévia "Foto" ou "Áudio"
        if (row && !row.deleted_at && row.has_attachment && !row.body) {
          const kind = await fetchAttachmentKind(row.id)
          if (kind !== undefined) row.attachment_kind = kind
        }
        return row
      },
      enabled: !!clinicId && enabled,
      staleTime: 60_000,
      retry: 1,
    })),
    combine: lastCombine,
  })
  return useMemo(() => {
    const out: TeamLastMessages = {}
    channelIds.forEach((id, i) => { if (datas[i] !== undefined) out[id] = datas[i] })
    return out
  }, [channelIds, datas])
}

/** Total de não lidas do menu lateral. Conversas silenciadas não entram na soma. Só usa as linhas do próprio login. */
export function useTeamUnreadTotal(clinicId: string | undefined, enabled = true): number {
  const { data: unread } = useTeamUnread(clinicId, enabled)
  const { data: dir } = useTeamDirectory(clinicId, enabled)
  const meId = dir?.find(d => d.is_me)?.clinic_user_id ?? null
  const { data: mine } = useTeamMyMemberships(clinicId, meId, enabled)
  return useMemo(() => {
    if (!unread) return 0
    const muted = new Set((mine ?? []).filter(m => m.muted).map(m => m.channel_id))
    let total = 0
    for (const [channelId, n] of Object.entries(unread)) if (!muted.has(channelId)) total += n
    return total
  }, [unread, mine])
}

// ── anexos (foto e áudio) ───────────────────────────────────────────────────
// O Realtime não cobre team_message_attachments: os anexos vêm por consulta em lote (message_id in (...)) ao carregar páginas
// e ao chegar mensagem nova, e são juntados à mensagem na memória.

/** Anexos das mensagens, por message_id. null quando a consulta falhou (o anexo continua "não consultado" e é tentado de novo). */
async function fetchAttachmentMap(ids: string[]): Promise<Map<string, TeamAttachment> | null> {
  const out = new Map<string, TeamAttachment>()
  if (ids.length === 0) return out
  const batches: string[][] = []
  for (let i = 0; i < ids.length; i += ATT_BATCH) batches.push(ids.slice(i, i + ATT_BATCH))
  const results = await Promise.all(batches.map(b => supabase.from('team_message_attachments').select(ATT_COLS).in('message_id', b)))
  for (const r of results) {
    if (r.error) return null
    for (const a of (r.data ?? []) as TeamAttachment[]) out.set(a.message_id, a)
  }
  return out
}

/**
 * Transforma as linhas do servidor em mensagens com anexo: herda o que o cache já sabia (anexo e arquivo local) e consulta só o
 * que ainda não foi consultado. Mensagem sem anexo ou apagada não tem o que consultar.
 */
async function withAttachments(rows: TeamMessage[], prev: TeamMessageView[] | undefined): Promise<TeamMessageView[]> {
  const known = new Map((prev ?? []).map(m => [m.id, m]))
  const views: TeamMessageView[] = rows.map(r => {
    const p = known.get(r.id)
    const v: TeamMessageView = { ...r }
    // só mensagem com anexo (e não apagada) tem o que consultar
    if (r.deleted_at || !r.has_attachment) v.attachment = null
    else if (p && p.attachment !== undefined) v.attachment = p.attachment
    if (p?.localAttachment) v.localAttachment = p.localAttachment
    return v
  })
  const missing = views.filter(v => v.attachment === undefined).map(v => v.id)
  if (missing.length === 0) return views
  const found = await fetchAttachmentMap(missing)
  if (!found) return views
  const set = new Set(missing)
  return views.map(v => (set.has(v.id) ? { ...v, attachment: found.get(v.id) ?? null } : v))
}

/** Tipo do anexo de uma mensagem (para a prévia "Foto"/"Áudio" na lista de conversas). */
async function fetchAttachmentKind(messageId: string): Promise<TeamAttachmentKind | null | undefined> {
  const { data, error } = await supabase.from('team_message_attachments').select('kind').eq('message_id', messageId).limit(1)
  if (error) return undefined
  return ((data ?? [])[0] as { kind: TeamAttachmentKind } | undefined)?.kind ?? null
}

/** Fila de consulta de anexos de mensagens que chegaram pelo Realtime: junta o que chega em 120 ms numa consulta só. */
const attQueue = new Map<string, { qc: QueryClient; items: Map<string, string> }>()
let attTimer: ReturnType<typeof setTimeout> | null = null

function queueAttachmentFetch(qc: QueryClient, scope: string, channelId: string, messageId: string) {
  let q = attQueue.get(scope)
  if (!q) { q = { qc, items: new Map() }; attQueue.set(scope, q) }
  q.items.set(messageId, channelId)
  if (attTimer) return
  attTimer = setTimeout(() => {
    attTimer = null
    const queues = Array.from(attQueue.entries())
    attQueue.clear()
    for (const [sc, { qc: client, items }] of queues) {
      void fetchAttachmentMap(Array.from(items.keys())).then(found => {
        if (!found) return
        const byChannel = new Map<string, Set<string>>()
        for (const [id, ch] of items) {
          const set = byChannel.get(ch)
          if (set) set.add(id); else byChannel.set(ch, new Set([id]))
        }
        for (const [ch, ids] of byChannel) {
          patchMessages(client, sc, ch, list => list.map(m => (ids.has(m.id) && m.attachment === undefined ? { ...m, attachment: found.get(m.id) ?? null } : m)))
          for (const id of ids) setLastKind(client, sc, ch, id, found.get(id)?.kind ?? null)
        }
      })
    }
  }, 120)
}

/** Preenche o tipo de anexo da "última mensagem" do canal, se for ela. */
function setLastKind(qc: QueryClient, scope: string, channelId: string, messageId: string, kind: TeamAttachmentKind | null) {
  qc.setQueryData<TeamLastMessage | null>(KEYS.last(scope, channelId), old => (old && old.id === messageId ? { ...old, attachment_kind: kind } : old))
}

// ── mensagens de um canal ───────────────────────────────────────────────────

/** Junta a página mais recente do servidor com o que já estava no cache (páginas antigas e mensagens locais). */
function mergeLatest(prev: TeamMessagesCache | undefined, fresh: TeamMessageView[], freshFull: boolean): TeamMessagesCache {
  if (!prev) return { messages: fresh, hasMore: freshFull }
  const freshIds = new Set(fresh.map(m => m.id))
  const local = prev.messages.filter(m => m.sendState && !freshIds.has(m.id))
  const prevServer = prev.messages.filter(m => !m.sendState)
  // página cheia sem nenhuma mensagem em comum com o cache: houve um buraco (ficou muito tempo sem atualizar); parte só do que veio
  if (freshFull && prevServer.length > 0 && !prevServer.some(m => freshIds.has(m.id))) {
    return { messages: [...fresh, ...local], hasMore: true }
  }
  const oldestFresh = fresh.length ? ts(fresh[0].created_at) : null
  const older = prevServer.filter(m => !freshIds.has(m.id) && (oldestFresh === null || ts(m.created_at) <= oldestFresh))
  return { messages: [...older, ...fresh, ...local], hasMore: older.length > 0 ? prev.hasMore : freshFull }
}

/** Mensagens do canal aberto: as últimas 50, mais as páginas antigas já carregadas. */
export function useTeamMessages(clinicId: string | undefined, channelId: string | null, enabled = true) {
  const qc = useQueryClient()
  const scope = useScope(clinicId)
  return useQuery<TeamMessagesCache>({
    queryKey: KEYS.msgs(scope, channelId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_messages')
        .select(MSG_COLS)
        .eq('channel_id', channelId!)
        .order('created_at', { ascending: false })
        .limit(TEAM_PAGE_SIZE)
      if (error) throw error
      const rows = ((data ?? []) as TeamMessage[]).reverse()
      const fresh = await withAttachments(rows, qc.getQueryData<TeamMessagesCache>(KEYS.msgs(scope, channelId))?.messages)
      return mergeLatest(qc.getQueryData<TeamMessagesCache>(KEYS.msgs(scope, channelId)), fresh, rows.length >= TEAM_PAGE_SIZE)
    },
    enabled: !!channelId && enabled,
    staleTime: 10_000,
    refetchInterval: 30_000,
    retry: 1,
  })
}

// ── busca ───────────────────────────────────────────────────────────────────

/** Mínimo de letras para buscar (menos que isso devolveria quase tudo). */
export const TEAM_SEARCH_MIN = 2
/** Quantos resultados a busca de mensagens traz (os mais recentes). */
export const TEAM_SEARCH_LIMIT = 30
/** O banco busca no corpo cru (com os tokens); pede mais para sobrar depois de descartar o que só casa com o token. */
const TEAM_SEARCH_FETCH = 60

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/**
 * Busca no texto das mensagens (ilike, sem apagadas, mais recentes primeiro, no máximo 30). Com `channelId`, só dentro
 * dessa conversa; sem ele, em todas as que o login pode ler (a RLS decide). Espera 300 ms depois da última tecla.
 */
export function useTeamMessageSearch(clinicId: string | undefined, term: string, channelId: string | null, enabled = true) {
  const scope = useScope(clinicId)
  const typed = term.trim()
  const debounced = useDebounced(typed, 300)
  const active = enabled && !!clinicId && debounced.length >= TEAM_SEARCH_MIN
  const query = useQuery({
    queryKey: KEYS.search(scope, channelId, debounced),
    queryFn: async (): Promise<{ rows: TeamMessage[]; more: boolean }> => {
      const base = supabase
        .from('team_messages')
        .select(MSG_COLS)
        .eq('clinic_id', clinicId!)
        .is('deleted_at', null)
        .ilike('body', `%${escapeLike(debounced)}%`)
      const { data, error } = await (channelId ? base.eq('channel_id', channelId) : base)
        .order('created_at', { ascending: false })
        .limit(TEAM_SEARCH_FETCH)
      if (error) throw error
      const raw = (data ?? []) as TeamMessage[]
      // só vale o que está no texto que a pessoa vê: "paciente:", pedaço de uuid e o resto do token não são resultado
      const rows = raw.filter(m => visibleTextHas(m.body, debounced))
      return { rows: rows.slice(0, TEAM_SEARCH_LIMIT), more: rows.length > TEAM_SEARCH_LIMIT || raw.length >= TEAM_SEARCH_FETCH }
    },
    enabled: active,
    staleTime: 30_000,
    retry: 1,
  })
  return {
    /** termo que a consulta usa (já com a espera aplicada) */
    term: debounced,
    /** há consulta rodando ou o termo ainda vai ser consultado */
    active,
    /** o usuário ainda está digitando: o termo consultado é o anterior */
    waiting: enabled && typed.length >= TEAM_SEARCH_MIN && typed !== debounced,
    data: active ? query.data?.rows : undefined,
    /** há mais mensagens do que as exibidas */
    more: active ? (query.data?.more ?? false) : false,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}

export interface TeamPatientHit {
  id: string
  name: string
  phone: string | null
  pet_name: string | null
}

/** Busca de pacientes da clínica por nome (ou nome do pet) para citar na conversa. Até 8; a RLS de patients vale. */
export function useTeamPatientSearch(clinicId: string | undefined, term: string, enabled = true) {
  const scope = useScope(clinicId)
  const debounced = useDebounced(term.trim(), 250)
  // sem 2 letras úteis (só % _ , etc.) não há consulta: um curinga puro casaria com todos os pacientes
  const variants = useMemo(() => patientSearchTerms(debounced), [debounced])
  const active = enabled && !!clinicId && variants.length > 0
  const query = useQuery({
    queryKey: KEYS.patients(scope, variants.join('|')),
    queryFn: async (): Promise<TeamPatientHit[]> => {
      if (variants.length === 0) return []
      // nome e nome do pet, no termo digitado e no termo sem acento (os termos já vêm sem os caracteres do filtro)
      const filter = variants.flatMap(v => [`name.ilike.%${v}%`, `pet_name.ilike.%${v}%`]).join(',')
      const { data, error } = await supabase
        .from('patients')
        .select('id, name, phone, pet_name')
        .eq('clinic_id', clinicId!)
        .eq('is_active', true)
        .or(filter)
        .order('name')
        .limit(8)
      if (error) throw error
      return (data ?? []) as TeamPatientHit[]
    },
    enabled: active,
    staleTime: 30_000,
    retry: 1,
  })
  return {
    /** há 2 ou mais letras úteis para buscar */
    active,
    waiting: enabled && term.trim().length >= TEAM_SEARCH_MIN && term.trim() !== debounced,
    data: active ? query.data : undefined,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}

// ── escrita no cache (usada pelo Realtime e pelas ações) ────────────────────

function patchMessages(qc: QueryClient, scope: string, channelId: string, fn: (list: TeamMessageView[]) => TeamMessageView[]) {
  qc.setQueryData<TeamMessagesCache>(KEYS.msgs(scope, channelId), old => (old ? { ...old, messages: fn(old.messages) } : old))
}

/**
 * Põe a mensagem do servidor no cache do canal (se o canal já foi aberto). Troca a de mesmo id; só uma INSERÇÃO
 * acrescenta: um UPDATE de mensagem que não está no cache (histórico antigo) nunca cria bolha nova.
 */
function upsertMessage(qc: QueryClient, scope: string, row: TeamMessage, insert: boolean) {
  patchMessages(qc, scope, row.channel_id, list => {
    const i = list.findIndex(m => m.id === row.id)
    if (i >= 0) {
      const next = list.slice()
      // o anexo não vem na linha da mensagem: continua o que já estava no cache
      next[i] = { ...row, attachment: list[i].attachment, localAttachment: list[i].localAttachment }
      return next
    }
    if (!insert) return list
    return [...list, { ...row }].sort((a, b) => ts(a.created_at) - ts(b.created_at))
  })
}

/** Atualiza a "última mensagem" do canal: só uma inserção mais nova a troca; edição/apagar só vale se for a própria última. */
function updateLast(qc: QueryClient, scope: string, row: TeamMessage, insert: boolean, kind?: TeamAttachmentKind | null) {
  qc.setQueryData<TeamLastMessage | null>(KEYS.last(scope, row.channel_id), old => {
    const next: TeamLastMessage = {
      id: row.id, channel_id: row.channel_id, sender_clinic_user_id: row.sender_clinic_user_id,
      body: row.body, has_attachment: row.has_attachment, created_at: row.created_at, deleted_at: row.deleted_at,
      // edição e apagar não mudam o anexo: o tipo que já se sabia continua
      attachment_kind: kind !== undefined ? kind : old && old.id === row.id ? old.attachment_kind : undefined,
    }
    if (insert) return !old || ts(row.created_at) >= ts(old.created_at) ? next : old
    return old && old.id === row.id ? next : old
  })
}

async function markChannelRead(qc: QueryClient, scope: string, channelId: string) {
  const { error } = await supabase.rpc('team_mark_read', { p_channel: channelId })
  if (error) return
  qc.setQueryData<Record<string, number>>(KEYS.unread(scope), old => (old ? { ...old, [channelId]: 0 } : old))
}

// ── tempo real ──────────────────────────────────────────────────────────────

/** Canais alheios (administrador) vistos há pouco: evita refazer consultas a cada evento de uma conversa que não é minha. */
const recheckedAt = new Map<string, number>()
const RECHECK_MS = 60_000

/**
 * Envios de anexo em andamento por canal (escopo:canal). A mensagem de anexo nasce no servidor (a RPC devolve o id), então a
 * inserção chega pelo Realtime com um id que a bolha local não conhece: enquanto o envio não termina, a inserção própria é
 * ignorada e o envio põe a mensagem definitiva no lugar da local.
 */
const pendingAttachmentSends = new Map<string, number>()
const pendingKey = (scope: string, channelId: string) => `${scope}:${channelId}`

function handleRealtime(qc: QueryClient, scope: string, eventType: string, row: TeamMessage | undefined) {
  if (!row?.id || !row.channel_id) return
  const insert = eventType === 'INSERT'
  const me = qc.getQueryData<TeamDirectoryEntry[]>(KEYS.directory(scope))?.find(d => d.is_me)?.clinic_user_id
  if (insert && me && row.sender_clinic_user_id === me && (pendingAttachmentSends.get(pendingKey(scope, row.channel_id)) ?? 0) > 0) {
    const cached = qc.getQueryData<TeamMessagesCache>(KEYS.msgs(scope, row.channel_id))
    if (!cached?.messages.some(m => m.id === row.id)) return
  }
  upsertMessage(qc, scope, row, insert)
  updateLast(qc, scope, row, insert)
  // anexos não passam pelo Realtime: busca o da mensagem nova (só se ela tem anexo)
  if (insert && row.has_attachment) {
    queueAttachmentFetch(qc, scope, row.channel_id, row.id)
  }
  if (!insert) return

  if (me && row.sender_clinic_user_id === me) return

  const mine = qc.getQueryData<TeamChannelMember[]>(KEYS.mine(scope))
  if (mine && !mine.some(m => m.channel_id === row.channel_id)) {
    // não sou membro. Se o canal já é conhecido, é conversa alheia que o administrador pode ler: nada a contar.
    // Se é desconhecido, pode ser conversa nova comigo (ou grupo onde me puseram): confere uma vez por minuto.
    const known = qc.getQueryData<TeamChannel[]>(KEYS.channels(scope))?.some(c => c.id === row.channel_id)
    if (known) return
    const key = `${scope}:${row.channel_id}`
    const last = recheckedAt.get(key)
    if (last !== undefined && Date.now() - last < RECHECK_MS) return
    recheckedAt.set(key, Date.now())
    qc.invalidateQueries({ queryKey: KEYS.channels(scope) })
    qc.invalidateQueries({ queryKey: KEYS.mine(scope) })
    qc.invalidateQueries({ queryKey: KEYS.membersAll(scope) })
    qc.invalidateQueries({ queryKey: KEYS.unread(scope) })
    return
  }

  const watching = useTeamChatUi.getState().activeChannelId === row.channel_id && document.visibilityState === 'visible'
  if (watching) void markChannelRead(qc, scope, row.channel_id)
  else qc.invalidateQueries({ queryKey: KEYS.unread(scope) })
}

/** Refaz o que o Realtime pode ter perdido (aba que voltou, rede que voltou, canal que reconectou). */
function refreshAfterGap(qc: QueryClient, scope: string) {
  qc.invalidateQueries({ queryKey: KEYS.unread(scope) })
  qc.invalidateQueries({ queryKey: KEYS.lastAll(scope) })
  qc.invalidateQueries({ queryKey: KEYS.channels(scope) })
  qc.invalidateQueries({ queryKey: KEYS.mine(scope) })
  qc.invalidateQueries({ queryKey: KEYS.membersAll(scope) })
  const active = useTeamChatUi.getState().activeChannelId
  if (active) qc.invalidateQueries({ queryKey: KEYS.msgs(scope, active) })
}

/**
 * Assina team_messages da clínica. Montar UMA vez (na barra lateral): uma segunda assinatura com o mesmo
 * nome de canal quebraria. Ao voltar para a aba, quando a rede volta ou quando o canal reconecta, refaz as
 * consultas para pegar o que o Realtime perdeu.
 */
export function useTeamChatRealtime(clinicId: string | undefined, enabled: boolean) {
  const qc = useQueryClient()
  const scope = useScope(clinicId)
  useEffect(() => {
    if (!clinicId || !enabled) return
    let subscribedBefore = false
    const channel = supabase
      // sufixo único por montagem: o efeito pode rodar de novo logo após o cleanup, e supabase.channel(topic) devolveria o canal antigo
      // (ainda não removido) em vez de um novo
      .channel(`team-chat-${clinicId}-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'team_messages', filter: `clinic_id=eq.${clinicId}` },
        payload => handleRealtime(qc, scope, payload.eventType, payload.new as TeamMessage | undefined),
      )
      .subscribe(status => {
        if (status !== 'SUBSCRIBED') return
        // voltou a conectar depois de uma queda: o que chegou nesse meio tempo não passou pelo Realtime
        if (subscribedBefore) refreshAfterGap(qc, scope)
        subscribedBefore = true
      })

    const onVisible = () => { if (document.visibilityState === 'visible') refreshAfterGap(qc, scope) }
    const onOnline = () => refreshAfterGap(qc, scope)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      supabase.removeChannel(channel)
    }
  }, [clinicId, enabled, qc, scope])
}

// ── presença (quem está online) ─────────────────────────────────────────────

interface TeamPresenceState {
  /** clínica a que `online` pertence (evita mostrar a presença de outra clínica depois de trocar de conta) */
  clinicId: string | null
  online: ReadonlySet<string>
}

const NO_ONLINE: ReadonlySet<string> = new Set()
const usePresenceStore = create<TeamPresenceState>(() => ({ clinicId: null, online: NO_ONLINE }))

/** Remoção do canal de presença anterior ainda em andamento: o próximo só nasce depois dela (o nome do canal é fixo). */
let presenceTeardown: Promise<unknown> = Promise.resolve()

/**
 * Presença em tempo real: quem está com o app aberto. Um canal 'team-presence:<clínica>' montado UMA vez, na barra
 * lateral (junto de useTeamChatRealtime); o nome é diferente do 'team-chat-<clínica>-<id>' das mensagens. Cada login
 * anuncia o próprio clinic_user_id; a tela lê o resultado com useTeamOnline. Ao desmontar ou trocar de usuário, sai do canal.
 *
 * O nome do canal é fixo de propósito (uma futura policy em realtime.messages vai casar por ele). Por isso, quando o efeito
 * roda de novo logo depois do cleanup, o canal novo só é criado depois que o antigo terminou de ser removido: senão
 * supabase.channel(topic) devolveria o antigo, que ainda não saiu.
 *
 * TODO(presença privada): hoje o canal é público (qualquer um com a chave anon e o id da clínica entra e vê os
 * clinic_user_id online). Quando a migração com a policy de realtime.messages estiver aplicada, passar
 * `config: { private: true, presence: { key: meId } }` aqui e confirmar que o login só entra no canal da própria clínica.
 */
export function useTeamPresence(clinicId: string | undefined, enabled: boolean) {
  const { data: directory } = useTeamDirectory(clinicId, enabled)
  const meId = directory?.find(d => d.is_me)?.clinic_user_id ?? null
  useEffect(() => {
    if (!clinicId || !enabled || !meId) return
    let cancelled = false
    let channel: RealtimeChannel | null = null
    void presenceTeardown.then(() => {
      if (cancelled) return
      const ch = supabase.channel(`team-presence:${clinicId}`, { config: { presence: { key: meId } } })
      channel = ch
      const sync = () => {
        if (cancelled) return
        const ids = new Set<string>()
        for (const [key, metas] of Object.entries(ch.presenceState<{ clinic_user_id?: string }>())) {
          ids.add(key)
          for (const m of metas) if (m.clinic_user_id) ids.add(m.clinic_user_id)
        }
        // só avisa a tela quando o conjunto mudou (sync chega a cada entrada e saída, inclusive de quem não importa)
        const cur = usePresenceStore.getState()
        if (cur.clinicId === clinicId && cur.online.size === ids.size && Array.from(ids).every(id => cur.online.has(id))) return
        usePresenceStore.setState({ clinicId, online: ids })
      }
      ch
        .on('presence', { event: 'sync' }, sync)
        // SUBSCRIBED vem de novo a cada reconexão: anuncia a presença outra vez
        .subscribe(status => {
          if (status === 'SUBSCRIBED' && !cancelled) void ch.track({ clinic_user_id: meId, online_at: new Date().toISOString() })
        })
    })
    return () => {
      cancelled = true
      if (channel) presenceTeardown = supabase.removeChannel(channel).catch(() => undefined)
      usePresenceStore.setState({ clinicId: null, online: NO_ONLINE })
    }
  }, [clinicId, enabled, meId])
}

/** Ids (clinic_user_id) dos logins online agora. Vazio enquanto a presença não chegou. */
export function useTeamOnline(clinicId: string | undefined): ReadonlySet<string> {
  return usePresenceStore(s => (s.clinicId === clinicId ? s.online : NO_ONLINE))
}

/** Busca uma página mais antiga que o que o cache do canal já tem e junta ao cache. Devolve o erro, ou null. */
async function fetchOlderPage(qc: QueryClient, scope: string, channelId: string, pageSize: number): Promise<string | null> {
  const cache = qc.getQueryData<TeamMessagesCache>(KEYS.msgs(scope, channelId))
  const oldest = cache?.messages.find(m => !m.sendState)
  if (!oldest) return null
  const { data, error } = await supabase
    .from('team_messages')
    .select(MSG_COLS)
    .eq('channel_id', channelId)
    .lt('created_at', oldest.created_at)
    .order('created_at', { ascending: false })
    .limit(pageSize)
  if (error) return teamChatErrorMessage(error, 'Não foi possível carregar as mensagens anteriores.')
  const raw = ((data ?? []) as TeamMessage[]).reverse()
  const rows = await withAttachments(raw, undefined)
  qc.setQueryData<TeamMessagesCache>(KEYS.msgs(scope, channelId), old => {
    if (!old) return old
    const have = new Set(old.messages.map(m => m.id))
    return { messages: [...rows.filter(r => !have.has(r.id)), ...old.messages], hasMore: raw.length >= pageSize }
  })
  return null
}

/** Para ir até uma mensagem antiga: páginas maiores e um teto (10 páginas de 200 = 2.000 mensagens para trás). */
const JUMP_PAGE_SIZE = 200
const JUMP_MAX_PAGES = 10

// ── ações ───────────────────────────────────────────────────────────────────

/** Foto ou áudio já comprimido, pronto para subir. */
export interface TeamAttachmentInput {
  kind: TeamAttachmentKind
  blob: Blob
  /** tipo do arquivo (pode trazer parâmetros, como "audio/webm;codecs=opus") */
  mime: string
  width?: number | null
  height?: number | null
  durationMs?: number | null
  /** legenda opcional (vai em body) */
  caption: string
}

interface PendingUpload {
  channelId: string
  input: TeamAttachmentInput
  replyToId: string | null
  /** o arquivo já subiu (a RPC falhou depois): reenviar não sobe de novo; a RPC é idempotente por caminho, então repetir não duplica a mensagem */
  uploadedPath?: string
}

/** Anexos que ainda não chegaram ao servidor, por id da bolha local. Só em memória: some ao recarregar a página. */
const pendingUploads = new Map<string, PendingUpload>()

export interface TeamChatActions {
  /** envia (ou reenvia, com `retryId`) uma mensagem; ela aparece na hora e é conciliada pelo id */
  send: (channelId: string, body: string, replyToId: string | null, retryId?: string) => Promise<void>
  /** sobe a foto/áudio para o Storage e envia a mensagem com anexo; a bolha local mostra o arquivo e o estado do envio */
  sendAttachment: (channelId: string, input: TeamAttachmentInput, replyToId: string | null) => Promise<void>
  /** tenta de novo um anexo que falhou (o arquivo comprimido ainda está na memória) */
  retryAttachment: (channelId: string, messageId: string) => Promise<void>
  edit: (channelId: string, messageId: string, body: string) => Promise<string | null>
  remove: (channelId: string, messageId: string) => Promise<string | null>
  /** tira da conversa uma mensagem local que falhou */
  discard: (channelId: string, messageId: string) => void
  markRead: (channelId: string) => Promise<void>
  /** busca a página anterior ao que já está carregado; devolve o erro, ou null */
  loadOlder: (channelId: string) => Promise<string | null>
  /** carrega páginas anteriores até a mensagem estar no cache do canal; devolve o erro, ou null quando ela está lá */
  loadUntil: (channelId: string, messageId: string) => Promise<string | null>
  setMuted: (channelId: string, muted: boolean) => Promise<string | null>
  openDirect: (otherId: string) => Promise<{ id: string } | { error: string }>
  createGroup: (name: string, memberIds: string[]) => Promise<{ id: string } | { error: string }>
  /** gestão de grupo (criador ou administrador): cada ação devolve o erro em português, ou null */
  addGroupMembers: (channelId: string, memberIds: string[]) => Promise<string | null>
  removeGroupMember: (channelId: string, memberId: string) => Promise<string | null>
  /** qualquer participante sai; a lista e os caches já refletem a saída quando a promessa resolve */
  leaveGroup: (channelId: string) => Promise<string | null>
  renameGroup: (channelId: string, name: string) => Promise<string | null>
}

export function useTeamChatActions(clinicId: string | undefined, meId: string | null): TeamChatActions {
  const qc = useQueryClient()
  const scope = useScope(clinicId)

  const send = useCallback<TeamChatActions['send']>(async (channelId, body, replyToId, retryId) => {
    if (!clinicId || !meId) return
    const id = retryId ?? crypto.randomUUID()
    const local: TeamMessageView = {
      id, channel_id: channelId, clinic_id: clinicId, sender_clinic_user_id: meId, body, has_attachment: false, reply_to_id: replyToId,
      created_at: new Date().toISOString(), edited_at: null, deleted_at: null, sendState: 'sending',
    }
    patchMessages(qc, scope, channelId, list => {
      const i = list.findIndex(m => m.id === id)
      if (i < 0) return [...list, local]
      const next = list.slice()
      next[i] = { ...next[i], sendState: 'sending', sendError: undefined }
      return next
    })

    const { data, error } = await supabase
      .from('team_messages')
      .insert({ id, channel_id: channelId, clinic_id: clinicId, sender_clinic_user_id: meId, body, reply_to_id: replyToId })
      .select(MSG_COLS)
      .single()

    // id repetido: a primeira tentativa tinha chegado ao servidor; basta conciliar
    if (error && error.code === '23505') {
      qc.invalidateQueries({ queryKey: KEYS.msgs(scope, channelId) })
      patchMessages(qc, scope, channelId, list => list.map(m => (m.id === id ? { ...m, sendState: undefined, sendError: undefined } : m)))
      return
    }
    if (error || !data) {
      const message = teamChatErrorMessage(error, 'Não foi possível enviar. Tente de novo.')
      patchMessages(qc, scope, channelId, list => list.map(m => (m.id === id ? { ...m, sendState: 'failed', sendError: message } : m)))
      return
    }
    const row = data as TeamMessage
    patchMessages(qc, scope, channelId, list => list.map(m => (m.id === id ? { ...row } : m)))
    updateLast(qc, scope, row, true)
  }, [qc, scope, clinicId, meId])

  /** Sobe o arquivo (se ainda não subiu), chama a RPC e troca a bolha local pela mensagem definitiva. Falha: bolha "não enviada". */
  const runAttachmentSend = useCallback(async (localId: string, pending: PendingUpload) => {
    if (!clinicId || !meId) return
    const { channelId, input } = pending
    const key = pendingKey(scope, channelId)
    const fail = (message: string) => patchMessages(qc, scope, channelId, list => list.map(m => (m.id === localId ? { ...m, sendState: 'failed', sendError: message } : m)))
    pendingAttachmentSends.set(key, (pendingAttachmentSends.get(key) ?? 0) + 1)
    try {
      patchMessages(qc, scope, channelId, list => list.map(m => (m.id === localId ? { ...m, sendState: 'sending', sendError: undefined } : m)))
      let path = pending.uploadedPath
      if (!path) {
        const target = buildStoragePath(clinicId, channelId, crypto.randomUUID(), input.mime)
        if (!target) { fail('Este tipo de arquivo não é aceito.'); return }
        const up = await supabase.storage.from(TEAM_BUCKET).upload(target, input.blob, { contentType: baseMime(input.mime), upsert: false })
        if (up.error) { fail(teamChatErrorMessage(up.error, 'Não foi possível enviar o arquivo. Tente de novo.')); return }
        path = target
        pending.uploadedPath = path
      }
      const { data, error } = await supabase.rpc('team_send_attachment_message', {
        p_channel_id: channelId,
        p_kind: input.kind,
        p_storage_path: path,
        p_mime: baseMime(input.mime),
        p_size_bytes: input.blob.size,
        p_width: input.width ?? null,
        p_height: input.height ?? null,
        p_duration_ms: input.durationMs != null ? Math.round(input.durationMs) : null,
        p_body: input.caption,
        p_reply_to: pending.replyToId,
      })
      if (error || typeof data !== 'string') { fail(teamChatErrorMessage(error, 'Não foi possível enviar o arquivo. Tente de novo.')); return }

      // mensagem enviada: traz a linha e o anexo reais (se a consulta falhar, monta a partir do que se sabe; a atualização periódica corrige)
      const [msgRes, attRes] = await Promise.all([
        supabase.from('team_messages').select(MSG_COLS).eq('id', data).maybeSingle(),
        supabase.from('team_message_attachments').select(ATT_COLS).eq('message_id', data).maybeSingle(),
      ])
      const nowIso = new Date().toISOString()
      const row: TeamMessage = (msgRes.data as TeamMessage | null) ?? {
        id: data, channel_id: channelId, clinic_id: clinicId, sender_clinic_user_id: meId, body: input.caption, has_attachment: true,
        reply_to_id: pending.replyToId, created_at: nowIso, edited_at: null, deleted_at: null,
      }
      const att: TeamAttachment = (attRes.data as TeamAttachment | null) ?? {
        id: data, message_id: data, channel_id: channelId, clinic_id: clinicId, kind: input.kind, storage_path: path, mime: baseMime(input.mime),
        size_bytes: input.blob.size, width: input.width ?? null, height: input.height ?? null, duration_ms: input.durationMs ?? null,
        expires_at: new Date(Date.now() + ATTACHMENT_TTL_DAYS * 86_400_000).toISOString(), expired_at: null, created_at: nowIso,
      }
      patchMessages(qc, scope, channelId, list => {
        // sem localAttachment: a bolha troca o arquivo local pelo do servidor e libera o link de objeto ao desmontar
        const done: TeamMessageView = { ...row, attachment: att }
        const rest = list.filter(m => m.id !== localId && m.id !== row.id)
        const at = list.findIndex(m => m.id === localId)
        if (at < 0) return [...rest, done].sort((a, b) => ts(a.created_at) - ts(b.created_at))
        // fica onde a bolha local estava
        const before = list.slice(0, at).filter(m => m.id !== row.id)
        const after = list.slice(at + 1).filter(m => m.id !== row.id)
        return [...before, done, ...after]
      })
      updateLast(qc, scope, row, true, input.kind)
      pendingUploads.delete(localId)
    } catch (e) {
      fail(teamChatErrorMessage(e, 'Não foi possível enviar o arquivo. Tente de novo.'))
    } finally {
      const left = (pendingAttachmentSends.get(key) ?? 1) - 1
      if (left <= 0) pendingAttachmentSends.delete(key); else pendingAttachmentSends.set(key, left)
    }
  }, [qc, scope, clinicId, meId])

  const sendAttachment = useCallback<TeamChatActions['sendAttachment']>(async (channelId, input, replyToId) => {
    if (!clinicId || !meId) return
    const id = crypto.randomUUID()
    const pending: PendingUpload = { channelId, input, replyToId }
    pendingUploads.set(id, pending)
    const local: TeamMessageView = {
      id, channel_id: channelId, clinic_id: clinicId, sender_clinic_user_id: meId, body: input.caption, has_attachment: true, reply_to_id: replyToId,
      created_at: new Date().toISOString(), edited_at: null, deleted_at: null, sendState: 'sending', attachment: null,
      localAttachment: {
        kind: input.kind, blob: input.blob,
        width: input.width ?? null, height: input.height ?? null, duration_ms: input.durationMs ?? null,
      },
    }
    patchMessages(qc, scope, channelId, list => [...list, local])
    await runAttachmentSend(id, pending)
  }, [qc, scope, clinicId, meId, runAttachmentSend])

  const retryAttachment = useCallback<TeamChatActions['retryAttachment']>(async (channelId, messageId) => {
    const pending = pendingUploads.get(messageId)
    if (!pending) {
      patchMessages(qc, scope, channelId, list => list.map(m => (m.id === messageId
        ? { ...m, sendState: 'failed', sendError: 'Não foi possível reenviar: o arquivo saiu da memória. Descarte e envie de novo.' } : m)))
      return
    }
    await runAttachmentSend(messageId, pending)
  }, [qc, scope, runAttachmentSend])

  const edit = useCallback<TeamChatActions['edit']>(async (channelId, messageId, body) => {
    const { error } = await supabase.rpc('team_edit_message', { p_message: messageId, p_body: body })
    if (error) return teamChatErrorMessage(error, 'Não foi possível editar a mensagem.')
    const at = new Date().toISOString()
    patchMessages(qc, scope, channelId, list => list.map(m => (m.id === messageId ? { ...m, body, edited_at: at } : m)))
    qc.invalidateQueries({ queryKey: KEYS.last(scope, channelId) })
    return null
  }, [qc, scope])

  const remove = useCallback<TeamChatActions['remove']>(async (channelId, messageId) => {
    const { error } = await supabase.rpc('team_delete_message', { p_message: messageId })
    if (error) return teamChatErrorMessage(error, 'Não foi possível apagar a mensagem.')
    const at = new Date().toISOString()
    patchMessages(qc, scope, channelId, list => list.map(m => (m.id === messageId ? { ...m, body: '', deleted_at: at } : m)))
    qc.invalidateQueries({ queryKey: KEYS.last(scope, channelId) })
    return null
  }, [qc, scope])

  const discard = useCallback<TeamChatActions['discard']>((channelId, messageId) => {
    const pending = pendingUploads.get(messageId)
    if (pending) {
      pendingUploads.delete(messageId)
      // o arquivo que já subiu e não virou mensagem fica órfão no servidor: a limpeza do banco cuida (o navegador não tem DELETE no bucket)
    }
    patchMessages(qc, scope, channelId, list => list.filter(m => m.id !== messageId))
  }, [qc, scope])

  const markRead = useCallback<TeamChatActions['markRead']>(async channelId => {
    await markChannelRead(qc, scope, channelId)
  }, [qc, scope])

  const loadOlder = useCallback<TeamChatActions['loadOlder']>(
    channelId => fetchOlderPage(qc, scope, channelId, TEAM_PAGE_SIZE),
    [qc, scope],
  )

  const loadUntil = useCallback<TeamChatActions['loadUntil']>(async (channelId, messageId) => {
    const has = () => qc.getQueryData<TeamMessagesCache>(KEYS.msgs(scope, channelId))?.messages.some(m => m.id === messageId) ?? false
    for (let i = 0; i < JUMP_MAX_PAGES; i++) {
      if (has()) return null
      const cache = qc.getQueryData<TeamMessagesCache>(KEYS.msgs(scope, channelId))
      if (!cache?.hasMore) break
      const e = await fetchOlderPage(qc, scope, channelId, JUMP_PAGE_SIZE)
      if (e) return e
    }
    if (has()) return null
    const more = qc.getQueryData<TeamMessagesCache>(KEYS.msgs(scope, channelId))?.hasMore
    return more
      ? 'Essa mensagem é muito antiga. Use "Carregar anteriores" para chegar até ela.'
      : 'Não foi possível localizar essa mensagem na conversa.'
  }, [qc, scope])

  const setMuted = useCallback<TeamChatActions['setMuted']>(async (channelId, muted) => {
    if (!meId) return 'Não foi possível identificar o seu usuário.'
    const { error } = await supabase
      .from('team_channel_members')
      .update({ muted })
      .eq('channel_id', channelId)
      .eq('clinic_user_id', meId)
    if (error) return teamChatErrorMessage(error, 'Não foi possível mudar o silêncio desta conversa.')
    qc.setQueryData<TeamChannelMember[]>(KEYS.mine(scope), old => old?.map(m => (m.channel_id === channelId ? { ...m, muted } : m)))
    return null
  }, [qc, scope, meId])

  /** Depois de criar um canal: traz a lista e as minhas participações antes de abrir a conversa. */
  const refreshChannels = useCallback(async () => {
    await Promise.all([
      qc.refetchQueries({ queryKey: KEYS.channels(scope) }),
      qc.refetchQueries({ queryKey: KEYS.mine(scope) }),
    ])
    qc.invalidateQueries({ queryKey: KEYS.membersAll(scope) })
  }, [qc, scope])

  const openDirect = useCallback<TeamChatActions['openDirect']>(async otherId => {
    const { data, error } = await supabase.rpc('team_open_direct', { p_other: otherId })
    if (error || typeof data !== 'string') return { error: teamChatErrorMessage(error, 'Não foi possível abrir a conversa.') }
    await refreshChannels()
    return { id: data }
  }, [refreshChannels])

  const createGroup = useCallback<TeamChatActions['createGroup']>(async (name, memberIds) => {
    const { data, error } = await supabase.rpc('team_create_group', { p_name: name, p_members: memberIds })
    if (error || typeof data !== 'string') return { error: teamChatErrorMessage(error, 'Não foi possível criar o grupo.') }
    await refreshChannels()
    return { id: data }
  }, [refreshChannels])

  /** Depois de mudar um grupo: refaz canais, minhas participações e quem está em cada canal; marca não lidas e última mensagem para refazer. */
  const refreshGroups = useCallback(async () => {
    await Promise.all([
      qc.refetchQueries({ queryKey: KEYS.channels(scope) }),
      qc.refetchQueries({ queryKey: KEYS.mine(scope) }),
      qc.refetchQueries({ queryKey: KEYS.membersAll(scope) }),
    ])
    qc.invalidateQueries({ queryKey: KEYS.unread(scope) })
    qc.invalidateQueries({ queryKey: KEYS.lastAll(scope) })
  }, [qc, scope])

  const addGroupMembers = useCallback<TeamChatActions['addGroupMembers']>(async (channelId, memberIds) => {
    const { error } = await supabase.rpc('team_group_add_members', { p_channel_id: channelId, p_member_ids: memberIds })
    if (error) return teamChatErrorMessage(error, 'Não foi possível adicionar os participantes.')
    await refreshGroups()
    return null
  }, [refreshGroups])

  const removeGroupMember = useCallback<TeamChatActions['removeGroupMember']>(async (channelId, memberId) => {
    const { error } = await supabase.rpc('team_group_remove_member', { p_channel_id: channelId, p_member_id: memberId })
    if (error) return teamChatErrorMessage(error, 'Não foi possível remover o participante.')
    await refreshGroups()
    return null
  }, [refreshGroups])

  const leaveGroup = useCallback<TeamChatActions['leaveGroup']>(async channelId => {
    const { error } = await supabase.rpc('team_group_leave', { p_channel_id: channelId })
    if (error) return teamChatErrorMessage(error, 'Não foi possível sair do grupo.')
    await refreshGroups()
    return null
  }, [refreshGroups])

  const renameGroup = useCallback<TeamChatActions['renameGroup']>(async (channelId, name) => {
    const { error } = await supabase.rpc('team_group_rename', { p_channel_id: channelId, p_name: name })
    if (error) return teamChatErrorMessage(error, 'Não foi possível renomear o grupo.')
    await qc.refetchQueries({ queryKey: KEYS.channels(scope) })
    return null
  }, [qc, scope])

  return useMemo(
    () => ({
      send, sendAttachment, retryAttachment, edit, remove, discard, markRead, loadOlder, loadUntil, setMuted, openDirect, createGroup,
      addGroupMembers, removeGroupMember, leaveGroup, renameGroup,
    }),
    [
      send, sendAttachment, retryAttachment, edit, remove, discard, markRead, loadOlder, loadUntil, setMuted, openDirect, createGroup,
      addGroupMembers, removeGroupMember, leaveGroup, renameGroup,
    ],
  )
}
