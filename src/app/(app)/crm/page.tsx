'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { PageTitle } from '@/components/layout/PageTitle'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { Icon } from '@/components/ui/Icon'
import { showToast } from '@/components/ui/Toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { usePermissions } from '@/hooks/usePermissions'
import { useWhatsAppState } from '@/hooks/useClinicData'
import { conversationPhoto, useConversations } from '@/hooks/useWhatsAppInbox'
import { useCrmMembers, useCrmRealtime, useLeadMutations, useLeads, leadErrorMessage, type LeadPatch } from '@/hooks/useCrmLeads'
import { whatsappApi } from '@/components/configuracoes/whatsappApi'
import { CrmBoard } from '@/components/crm/CrmBoard'
import { LeadDrawer, type LeadSaveValues } from '@/components/crm/LeadDrawer'
import { LostReasonDialog } from '@/components/crm/LostReasonDialog'
import { LegacyAiLeads } from '@/components/crm/LegacyAiLeads'
import { hasWhatsAppAI } from '@/lib/planGates'
import { formatMoney, leadPhoneLabel, leadTitle, openLeadCount, stagePatch, type Lead, type Stage } from '@/lib/crm/model'
import { phoneKeys } from '@/lib/whatsapp/phone'
import styles from '@/components/crm/Crm.module.css'

type DrawerState = { mode: 'edit'; leadId: string } | { mode: 'create'; stage: Stage } | null

function Funnel() {
  const clinic = useAuthStore(s => s.clinic)
  const user = useAuthStore(s => s.user)
  const router = useRouter()
  const qc = useQueryClient()
  const clinicId = clinic?.id
  const { canEdit } = usePermissions('crm')
  const { canEdit: canEditPatients } = usePermissions('pacientes')

  const { data: leads = [], isLoading, isError } = useLeads(clinicId)
  const { data: members = [] } = useCrmMembers(clinicId)
  const { data: conversations = [] } = useConversations(clinicId)
  const { data: waState } = useWhatsAppState(clinicId)
  useCrmRealtime(clinicId)
  const { create, update, moveStage, remove } = useLeadMutations(clinicId, user?.id)

  const [query, setQuery] = useState('')
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
      .then(r => { if (r.linked > 0 || r.moved > 0) qc.invalidateQueries({ queryKey: ['crm-leads', clinicId] }) })
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

  return (
    <>
      <div className={styles.head}>
        <p className={styles.summary}>
          <strong>{openLeadCount(leads)}</strong> {openLeadCount(leads) === 1 ? 'lead em andamento' : 'leads em andamento'}
          {potential > 0 && <> · <strong>{formatMoney(potential)}</strong> em potencial</>}
          . O funil se atualiza sozinho com o WhatsApp e a agenda.{canEdit && <> Arraste um cartão só para corrigir.</>}
        </p>
        <div className={styles.tools}>
          <label className={styles.search}>
            <Icon name="search" size={16} />
            <input type="search" placeholder="Buscar lead" value={query} onChange={e => setQuery(e.target.value)} aria-label="Buscar lead por nome, telefone ou interesse" />
          </label>
          <div className={styles.ownerFilter}><SelectMenu value={owner} onChange={setOwner} options={memberOptions} /></div>
          {canEdit && <button type="button" className={styles.btnPrimary} onClick={() => { setFormError(''); setDrawer({ mode: 'create', stage: 'novo' }) }}><Icon name="plus" size={16} />Novo lead</button>}
        </div>
      </div>

      {waState && !connected && (
        <div className={styles.notice} role="alert">
          <strong>O WhatsApp da clínica está desconectado.</strong>
          <span>Contatos novos não entram no funil e não dá para conversar até reconectar.</span>
          <Link className={styles.emptyLink} href="/configuracoes?tab=whatsapp">Reconectar</Link>
        </div>
      )}

      {isLoading ? (
        <p className={styles.loading}>Carregando leads…</p>
      ) : isError ? (
        <p className={styles.errorBox} role="alert">Não foi possível carregar os leads. Atualize a página.</p>
      ) : (
        <>
          {leads.length === 0 && (
            <div className={styles.emptyBox}>
              <h2 className={styles.emptyTitle}>Nenhum lead ainda</h2>
              <p className={styles.emptyText}>
                {waState
                  ? 'Quando alguém que ainda não é paciente escrever para o WhatsApp da clínica, o contato aparece aqui sozinho, na etapa Novo. Você também pode cadastrar um lead à mão.'
                  : 'Conecte o WhatsApp da clínica para os contatos novos entrarem aqui sozinhos. Você também pode cadastrar leads à mão, como os que vêm do Instagram.'}
              </p>
              {!waState && <Link className={styles.emptyLink} href="/configuracoes?tab=whatsapp">Conectar o WhatsApp</Link>}
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
          onOpenPatient={() => editing?.patient_id && router.push(`/pacientes?patient=${editing.patient_id}`)}
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

  return (
    <div className={styles.root}>
      <PageTitle title="CRM" subtitle="Acompanhe cada contato até virar paciente" />
      {hasAI && (
        <div className={styles.tabs} role="tablist" aria-label="Seções do CRM">
          <button type="button" role="tab" aria-selected={tab === 'funil'} className={`${styles.tab} ${tab === 'funil' ? styles.tabOn : ''}`} onClick={() => setTab('funil')}>Funil</button>
          <button type="button" role="tab" aria-selected={tab === 'ia'} className={`${styles.tab} ${tab === 'ia' ? styles.tabOn : ''}`} onClick={() => setTab('ia')}>Atendente virtual</button>
        </div>
      )}
      {tab === 'ia' && hasAI ? <LegacyAiLeads /> : <Funnel />}
    </div>
  )
}

export default function CRMPage() {
  return <PermissionGuard module="crm"><CrmContent /></PermissionGuard>
}
