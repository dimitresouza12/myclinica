'use client'
import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { contactDisplayName, listTimeLabel } from '@/lib/whatsapp/inbox'
import { Avatar } from '@/components/ui/Avatar'
import { conversationPhoto } from '@/hooks/useWhatsAppInbox'
import type { WaConversation } from '@/hooks/useWhatsAppInbox'
import styles from './Inbox.module.css'

export type InboxFilter = 'todas' | 'naolidas' | 'pacientes' | 'leads'

const TABS: { key: InboxFilter; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'naolidas', label: 'Não lidas' },
  { key: 'pacientes', label: 'Pacientes' },
  { key: 'leads', label: 'Leads' },
]

export function conversationName(c: WaConversation): string {
  return contactDisplayName({ patientName: c.patients?.name, contactName: c.contact_name, jid: c.jid })
}

export function filterConversations(list: WaConversation[], filter: InboxFilter, query: string): WaConversation[] {
  const q = query.trim().toLowerCase()
  return list.filter(c => {
    if (filter === 'naolidas' && c.unread_count === 0) return false
    if (filter === 'pacientes' && !c.patient_id) return false
    if (filter === 'leads' && c.patient_id) return false
    if (q && !conversationName(c).toLowerCase().includes(q) && !c.jid.includes(q.replace(/\D/g, '') || '\u0000')) return false
    return true
  })
}

interface Props {
  conversations: WaConversation[]
  loading: boolean
  everConnected: boolean
  selectedId: string | null
  filter: InboxFilter
  query: string
  now: Date
  timezone: string
  onFilter: (f: InboxFilter) => void
  onQuery: (q: string) => void
  onSelect: (c: WaConversation) => void
}

export function ConversationList(p: Props) {
  const visible = filterConversations(p.conversations, p.filter, p.query)

  return (
    <div className={`${styles.pane} ${styles.list}`}>
      <div className={styles.listHead}>
        <h2 className={styles.listTitle}>Mensagens</h2>
        <label className={styles.search}>
          <Icon name="search" size={16} />
          <input type="search" placeholder="Buscar conversa" aria-label="Buscar conversa" value={p.query} onChange={e => p.onQuery(e.target.value)} />
        </label>
        <div className={styles.tabs} role="group" aria-label="Filtrar conversas">
          {TABS.map(t => (
            <button key={t.key} className={`${styles.tab} ${p.filter === t.key ? styles.tabOn : ''}`} aria-pressed={p.filter === t.key} onClick={() => p.onFilter(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.convs}>
        {p.loading && <p className={styles.empty}>Carregando conversas…</p>}

        {!p.loading && p.conversations.length === 0 && (
          <div className={styles.empty}>
            {p.everConnected ? (
              <p>Nenhuma conversa ainda. As mensagens que seus pacientes e contatos enviarem para o WhatsApp da clínica aparecem aqui.</p>
            ) : (
              <>
                <p>Conecte o WhatsApp da clínica para ver e responder as conversas por aqui, sem precisar do celular.</p>
                <Link className={styles.emptyLink} href="/configuracoes?tab=whatsapp">Conectar WhatsApp</Link>
              </>
            )}
          </div>
        )}

        {!p.loading && p.conversations.length > 0 && visible.length === 0 && (
          <p className={styles.empty}>Nenhuma conversa encontrada com esse filtro.</p>
        )}

        {visible.map(c => {
          const name = conversationName(c)
          const selected = c.id === p.selectedId
          return (
            <button key={c.id} className={`${styles.conv} ${selected ? styles.convOn : ''} ${c.unread_count > 0 ? styles.unreadRow : ''}`} aria-current={selected} onClick={() => p.onSelect(c)}>
              <Avatar url={conversationPhoto(c)} name={name} size={40} className={styles.avatar} />
              <span className={styles.mid}>
                <span className={styles.l1}>
                  <span className={styles.nm}>
                    {name}
                    <span className={`${styles.kind} ${c.patient_id ? styles.kindPatient : styles.kindLead}`}>{c.patient_id ? 'Paciente' : 'Lead'}</span>
                  </span>
                  <span className={styles.tm}>{listTimeLabel(new Date(c.last_message_at), p.now, p.timezone)}</span>
                </span>
                <span className={styles.l2}>
                  <span className={styles.pv}>{c.last_message_direction === 'out' ? 'Você: ' : ''}{c.last_message_preview ?? ''}</span>
                  {c.unread_count > 0 && <span className={styles.badge} aria-label={`${c.unread_count} não lidas`}>{c.unread_count}</span>}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
