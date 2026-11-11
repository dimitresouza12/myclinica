'use client'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { PageHeader } from '@/components/ui/PageHeader'
import { PillTabs } from '@/components/ui/PillTabs'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorNotice } from '@/components/ui/ErrorNotice'
import { SearchInput } from '@/components/ui/SearchInput'
import { Skeleton } from '@/components/ui/Skeleton'
import btn from '@/components/ui/button.module.css'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { Icon } from '@/components/ui/Icon'
import { showToast } from '@/components/ui/Toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { usePermissions } from '@/hooks/usePermissions'
import { useWhatsAppState } from '@/hooks/useClinicData'
import { conversationPhoto, useConversations } from '@/hooks/useWhatsAppInbox'
import { usePageSearch } from '@/store/pageSearch'
import { useCrmMembers, useCrmRealtime, useLeadMutations, useLeads, leadErrorMessage, type LeadPatch } from '@/hooks/useCrmLeads'
import { whatsappApi } from '@/components/configuracoes/whatsappApi'
import { CrmBoard, CrmBoardSkeleton } from '@/components/crm/CrmBoard'
import { LeadDrawer, type LeadSaveValues } from '@/components/crm/LeadDrawer'
import { LostReasonDialog } from '@/components/crm/LostReasonDialog'
import { LegacyAiLeads } from '@/components/crm/LegacyAiLeads'
import { hasWhatsAppAI } from '@/lib/planGates'
import { formatMoney, leadPhoneLabel, leadTitle, openLeadCount, stagePatch, type Lead, type Stage } from '@/lib/crm/model'
import { phoneKeys } from '@/lib/whatsapp/phone'
import styles from '@/components/crm/Crm.module.css'
import { patientHref } from '@/lib/prontuario/navigation'

type DrawerState = { mode: 'edit'; leadId: string } | { mode: 'create'; stage: Stage } | null

function Funnel({ tabs }: { tabs: ReactNode }) {
  const clinic = useAuthStore(s => s.clinic)
  const user = useAuthStore(s => s.user)
  const router = useRouter()
  const qc = useQueryClient()
  const clinicId = clinic?.id
  const { canEdit } = usePermissions('crm')
  const { canEdit: canEditPatients } = usePermissions('pacientes')

  const { data: leads = [], isLoading, isError, refetch, isRefetching } = useLeads(clinicId)
  const { data: members = [] } = useCrmMembers(clinicId)
  const { data: conversations = [] } = useConversations(clinicId)
  const { data: waState } = useWhatsAppState(clinicId)
  useCrmRealtime(clinicId)
  const { create, update, moveStage, remove } = useLeadMutations(clinicId, user?.id)

  const [query, setQuery] = usePageSearch()
  const [owner, setOwner] = useState('')
  const [drawer, setDrawer] = useState<DrawerState>(null)
  const [lostFor, setLostFor] = useState<Lead | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  // "agora" para rótulos de tempo: muda a cada minuto, sem chamar Date.now() no render
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  // Ao abrir o CRM, o funil se põe em dia com a agenda e o silêncio (o agendador faz o mesmo a cada 5 min)
  const synced = useRef(false)
  useEffect(() => {
    if (!clinicId || synced.current) return
    synced.current = true
    whatsappApi<{ linked: number; moved: number }>('/api/crm/sync', { method: 'POST' })
      .then(r => {
        if (r.linked > 0 || r.moved > 0) {
          qc.invalidateQueries({ queryKey: ['crm-leads', clinicId] })
          qc.invalidateQueries({ queryKey: ['wa-convs', clinicId] })
        }
      })
      .catch(() => { /* o agendador tenta de novo */ })
  }, [clinicId, qc])

  const convByKey = useMemo(() => new Map(conversations.map(c => [c.phone_key, c])), [conversations])
  const photoByKey = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of conversations) { const p = conversationPhoto(c); if (p) m.set(c.phone_key, p) }
    return m
  }, [conversations])
  const unreadByKey = useMemo(() => new Map(conversations.filter(c => c.unread_count > 0).map(c => [c.phone_key, c.unread_count])), [conversations])
  const ownerNames = useMemo(() => new Map(members.map(m => [m.userId, m.name])), [members])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const qDigits = q.replace(/\D/g, '')
    return leads.filter(l => {
      if (owner === '__none' && l.assigned_to) return false
      if (owner && owner !== '__none' && l.assigned_to !== owner) return false
      if (!q) return true
      return leadTitle(l).toLowerCase().includes(q)
        || (l.interest ?? '').toLowerCase().includes(q)
        || (qDigits.length >= 3 && (l.phone ?? '').replace(/\D/g, '').includes(qDigits))
    })
  }, [leads, query, owner])

  const open = leads.filter(l => l.stage !== 'perdido' && l.stage !== 'compareceu')
  const potential = open.reduce((s, l) => s + (l.estimated_value ?? 0), 0)
  const editing = drawer?.mode === 'edit' ? leads.find(l => l.id === drawer.leadId) ?? null : null

  // ── ações ──────────────────────────────────────────────────────────────────

  async function requestMove(lead: Lead, to: Stage) {
    if (!canEdit || lead.stage === to) return
    if (to === 'perdido') { setLostFor(lead); return }
    try { await moveStage(lead, to) } catch (e) { showToast('error', leadErrorMessage(e)) }
  }

  async function confirmLost(reason: string | null) {
    if (!lostFor) return
    setSaving(true)
    try {
      await update.mutateAsync({ id: lostFor.id, patch: stagePatch('perdido', lostFor, reason) })
      setLostFor(null)
    } catch (e) { showToast('error', leadErrorMessage(e)) } finally { setSaving(false) }
  }

  async function talk(lead: Lead) {
    if (!lead.phone_key) { showToast('error', 'Este lead não tem telefone. Abra o lead e informe o telefone.'); return }
    const conv = convByKey.get(lead.phone_key)
    if (conv) { router.push(`/mensagens?c=${conv.id}`); return }
    setBusyId(lead.id)
    try {
      const r = await whatsappApi<{ conversationId: string }>('/api/whatsapp/conversations/open', { method: 'POST', body: { leadId: lead.id } })
      router.push(`/mensagens?c=${r.conversationId}`)
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Não foi possível abrir a conversa.')
    } finally { setBusyId(null) }
  }

  /** A conversa do WhatsApp desse contato passa a mostrar "Paciente" também na tela de Mensagens. */
  function linkConversation(lead: Lead) {
    if (!lead.phone_key) return
    whatsappApi('/api/whatsapp/conversations/link-patient', { method: 'POST', body: { phoneKey: lead.phone_key } })
      .catch(() => { /* a rotina do funil completa o vínculo em poucos minutos */ })
      .finally(() => qc.invalidateQueries({ queryKey: ['wa-convs', clinicId] }))
  }

  /** Paciente do lead: o que já existe com esse telefone, ou um novo. Devolve o id, ou null se falhar. */
  async function ensurePatient(lead: Lead): Promise<string | null> {
    if (lead.patient_id) return lead.patient_id
    if (!clinicId) return null
    setBusyId(lead.id)
    try {
      const national = !!lead.phone_key && !lead.phone_key.startsWith('lid:') && !lead.phone_key.startsWith('raw:')
      if (national) {
        const { data } = await supabase.from('patients').select('id, name, phone').eq('clinic_id', clinicId).eq('is_active', true).not('phone', 'is', null).limit(20000)
        const hit = (data ?? []).find(p => phoneKeys(p.phone as string).includes(lead.phone_key as string))
        if (hit) {
          await update.mutateAsync({ id: lead.id, patch: { patient_id: hit.id as string } })
          linkConversation(lead)
          showToast('ok', `Já existe o paciente ${hit.name} com esse telefone. O lead foi vinculado a ele.`)
          return hit.id as string
        }
      }
      const phone = lead.phone ? (lead.phone_key?.startsWith('raw:') ? `+${lead.phone}` : lead.phone) : null
      const { data: created, error } = await supabase.from('patients').insert({
        clinic_id: clinicId,
        name: lead.name?.trim() || (phone ? `Lead ${leadPhoneLabel(lead)}` : 'Lead sem nome'),
        phone,
        is_active: true,
        registration_status: 'approved',
        notes: lead.interest ? `Interesse: ${lead.interest}` : null,
      }).select('id').single()
      if (error || !created) throw error ?? new Error('sem id')
      await update.mutateAsync({ id: lead.id, patch: { patient_id: created.id as string } })
      linkConversation(lead)
      showToast('ok', 'Paciente cadastrado.')
      // a Agenda e a lista de Pacientes têm o próprio cache: precisam enxergar o paciente novo
      qc.invalidateQueries({ queryKey: ['agenda', clinicId] })
      qc.invalidateQueries({ queryKey: ['pacientes', clinicId] })
      return created.id as string
    } catch {
      showToast('error', 'Não foi possível cadastrar o paciente. Tente de novo.')
      return null
    } finally { setBusyId(null) }
  }

  async function schedule(lead: Lead) {
    if (!lead.patient_id) {
      if (!canEditPatients) { showToast('error', 'Você não tem permissão para cadastrar pacientes.'); return }
      const ok = await confirmDialog({
        title: 'Cadastrar como paciente?',
        message: `Para agendar, ${leadTitle(lead)} precisa estar cadastrado como paciente. Cadastrar agora e abrir a agenda?`,
        confirmText: 'Cadastrar e agendar',
      })
      if (!ok) return
    }
    const id = await ensurePatient(lead)
    if (id) router.push(`/agenda?paciente=${id}`)
  }

  async function convert(lead: Lead) {
    await ensurePatient(lead)
  }

  async function save(values: LeadSaveValues) {
    setSaving(true); setFormError('')
    try {
      if (drawer?.mode === 'create') {
        await create.mutateAsync({
          ...values.fields,
          stage: values.stage,
          lost_reason: values.stage === 'perdido' ? values.lostReason : null,
          next_contact_at: values.nextContactAt,
        })
      } else if (editing) {
        const patch: LeadPatch = { ...values.fields, next_contact_at: values.nextContactAt }
        if (values.stage !== editing.stage) Object.assign(patch, stagePatch(values.stage, editing, values.lostReason))
        else if (values.stage === 'perdido') patch.lost_reason = values.lostReason
        await update.mutateAsync({ id: editing.id, patch })
      }
      setDrawer(null)
    } catch (e) {
      setFormError(leadErrorMessage(e))
    } finally { setSaving(false) }
  }

  async function removeLead(lead: Lead) {
    const ok = await confirmDialog({
      title: 'Excluir lead?',
      message: `${leadTitle(lead)} sai do funil. A conversa do WhatsApp e o cadastro de paciente, se houver, não são apagados.`,
      confirmText: 'Excluir',
      danger: true,
    })
    if (!ok) return
    try { await remove.mutateAsync(lead.id); setDrawer(null) } catch (e) { showToast('error', leadErrorMessage(e)) }
  }

  // ── tela ───────────────────────────────────────────────────────────────────

  const memberOptions = [{ value: '', label: 'Todos os responsáveis' }, { value: '__none', label: 'Sem responsável' }, ...members.map(m => ({ value: m.userId, label: m.name }))]
  const connected = waState?.status === 'conectado'

  const count = (n: number) => isLoading ? <Skeleton width={36} height={24} radius={6} /> : n

  return (
    <>
      <PageHeader
        title="CRM"
        subtitle="Acompanhe cada contato até virar paciente"
        actions={canEdit ? <Button variant="primary" icon="plus" onClick={() => { setFormError(''); setDrawer({ mode: 'create', stage: 'novo' }) }}>Novo lead</Button> : undefined}
      />
      {tabs}

      {!isError && (
        <ul className={styles.stats} data-hscroll aria-label="Resumo do funil" aria-busy={isLoading || undefined}>
          <li className={`${styles.stat} ${styles.stConversa}`}><span className={styles.statLabel}><span className={styles.statDot} aria-hidden="true" />Em andamento</span><span className={styles.statValue}>{count(openLeadCount(leads))}</span></li>
          <li className={`${styles.stat} ${styles.stAgendado}`}><span className={styles.statLabel}><span className={styles.statDot} aria-hidden="true" />Agendados</span><span className={styles.statValue}>{count(leads.filter(l => l.stage === 'agendado').length)}</span></li>
          <li className={`${styles.stat} ${styles.stCompareceu}`}><span className={styles.statLabel}><span className={styles.statDot} aria-hidden="true" />Compareceram</span><span className={styles.statValue}>{count(leads.filter(l => l.stage === 'compareceu').length)}</span></li>
          <li className={`${styles.stat} ${styles.stPerdido}`}><span className={styles.statLabel}><span className={styles.statDot} aria-hidden="true" />Perdidos</span><span className={styles.statValue}>{count(leads.filter(l => l.stage === 'perdido').length)}</span></li>
          <li className={styles.stat}><span className={styles.statLabel}><span className={styles.statDot} aria-hidden="true" />Valor em potencial</span><span className={`${styles.statValue} ${styles.statValueMoney}`}>{isLoading ? <Skeleton width={96} height={22} radius={6} /> : formatMoney(potential)}</span></li>
        </ul>
      )}

      <div className={styles.bar}>
        <p className={styles.hintLine}><Icon name="info" size={14} />O funil se atualiza sozinho com o WhatsApp e a agenda.{canEdit && <> Arraste um cartão só para corrigir.</>}</p>
        <div className={styles.tools}>
          <SearchInput className={styles.localSearch} value={query} onChange={setQuery} placeholder="Buscar lead" label="Buscar lead por nome, telefone ou interesse" />
          <div className={styles.ownerFilter}><SelectMenu value={owner} onChange={setOwner} options={memberOptions} ariaLabel="Filtrar por responsável" /></div>
        </div>
      </div>

      {waState && !connected && (
        <div className={styles.notice} role="alert">
          <Icon name="alert" size={18} className={styles.noticeIcon} aria-hidden="true" />
          <p className={styles.noticeText}>
            <strong>O WhatsApp da clínica está desconectado.</strong>
            <span>Contatos novos não entram no funil e não dá para conversar até reconectar.</span>
          </p>
          <Link className={btn.secondary} href="/configuracoes?tab=whatsapp">Reconectar</Link>
        </div>
      )}

      {isLoading ? (
        <CrmBoardSkeleton />
      ) : isError ? (
        <ErrorNotice message="Não foi possível carregar os leads." onRetry={() => { refetch() }} retrying={isRefetching} />
      ) : (
        <>
          {leads.length === 0 && (
            <div className={styles.emptyCard}>
              <EmptyState
                icon="crm"
                title="Nenhum lead ainda"
                description={waState
                  ? 'Quando alguém que ainda não é paciente escrever para o WhatsApp da clínica, o contato aparece aqui sozinho, na etapa Novo. Você também pode cadastrar um lead à mão.'
                  : 'Conecte o WhatsApp da clínica para os contatos novos entrarem aqui sozinhos. Você também pode cadastrar leads à mão, como os que vêm do Instagram.'}
                action={!waState ? <Link className={btn.primary} href="/configuracoes?tab=whatsapp">Conectar o WhatsApp</Link> : undefined}
              />
            </div>
          )}
          <CrmBoard
            leads={visible}
            ownerNames={ownerNames}
            unreadByKey={unreadByKey}
            photoByKey={photoByKey}
            now={now}
            canEdit={canEdit}
            busyId={busyId}
            onOpen={l => { setFormError(''); setDrawer({ mode: 'edit', leadId: l.id }) }}
            onTalk={talk}
            onSchedule={schedule}
            onMove={requestMove}
            onAdd={stage => { setFormError(''); setDrawer({ mode: 'create', stage }) }}
          />
        </>
      )}

      {drawer && (drawer.mode === 'create' || editing) && (
        <LeadDrawer
          key={drawer.mode === 'edit' ? drawer.leadId : 'novo'}
          lead={editing}
          initialStage={drawer.mode === 'create' ? drawer.stage : 'novo'}
          members={members}
          photoUrl={editing?.phone_key ? photoByKey.get(editing.phone_key) ?? null : null}
          hasConversation={!!editing?.phone_key && convByKey.has(editing.phone_key)}
          canEdit={canEdit}
          canCreatePatient={canEditPatients}
          saving={saving}
          error={formError}
          onSave={save}
          onClose={() => setDrawer(null)}
          onTalk={() => editing && talk(editing)}
          onSchedule={() => editing && schedule(editing)}
          onConvert={() => editing && convert(editing)}
          onOpenPatient={() => editing?.patient_id && router.push(patientHref(editing.patient_id))}
          onDelete={() => editing && removeLead(editing)}
        />
      )}

      {lostFor && <LostReasonDialog lead={lostFor} saving={saving} onConfirm={confirmLost} onCancel={() => setLostFor(null)} />}
    </>
  )
}

function CrmContent() {
  const plan = useAuthStore(s => s.clinic?.plan)
  const hasAI = hasWhatsAppAI(plan)
  const [tab, setTab] = useState<'funil' | 'ia'>('funil')
  const tabs = hasAI ? (
    <div>
      <PillTabs
        label="Seções do CRM"
        value={tab}
        onChange={setTab}
        options={[{ value: 'funil', label: 'Funil' }, { value: 'ia', label: 'Atendente virtual' }]}
      />
    </div>
  ) : null

  return (
    <div className={styles.root}>
      {tab === 'ia' && hasAI ? (
        <>
          <PageHeader title="CRM" subtitle="Acompanhe cada contato até virar paciente" />
          {tabs}
          <LegacyAiLeads />
        </>
      ) : <Funnel tabs={tabs} />}
    </div>
  )
}

export default function CRMPage() {
  return <PermissionGuard module="crm"><CrmContent /></PermissionGuard>
}
