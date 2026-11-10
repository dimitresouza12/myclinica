'use client'
import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { PillTabs, type PillOption } from '@/components/ui/PillTabs'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import btn from '@/components/ui/button.module.css'
import { contactDisplayName, listTimeLabel } from '@/lib/whatsapp/inbox'
import { avatarTone } from '@/lib/whatsapp/bubble'
import { Avatar } from '@/components/ui/Avatar'
import { conversationPhoto } from '@/hooks/useWhatsAppInbox'
import type { WaConversation } from '@/hooks/useWhatsAppInbox'
import styles from './Inbox.module.css'

export type InboxFilter = 'todas' | 'naolidas' | 'pacientes' | 'leads'

const TABS: { value: InboxFilter; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'naolidas', label: 'Não lidas' },
  { value: 'pacientes', label: 'Pacientes' },
  { value: 'leads', label: 'Leads' },
]

/** Círculo do contato: foto ou iniciais (cor derivada do nome); lead ganha um contorno ao redor. */
export function ContactAvatar({ c, name, size = 40 }: { c: WaConversation; name: string; size?: number }) {
  return (
    <span className={`${styles.avWrap} ${c.patient_id ? '' : styles.avLead}`}>
      <Avatar url={conversationPhoto(c)} name={name} size={size} className={`${styles.avatar} ${styles[`tone${avatarTone(name)}`]}`} empty={<Icon name="patients" size={Math.round(size * 0.45)} />} />
    </span>
  )
}

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
  const unread = p.conversations.filter(c => c.unread_count > 0).length
  const tabOptions: PillOption<InboxFilter>[] = TABS.map(t => (t.value === 'naolidas' && unread > 0 ? { ...t, count: unread } : t))

  return (
    <div className={`${styles.pane} ${styles.list}`}>
      <div className={styles.listHead}>
        {/* no desktop a busca fica na barra de cima; este campo só aparece no celular */}
        <SearchInput className={styles.localSearch} placeholder="Buscar conversa" value={p.query} onChange={p.onQuery} />
        <PillTabs label="Filtrar conversas" options={tabOptions} value={p.filter} onChange={p.onFilter} className={styles.filterTabs} />
      </div>

      <div className={styles.convs}>
        {p.loading && (
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

        {!p.loading && p.conversations.length === 0 && (
          p.everConnected ? (
            <EmptyState
              compact
              icon="messages"
              title="Nenhuma conversa ainda"
              description="As mensagens que seus pacientes e contatos enviarem para o WhatsApp da clínica aparecem aqui."
            />
          ) : (
            <EmptyState
              compact
              icon="messages"
              title="WhatsApp não conectado"
              description="Conecte o WhatsApp da clínica para ver e responder as conversas por aqui, sem precisar do celular."
              action={<Link className={`${btn.primary} ${styles.emptyLink}`} href="/configuracoes?tab=whatsapp">Conectar WhatsApp</Link>}
            />
          )
        )}

        {!p.loading && p.conversations.length > 0 && visible.length === 0 && (
          <EmptyState compact icon="search" title="Nenhuma conversa encontrada" description="Tente outro nome ou troque o filtro." />
        )}

        {visible.map(c => {
          const name = conversationName(c)
          const selected = c.id === p.selectedId
          return (
            <button key={c.id} className={`${styles.conv} ${selected ? styles.convOn : ''} ${c.unread_count > 0 ? styles.unreadRow : ''}`} aria-current={selected} onClick={() => p.onSelect(c)}>
              <ContactAvatar c={c} name={name} />
              <span className={styles.mid}>
                <span className={styles.l1}>
                  <span className={styles.nm}>{name}<span className={styles.srOnly}>{c.patient_id ? ', paciente' : ', lead'}</span></span>
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
