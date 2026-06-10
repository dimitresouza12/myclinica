'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { callN8n } from '@/lib/supabase-n8n'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { Portal } from '@/components/ui/Portal'
import { useScrollLock } from '@/hooks/useScrollLock'
import { formatDate, cleanPhone } from '@/lib/utils'
import styles from './crm.module.css'
import { PermissionGuard } from '@/components/ui/PermissionGuard'

interface PatientRow { id: string; phone: string }

interface Lead {
  phone: string
  conversation_id: string
  nome: string | null
  procedimento: string | null
  status: string | null
  data_agendamento: string | null
  created_at: string | null
  ai_service: string | null
  contexto: string | null
  memoria_contexto: string | null
}

interface ChatMessage {
  id: number
  created_at: string | null
  phone: string | null
  bot_message: string | null
  user_message: string | null
}

const COLUMNS: { key: string; label: string; color: string }[] = [
  { key: 'novo',      label: 'Novo Lead',   color: '#6B7280' },
  { key: 'Agendado',  label: 'Agendado',    color: '#0EA5E9' },
  { key: 'Concluído', label: 'Concluído',   color: '#10B981' },
]

function normalizeStatus(status: string | null): string {
  if (!status) return 'novo'
  const s = status.toLowerCase()
  if (s === 'agendado') return 'Agendado'
  if (s === 'concluído' || s === 'concluido') return 'Concluído'
  return status
}

function colKey(status: string | null) {
  const n = normalizeStatus(status)
  if (n === 'Agendado' || n === 'Concluído') return n
  return 'novo'
}

function initials(name: string | null, phone: string) {
  if (name?.trim()) return name.trim().split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return phone.slice(-2)
}

function fmtPhone(phone: string) {
  const d = phone.replace(/\D/g, '')
  if (d.length === 13) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
  return phone
}

const WHATSAPP_ORCAMENTO = 'https://wa.me/5588988557247?text=Ol%C3%A1%2C+gostaria+de+fazer+um+or%C3%A7amento+para+integrar+o+CRM+com+WhatsApp+IA.'

function CRMContent() {
  const { clinic } = useAuthStore()
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [automacaoAtiva, setAutomacaoAtiva] = useState<boolean | null>(null)
  const [selected, setSelected] = useState<Lead | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [msgLoading, setMsgLoading] = useState(false)
  const [converting, setConverting] = useState(false)
  const [convertMsg, setConvertMsg] = useState('')
  const [existingPatients, setExistingPatients] = useState<Set<string>>(new Set())
  const [patientIdMap, setPatientIdMap] = useState<Record<string, string>>({})

  useScrollLock(!!selected)

  // Gate: CRM é exclusivo do plano Plus
  useEffect(() => {
    if (clinic && clinic.plan !== 'plus') {
      router.replace('/dashboard')
    }
  }, [clinic, router])

  useEffect(() => {
    if (!clinic?.id || clinic.plan !== 'plus') return
    setLeads([])
    setAutomacaoAtiva(null)
    loadLeads()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic?.id])
  useEffect(() => {
    if (!clinic?.id || clinic.plan !== 'plus') return
    setExistingPatients(new Set())
    loadExistingPatients()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic?.id])

  if (clinic && clinic.plan !== 'plus') {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>CRM</h1>
        </div>
        <p className={styles.loading}>Redirecionando…</p>
      </div>
    )
  }

  async function loadLeads() {
    if (!clinic?.id) return
    setLoading(true)
    try {
      let rows: Lead[] = []
      let queryError = false
      try {
        const { data } = await callN8n<{ data: Lead[] }>({ action: 'list_chats' })
        rows = data ?? []
      } catch (e) {
        queryError = true
        console.error('[CRM] chats query error:', e)
      }
      const filtered = rows.filter(r => {
        if (!r.phone || r.phone === '=' || r.phone.length <= 5) return false
        if (r.phone.includes('@g.us')) return false   // grupos WhatsApp
        if (r.phone.includes('@lid')) return false    // dispositivos linked
        return true
      })

      // Extrair nome do memoria_contexto para leads que ainda não têm nome
      const semNome = filtered.filter(r => !r.nome && r.memoria_contexto)
      for (const lead of semNome) {
        const match = lead.memoria_contexto!.match(/Nome:\s*(.+)/i)
        if (!match) continue
        const nome = match[1].trim()
        const invalido = !nome || nome.startsWith('[') || nome === 'Não informado' || nome === 'Desconhecido'
        if (invalido) continue
        // Atualiza a coluna nome no banco do n8n (via Edge Function)
        try {
          await callN8n({ action: 'update_chat_name', conversation_id: lead.conversation_id, nome })
          lead.nome = nome // atualiza localmente também
        } catch (e) {
          console.error('[CRM] update name error:', e)
        }
      }

      setLeads(filtered)
      setAutomacaoAtiva(!queryError && rows.length > 0)
    } finally {
      setLoading(false)
    }
  }

  async function loadExistingPatients() {
    if (!clinic) return
    const { data } = await supabase.from('patients').select('id, phone').eq('clinic_id', clinic.id)
    const rows = (data ?? []) as PatientRow[]
    const phones = new Set(rows.map(p => cleanPhone(p.phone)).filter(Boolean))
    const idMap: Record<string, string> = {}
    for (const p of rows) {
      const clean = cleanPhone(p.phone)
      if (clean) idMap[clean] = p.id
    }
    setExistingPatients(phones)
    setPatientIdMap(idMap)
  }

  async function openLead(lead: Lead) {
    setSelected(lead)
    setConvertMsg('')
    setMsgLoading(true)
    // Filter by conversation_id (unique per lead) — phone is unreliable due to format variants
    try {
      const { data } = await callN8n<{ data: ChatMessage[] }>({
        action: 'list_messages_by_conversation',
        conversation_id: lead.conversation_id,
      })
      setMessages(data ?? [])
    } catch (e) {
      console.error('[CRM] messages error:', e)
      setMessages([])
    }
    setMsgLoading(false)
  }

  function cleanUserMsg(raw: string | null): string {
    if (!raw) return ''
    // n8n stores user messages as JSON-like: ["oi"] or ["oi" "igor"] or ["msg"] null
    // Strip surrounding brackets, drop trailing " null", split tokens, take the last one (most recent batch)
    let s = raw.trim().replace(/\s+null\s*$/, '').trim()
    if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1).trim()
    // Split by `" "` boundary between batched tokens
    const tokens = s.split(/"\s+"/).map((t) => t.replace(/^"|"$/g, '').trim()).filter(Boolean)
    return tokens.length ? tokens[tokens.length - 1] : s
  }

  function cleanBotMsg(raw: string | null): string {
    if (!raw) return ''
    return raw.replace(/^=/, '').trim()
  }

  async function convertToPatient() {
    if (!selected || !clinic) return
    setConverting(true)
    setConvertMsg('')
    const clean = cleanPhone(selected.phone)

    // Check duplicate
    if (existingPatients.has(clean)) {
      setConvertMsg('already')
      setConverting(false)
      return
    }

    const { error } = await supabase.from('patients').insert([{
      clinic_id: clinic.id,
      name: selected.nome?.trim() || `Lead ${clean || selected.phone}`,
      phone: clean || null,
      is_active: true,
      registration_status: 'approved',
      notes: selected.procedimento ? `Procedimento de interesse: ${selected.procedimento}` : null,
    }])

    if (error) {
      setConvertMsg('error')
    } else {
      setConvertMsg('ok')
      setExistingPatients(prev => new Set([...prev, clean]))
      // Reload patients to get the new ID for the "Ver Atendimento" button
      loadExistingPatients()
      loadLeads()
    }
    setConverting(false)
  }

  const byCol = (col: string) => leads.filter(l => colKey(l.status) === col)

  const stats = {
    total: leads.length,
    agendados: leads.filter(l => normalizeStatus(l.status) === 'Agendado').length,
    concluidos: leads.filter(l => normalizeStatus(l.status) === 'Concluído').length,
    semNome: leads.filter(l => !l.nome).length,
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>CRM — Leads WhatsApp</h1>
          <p className={styles.sub}>Contatos captados pelo bot de IA</p>
        </div>
        <button className={styles.btnRefresh} onClick={loadLeads}>↻ Atualizar</button>
      </div>

      {/* Stats */}
      <div className={styles.stats}>
        <div className={styles.stat}><span className={styles.statVal}>{stats.total}</span><span className={styles.statLabel}>Total de leads</span></div>
        <div className={styles.stat}><span className={styles.statVal} style={{ color: '#0EA5E9' }}>{stats.agendados}</span><span className={styles.statLabel}>Agendados</span></div>
        <div className={styles.stat}><span className={styles.statVal} style={{ color: '#10B981' }}>{stats.concluidos}</span><span className={styles.statLabel}>Concluídos</span></div>
        <div className={styles.stat}><span className={styles.statVal} style={{ color: '#F59E0B' }}>{stats.semNome}</span><span className={styles.statLabel}>Sem identificação</span></div>
      </div>

      {loading ? (
        <p className={styles.loading}>Carregando leads...</p>
      ) : automacaoAtiva === false ? (
        <div className={styles.gateBox}>
          <div className={styles.gateIcon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h2 className={styles.gateTitle}>Automação WhatsApp não configurada</h2>
          <p className={styles.gateSub}>
            O CRM com IA é exclusivo do plano Plus e requer a integração com o bot WhatsApp da sua clínica.
            Entre em contato para fazer um orçamento e ativar o serviço.
          </p>
          <a
            href={WHATSAPP_ORCAMENTO}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.btnOrcamento}
          >
            Fazer orçamento pelo WhatsApp
          </a>
        </div>
      ) : (
        <div className={styles.kanban}>
          {COLUMNS.map(col => {
            const cards = byCol(col.key)
            return (
              <div key={col.key} className={styles.column}>
                <div className={styles.colHeader}>
                  <span className={styles.colDot} style={{ background: col.color }} />
                  <span className={styles.colLabel}>{col.label}</span>
                  <span className={styles.colCount}>{cards.length}</span>
                </div>
                <div className={styles.cards}>
                  {cards.length === 0 && <p className={styles.empty}>Nenhum lead</p>}
                  {cards.map(lead => {
                    const clean = cleanPhone(lead.phone)
                    const isPatient = existingPatients.has(clean)
                    return (
                      <div key={`${lead.phone}-${lead.conversation_id}`} className={styles.card} onClick={() => openLead(lead)}>
                        <div className={styles.cardTop}>
                          <div className={styles.avatar}>{initials(lead.nome, lead.phone)}</div>
                          <div className={styles.cardInfo}>
                            <span className={styles.cardName}>{lead.nome || <em className={styles.noName}>Sem nome</em>}</span>
                            <span className={styles.cardPhone}>{fmtPhone(lead.phone)}</span>
                          </div>
                          {isPatient && <span className={styles.badgePatient}>Paciente</span>}
                        </div>
                        {lead.procedimento && (
                          <span className={styles.badgeProcedimento}>{lead.procedimento}</span>
                        )}
                        {lead.data_agendamento && (
                          <span className={styles.cardDate}>{formatDate(lead.data_agendamento, true)}</span>
                        )}
                        {lead.created_at && (
                          <span className={styles.cardCreated}>{formatDate(lead.created_at, true)}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <Portal>
          <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelAvatarWrap}>
                  <div className={styles.panelAvatar}>{initials(selected.nome, selected.phone)}</div>
                  <div>
                    <h2 className={styles.panelName}>{selected.nome || 'Sem nome'}</h2>
                    <p className={styles.panelPhone}>{fmtPhone(selected.phone)}</p>
                  </div>
                </div>
                <button className={styles.btnClose} onClick={() => setSelected(null)}>✕</button>
              </div>

              <div className={styles.panelMeta}>
                {selected.procedimento && <MetaRow label="Procedimento" value={selected.procedimento} />}
                {selected.status && <MetaRow label="Status" value={selected.status} />}
                {selected.data_agendamento && <MetaRow label="Agendamento" value={formatDate(selected.data_agendamento, true)} />}
                {selected.ai_service && <MetaRow label="Serviço IA" value={selected.ai_service} />}
                {selected.created_at && <MetaRow label="Primeiro contato" value={formatDate(selected.created_at, true)} />}
              </div>

              {/* Conversation */}
              <div className={styles.chatSection}>
                <p className={styles.chatTitle}>Histórico WhatsApp</p>
                <div className={styles.chatBox}>
                  {msgLoading && <p className={styles.chatInfo}>Carregando...</p>}
                  {!msgLoading && messages.length === 0 && <p className={styles.chatInfo}>Nenhuma mensagem encontrada.</p>}
                  {messages.map(m => {
                    const userText = cleanUserMsg(m.user_message)
                    const botText = cleanBotMsg(m.bot_message)
                    const time = m.created_at ? new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
                    const msgs = []
                    if (userText) msgs.push(
                      <div key={`u-${m.id}`} className={`${styles.bubble} ${styles.user}`}>
                        <span>{userText}</span>
                        {time && <span className={styles.bubbleTime}>{time}</span>}
                      </div>
                    )
                    if (botText) msgs.push(
                      <div key={`b-${m.id}`} className={`${styles.bubble} ${styles.bot}`}>
                        <span>{botText}</span>
                        {time && <span className={styles.bubbleTime}>{time}</span>}
                      </div>
                    )
                    return msgs
                  })}
                </div>
              </div>

              {/* Convert action */}
              <div className={styles.panelFooter}>
                {convertMsg === 'ok' && <p className={styles.msgOk}>✓ Paciente criado com sucesso!</p>}
                {convertMsg === 'already' && <p className={styles.msgWarn}>Telefone já cadastrado como paciente.</p>}
                {convertMsg === 'error' && <p className={styles.msgErr}>Erro ao criar paciente.</p>}
                {existingPatients.has(cleanPhone(selected.phone)) ? (
                  <>
                    <button className={styles.btnPatientExists} disabled>✓ Já é paciente</button>
                    {patientIdMap[cleanPhone(selected.phone)] && (
                      <button
                        className={styles.btnAtendimento}
                        onClick={() => router.push(`/pacientes?patient=${patientIdMap[cleanPhone(selected.phone)]}`)}
                      >
                        Ver Atendimento
                      </button>
                    )}
                  </>
                ) : (
                  <button className={styles.btnConvert} onClick={convertToPatient} disabled={converting}>
                    {converting ? 'Convertendo...' : '+ Converter em Paciente'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  )
}

export default function CRMPage() {
  return <PermissionGuard module="crm"><CRMContent /></PermissionGuard>
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metaRow}>
      <span className={styles.metaLabel}>{label}</span>
      <span className={styles.metaValue}>{value}</span>
    </div>
  )
}
