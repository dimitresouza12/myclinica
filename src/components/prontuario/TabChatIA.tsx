'use client'
import { useState, useEffect, useRef } from 'react'
import { callN8n } from '@/lib/supabase-n8n'
import styles from './TabChatIA.module.css'

interface Message {
  id: string
  text: string
  sender: 'user' | 'bot'
  time: string
}

export function TabChatIA({ phone }: { phone: string | null }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let ignore = false
    loadMessages(() => ignore)
    return () => { ignore = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadMessages(isStale: () => boolean) {
    setLoading(true)
    setError('')
    if (!phone) {
      setError('Paciente sem número de telefone cadastrado.')
      setLoading(false)
      return
    }

    try {
      const { data } = await callN8n<{
        data: { messages: Record<string, unknown>[]; histories: Record<string, unknown>[] }
      }>({ action: 'list_messages_by_phone', phone })
      if (isStale()) return
      const msgData = data?.messages ?? []
      const histData = data?.histories ?? []

      if (msgData.length > 0) {
        const msgs: Message[] = []
        msgData.forEach((row: Record<string, unknown>) => {
          const time = row.created_at ? new Date(row.created_at as string).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
          if (row.user_message) msgs.push({ id: `u-${row.id}`, text: String(row.user_message), sender: 'user', time })
          if (row.bot_message) msgs.push({ id: `b-${row.id}`, text: String(row.bot_message), sender: 'bot', time })
        })
        setMessages(msgs)
        setLoading(false)
        return
      }

      const msgs: Message[] = histData.map((row: Record<string, unknown>) => {
        const msg = row.message as { type?: string; data?: { content?: string } }
        const text = msg?.data?.content ?? '...'
        const sender: 'user' | 'bot' = msg?.type === 'human' ? 'user' : 'bot'
        return { id: String(row.id), text, sender, time: '' }
      })
      setMessages(msgs)
    } catch {
      if (isStale()) return
      setError('Não foi possível carregar o histórico de conversas do WhatsApp.')
    } finally {
      if (!isStale()) setLoading(false)
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.badge}>WhatsApp / IA</span>
        <span className={styles.readOnly}>somente leitura</span>
      </div>

      <div className={styles.chatBox}>
        {loading && <p className={styles.info}>Carregando histórico...</p>}
        {error && <p className={styles.info}>{error}</p>}
        {!loading && !error && messages.length === 0 && (
          <p className={styles.info}>Nenhuma conversa encontrada para este paciente.</p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`${styles.bubble} ${styles[msg.sender]}`}>
            <span className={styles.text}>{msg.text}</span>
            {msg.time && <span className={styles.time}>{msg.time}</span>}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  )
}
