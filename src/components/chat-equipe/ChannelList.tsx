'use client'
import { Icon } from '@/components/ui/Icon'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorNotice } from '@/components/ui/ErrorNotice'
import { SearchInput } from '@/components/ui/SearchInput'
import { Skeleton } from '@/components/ui/Skeleton'
import btn from '@/components/ui/button.module.css'
import { listTimeLabel } from '@/lib/whatsapp/inbox'
import type { useTeamMessageSearch } from '@/hooks/useTeamChat'
import {
  CHANNEL_FILTERS, arrangeChannelViews, lastPreview, normalizeSearch, unreadByFilter, type ChannelFilter, type ChannelView,
} from '@/lib/teamChat/format'
import type { TeamDirectoryEntry, TeamMessage } from '@/lib/teamChat/types'
import { ChannelAvatar } from './ChannelAvatar'
import { MessageSearchResults } from './MessageSearchResults'
import { PresenceDot } from './PresenceDot'
import styles from './ChatEquipe.module.css'

interface Props {
  views: ChannelView[]
  directory: TeamDirectoryEntry[]
  meId: string | null
  loading: boolean
  error: boolean
  onRetry: () => void
  selectedId: string | null
  query: string
  onQuery: (q: string) => void
  now: Date
  timezone: string
  onSelect: (view: ChannelView) => void
  onNewDirect: () => void
  onNewGroup: () => void
  /** o que a busca procura: nomes de conversas ou o texto das mensagens */
  searchMode: SearchMode
  onSearchMode: (m: SearchMode) => void
  /** filtro por tipo (só em memória: quem guarda é a tela) */
  filter: ChannelFilter
  onFilter: (f: ChannelFilter) => void
  search: ReturnType<typeof useTeamMessageSearch>
  onPickMessage: (m: TeamMessage) => void
  /** logins online agora (clinic_user_id) */
  online: ReadonlySet<string>
}

export type SearchMode = 'channels' | 'messages'

export function ChannelList(p: Props) {
  const q = normalizeSearch(p.query)
  const inMessages = p.searchMode === 'messages'
  const channelTitles = new Map(p.views.map(v => [v.channel.id, v.title]))
  const visible = arrangeChannelViews(p.views, p.filter, q)
  const unreadChips = unreadByFilter(p.views)

  return (
    <div className={`${styles.pane} ${styles.list}`}>
      <div className={styles.listHead}>
        <div className={styles.listActions}>
          <button type="button" className={btn.primary} onClick={p.onNewDirect} disabled={p.loading || p.error}>
            <Icon name="plus" size={16} />Nova conversa
          </button>
          <button type="button" className={btn.secondary} onClick={p.onNewGroup} disabled={p.loading || p.error}>
            <Icon name="team" size={16} />Novo grupo
          </button>
        </div>
        <SearchInput placeholder={inMessages ? 'Buscar nas mensagens' : 'Buscar conversa'} value={p.query} onChange={p.onQuery} />
        <div className={styles.modeSwitch} role="group" aria-label="O que buscar">
          <button type="button" className={`${styles.modeBtn} ${!inMessages ? styles.modeBtnOn : ''}`} aria-pressed={!inMessages} onClick={() => p.onSearchMode('channels')}>Conversas</button>
          <button type="button" className={`${styles.modeBtn} ${inMessages ? styles.modeBtnOn : ''}`} aria-pressed={inMessages} onClick={() => p.onSearchMode('messages')}>Mensagens</button>
        </div>
        {!inMessages && (
          <div className={styles.filterRow} role="group" aria-label="Filtrar conversas por tipo">
            {CHANNEL_FILTERS.map(f => {
              const on = p.filter === f.value
              const n = unreadChips[f.value]
              return (
                <button
                  key={f.value}
                  type="button"
                  className={`${styles.modeBtn} ${styles.filterChip} ${on ? styles.modeBtnOn : ''}`}
                  aria-pressed={on}
                  onClick={() => p.onFilter(f.value)}
                >
                  {f.label}
                  {n > 0 && <span className={styles.chipCount} aria-label={`${n} não lidas`}>{n > 99 ? '99+' : n}</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {inMessages ? (
        <div className={styles.convs}>
          <MessageSearchResults
            term={p.search.term}
            active={p.search.active}
            waiting={p.search.waiting}
            loading={p.search.isLoading}
            error={p.search.isError}
            onRetry={() => { void p.search.refetch() }}
            results={p.search.data}
            more={p.search.more}
            directory={p.directory}
            meId={p.meId}
            channelTitle={id => channelTitles.get(id) ?? null}
            now={p.now}
            timezone={p.timezone}
            onPick={p.onPickMessage}
          />
        </div>
      ) : (
      <div className={styles.convs}>
        {p.error && (
          <div className={styles.listError}>
            <ErrorNotice message="Não foi possível carregar as conversas." onRetry={p.onRetry} />
          </div>
        )}

        {p.loading && !p.error && (
          <div className={styles.convSkelList} aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className={styles.convSkel}>
                <Skeleton width={40} height={40} radius="50%" />
                <span className={styles.convSkelText}>
                  <Skeleton width={i % 2 ? '55%' : '70%'} height={14} />
                  <Skeleton width={i % 2 ? '80%' : '60%'} height={12} />
                </span>
              </div>
            ))}
          </div>
        )}

        {!p.loading && !p.error && p.views.length === 0 && (
          <EmptyState
            compact
            icon="chat"
            title="Nenhuma conversa ainda"
            description="Toque em Nova conversa para falar com um colega, ou em Novo grupo para reunir várias pessoas."
          />
        )}

        {!p.loading && !p.error && p.views.length > 0 && visible.length === 0 && (
          <EmptyState compact icon="search" title="Nenhuma conversa encontrada" description={p.filter === 'all' ? 'Tente outro nome.' : 'Tente outro nome ou outro filtro.'} />
        )}

        {visible.map(v => {
          const selected = v.channel.id === p.selectedId
          const hasUnread = v.unread > 0
          const kindTag = v.channel.kind === 'area' ? 'Área' : v.channel.kind === 'group' ? 'Grupo' : null
          return (
            <button
              key={v.channel.id}
              type="button"
              className={`${styles.conv} ${selected ? styles.convOn : ''} ${hasUnread && !v.muted ? styles.unreadRow : ''}`}
              aria-current={selected || undefined}
              onClick={() => p.onSelect(v)}
            >
              <ChannelAvatar kind={v.channel.kind} name={v.avatarName} avatar={v.avatarData} />
              <span className={styles.mid}>
                <span className={styles.l1}>
                  <span className={styles.nmRow}>
                    <span className={styles.nm}>{v.title}</span>
                    {kindTag && <span className={styles.kindTag}>{kindTag}</span>}
                    {v.otherUserId && p.online.has(v.otherUserId) && <PresenceDot />}
                  </span>
                  {v.last && <span className={styles.tm}>{listTimeLabel(new Date(v.last.created_at), p.now, p.timezone)}</span>}
                </span>
                <span className={styles.l2}>
                  <span className={styles.pv}>{lastPreview(v, p.meId, p.directory)}</span>
                  <span className={styles.l2End}>
                    {v.readOnly === 'admin' && <span className={styles.readOnlyTag}>Somente leitura</span>}
                    {v.muted && (
                      <span className={styles.mutedMark}>
                        <Icon name="bell" size={14} />
                        <span className={styles.srOnly}>Silenciada</span>
                      </span>
                    )}
                    {hasUnread && (
                      <span className={`${styles.badge} ${v.muted ? styles.badgeMuted : ''}`} aria-label={`${v.unread} não lidas`}>
                        {v.unread > 99 ? '99+' : v.unread}
                      </span>
                    )}
                  </span>
                </span>
              </span>
            </button>
          )
        })}
      </div>
      )}
    </div>
  )
}
