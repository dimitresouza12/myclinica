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
import { birthdaysOfMonth, withoutReturn, MAX_RETURN_WINDOW_DAYS, type AudienceAppt } from '@/lib/campanhas/audience'
import { fetchAllPages } from '@/lib/campanhas/paginate'

interface Patient { id: string; name: string; phone: string | null; created_at: string; birth_date: string | null }

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
const AUDIENCE_BLOCKED_NOTICE = 'Não foi possível carregar a lista de pacientes e consultas. Por segurança, criar e enviar campanhas fica bloqueado até a lista carregar por completo. Use Tentar novamente na página.'

function CampanhasContent() {
  const { clinic, user } = useAuthStore()
  const { canEdit } = usePermissions('campanhas')
  const demo = !!clinic?.demoMode
  // campanha já salva como rascunho cujo disparo falhou: a nova tentativa reaproveita a mesma linha
  const pendingDraft = useRef<{ id: string; key: string } | null>(null)
  const [creating, setCreating]     = useState(false)
  const [campaigns, setCampaigns]   = useState<Campaign[]>([])
  const [patients, setPatients]     = useState<Patient[]>([])
  const [appts, setAppts]           = useState<AudienceAppt[]>([])
  const [loading, setLoading]       = useState(true)
  const [sending, setSending]       = useState(false)
  const [error, setError]           = useState('')
  const [loadError, setLoadError]   = useState(false)
  // pacientes ou consultas não vieram completos: o público calculado estaria errado, então nada é criado nem enviado
  const [audienceFailed, setAudienceFailed] = useState(false)

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

  // Consultas dos últimos 90 dias (e as marcadas pra frente): é o que decide quem está "sem retorno".
  // O banco devolve no máximo 1000 linhas por consulta, então lê em páginas.
  function loadRecentAppointments(clinicId: string) {
    const since = new Date(Date.now() - MAX_RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
    return fetchAllPages<AudienceAppt>((from, to) => supabase.from('appointments')
      .select('patient_id, scheduled_at, status')
      .eq('clinic_id', clinicId)
      .not('patient_id', 'is', null)
      .gte('scheduled_at', since)
      .order('scheduled_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to))
  }

  // Pacientes ativos com telefone, também em páginas (clínica com mais de 1000 pacientes).
  async function loadActivePatients(clinicId: string) {
    const res = await fetchAllPages<Patient>((from, to) => supabase.from('patients')
      .select('id,name,phone,created_at,birth_date')
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .not('phone', 'is', null)
      .neq('phone', '')
      .order('id', { ascending: true })
      .range(from, to))
    // telefone só com espaços também não dá para enviar
    return { rows: res.rows.filter(p => !!p.phone?.trim()), failed: res.failed }
  }

  async function loadData() {
    if (!clinic) return
    setLoading(true)
    setLoadError(false)
    const [patRes, campRes, apptRes] = await Promise.all([
      loadActivePatients(clinic.id),
      supabase.from('campaigns')
        .select('*')
        .eq('clinic_id', clinic.id)
        .order('created_at', { ascending: false })
        .limit(20),
      loadRecentAppointments(clinic.id),
    ])
    // sem a lista de consultas, "sem retorno" listaria quem voltou há pouco: melhor bloquear do que disparar errado
    const incomplete = patRes.failed || apptRes.failed
    setAudienceFailed(incomplete)
    if (incomplete || campRes.error) setLoadError(true)
    setPatients(incomplete ? [] : patRes.rows)
    setAppts(incomplete ? [] : apptRes.rows)
    setCampaigns((campRes.data ?? []) as Campaign[])
    setLoading(false)
  }

  // Filtra audiência com base no tipo selecionado
  const audience = useMemo(() => {
    if (!patients.length) return []

    if (form.audienceType === 'todos') return patients

    // aniversariantes: mês de nascimento igual ao mês atual (Brasília); sem data de nascimento não entra
    if (form.audienceType === 'aniversariantes') return birthdaysOfMonth(patients)

    // sem retorno: última consulta (ou o cadastro, se nunca veio) mais antiga que o corte
    const days = AUDIENCE_DAYS[form.audienceType]
    if (days) return withoutReturn(patients, appts, days)

    return patients
  }, [patients, appts, form.audienceType])

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
    if (audienceFailed) return setError(AUDIENCE_BLOCKED_NOTICE)

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
    if (audienceFailed) return setError(AUDIENCE_BLOCKED_NOTICE)
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
          <Button variant="primary" icon="plus" onClick={() => { setCreating(true); setError('') }} disabled={!canEdit || audienceFailed} title={canEdit ? undefined : 'Seu perfil só pode visualizar'} aria-describedby={!canEdit ? 'campanha-readonly-note' : audienceFailed ? 'campanha-blocked-note' : undefined}>
            Nova campanha
          </Button>
        }
      />

      {!canEdit && <p id="campanha-readonly-note" className={styles.demoNote}>{READ_ONLY_NOTICE}</p>}

      {loadError && (
        <div id={audienceFailed ? 'campanha-blocked-note' : undefined}>
          <ErrorNotice message={audienceFailed ? AUDIENCE_BLOCKED_NOTICE : 'Não foi possível carregar suas campanhas.'} onRetry={loadData} retrying={loading} />
        </div>
      )}

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
            action={<Button variant="primary" icon="plus" onClick={() => { setCreating(true); setError('') }} disabled={!canEdit || audienceFailed} title={canEdit ? undefined : 'Seu perfil só pode visualizar'} aria-describedby={!canEdit ? 'campanha-readonly-note' : audienceFailed ? 'campanha-blocked-note' : undefined}>Nova campanha</Button>}
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
            <Button variant="secondary" onClick={saveDraft} disabled={sending || !canEdit || audienceFailed} title={canEdit ? undefined : 'Seu perfil só pode visualizar'}>Salvar rascunho</Button>
            <Button variant="primary" icon="send" onClick={handleSend} loading={sending} disabled={audience.length === 0 || demo || !canEdit || audienceFailed} aria-describedby={demo ? 'campanha-demo-note' : audienceFailed ? 'campanha-blocked-note-modal' : undefined}>
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
              {form.audienceType === 'aniversariantes' && (
                <div className={styles.audienceLabel}>Só entram pacientes com data de nascimento cadastrada.</div>
              )}
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

            {audienceFailed && (
              <p id="campanha-blocked-note-modal" className={styles.demoNote}>{AUDIENCE_BLOCKED_NOTICE}</p>
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
