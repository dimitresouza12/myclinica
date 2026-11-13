'use client'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useAuthStore } from '@/store/auth'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import btn from '@/components/ui/button.module.css'
import {
  useTeamChannelMembers, useTeamChannels, useTeamChatActions, useTeamChatEnabled, useTeamChatUi, useTeamDirectory,
  useTeamLastMessages, useTeamMessageSearch, useTeamMessages, useTeamMyMemberships, useTeamOnline, useTeamUnread,
} from '@/hooks/useTeamChat'
import { buildChannelViews, type ChannelFilter, type ChannelView } from '@/lib/teamChat/format'
import { isChatBackendMissing } from '@/lib/teamChat/errors'
import type { TeamChannel, TeamChannelMember, TeamDirectoryEntry, TeamJumpRequest, TeamMessage } from '@/lib/teamChat/types'
import { DEFAULT_SETTINGS } from '@/lib/whatsapp/settings'
import { ChannelList, type SearchMode } from './ChannelList'
import { ChatPanel } from './ChatPanel'
import { NewChatModal } from './NewChatModal'
import styles from './ChatEquipe.module.css'

const TIMEZONE = DEFAULT_SETTINGS.timezone
const NO_DIRECTORY: TeamDirectoryEntry[] = []
const NO_CHANNELS: TeamChannel[] = []
const NO_MEMBERS: TeamChannelMember[] = []

function subscribeVisibility(cb: () => void) {
  document.addEventListener('visibilitychange', cb)
  return () => document.removeEventListener('visibilitychange', cb)
}

/** A aba do navegador está à vista? Mensagem só vira "lida" com a aba aberta. */
function usePageVisible(): boolean {
  return useSyncExternalStore(subscribeVisibility, () => document.visibilityState === 'visible', () => true)
}

function Unavailable({ title, description, onRetry }: { title: string; description: string; onRetry?: () => void }) {
  return (
    <>
      <PageHeader title="Chat da equipe" />
      <EmptyState
        icon="chat"
        title={title}
        description={description}
        action={onRetry ? <button type="button" className={btn.secondary} onClick={onRetry}>Tentar novamente</button> : undefined}
      />
    </>
  )
}

function Board({ clinicId }: { clinicId: string }) {
  const dirQ = useTeamDirectory(clinicId)
  const chQ = useTeamChannels(clinicId)
  const unreadQ = useTeamUnread(clinicId)

  const directory = dirQ.data ?? NO_DIRECTORY
  const meId = useMemo(() => directory.find(d => d.is_me)?.clinic_user_id ?? null, [directory])
  const mineQ = useTeamMyMemberships(clinicId, meId)
  const channels = chQ.data ?? NO_CHANNELS
  const channelIds = useMemo(() => channels.map(c => c.id), [channels])
  const membersQ = useTeamChannelMembers(clinicId, channelIds)
  const last = useTeamLastMessages(clinicId, channelIds)
  const actions = useTeamChatActions(clinicId, meId)
  const online = useTeamOnline(clinicId)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [seenId, setSeenId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list')
  const [query, setQuery] = useState('')
  const [searchMode, setSearchMode] = useState<SearchMode>('channels')
  // filtro por tipo da lista: só em memória, não vai para o localStorage
  const [filter, setFilter] = useState<ChannelFilter>('all')
  const [jump, setJump] = useState<TeamJumpRequest | null>(null)
  const clearJump = useCallback(() => setJump(null), [])
  const [modal, setModal] = useState<'direct' | 'group' | null>(null)
  // "agora" para rótulos de data: muda a cada minuto, sem chamar Date.now() no render
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const views = useMemo(
    () => buildChannelViews({
      channels,
      members: membersQ.data ?? NO_MEMBERS,
      mine: mineQ.data ?? NO_MEMBERS,
      directory,
      unread: unreadQ.data ?? {},
      last,
      meId,
    }),
    [channels, membersQ.data, mineQ.data, directory, unreadQ.data, last, meId],
  )
  const selected = useMemo<ChannelView | null>(() => views.find(v => v.channel.id === selectedId) ?? null, [views, selectedId])
  const msgsQ = useTeamMessages(clinicId, selected ? selected.channel.id : null)
  // busca nas mensagens de todas as conversas (a da conversa aberta mora no ChatPanel)
  const messageSearch = useTeamMessageSearch(clinicId, query, null, searchMode === 'messages')

  // canal aberto: o Realtime (na barra lateral) lê isto para não contar como não lida a mensagem que chega com a conversa à vista
  const setActive = useTeamChatUi(s => s.setActive)
  useEffect(() => {
    setActive(selectedId)
    return () => setActive(null)
  }, [selectedId, setActive])

  // abrir um canal com não lidas (e as que chegam com ele aberto) marca como lido
  const visible = usePageVisible()
  const selectedUnread = selected?.unread ?? 0
  const markRead = actions.markRead
  useEffect(() => {
    if (!selectedId || !selected?.isMember || selectedUnread === 0 || !visible) return
    void markRead(selectedId)
  }, [selectedId, selected?.isMember, selectedUnread, visible, markRead])

  if (dirQ.isSuccess && !meId) {
    return <Unavailable title="Chat indisponível" description="Não encontramos o seu usuário entre os logins ativos desta clínica." />
  }

  const loading = dirQ.isLoading || chQ.isLoading || mineQ.isLoading
  const error = dirQ.isError || chQ.isError || mineQ.isError

  // a conversa aberta saiu da lista (arquivada, removida do grupo, acesso perdido): volta para a lista em vez de ficar numa tela vazia
  // sem saída no celular. Só vale para uma conversa que já esteve na lista (uma recém-criada pode demorar a chegar).
  if (selected && seenId !== selected.channel.id) {
    setSeenId(selected.channel.id)
  } else if (selectedId && !selected && seenId === selectedId && !loading && !error) {
    setSelectedId(null)
    setSeenId(null)
    setMobileView('list')
  }

  function openChannel(id: string, keepQuery = false) {
    // um pedido de salto para outro canal não vale mais
    setJump(cur => (cur && cur.channelId !== id ? null : cur))
    setSelectedId(id)
    setMobileView('chat')
    if (!keepQuery) setQuery('')
  }

  /** resultado da busca: abre o canal e pede para rolar até a mensagem (o painel carrega páginas anteriores se for preciso) */
  function openMessage(m: TeamMessage) {
    setJump({ channelId: m.channel_id, messageId: m.id, nonce: Date.now() })
    openChannel(m.channel_id, true)
  }

  return (
    <>
      {/* no celular o título já aparece na barra de cima (PageHeader o leva para lá); o bloco some para não ocupar espaço */}
      <div className={styles.pageHead}><PageHeader title="Chat da equipe" /></div>
      <div className={styles.root} data-fullbleed data-team-root>
        <div className={`${styles.grid} ${mobileView === 'chat' ? styles.gridChat : styles.gridList}`}>
          <ChannelList
            views={views}
            directory={directory}
            meId={meId}
            loading={loading}
            error={error}
            onRetry={() => { void dirQ.refetch(); void chQ.refetch(); void mineQ.refetch() }}
            selectedId={selectedId}
            query={query}
            onQuery={setQuery}
            now={now}
            timezone={TIMEZONE}
            onSelect={v => openChannel(v.channel.id)}
            onNewDirect={() => setModal('direct')}
            onNewGroup={() => setModal('group')}
            searchMode={searchMode}
            onSearchMode={setSearchMode}
            filter={filter}
            onFilter={setFilter}
            search={messageSearch}
            onPickMessage={openMessage}
            online={online}
          />
          {/* key: o rascunho e a resposta em andamento não passam de uma conversa para outra */}
          <ChatPanel
            key={selected?.channel.id ?? 'nenhuma'}
            clinicId={clinicId}
            view={selected}
            meId={meId}
            directory={directory}
            data={msgsQ.data}
            loading={msgsQ.isLoading}
            error={msgsQ.isError}
            onRetry={() => { void msgsQ.refetch() }}
            now={now}
            timezone={TIMEZONE}
            actions={actions}
            waitingCount={views.filter(v => v.unread > 0 && !v.muted).length}
            onBack={() => { setMobileView('list'); setSelectedId(null); setJump(null) }}
            online={online}
            jump={jump}
            onRequestJump={messageId => { if (selectedId) setJump({ channelId: selectedId, messageId, nonce: Date.now() }) }}
            onJumpDone={clearJump}
          />
        </div>
      </div>
      {modal && (
        <NewChatModal
          mode={modal}
          colleagues={directory.filter(d => !d.is_me)}
          actions={actions}
          online={online}
          onClose={() => setModal(null)}
          onOpened={id => { setModal(null); openChannel(id) }}
        />
      )}
    </>
  )
}

function BoardSkeleton() {
  return (
    <>
      <PageHeader title="Chat da equipe" />
      <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}>
        <Skeleton width="60%" height={16} />
        <Skeleton width="90%" height={14} />
        <Skeleton width="75%" height={14} />
      </div>
    </>
  )
}

/** Porta de entrada: confere se o chat está habilitado para a clínica antes de carregar qualquer conversa. */
export function TeamChat() {
  const clinicId = useAuthStore(s => s.clinic?.id)
  const enabledQ = useTeamChatEnabled(clinicId)

  if (!clinicId || enabledQ.isLoading) return <BoardSkeleton />
  if (enabledQ.isError) {
    return isChatBackendMissing(enabledQ.error)
      ? <Unavailable title="Chat indisponível" description="O chat da equipe ainda não está disponível. Tente novamente mais tarde." onRetry={() => { void enabledQ.refetch() }} />
      : <Unavailable title="Não foi possível abrir o chat" description="Confira a conexão e tente de novo. Se o problema continuar, fale com o suporte." onRetry={() => { void enabledQ.refetch() }} />
  }
  if (!enabledQ.data) {
    return <Unavailable title="Chat indisponível" description="O chat da equipe fica disponível para clínicas com 3 ou mais profissionais cadastrados." />
  }
  return <Board clinicId={clinicId} />
}
