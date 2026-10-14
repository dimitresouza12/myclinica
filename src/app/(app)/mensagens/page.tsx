'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { PageTitle } from '@/components/layout/PageTitle'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { usePermissions } from '@/hooks/usePermissions'
import { useWhatsAppState } from '@/hooks/useClinicData'
import { useConversations, useMessages, useMediaUrls, useQuickReplies } from '@/hooks/useWhatsAppInbox'
import { whatsappApi } from '@/components/configuracoes/whatsappApi'
import { ConversationList, type InboxFilter } from '@/components/mensagens/ConversationList'
import { ChatPane } from '@/components/mensagens/ChatPane'
import { ContactPanel } from '@/components/mensagens/ContactPanel'
import { DEFAULT_SETTINGS } from '@/lib/whatsapp/settings'
import styles from '@/components/mensagens/Inbox.module.css'

const TIMEZONE = DEFAULT_SETTINGS.timezone

function Inbox() {
  const clinicId = useAuthStore(s => s.clinic?.id)
  const qc = useQueryClient()
  const { canEdit } = usePermissions('crm')
  const { data: waState } = useWhatsAppState(clinicId)
  const { data: conversations = [], isLoading } = useConversations(clinicId)

  // vindo do CRM ("Conversar"), a conversa já abre selecionada
  const initialConversation = useSearchParams().get('c')
  const [selectedId, setSelectedId] = useState<string | null>(initialConversation)
  const [filter, setFilter] = useState<InboxFilter>('todas')
  const [query, setQuery] = useState('')
  const [mobileView, setMobileView] = useState<'list' | 'chat'>(initialConversation ? 'chat' : 'list')
  const [infoOpen, setInfoOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  // "agora" para rótulos de data: muda a cada minuto, sem chamar Date.now() no render
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const selected = useMemo(() => conversations.find(c => c.id === selectedId) ?? null, [conversations, selectedId])
  const { data: messages = [], isLoading: loadingMsgs } = useMessages(selectedId)
  const { data: mediaUrls = {} } = useMediaUrls(selectedId, messages)
  const { data: quickReplies = [] } = useQuickReplies(clinicId)

  const connected = waState?.status === 'conectado'
  const everConnected = !!waState

  // conversa aberta com mensagens não lidas (inclusive as que chegam com ela aberta) → marca como lida
  const selectedUnread = selected?.unread_count ?? 0
  useEffect(() => {
    if (!selectedId || selectedUnread === 0) return
    let alive = true
    whatsappApi('/api/whatsapp/conversations/read', { method: 'POST', body: { conversationId: selectedId } })
      .then(() => {
        if (!alive) return
        qc.invalidateQueries({ queryKey: ['wa-convs', clinicId] })
        qc.invalidateQueries({ queryKey: ['wa-unread', clinicId] })
      })
      .catch(() => { /* o contador se acerta no próximo carregamento */ })
    return () => { alive = false }
  }, [selectedId, selectedUnread, clinicId, qc])

  async function handleSend(text: string): Promise<boolean> {
    if (!selectedId) return false
    setSending(true); setSendError('')
    try {
      await whatsappApi('/api/whatsapp/conversations/send', { method: 'POST', body: { conversationId: selectedId, text } })
      qc.invalidateQueries({ queryKey: ['wa-msgs', selectedId] })
      qc.invalidateQueries({ queryKey: ['wa-convs', clinicId] })
      return true
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Não foi possível enviar. Tente de novo.')
      return false
    } finally {
      setSending(false)
    }
  }

  async function handleSendFile(file: File, caption: string): Promise<boolean> {
    if (!selectedId) return false
    setSending(true); setSendError('')
    try {
      const form = new FormData()
      form.append('conversationId', selectedId)
      form.append('file', file)
      form.append('caption', caption)
      await whatsappApi('/api/whatsapp/conversations/send-media', { method: 'POST', body: form })
      qc.invalidateQueries({ queryKey: ['wa-msgs', selectedId] })
      qc.invalidateQueries({ queryKey: ['wa-convs', clinicId] })
      return true
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Não foi possível enviar o arquivo. Tente de novo.')
      return false
    } finally {
      setSending(false)
    }
  }

  async function handleSendVoice(blob: Blob, seconds: number): Promise<boolean> {
    if (!selectedId) return false
    setSending(true); setSendError('')
    try {
      const form = new FormData()
      form.append('conversationId', selectedId)
      form.append('file', new File([blob], 'audio', { type: blob.type }))
      form.append('voice', '1')
      form.append('seconds', String(seconds))
      await whatsappApi('/api/whatsapp/conversations/send-media', { method: 'POST', body: form })
      qc.invalidateQueries({ queryKey: ['wa-msgs', selectedId] })
      qc.invalidateQueries({ queryKey: ['wa-convs', clinicId] })
      return true
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Não foi possível enviar o áudio. Tente de novo.')
      return false
    } finally {
      setSending(false)
    }
  }

  async function handleEditMessage(messageId: string, text: string): Promise<string | null> {
    try {
      await whatsappApi('/api/whatsapp/messages/edit', { method: 'POST', body: { messageId, text } })
      qc.invalidateQueries({ queryKey: ['wa-msgs', selectedId] })
      return null
    } catch (e) {
      return e instanceof Error ? e.message : 'Não foi possível editar a mensagem.'
    }
  }

  async function handleDeleteMessage(messageId: string): Promise<string | null> {
    try {
      await whatsappApi('/api/whatsapp/messages/delete', { method: 'POST', body: { messageId } })
      qc.invalidateQueries({ queryKey: ['wa-msgs', selectedId] })
      qc.invalidateQueries({ queryKey: ['wa-convs', clinicId] })
      return null
    } catch (e) {
      return e instanceof Error ? e.message : 'Não foi possível apagar a mensagem.'
    }
  }

  // "Baixar de novo": devolve a mensagem de erro (ou null se deu certo) para a própria bolha mostrar
  async function handleRetryMedia(messageId: string): Promise<string | null> {
    try {
      await whatsappApi('/api/whatsapp/media/retry', { method: 'POST', body: { messageId } })
      qc.invalidateQueries({ queryKey: ['wa-msgs', selectedId] })
      return null
    } catch (e) {
      qc.invalidateQueries({ queryKey: ['wa-msgs', selectedId] })
      return e instanceof Error ? e.message : 'Não foi possível baixar de novo.'
    }
  }

  // "Baixar": pede um link que baixa com o nome original e abre
  async function handleDownloadMedia(messageId: string): Promise<string | null> {
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
      return e instanceof Error ? e.message : 'Não foi possível baixar o arquivo.'
    }
  }

  const sendBlockedReason =
    !canEdit ? 'Você pode ver as conversas, mas não tem permissão para responder.'
    : !connected ? 'O WhatsApp da clínica está desconectado. Reconecte para responder por aqui.'
    : null

  return (
    <>
      <PageTitle title="Mensagens" mobileOnly />
      <div className={styles.root}>
        {everConnected && !connected && (
          <div className={styles.banner} role="alert">
            <strong>O WhatsApp da clínica está desconectado.</strong>
            <span>As mensagens novas não chegam e não dá para responder até reconectar.</span>
            <Link className={styles.bannerLink} href="/configuracoes?tab=whatsapp">Reconectar</Link>
          </div>
        )}
        <div className={`${styles.grid} ${mobileView === 'chat' ? styles.gridChat : styles.gridList}`}>
          <ConversationList
            conversations={conversations}
            loading={isLoading}
            everConnected={everConnected}
            selectedId={selectedId}
            filter={filter}
            query={query}
            now={now}
            timezone={TIMEZONE}
            onFilter={setFilter}
            onQuery={setQuery}
            onSelect={c => { setSelectedId(c.id); setMobileView('chat'); setInfoOpen(false); setSendError('') }}
          />
          {/* key: o rascunho não passa de uma conversa para outra */}
          <ChatPane
            key={selectedId ?? 'nenhuma'}
            conversation={selected}
            messages={messages}
            loading={loadingMsgs}
            now={now}
            timezone={TIMEZONE}
            canSend={!sendBlockedReason}
            sendBlockedReason={selected ? sendBlockedReason : null}
            sending={sending}
            sendError={sendError}
            onSend={handleSend}
            onSendFile={handleSendFile}
            onSendVoice={handleSendVoice}
            onEditMessage={handleEditMessage}
            onDeleteMessage={handleDeleteMessage}
            clinicId={clinicId ?? ''}
            canManageQuick={canEdit}
            quickReplies={quickReplies}
            onQuickChanged={() => qc.invalidateQueries({ queryKey: ['wa-quick', clinicId] })}
            mediaUrls={mediaUrls}
            onRetryMedia={handleRetryMedia}
            onDownloadMedia={handleDownloadMedia}
            onBack={() => setMobileView('list')}
            onToggleInfo={() => setInfoOpen(o => !o)}
          />
          <ContactPanel conversation={selected} open={infoOpen} />
        </div>
      </div>
    </>
  )
}

export default function MensagensPage() {
  return (
    <PermissionGuard module="crm">
      <Inbox />
    </PermissionGuard>
  )
}
