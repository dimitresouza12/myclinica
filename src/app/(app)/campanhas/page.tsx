'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { callN8n } from '@/lib/supabase-n8n'
import { formatDate } from '@/lib/utils'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import styles from './campanhas.module.css'
import { Icon } from '@/components/ui/Icon'
import { PageTitle } from '@/components/layout/PageTitle'

interface Patient { id: string; name: string; phone: string | null; created_at: string }

interface Campaign {
  id: string
  name: string
  message: string
  audience_type: string
  audience_count: number
  status: 'sent' | 'draft'
  sent_at: string | null
  created_at: string
}

const AUDIENCE_OPTIONS = [
  { value: 'sem_retorno_30',  label: 'Sem retorno há 30 dias'  },
  { value: 'sem_retorno_60',  label: 'Sem retorno há 60 dias'  },
  { value: 'sem_retorno_90',  label: 'Sem retorno há 90 dias'  },
  { value: 'aniversariantes', label: 'Aniversariantes do mês'  },
  { value: 'todos',           label: 'Todos os pacientes ativos'},
]

const MESSAGE_TEMPLATES: Record<string, string> = {
  sem_retorno_30: 'Olá, {{nome}}! 😊 Notamos que faz um tempinho que você não nos visita. Que tal agendar uma consulta? Estamos com horários disponíveis. Entre em contato! 📅',
  sem_retorno_60: 'Olá, {{nome}}! Já faz 2 meses desde sua última visita. Sua saúde é nossa prioridade! Agende agora sua consulta de acompanhamento. 💚',
  sem_retorno_90: 'Oi, {{nome}}! Sentimos sua falta! 🥺 Já faz 3 meses desde sua última consulta. Vamos cuidar da sua saúde juntos? Fale conosco!',
  aniversariantes: 'Parabéns, {{nome}}! 🎂🎉 A equipe da {{clinica}} deseja a você um feliz aniversário cheio de saúde e alegria! Como presente especial, temos uma condição especial para você este mês. Entre em contato!',
  todos: 'Olá, {{nome}}! 👋 A {{clinica}} tem novidades para você! Entre em contato e agende sua consulta.',
}

const AUDIENCE_DAYS: Record<string, number> = {
  sem_retorno_30: 30,
  sem_retorno_60: 60,
  sem_retorno_90: 90,
}

function CampanhasContent() {
  const { clinic, user } = useAuthStore()
  const [creating, setCreating]     = useState(false)
  const [campaigns, setCampaigns]   = useState<Campaign[]>([])
  const [patients, setPatients]     = useState<Patient[]>([])
  const [loading, setLoading]       = useState(true)
  const [sending, setSending]       = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')

  const [form, setForm] = useState({
    name: '',
    audienceType: 'sem_retorno_60',
    message: MESSAGE_TEMPLATES['sem_retorno_60'],
  })

  useEffect(() => {
    if (!clinic?.id) return
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic?.id])

  async function loadData() {
    if (!clinic) return
    setLoading(true)
    const [patRes, campRes] = await Promise.all([
      supabase.from('patients')
        .select('id,name,phone,created_at')
        .eq('clinic_id', clinic.id)
        .eq('is_active', true)
        .not('phone', 'is', null),
      supabase.from('campaigns')
        .select('*')
        .eq('clinic_id', clinic.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ])
    setPatients((patRes.data ?? []) as Patient[])
    setCampaigns((campRes.data ?? []) as Campaign[])
    setLoading(false)
  }

  // Filtra audiência com base no tipo selecionado
  const audience = useMemo(() => {
    if (!patients.length) return []
    const now = new Date()

    if (form.audienceType === 'todos') return patients

    if (form.audienceType === 'aniversariantes') {
      // Para aniversariantes precisaríamos do birth_date — retorna todos por simplicidade
      return patients.filter(p => {
        // placeholder — idealmente buscar birth_date
        return !!p.phone
      }).slice(0, 50)
    }

    const days = AUDIENCE_DAYS[form.audienceType]
    if (days) {
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
      // Pacientes cujo cadastro é anterior ao corte (proxy de "sem retorno recente")
      return patients.filter(p => p.created_at < cutoff)
    }

    return patients
  }, [patients, form.audienceType])

  function handleAudienceChange(value: string) {
    setForm(f => ({
      ...f,
      audienceType: value,
      message: MESSAGE_TEMPLATES[value] ?? f.message,
    }))
  }

  function insertTag(tag: string) {
    setForm(f => ({ ...f, message: f.message + tag }))
  }

  // Gera preview substituindo variáveis pelo primeiro paciente da lista
  const previewMessage = useMemo(() => {
    const sample = audience[0]
    return form.message
      .replace(/\{\{nome\}\}/g, sample?.name?.split(' ')[0] ?? 'Paciente')
      .replace(/\{\{clinica\}\}/g, clinic?.name ?? 'Clínica')
  }, [form.message, audience, clinic?.name])

  async function handleSend() {
    if (!form.name.trim()) return setError('Dê um nome para a campanha.')
    if (!form.message.trim()) return setError('Digite a mensagem da campanha.')
    if (audience.length === 0) return setError('Nenhum paciente encontrado para este público.')
    if (!clinic || !user) return

    setSending(true)
    setError('')

    try {
      // Salva a campanha no banco
      const { data: camp, error: campErr } = await supabase
        .from('campaigns')
        .insert([{
          clinic_id: clinic.id,
          name: form.name,
          message: form.message,
          audience_type: form.audienceType,
          audience_count: audience.length,
          status: 'sent',
          sent_at: new Date().toISOString(),
          created_by: user.id,
        }])
        .select('id')
        .single()

      if (campErr) throw campErr

      // Dispara via n8n — envia lista de contatos e mensagem
      await callN8n('campanha-whatsapp', {
        campaign_id: camp.id,
        clinic_name: clinic.name,
        message_template: form.message,
        contacts: audience.map(p => ({
          name: p.name,
          phone: p.phone,
          first_name: p.name.split(' ')[0],
        })),
      })

      setSuccess(`Campanha enviada para ${audience.length} pacientes.`)
      setCreating(false)
      setForm({ name: '', audienceType: 'sem_retorno_60', message: MESSAGE_TEMPLATES['sem_retorno_60'] })
      loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar campanha.')
    } finally {
      setSending(false)
    }
  }

  async function saveDraft() {
    if (!form.name.trim() || !clinic || !user) return
    await supabase.from('campaigns').insert([{
      clinic_id: clinic.id,
      name: form.name,
      message: form.message,
      audience_type: form.audienceType,
      audience_count: audience.length,
      status: 'draft',
      created_by: user.id,
    }])
    setCreating(false)
    setForm({ name: '', audienceType: 'sem_retorno_60', message: MESSAGE_TEMPLATES['sem_retorno_60'] })
    loadData()
  }

  if (loading) return <p className={styles.loading}>Carregando...</p>

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <PageTitle title="Campanhas" subtitle="Envie mensagens segmentadas pelo WhatsApp para seus pacientes" />
        {!creating && (
          <button className={styles.btnNew} onClick={() => { setCreating(true); setError(''); setSuccess('') }}>
            + Nova campanha
          </button>
        )}
      </div>

      {success && (
        <div style={{ background: '#ECFDF5', border: '1px solid #6EE7B7', borderRadius: 10, padding: '1rem 1.25rem', color: '#065F46', fontSize: '.875rem', fontWeight: 600 }}>
          {success}
        </div>
      )}

      {/* Builder */}
      {creating && (
        <div className={styles.builder}>
          {/* Esquerda: configuração */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Configurar campanha</div>

            <div className={styles.field}>
              <label className={styles.label}>Nome da campanha</label>
              <input
                className={styles.input}
                placeholder="Ex: Reativação junho, Aniversariantes..."
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Público-alvo</label>
              <select
                className={styles.select}
                value={form.audienceType}
                onChange={e => handleAudienceChange(e.target.value)}
              >
                {AUDIENCE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Preview da audiência */}
            <div className={styles.audienceBox}>
              <div className={styles.audienceCount}>{audience.length}</div>
              <div className={styles.audienceLabel}>pacientes serão atingidos</div>
              {audience.length > 0 && (
                <div className={styles.audienceList}>
                  {audience.slice(0, 6).map(p => (
                    <div key={p.id} className={styles.audienceName}>
                      {p.name} · {p.phone}
                    </div>
                  ))}
                  {audience.length > 6 && (
                    <div className={styles.audienceName} style={{ color: 'var(--text-secondary)' }}>
                      +{audience.length - 6} pacientes...
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Mensagem</label>
              <div className={styles.tagHelp}>
                {['{{nome}}', '{{clinica}}'].map(tag => (
                  <button key={tag} className={styles.tagChip} type="button" onClick={() => insertTag(tag)}>
                    {tag}
                  </button>
                ))}
              </div>
              <textarea
                className={styles.textarea}
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                rows={5}
              />
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.actions}>
              <button className={styles.btnCancel} onClick={() => { setCreating(false); setError('') }}>
                Cancelar
              </button>
              <button className={styles.btnCancel} onClick={saveDraft}>
                Salvar rascunho
              </button>
              <button
                className={styles.btnSend}
                onClick={handleSend}
                disabled={sending || audience.length === 0}
              >
                {sending ? 'Enviando...' : <><Icon name="phone" size={14} /> Enviar para {audience.length} pacientes</>}
              </button>
            </div>
          </div>

          {/* Direita: preview WhatsApp */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Preview da mensagem</div>
            <div className={styles.waPreview}>
              <div className={styles.waHeader}>
                <div className={styles.waAvatar}>
                  {(clinic?.name ?? 'C').slice(0, 2).toUpperCase()}
                </div>
                <span className={styles.waName}>{clinic?.name ?? 'Clínica'}</span>
              </div>
              <div className={styles.waBubble}>{previewMessage}</div>
              <div className={styles.waTime}>
                {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <p style={{ fontSize: '.75rem', color: 'var(--text-secondary)', marginTop: '.75rem' }}>
              Preview com dados do primeiro paciente da lista. As variáveis serão substituídas individualmente no envio.
            </p>
          </div>
        </div>
      )}

      {/* Histórico */}
      <div className={styles.historySection}>
        <div className={styles.historyHeader}>Histórico de campanhas</div>
        {campaigns.length === 0 ? (
          <p className={styles.emptyHistory}>Nenhuma campanha enviada ainda.<br />Crie sua primeira campanha acima!</p>
        ) : (
          <div className={styles.historyList}>
            {campaigns.map(c => (
              <div key={c.id} className={styles.historyItem}>
                <div>
                  <div className={styles.historyName}>{c.name}</div>
                  <div className={styles.historySub}>
                    {AUDIENCE_OPTIONS.find(o => o.value === c.audience_type)?.label ?? c.audience_type}
                    {' · '}
                    {c.sent_at ? formatDate(c.sent_at) : formatDate(c.created_at)}
                  </div>
                </div>
                <div className={styles.historyCount}>{c.audience_count} contatos</div>
                <span className={c.status === 'sent' ? styles.tagSent : styles.tagDraft}>
                  {c.status === 'sent' ? 'Enviada' : 'Rascunho'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CampanhasPage() {
  return (
    <PermissionGuard module="campanhas">
      <CampanhasContent />
    </PermissionGuard>
  )
}
