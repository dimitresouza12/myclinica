'use client'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorNotice } from '@/components/ui/ErrorNotice'
import { Spinner } from '@/components/ui/Spinner'
import { showToast } from '@/components/ui/Toast'
import { withDaySeparators } from '@/lib/whatsapp/inbox'
import { startsAuthorRun } from '@/lib/whatsapp/bubble'
import { quotePreview, type ChannelView } from '@/lib/teamChat/format'
import { buildMentionIndex } from '@/lib/teamChat/richText'
import { useTeamMessageSearch, type TeamAttachmentInput, type TeamChatActions } from '@/hooks/useTeamChat'
import type { TeamDirectoryEntry, TeamJumpRequest, TeamMessage, TeamMessagesCache, TeamMessageView } from '@/lib/teamChat/types'
import { ChannelAvatar } from './ChannelAvatar'
import { Composer, type ComposerHandle } from './Composer'
import { MessageBubble, type QuoteInfo } from './MessageBubble'
import { GroupInfoModal } from './GroupInfoModal'
import { MessageSearchResults } from './MessageSearchResults'
import { PresenceDot } from './PresenceDot'
import styles from './ChatEquipe.module.css'

const NEAR_BOTTOM_PX = 120

/** Um pedido de salto mais velho que isto (e ainda não atendido) é ignorado: ficou para trás. */
const JUMP_TTL_MS = 10_000

interface Props {
  clinicId: string
  view: ChannelView | null
  meId: string | null
  directory: TeamDirectoryEntry[]
  data: TeamMessagesCache | undefined
  loading: boolean
  error: boolean
  onRetry: () => void
  now: Date
  timezone: string
  actions: TeamChatActions
  /** conversas com não lidas (tela vazia) */
  waitingCount: number
  onBack: () => void
  /** logins online agora (clinic_user_id) */
  online: ReadonlySet<string>
  /** pedido de abrir uma mensagem (vem da busca da lista); vale só se for deste canal */
  jump: TeamJumpRequest | null
  /** pede para rolar até uma mensagem deste canal (vem da busca dentro da conversa) */
  onRequestJump: (messageId: string) => void
  /** o pedido foi atendido (ou desistido) */
  onJumpDone: () => void
}

export function ChatPanel(p: Props) {
  const { view, meId, actions } = p
  const channelId = view?.channel.id ?? null
  const messages = useMemo(() => p.data?.messages ?? [], [p.data])
  const hasMore = p.data?.hasMore ?? false

  const [replyTo, setReplyTo] = useState<TeamMessageView | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [seenLast, setSeenLast] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [groupInfo, setGroupInfo] = useState(false)
  const jumpBusy = useRef<number | null>(null)
  const msgsRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<ComposerHandle>(null)
  const searchBtnRef = useRef<HTMLButtonElement>(null)
  const stickRef = useRef(true)
  const prevRef = useRef<{ first: string | null; last: string | null; height: number }>({ first: null, last: null, height: 0 })
  const lastMsg = messages.length ? messages[messages.length - 1] : null
  const lastId = lastMsg?.id ?? null

  const nameOf = useMemo(() => {
    const map = new Map(p.directory.map(d => [d.clinic_user_id, d.display_name]))
    return (id: string | null) => (id ? map.get(id) : undefined) ?? 'Colega desativado'
  }, [p.directory])
  const byId = useMemo(() => new Map(messages.map(m => [m.id, m])), [messages])
  const mentionIndex = useMemo(() => buildMentionIndex(p.directory), [p.directory])
  const search = useTeamMessageSearch(p.clinicId, searchTerm, channelId, searching && !!channelId)

  const items = useMemo(() => withDaySeparators(messages, p.now, p.timezone), [messages, p.now, p.timezone])

  // ao abrir o canal vai para o fim; depois só acompanha mensagem nova se a pessoa já estava embaixo (ou se a mensagem é dela);
  // ao carregar histórico antigo, mantém a posição
  useLayoutEffect(() => {
    const el = msgsRef.current
    if (!el) return
    const first = messages.length ? messages[0].id : null
    const last = lastId
    const prev = prevRef.current
    const lastMine = !!lastMsg && lastMsg.sender_clinic_user_id === meId
    if (prev.last === null || (last !== prev.last && (stickRef.current || lastMine))) {
      el.scrollTop = el.scrollHeight
    } else if (first !== prev.first && last === prev.last) {
      el.scrollTop += el.scrollHeight - prev.height
    } else if (stickRef.current && last === prev.last && el.scrollHeight !== prev.height) {
      // a lista cresceu sem mensagem nova (o anexo da última mensagem chegou): quem estava no fim continua no fim
      el.scrollTop = el.scrollHeight
    }
    prevRef.current = { first, last, height: el.scrollHeight }
    // só quando a lista (ou o que muda a altura dela) muda: ler scrollHeight a cada render forçaria layout à toa
  }, [messages, lastMsg, lastId, meId, hasMore, p.loading, p.error])

  // a barra "Respondendo a..." abre e fecha acima da caixa de escrever
  useLayoutEffect(() => {
    if (!stickRef.current) return
    const el = msgsRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [replyTo])

  function onScroll() {
    const el = msgsRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
    stickRef.current = near
    setAtBottom(near)
    if (near) setSeenLast(lastId)
  }

  function scrollToEnd() {
    const el = msgsRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  /** A caixa de escrever cresceu (ou a barra de resposta abriu) e encolheu a lista: quem estava no fim continua no fim. */
  const keepAtEnd = useCallback(() => {
    if (!stickRef.current) return
    requestAnimationFrame(() => {
      const el = msgsRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [])

  async function loadOlder() {
    if (!channelId || loadingOlder) return
    setLoadingOlder(true)
    const e = await actions.loadOlder(channelId)
    setLoadingOlder(false)
    if (e) showToast('error', e)
  }

  const jumpTo = useCallback((id: string) => {
    const el = document.getElementById(`tm-${id}`)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setFlashId(id)
    setTimeout(() => setFlashId(cur => (cur === id ? null : cur)), 1300)
  }, [])

  // abrir uma mensagem vinda da busca: se ela não está no que foi carregado, traz páginas anteriores até achá-la; depois rola e destaca
  const activeJump = p.jump && p.jump.channelId === channelId ? p.jump : null
  const { onJumpDone } = p
  const hasData = !!p.data
  const loadUntil = actions.loadUntil
  const loadFailed = p.error
  useEffect(() => {
    if (!activeJump || !channelId) return
    // a consulta das mensagens falhou e não há nada carregado: desiste do pedido
    if (loadFailed && !hasData) { onJumpDone(); return }
    if (!hasData) return
    const { messageId, nonce } = activeJump
    const started = jumpBusy.current === nonce
    // pedido que ficou para trás (não foi atendido em 10 s): ignora
    if (!started && Date.now() - nonce > JUMP_TTL_MS) { onJumpDone(); return }
    if (byId.has(messageId)) {
      jumpBusy.current = null
      onJumpDone()
      requestAnimationFrame(() => jumpTo(messageId))
      return
    }
    if (started) return
    jumpBusy.current = nonce
    void loadUntil(channelId, messageId).then(e => {
      if (e) { showToast('error', e); onJumpDone() }
    })
  }, [activeJump, hasData, loadFailed, byId, channelId, loadUntil, onJumpDone, jumpTo])

  function closeSearch() {
    setSearching(false)
    setSearchTerm('')
    // o campo de busca some: o foco volta para o botão que o abriu
    requestAnimationFrame(() => searchBtnRef.current?.focus())
  }

  const onReply = useCallback((msg: TeamMessageView) => { setReplyTo(msg); composerRef.current?.focus() }, [])
  const onRetry = useCallback((msg: TeamMessageView) => {
    if (msg.localAttachment) void actions.retryAttachment(msg.channel_id, msg.id)
    else void actions.send(msg.channel_id, msg.body, msg.reply_to_id, msg.id)
  }, [actions])

  function pickResult(m: TeamMessage) {
    closeSearch()
    p.onRequestJump(m.id)
  }

  const sendBody = useCallback((body: string) => {
    if (!channelId) return
    void actions.send(channelId, body, replyTo?.id ?? null)
    setReplyTo(null)
  }, [actions, channelId, replyTo])
  const sendAttachment = useCallback((input: TeamAttachmentInput) => {
    if (!channelId) return
    void actions.sendAttachment(channelId, input, replyTo?.id ?? null)
    setReplyTo(null)
  }, [actions, channelId, replyTo])
  const cancelReply = useCallback(() => setReplyTo(null), [])

  async function toggleMute() {
    if (!view) return
    const e = await actions.setMuted(view.channel.id, !view.muted)
    if (e) showToast('error', e)
  }

  if (!view || !channelId) {
    return (
      <div className={`${styles.pane} ${styles.chat}`}>
        <div className={styles.narrowBar}>
          <button type="button" className={styles.iconBtn} onClick={p.onBack} aria-label="Voltar para a lista">
            <Icon name="chevronLeft" size={20} />
          </button>
          <b>Chat da equipe</b>
        </div>
        <div className={styles.placeholder}>
          <EmptyState
            icon="chat"
            title="Selecione uma conversa"
            description={p.waitingCount > 0
              ? `${p.waitingCount} ${p.waitingCount === 1 ? 'conversa com mensagem nova' : 'conversas com mensagens novas'}`
              : 'Escolha uma conversa na lista ou comece uma nova com um colega.'}
          />
        </div>
      </div>
    )
  }

  const kind = view.channel.kind
  const writable = view.readOnly === null
  const showNewBelow = !atBottom && !!lastId && lastId !== seenLast
  const otherOnline = !!view.otherUserId && p.online.has(view.otherUserId)
  // gerencia o grupo quem o criou ou é administrador da clínica (o mesmo cargo que enxerga conversas alheias como "Somente leitura")
  const me = p.directory.find(d => d.is_me)
  const canManageGroup = kind === 'group' && view.isMember && (!!meId && view.channel.created_by === meId || me?.role === 'admin')

  return (
    <div className={`${styles.pane} ${styles.chat}`}>
      <div className={styles.chatHead}>
        <button type="button" className={`${styles.iconBtn} ${styles.narrowOnly}`} onClick={p.onBack} aria-label="Voltar para a lista">
          <Icon name="chevronLeft" size={20} />
        </button>
        <ChannelAvatar kind={kind} name={view.avatarName} />
        <div className={styles.who}>
          <div className={styles.titleRow}>
            <b>{view.title}</b>
            {otherOnline && <PresenceDot />}
          </div>
          <span>{view.subtitle}</span>
        </div>
        <button
          ref={searchBtnRef}
          type="button"
          className={`${styles.iconBtn} ${searching ? styles.iconBtnOn : ''}`}
          onClick={() => (searching ? closeSearch() : setSearching(true))}
          aria-pressed={searching}
          aria-label="Buscar nesta conversa"
          title="Buscar nesta conversa"
        >
          <Icon name="search" size={20} />
        </button>
        {view.isMember && (
          <button
            type="button"
            className={`${styles.iconBtn} ${view.muted ? styles.iconBtnOn : ''}`}
            onClick={() => void toggleMute()}
            aria-pressed={view.muted}
            aria-label="Silenciar esta conversa"
            title={view.muted ? 'Conversa silenciada: toque para reativar' : 'Silenciar esta conversa'}
          >
            <span className={view.muted ? styles.mutedMark : undefined}><Icon name="bell" size={20} /></span>
          </button>
        )}
        {kind === 'group' && view.isMember && (
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => setGroupInfo(true)}
            aria-label="Informações do grupo"
            title="Informações do grupo"
          >
            <Icon name="info" size={20} />
          </button>
        )}
      </div>

      {groupInfo && kind === 'group' && view.isMember && (
        <GroupInfoModal
          view={view}
          meId={meId}
          directory={p.directory}
          canManage={canManageGroup}
          actions={actions}
          online={p.online}
          onClose={() => setGroupInfo(false)}
          onLeft={() => { setGroupInfo(false); p.onBack() }}
        />
      )}

      {searching && (
        <div className={styles.inSearch}>
          <SearchInput
            placeholder="Buscar nesta conversa"
            value={searchTerm}
            onChange={setSearchTerm}
            autoFocus
            onKeyDown={e => { if (e.key === 'Escape') closeSearch() }}
          />
          <button type="button" className={styles.iconBtn} onClick={closeSearch} aria-label="Fechar a busca">
            <Icon name="close" size={18} />
          </button>
        </div>
      )}

      <div className={styles.msgsWrap}>
        {searching && searchTerm.trim() && (
          <div className={styles.searchOverlay}>
            <MessageSearchResults
              term={search.term}
              active={search.active}
              waiting={search.waiting}
              loading={search.isLoading}
              error={search.isError}
              onRetry={() => { void search.refetch() }}
              results={search.data}
              more={search.more}
              directory={p.directory}
              meId={meId}
              channelTitle={null}
              now={p.now}
              timezone={p.timezone}
              onPick={pickResult}
            />
          </div>
        )}
        <div className={styles.msgs} ref={msgsRef} onScroll={onScroll} data-team-msgs>
          {p.loading && messages.length === 0 && !p.error && (
            <div className={styles.msgsLoading} aria-busy="true"><Spinner label="Carregando mensagens" /></div>
          )}
          {p.error && messages.length === 0 && (
            <div className={styles.errorWrap}><ErrorNotice message="Não foi possível carregar as mensagens." onRetry={p.onRetry} /></div>
          )}
          {hasMore && (
            <div className={styles.olderRow}>
              <button type="button" className={styles.olderBtn} onClick={() => void loadOlder()} disabled={loadingOlder}>
                {loadingOlder ? <Spinner size={14} decorative /> : <Icon name="arrowUp" size={14} />}
                Carregar anteriores
              </button>
            </div>
          )}
          {!p.loading && !p.error && messages.length === 0 && (
            <div className={styles.placeholder}>
              <EmptyState compact icon="chat" title="Nenhuma mensagem ainda" description={writable ? 'Escreva a primeira mensagem desta conversa.' : undefined} />
            </div>
          )}
          {items.map((it, idx) => {
            if (it.type === 'day') return <div key={`d-${it.key}`} className={styles.day}>{it.label}</div>
            const m = it.msg
            const mine = m.sender_clinic_user_id === meId
            const prev = idx > 0 ? items[idx - 1] : null
            const prevMsg = prev && prev.type === 'msg' ? prev.msg : null
            const runStart = startsAuthorRun(
              prevMsg ? { direction: prevMsg.sender_clinic_user_id === meId ? 'out' : 'in', author: prevMsg.sender_clinic_user_id, created_at: prevMsg.created_at } : null,
              { direction: mine ? 'out' : 'in', author: m.sender_clinic_user_id, created_at: m.created_at },
              p.timezone,
            )
            let quote: QuoteInfo | null = null
            if (m.reply_to_id) {
              const target = byId.get(m.reply_to_id)
              quote = target
                ? {
                  name: target.sender_clinic_user_id === meId ? 'Você' : nameOf(target.sender_clinic_user_id),
                  text: quotePreview(target), messageId: target.id, missing: false, own: target.sender_clinic_user_id === meId,
                }
                : { name: 'Mensagem', text: '', messageId: m.reply_to_id, missing: true, own: false }
            }
            return (
              <MessageBubble
                key={m.id}
                m={m}
                channelId={channelId}
                mine={mine}
                authorLabel={runStart && !mine && kind !== 'direct' ? nameOf(m.sender_clinic_user_id) : null}
                runStart={runStart}
                quote={quote}
                mentionIndex={mentionIndex}
                timezone={p.timezone}
                canReply={writable}
                canModify={writable && mine}
                flash={flashId === m.id}
                onReply={onReply}
                onEdit={actions.edit}
                onDelete={actions.remove}
                onRetry={onRetry}
                onDiscard={actions.discard}
                onJump={jumpTo}
              />
            )
          })}
        </div>
        {showNewBelow && (
          <button type="button" className={styles.newBelow} onClick={scrollToEnd}>
            <Icon name="chevronDown" size={16} />Novas mensagens
          </button>
        )}
      </div>

      <Composer
        ref={composerRef}
        clinicId={p.clinicId}
        channelId={channelId}
        kind={kind}
        readOnly={view.readOnly}
        members={view.members}
        directory={p.directory}
        online={p.online}
        replyName={replyTo ? (replyTo.sender_clinic_user_id === meId ? 'você' : nameOf(replyTo.sender_clinic_user_id)) : null}
        replyText={replyTo ? quotePreview(replyTo) : ''}
        onCancelReply={cancelReply}
        onSend={sendBody}
        onSendAttachment={sendAttachment}
        onResize={keepAtEnd}
      />
    </div>
  )
}
