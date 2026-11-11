'use client'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/usePermissions'
import { whatsappApi } from '@/components/configuracoes/whatsappApi'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { clockLabel } from '@/lib/whatsapp/inbox'
import { DEFAULT_SETTINGS } from '@/lib/whatsapp/settings'
import { groupByDay, mergePages, messageText, relativeTime, PAGE_SIZE, type MsgKind } from '@/lib/conversas/messages'
import styles from './TabConversas.module.css'

const TIMEZONE = DEFAULT_SETTINGS.timezone
const MAX_TEXT = 4000

interface PatientMessage {
  id: string
  conversation_id: string
  direction: 'in' | 'out'
  kind: MsgKind
  body: string | null
  origin: 'contato' | 'sistema' | 'celular' | 'automatico'
  sent_by_name: string | null
  created_at: string
  media_status: 'pending' | 'ready' | 'failed' | 'expired' | null
  media_name: string | null
  media_size: number | null
  deleted_at: string | null
  edited_at: string | null
}

interface Page {
  connection: string | null
  unavailable?: boolean
  primaryConversationId?: string | null
  conversations: { id: string; contactName: string | null; lastMessageAt: string }[]
  messages: PatientMessage[]
  hasMore: boolean
}

function authorOf(m: PatientMessage): string | null {
  if (m.direction !== 'out') return null
  if (m.origin === 'sistema') return m.sent_by_name ?? 'Equipe'
  if (m.origin === 'celular') return 'Celular da clínica'
  if (m.origin === 'automatico') return 'Mensagem automática'
  return null
}

function Bubble({ m, onOpen }: { m: PatientMessage; onOpen: (id: string) => Promise<string | null> }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const { label, text } = messageText(m)
  const deleted = !!m.deleted_at
  const by = authorOf(m)
  const canOpen = !deleted && m.kind !== 'text' && m.media_status === 'ready'

  async function open() {
    setBusy(true); setErr('')
    setErr((await onOpen(m.id)) ?? '')
    setBusy(false)
  }

  return (
    <div className={`${styles.b} ${m.direction === 'in' ? styles.in : styles.out}`}>
      {by && <span className={styles.by}>{by}</span>}
      {label && <span className={styles.label}>{label}</span>}
      {!deleted && m.kind === 'document' && m.media_name && <span className={styles.file}>{m.media_name}</span>}
      {text && <span className={deleted ? styles.deleted : styles.text}>{text}</span>}
      {canOpen && <button type="button" className={styles.open} onClick={() => void open()} disabled={busy}>{busy ? 'Abrindo…' : 'Abrir arquivo'}</button>}
      {err && <span className={styles.err} role="alert">{err}</span>}
      <span className={styles.time}>{m.edited_at && !deleted ? 'editada · ' : ''}{clockLabel(new Date(m.created_at), TIMEZONE)}</span>
    </div>
  )
}

/**
 * Conversas de WhatsApp do paciente (equipe de atendimento). Usa a conexão e as tabelas da tela Mensagens:
 * leitura pela rota /api/pacientes/[id]/conversas e resposta pela mesma rota de envio do CRM.
 * Não entra no prontuário impresso nem no portal do paciente.
 */
export function TabConversas({ patientId, active }: { patientId: string; active: boolean }) {
  const qc = useQueryClient()
  const isDemo = useAuthStore(s => s.clinic?.demoMode === true)
  const { canEdit, isAdmin } = usePermissions('crm')
  const [now, setNow] = useState(() => new Date())
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastIdRef = useRef<string | null>(null)
  const prevHeightRef = useRef<number | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const q = useInfiniteQuery({
    queryKey: ['pac-conversas', patientId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams({ limit: String(PAGE_SIZE) })
      if (pageParam) qs.set('before', pageParam)
      return whatsappApi<Page>(`/api/pacientes/${encodeURIComponent(patientId)}/conversas?${qs}`)
    },
    getNextPageParam: last => {
      if (!last.hasMore || last.messages.length === 0) return undefined
      return last.messages[last.messages.length - 1].created_at
    },
    staleTime: 15_000,
    refetchInterval: active ? 30_000 : false,
    retry: false,
  })

  const pages = useMemo(() => q.data?.pages ?? [], [q.data])
  const first = pages[0]
  const messages = useMemo(() => mergePages(pages.map(p => p.messages)), [pages])
  const groups = useMemo(() => groupByDay(messages, now, TIMEZONE), [messages, now])
  const lastMsg = messages[messages.length - 1]

  // rolagem: abre no fim; mensagem nova vai ao fim; ao carregar mais antigas, mantém o ponto de leitura
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !lastMsg) return
    if (prevHeightRef.current != null) {
      el.scrollTop += el.scrollHeight - prevHeightRef.current
      prevHeightRef.current = null
    } else if (lastIdRef.current !== lastMsg.id) {
      el.scrollTop = el.scrollHeight
    }
    lastIdRef.current = lastMsg.id
  }, [messages, lastMsg, active])

  function loadOlder() {
    prevHeightRef.current = scrollRef.current?.scrollHeight ?? null
    void q.fetchNextPage()
  }

  async function openMedia(messageId: string): Promise<string | null> {
    try {
      const r = await whatsappApi<{ urls: Record<string, string> }>('/api/whatsapp/media/urls', { method: 'POST', body: { messageIds: [messageId], download: true } })
      const url = r.urls[messageId]
      if (!url) return 'O arquivo não está mais disponível.'
      const a = document.createElement('a')
      a.href = url
      a.rel = 'noopener noreferrer'
      a.click()
      return null
    } catch (e) {
      return e instanceof Error ? e.message : 'Não foi possível abrir o arquivo.'
    }
  }

  const conversationId = first?.primaryConversationId ?? null
  const blockedReason =
    isDemo ? 'Envio desativado na conta de demonstração.'
    : !canEdit ? 'Você pode ler, mas não tem permissão para responder.'
    : !conversationId ? 'Sem conversa aberta para responder.'
    : null

  async function send() {
    const text = draft.replace(/\r\n/g, '\n').trim()
    if (!text || !conversationId || sending || blockedReason) return
    setSending(true); setSendError('')
    try {
      await whatsappApi('/api/whatsapp/conversations/send', { method: 'POST', body: { conversationId, text } })
      setDraft('')
      await q.refetch()
      qc.invalidateQueries({ queryKey: ['wa-convs'] })
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Não foi possível enviar. Tente de novo.')
    } finally {
      setSending(false)
    }
  }

  // ── estados ────────────────────────────────────────────────────────────────
  if (q.isPending) {
    return <div className={styles.center}><Spinner label="Carregando conversas" /></div>
  }
  if (q.isError) {
    return (
      <div className={styles.center} role="alert">
        <span className={styles.err}>{q.error instanceof Error ? q.error.message : 'Não foi possível carregar as conversas.'}</span>
        <button type="button" className={styles.older} onClick={() => void q.refetch()}>Tentar de novo</button>
      </div>
    )
  }
  if (first.unavailable) {
    return <EmptyState icon="messages" title="Conversas indisponíveis" description="O histórico de WhatsApp ainda não está habilitado nesta clínica." />
  }
  if (first.connection !== 'conectado') {
    return (
      <EmptyState
        icon="messages"
        title="WhatsApp não conectado"
        description={isAdmin
          ? 'Conecte o WhatsApp da clínica para ver aqui as conversas deste paciente.'
          : 'O WhatsApp da clínica não está conectado. Peça ao administrador para conectar em Configurações.'}
        action={isAdmin ? <Link className={styles.connectBtn} href="/configuracoes?tab=whatsapp">Conectar WhatsApp</Link> : undefined}
      />
    )
  }
  if (first.conversations.length === 0 || messages.length === 0) {
    return <EmptyState icon="messages" title="Nenhuma conversa com este paciente" description="Quando ele trocar mensagens com o WhatsApp da clínica, o histórico aparece aqui." />
  }

  const newest = first.conversations[0]
  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h3 className={styles.title}>Conversas de WhatsApp</h3>
        <span className={styles.badge}>Somente atendimento</span>
        <span className={styles.last}>Última mensagem {relativeTime(new Date(newest.lastMessageAt), now, TIMEZONE)}</span>
      </div>
      <p className={styles.notice}>
        <Icon name="alert" size={16} />
        <span>As conversas ficam só nesta aba, visíveis para o atendimento. Não entram no prontuário impresso nem no portal do paciente.</span>
      </p>

      <div className={styles.box}>
        <div className={styles.scroll} ref={scrollRef} role="log" aria-label="Histórico de conversas de WhatsApp">
          {q.hasNextPage && (
            <button type="button" className={styles.older} onClick={loadOlder} disabled={q.isFetchingNextPage}>
              {q.isFetchingNextPage ? 'Carregando…' : 'Carregar mensagens anteriores'}
            </button>
          )}
          {q.isFetchNextPageError && <span className={styles.err} role="alert">Não foi possível carregar as anteriores.</span>}
          {groups.map(g => (
            <div key={g.key} style={{ display: 'contents' }}>
              <span className={styles.day}>{g.label}</span>
              {g.messages.map(m => <Bubble key={m.id} m={m} onOpen={openMedia} />)}
            </div>
          ))}
        </div>

        {blockedReason ? (
          <div className={styles.blocked}>{blockedReason}</div>
        ) : (
          <>
            {sendError && <div className={styles.sendErr} role="alert">{sendError}</div>}
            <div className={styles.composer}>
              <textarea
                rows={1}
                value={draft}
                maxLength={MAX_TEXT}
                placeholder="Escreva uma resposta"
                aria-label="Resposta por WhatsApp"
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send() } }}
                disabled={sending}
              />
              <button type="button" className={styles.send} onClick={() => void send()} disabled={sending || !draft.trim()}>
                {sending ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
