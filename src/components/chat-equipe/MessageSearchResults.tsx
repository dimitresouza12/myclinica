'use client'
import { Icon } from '@/components/ui/Icon'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorNotice } from '@/components/ui/ErrorNotice'
import { Spinner } from '@/components/ui/Spinner'
import { TEAM_SEARCH_MIN } from '@/hooks/useTeamChat'
import { clockLabel, dayLabel } from '@/lib/whatsapp/inbox'
import { snippetParts } from '@/lib/teamChat/richText'
import type { TeamDirectoryEntry, TeamMessage } from '@/lib/teamChat/types'
import styles from './ChatEquipe.module.css'

interface Props {
  /** termo já consultado (o destacado no trecho) */
  term: string
  /** false: ainda não há o mínimo de letras */
  active: boolean
  /** o usuário ainda está digitando */
  waiting: boolean
  loading: boolean
  error: boolean
  onRetry: () => void
  results: TeamMessage[] | undefined
  /** há mais resultados do que os exibidos */
  more: boolean
  directory: TeamDirectoryEntry[]
  meId: string | null
  /** título do canal da mensagem; null = mostra só o autor (busca dentro de uma conversa) */
  channelTitle: ((channelId: string) => string | null) | null
  now: Date
  timezone: string
  onPick: (m: TeamMessage) => void
}

/** Lista de resultados da busca nas mensagens: canal, autor, trecho com o termo destacado e quando foi enviada. */
export function MessageSearchResults(p: Props) {
  if (!p.active) {
    return <p className={styles.searchHint}>Digite pelo menos {TEAM_SEARCH_MIN} letras para buscar nas mensagens.</p>
  }
  if (p.error) {
    return <div className={styles.listError}><ErrorNotice message="Não foi possível buscar as mensagens." onRetry={p.onRetry} /></div>
  }
  if (p.loading || p.waiting || !p.results) {
    return <div className={styles.msgsLoading} aria-busy="true"><Spinner label="Buscando mensagens" /></div>
  }

  const names = new Map(p.directory.map(d => [d.clinic_user_id, d.display_name]))
  const rows = p.results
    .map(m => ({ m, channel: p.channelTitle ? p.channelTitle(m.channel_id) : '' }))
    // mensagem de uma conversa que a lista não mostra não tem para onde abrir
    .filter((r): r is { m: TeamMessage; channel: string } => r.channel !== null)

  if (rows.length === 0) {
    return <EmptyState compact icon="search" title="Nenhuma mensagem encontrada" description="Tente outras palavras." />
  }

  return (
    <div className={styles.results}>
      <p className={styles.resultsCount} aria-live="polite">
        {p.more
          ? `Mostrando as ${rows.length} mais recentes. Refine a busca para ver outras.`
          : `${rows.length} ${rows.length === 1 ? 'mensagem encontrada' : 'mensagens encontradas'}`}
      </p>
      <ul className={styles.resultList}>
        {rows.map(({ m, channel }) => {
          const author = m.sender_clinic_user_id === p.meId
            ? 'Você'
            : (m.sender_clinic_user_id ? names.get(m.sender_clinic_user_id) : undefined) ?? 'Colega desativado'
          const when = new Date(m.created_at)
          return (
            <li key={m.id}>
              <button type="button" className={styles.resultRow} onClick={() => p.onPick(m)}>
                <span className={styles.resultTop}>
                  <span className={styles.resultWho}>
                    {channel ? <><b>{channel}</b><span aria-hidden="true"> · </span></> : null}
                    <span>{author}</span>
                  </span>
                  <span className={styles.resultTime}>{dayLabel(when, p.now, p.timezone)} · {clockLabel(when, p.timezone)}</span>
                </span>
                <span className={styles.resultText}>
                  {snippetParts(m.body, p.term).map((s, i) => (s.hit ? <mark key={i}>{s.text}</mark> : s.text))}
                </span>
                <Icon name="chevronRight" size={16} className={styles.resultGo} aria-hidden="true" />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
