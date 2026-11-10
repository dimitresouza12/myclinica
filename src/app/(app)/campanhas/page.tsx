'use client'
import { formatBrPhone } from '@/lib/phoneFormat'
import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/usePermissions'
import { whatsappApi } from '@/components/configuracoes/whatsappApi'
import { formatDate } from '@/lib/utils'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import styles from './campanhas.module.css'
import f from '@/components/ui/modalForm.module.css'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorNotice } from '@/components/ui/ErrorNotice'
import { Skeleton } from '@/components/ui/Skeleton'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { showToast } from '@/components/ui/Toast'

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

const DEMO_SEND_NOTICE = 'Envio de mensagens desativado na conta de demonstração.'
const READ_ONLY_NOTICE = 'Você pode consultar as campanhas, mas não tem permissão para criar ou enviar.'

function CampanhasContent() {
  const { clinic, user } = useAuthStore()
  const { canEdit } = usePermissions('campanhas')
  const demo = !!clinic?.demoMode
  // campanha já salva como rascunho cujo disparo falhou: a nova tentativa reaproveita a mesma linha
  const pendingDraft = useRef<{ id: string; key: string } | null>(null)
  const [creating, setCreating]     = useState(false)
  const [campaigns, setCampaigns]   = useState<Campaign[]>([])
  const [patients, setPatients]     = useState<Patient[]>([])
  const [loading, setLoading]       = useState(true)
  const [sending, setSending]       = useState(false)
  const [error, setError]           = useState('')
  const [loadError, setLoadError]   = useState(false)

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
    setLoadError(false)
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
    if (patRes.error || campRes.error) setLoadError(true)
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
    if (!canEdit) return setError(READ_ONLY_NOTICE)
    if (clinic.demoMode) return setError(DEMO_SEND_NOTICE)

    setSending(true)
    setError('')
    let savedAsDraft = false

    try {
      // A campanha nasce como rascunho; o servidor a marca como enviada só depois que o disparo é aceito.
      // Se o disparo falhar, ela continua como rascunho e uma nova tentativa reaproveita a mesma linha.
      const key = JSON.stringify([form.name, form.message, form.audienceType, audience.length])
      let campaignId = pendingDraft.current?.key === key ? pendingDraft.current.id : null
      if (!campaignId) {
        const { data: camp, error: campErr } = await supabase
          .from('campaigns')
          .insert([{
            clinic_id: clinic.id,
            name: form.name,
            message: form.message,
            audience_type: form.audienceType,
            audience_count: audience.length,
            status: 'draft',
            created_by: user.id,
          }])
          .select('id')
          .single()
        if (campErr) throw campErr
        campaignId = camp.id as string
        pendingDraft.current = { id: campaignId, key }
      }
      savedAsDraft = true

      // O envio passa pelo servidor, que recusa a conta de demonstração e marca a campanha como enviada.
      await whatsappApi('/api/campanhas/dispatch', {
        method: 'POST',
        body: {
          campaign_id: campaignId,
          clinic_name: clinic.name,
          message_template: form.message,
          contacts: audience.map(p => ({
            name: p.name,
            phone: p.phone,
            first_name: p.name.split(' ')[0],
          })),
        },
      })

      pendingDraft.current = null
      showToast('ok', `Campanha enviada para ${audience.length} pacientes.`)
      closeBuilder()
      loadData()
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Erro ao enviar campanha.'
      setError(savedAsDraft ? `${reason} A campanha ficou salva como rascunho.` : reason)
      if (savedAsDraft) loadData()
    } finally {
      setSending(false)
    }
  }

  function closeBuilder() {
    setCreating(false)
    setError('')
    pendingDraft.current = null
    setForm({ name: '', audienceType: 'sem_retorno_60', message: MESSAGE_TEMPLATES['sem_retorno_60'] })
  }

  async function saveDraft() {
    if (!form.name.trim()) return setError('Dê um nome para a campanha.')
    if (!clinic || !user) return
    if (!canEdit) return setError(READ_ONLY_NOTICE)
    setError('')
    const { error: draftErr } = await supabase.from('campaigns').insert([{
      clinic_id: clinic.id,
      name: form.name,
      message: form.message,
      audience_type: form.audienceType,
      audience_count: audience.length,
      status: 'draft',
      created_by: user.id,
    }])
    if (draftErr) return setError('Não foi possível salvar o rascunho. Tente novamente.')
    showToast('ok', 'Rascunho salvo.')
    closeBuilder()
    loadData()
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Campanhas"
        subtitle="Envie mensagens segmentadas pelo WhatsApp para seus pacientes"
        actions={
          <Button variant="primary" icon="plus" onClick={() => { setCreating(true); setError('') }} disabled={!canEdit} aria-describedby={!canEdit ? 'campanha-readonly-note' : undefined}>
            Nova campanha
          </Button>
        }
      />

      {!canEdit && <p id="campanha-readonly-note" className={styles.demoNote}>{READ_ONLY_NOTICE}</p>}

      {loadError && <ErrorNotice message="Não foi possível carregar suas campanhas." onRetry={loadData} retrying={loading} />}

      {/* Histórico */}
      <Card title="Histórico de campanhas" flush className={styles.history}>
        {loading ? (
          <div className={styles.historyList} aria-busy="true">
            {[0, 1, 2].map(i => (
              <div key={i} className={styles.historyItem}>
                <div className={styles.historyMain}>
                  <Skeleton width="45%" height={16} />
                  <Skeleton width="65%" height={13} />
                </div>
                <Skeleton width={72} height={24} radius={999} />
              </div>
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon="campaigns"
            title="Nenhuma campanha ainda"
            description="Crie a primeira para chamar pacientes sem retorno, aniversariantes ou toda a base pelo WhatsApp."
            action={<Button variant="primary" icon="plus" onClick={() => { setCreating(true); setError('') }} disabled={!canEdit} aria-describedby={!canEdit ? 'campanha-readonly-note' : undefined}>Nova campanha</Button>}
          />
        ) : (
          <div className={styles.historyList}>
            {campaigns.map(c => (
              <div key={c.id} className={styles.historyItem}>
                <div className={styles.historyMain}>
                  <div className={styles.historyName}>{c.name}</div>
                  <div className={styles.historySub}>
                    {AUDIENCE_OPTIONS.find(o => o.value === c.audience_type)?.label ?? c.audience_type}
                    {' · '}
                    {c.sent_at ? formatDate(c.sent_at) : formatDate(c.created_at)}
                    {' · '}
                    {c.audience_count} {c.audience_count === 1 ? 'contato' : 'contatos'}
                  </div>
                </div>
                <Badge tone={c.status === 'sent' ? 'success' : 'neutral'}>
                  {c.status === 'sent' ? 'Enviada' : 'Rascunho'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={creating}
        onClose={() => { if (!sending) closeBuilder() }}
        size="wide"
        title="Nova campanha"
        subtitle="Escolha o público, ajuste a mensagem e confira o preview antes de enviar"
        footer={
          <>
            <Button variant="secondary" onClick={closeBuilder} disabled={sending}>Cancelar</Button>
            <Button variant="secondary" onClick={saveDraft} disabled={sending || !canEdit}>Salvar rascunho</Button>
            <Button variant="primary" icon="send" onClick={handleSend} loading={sending} disabled={audience.length === 0 || demo || !canEdit} aria-describedby={demo ? 'campanha-demo-note' : undefined}>
              {sending ? 'Enviando...' : `Enviar para ${audience.length} ${audience.length === 1 ? 'paciente' : 'pacientes'}`}
            </Button>
          </>
        }
      >
        <div className={styles.builder}>
          {/* Esquerda: configuração */}
          <div className={styles.config}>
            <div className={f.field}>
              <label htmlFor="campanha-nome">Nome da campanha</label>
              <input
                id="campanha-nome"
                placeholder="Ex: Reativação junho, Aniversariantes..."
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className={f.field}>
              <label>Público-alvo</label>
              <SelectMenu variant="field" ariaLabel="Público-alvo" value={form.audienceType}
                onChange={handleAudienceChange}
                options={AUDIENCE_OPTIONS.map(o => ({ value: o.value, label: o.label }))} />
            </div>

            {/* Preview da audiência */}
            <div className={styles.audienceBox}>
              <div className={styles.audienceCount}>{audience.length}</div>
              <div className={styles.audienceLabel}>{audience.length === 1 ? 'paciente será atingido' : 'pacientes serão atingidos'}</div>
              {audience.length > 0 && (
                <div className={styles.audienceList}>
                  {audience.slice(0, 6).map(p => (
                    <div key={p.id} className={styles.audienceName}>
                      {p.name} · {formatBrPhone(p.phone)}
                    </div>
                  ))}
                  {audience.length > 6 && (
                    <div className={`${styles.audienceName} ${styles.audienceMore}`}>
                      +{audience.length - 6} pacientes
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className={f.field}>
              <label htmlFor="campanha-mensagem">Mensagem</label>
              <div className={styles.tagHelp}>
                {['{{nome}}', '{{clinica}}'].map(tag => (
                  <button key={tag} className={styles.tagChip} type="button" onClick={() => insertTag(tag)}>
                    {tag}
                  </button>
                ))}
              </div>
              <textarea
                id="campanha-mensagem"
                value={form.message}
                onChange={e => setForm(prev => ({ ...prev, message: e.target.value }))}
                rows={5}
              />
            </div>

            {demo && (
              <p id="campanha-demo-note" className={styles.demoNote}>
                {DEMO_SEND_NOTICE} Você pode montar a campanha e salvar como rascunho, mas nenhuma mensagem é enviada.
              </p>
            )}

            {error && <ErrorNotice message={error} />}
          </div>

          {/* Direita: preview WhatsApp */}
          <aside className={styles.previewCol} aria-label="Preview da mensagem">
            <div className={styles.previewTitle}>Preview da mensagem</div>
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
            <p className={styles.previewNote}>
              Preview com dados do primeiro paciente da lista. As variáveis serão substituídas individualmente no envio.
            </p>
          </aside>
        </div>
      </Modal>
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
