'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { audit } from '@/lib/audit'
import type { Patient, MedicalRecord, RecordEntry, ClinicType } from '@/types'
import type { AuthClinic } from '@/types'
import { TabFicha } from './TabFicha'
import { TabOdontograma } from './TabOdontograma'
import { TabFaceograma } from './TabFaceograma'
import { TabCorpograma } from './TabCorpograma'
import { TabNutri } from './nutri/TabNutri'
import { TabVet } from './vet/TabVet'
import { TabComparador } from './comparador/TabComparador'
import { TabTimeline } from './TabTimeline'
import { TabMetas } from './metas/TabMetas'
import { TabEscalas } from './escalas/TabEscalas'
import { escalasParaAreas } from '@/lib/escalas/escalas'
import { AREA_PROFILE, metasAreasOf, resolveMetasArea } from '@/lib/metas/constants'
import { TabChatIA } from './TabChatIA'
import { TabConversas } from './TabConversas'
import { usePermissions } from '@/hooks/usePermissions'
import { TabDocumentos } from './TabDocumentos'
import { AtendimentoBar } from './AtendimentoBar'
import { PortalLinkModal } from './portal/PortalLinkModal'
import { PillTabs } from '@/components/ui/PillTabs'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import btn from '@/components/ui/button.module.css'
import { printProntuario, printEvolucao, printOrcamento, printContrato } from '@/lib/print'
import styles from './ProntuarioView.module.css'
import { PrintMenu, type PrintGroup } from './print/PrintMenu'
import { PrintRegistryProvider, useCreatePrintRegistry } from './print/PrintRegistry'
import { corePrintOptions } from '@/lib/prontuario/printOptions'
import { CHAT_IA_ATIVO, resolveTab, withTab } from '@/lib/prontuario/navigation'
import { canLeave, internalTarget, joinLabels, setLeaveGuard, unsavedLabels } from '@/lib/prontuario/leaveGuard'
import { Icon } from '@/components/ui/Icon'
import { getSpecialtyConfig, mergeSpecialtyConfigs } from '@/lib/specialtyConfig'

type Tab = 'ficha' | 'odontograma' | 'faceograma' | 'corpograma' | 'metas' | 'nutri' | 'vet' | 'comparador' | 'escalas' | 'timeline' | 'documentos' | 'chat' | 'conversas'

interface Props {
  patient: Patient
  clinic: AuthClinic
}

/** O que a Ficha tem em edição (inclusive o não salvo): é o que as impressões do menu usam, como o botão antigo da Ficha fazia. */
interface FichaDraft { record: MedicalRecord; area: ClinicType }

/**
 * Prontuário do paciente, como página (/pacientes/[id]). A aba aberta fica na URL (?aba=odontograma).
 * Mantém o aviso de alterações não salvas ao sair: botão Voltar, links do menu, busca e fechar a aba do navegador.
 */
export function ProntuarioView({ patient, clinic }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const clinicId = clinic.id
  const clinicName = clinic.name
  const { user } = useAuthStore()
  // Conversas de WhatsApp: só para quem pode ver o módulo CRM (atendimento e admin); a rota também confere
  const { canView: canSeeConversas, loaded: permsLoaded } = usePermissions('crm')
  const printRegistry = useCreatePrintRegistry()
  const [record, setRecord] = useState<MedicalRecord | null>(null)
  const [entries, setEntries] = useState<RecordEntry[]>([])
  const [entriesLoading, setEntriesLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [portalOpen, setPortalOpen] = useState(false)
  const [fichaDraft, setFichaDraft] = useState<FichaDraft | null>(null)
  const handleDraft = useCallback((r: MedicalRecord, area: ClinicType) => setFichaDraft({ record: r, area }), [])

  // Abas extras (odontograma/faceograma/corpograma) vêm da união das áreas
  // que a clínica de fato atende (clinic.specialties), não só da área
  // principal — sem isso, odonto+estética com principal odonto não via o
  // Corpograma que a parte de estética da clínica precisa.
  const clinicSpecialties = clinic.specialties?.length ? clinic.specialties : [clinic.type]
  const recordTabs = mergeSpecialtyConfigs(clinicSpecialties).recordTabs
  // Na fisioterapia o corpograma é o mapa de dor (EVA); se outra área da clínica
  // (ex.: estética) também usa a aba, mantém o nome "Corpograma".
  const corpogramaSpecialties = clinicSpecialties.filter(t => getSpecialtyConfig(t).recordTabs.includes('corpograma'))
  const corpogramaLabel = corpogramaSpecialties.length > 0 && corpogramaSpecialties.every(t => t === 'fisio') ? 'Mapa corporal' : 'Corpograma'
  // Plano terapêutico por metas: o perfil (fono, TO, fisio, psico) segue a área de quem está logado, senão a 1ª da clínica que usa metas.
  const metasArea = resolveMetasArea(user?.specialtyType, clinicSpecialties)
  const RECORD_TAB_LABELS: Record<string, string> = { odontograma: 'Odontograma', faceograma: 'Faceograma', corpograma: corpogramaLabel, nutri: 'Nutrição', vet: 'Vacinas e peso', comparador: 'Antes e depois', metas: metasArea ? AREA_PROFILE[metasArea].tabLabel : 'Metas' }

  // Escalas clínicas (PHQ-9, GAD-7, Oswestry): as da área de quem está logado; sem área com escala, as da clínica.
  const escalasDoUsuario = escalasParaAreas(user?.specialtyType ? [user.specialtyType] : [])
  const escalas = escalasDoUsuario.length > 0 ? escalasDoUsuario : escalasParaAreas(clinicSpecialties)

  const tabs: { key: Tab; label: string }[] = [
    { key: 'ficha', label: 'Ficha Clínica' },
    ...recordTabs.map(t => ({ key: t as Tab, label: RECORD_TAB_LABELS[t] })),
    ...(escalas.length > 0 ? [{ key: 'escalas' as Tab, label: 'Escalas' }] : []),
    { key: 'timeline',   label: 'Evolução'    },
    { key: 'documentos', label: 'Documentos e contratos' },
    ...(CHAT_IA_ATIVO ? [{ key: 'chat' as Tab, label: 'Chat IA' }] : []),
    ...(permsLoaded && canSeeConversas ? [{ key: 'conversas' as Tab, label: 'Conversas' }] : []),
  ]

  // Aba inicial vem da URL; só vale se existir para esta clínica
  const [tab, setTab] = useState<Tab>(() => resolveTab(searchParams.get('aba'), tabs.map(t => t.key)))
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set<Tab>(['ficha', resolveTab(searchParams.get('aba'), tabs.map(t => t.key))]))

  function goToTab(t: Tab) {
    setTab(t)
    setVisited(prev => (prev.has(t) ? prev : new Set(prev).add(t)))
    // troca de aba não empilha histórico: o Voltar do navegador continua saindo do prontuário
    try { window.history.replaceState(null, '', withTab(window.location.pathname, window.location.search, window.location.hash, t)) } catch { /* a aba ainda troca, só não vai na URL */ }
  }

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [timelinePending, setTimelinePending] = useState(false)
  const [fichaDirty, setFichaDirty] = useState(false)
  const [odontoDirty, setOdontoDirty] = useState(false)
  const [faceDirty, setFaceDirty] = useState(false)
  const [bodyDirty, setBodyDirty] = useState(false)
  const [metasDirty, setMetasDirty] = useState(false)
  const [nutriDirty, setNutriDirty] = useState(false)
  const [escalasDirty, setEscalasDirty] = useState(false)

  // o que ainda não foi salvo, para avisar antes de sair do prontuário
  const unsaved = unsavedLabels({
    ficha: fichaDirty, evolucao: timelinePending, odontograma: odontoDirty, faceograma: faceDirty, corpograma: bodyDirty, metas: metasDirty, nutri: nutriDirty, escalas: escalasDirty,
  })
  const unsavedKey = unsaved.join('|')
  // atendimento em andamento (cronômetro rodando): também pergunta antes de sair, mesmo sem nada por salvar
  const [attendanceRunning, setAttendanceRunning] = useState(false)
  const guardKey = unsavedKey || (attendanceRunning ? 'atendimento' : '')

  const askLeave = useCallback(async () => {
    if (!guardKey) return true
    if (!unsavedKey) {
      return confirmDialog({
        title: 'Atendimento em andamento',
        message: 'Este atendimento ainda não foi finalizado. Se sair agora ele continua em andamento e você pode retomar depois.',
        confirmText: 'Sair mesmo assim',
        cancelText: 'Ficar',
      })
    }
    return confirmDialog({
      title: 'Sair sem salvar?',
      message: `Ainda não foi salvo: ${joinLabels(unsavedKey.split('|'))}. Se sair agora, essas alterações serão perdidas.`,
      confirmText: 'Descartar e sair',
      cancelText: 'Voltar e salvar',
      danger: true,
    })
  }, [unsavedKey, guardKey])

  // Guarda global: a busca do topo e o botão Voltar perguntam antes de navegar
  useEffect(() => {
    if (!guardKey) return
    setLeaveGuard(askLeave)
    return () => setLeaveGuard(null)
  }, [guardKey, askLeave])

  // Fechar ou recarregar a aba do navegador
  useEffect(() => {
    if (!guardKey) return
    function onBeforeUnload(e: BeforeUnloadEvent) { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [guardKey])

  // Links do menu e da barra de cima: pergunta antes; se a pessoa confirmar, refaz o clique sem interceptar
  useEffect(() => {
    if (!guardKey) return
    let bypass = false
    function onClick(e: MouseEvent) {
      if (bypass || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return
      if (!internalTarget(a.href, window.location.origin, window.location.href)) return
      e.preventDefault()
      e.stopPropagation()
      askLeave().then(ok => {
        if (!ok) return
        bypass = true
        try { a.click() } finally { bypass = false }
      })
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [guardKey, askLeave])

  async function goBack() {
    if (await canLeave()) router.push('/pacientes')
  }

  useEffect(() => {
    loadRecord(true)
    loadAvatar()
    // Auditoria: acesso ao prontuário
    if (user?.id) {
      audit({
        action: 'prontuario.view',
        user_id: user.id,
        clinic_id: clinicId,
        module: 'prontuario',
        resource_id: patient.id,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.id])

  async function loadAvatar() {
    try {
      // O upload grava o caminho real (avatar.png, .webp, .jpg...) em patients.avatar_url. Lê o valor atual do
      // banco: a linha da lista pode estar desatualizada (foto enviada nesta sessão) e a extensão não é fixa.
      const { data: row } = await supabase.from('patients').select('avatar_url').eq('id', patient.id).eq('clinic_id', clinicId).maybeSingle()
      const stored = (row?.avatar_url ?? patient.avatar_url ?? '').trim()
      if (!stored) return
      // caminho do storage; um https://... de versão antiga cai no nome fixo usado então
      const path = /^https?:/i.test(stored) ? `${clinicId}/${patient.id}/avatar.jpg` : stored
      const { data } = await supabase.storage
        .from('patient-avatars')
        .createSignedUrl(path, 3600)
      if (data?.signedUrl) setAvatarUrl(data.signedUrl)
    } catch {
      // Avatar não encontrado — sem URL
    }
  }

  // `initial`: só o primeiro carregamento (ou troca de paciente) mostra o 'Carregando'. Recarregar depois de salvar
  // mantém as abas montadas, senão o que está digitado e não salvo na Ficha se perde.
  async function loadRecord(initial = false) {
    if (initial) setLoading(true)
    // Load medical_record first — unblocks the UI for Ficha/Faceograma tabs
    const recRes = await supabase
      .from('medical_records')
      .select('*')
      .eq('patient_id', patient.id)
      .eq('clinic_id', clinicId)
      .maybeSingle<MedicalRecord>()
    setRecord(recRes.data ?? null)
    setLoading(false)
    // Load entries in the background — only needed for Timeline/print
    if (initial) setEntriesLoading(true)
    supabase
      .from('record_entries')
      .select('*')
      .eq('patient_id', patient.id)
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setEntries((data ?? []) as RecordEntry[])
        setEntriesLoading(false)
      })
  }

  const refreshRecord = () => { void loadRecord(false) }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (!file.type.startsWith('image/')) return
    setUploadingAvatar(true)
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `${clinicId}/${patient.id}/avatar.${ext}`
    const { error: upErr } = await supabase.storage
      .from('patient-avatars')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (!upErr) {
      // Salva o path no banco, não a URL pública
      await supabase.from('patients').update({ avatar_url: path }).eq('id', patient.id)
      // Gera signed URL para exibição imediata
      const { data } = await supabase.storage
        .from('patient-avatars')
        .createSignedUrl(path, 3600)
      if (data?.signedUrl) setAvatarUrl(data.signedUrl)
    }
    setUploadingAvatar(false)
  }

  const initials = patient.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  // ── Impressão: um menu só, no cabeçalho ──
  const clinicInfo = { name: clinicName, logo: clinic.logo || undefined, address: clinic.address || undefined, phone: clinic.phone || undefined }
  const printRecord = fichaDraft?.record ?? record
  const printArea: ClinicType = fichaDraft?.area ?? user?.specialtyType ?? clinicSpecialties[0]
  const coreOptions = corePrintOptions({ record: printRecord, entries, entriesLoading, planItemCount: printRecord?.treatment_plan_items?.length ?? 0 })
  const coreRunners: Record<string, () => void> = {
    prontuario: () => printProntuario(clinicInfo, patient, printRecord, entries, printArea),
    ficha: () => printProntuario(clinicInfo, patient, printRecord, entries, printArea, { evolucao: false }),
    evolucao: () => printEvolucao(clinicInfo, patient, entries),
    orcamento: () => printOrcamento(clinicInfo, patient, printRecord?.treatment_plan_items ?? [], printRecord?.treatment_plan),
    contrato: () => printContrato(clinicInfo, patient, printRecord?.contract_text ?? ''),
  }
  const tabLabel = tabs.find(t => t.key === tab)?.label ?? ''
  function getPrintGroups(): PrintGroup[] {
    return [
      { key: 'paciente', title: 'Do paciente', items: coreOptions.map(o => ({ ...o, run: coreRunners[o.id] })) },
      { key: 'aba', title: `Desta aba: ${tabLabel}`, items: printRegistry.get(tab) },
    ]
  }

  return (
    <PrintRegistryProvider value={printRegistry}>
    <div className={styles.page}>
      <div className={styles.topRow}>
        <button type="button" className={styles.back} onClick={goBack}>
          <Icon name="chevronLeft" size={16} aria-hidden="true" /> Pacientes
        </button>
      </div>

      <section className={styles.surface} aria-label={`Prontuário de ${patient.name}`}>
        <header className={styles.head}>
          <button type="button" className={styles.avatarWrap} onClick={() => avatarInputRef.current?.click()} aria-label="Trocar a foto do paciente" title="Trocar a foto">
            {avatarUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={avatarUrl} alt="" className={styles.avatar} />
              : <span className={styles.avatarInitials}>{initials}</span>
            }
            <span className={styles.avatarOverlay}>{uploadingAvatar ? <Icon name="refresh" size={16} className={styles.spinIcon} /> : <Icon name="camera" size={16} />}</span>
          </button>
          <div className={styles.headText}>
            <h1 className={styles.title}>{patient.name}</h1>
            <p className={styles.subtitle}>Prontuário</p>
          </div>
          <div className={styles.actions}>
            {/* Link mágico do paciente (plano, vacinas, consultas, assinatura de termos). Fora da demonstração. */}
            {!clinic.demoMode && (
              <button type="button" className={btn.secondary} onClick={() => setPortalOpen(true)} title="Gerar link pessoal para o paciente">
                Link do paciente
              </button>
            )}
            <PrintMenu patientName={patient.name} getGroups={getPrintGroups} entries={entries} />
          </div>
        </header>

        <AtendimentoBar patientId={patient.id} clinicId={clinicId} onRunningChange={setAttendanceRunning} />

        <div className={styles.tabsRow}>
          <PillTabs
            label="Seções do prontuário"
            options={tabs.map(x => ({ value: x.key, label: x.label }))}
            value={tab}
            onChange={goToTab}
          />
        </div>

        <input ref={avatarInputRef} type="file" accept="image/*" hidden onChange={handleAvatarChange} />
        {portalOpen && <PortalLinkModal patient={patient} clinic={clinic} contractText={record?.contract_text} onClose={() => setPortalOpen(false)} />}
        <div className={styles.sections}>
          {/* Ficha: always mounted (default tab) */}
          <div style={{ display: tab === 'ficha' ? undefined : 'none' }}>
            {loading
              ? <p className={styles.loading}>Carregando prontuário...</p>
              : <TabFicha
                  patient={patient}
                  record={record}
                  clinic={clinic}
                  clinicId={clinicId}
                  onSaved={refreshRecord}
                  onDraftChange={handleDraft}
                  onDirtyChange={setFichaDirty}
                  onOpenDocuments={() => goToTab('documentos')}
                />
            }
          </div>

          {/* Heavy tabs: lazy-mount on first visit, then keep mounted */}
          {recordTabs.includes('odontograma') && visited.has('odontograma') && (
            <div style={{ display: tab === 'odontograma' ? undefined : 'none' }}>
              <TabOdontograma
                record={record}
                patient={patient}
                clinicId={clinicId}
                onSaved={refreshRecord}
                onDirtyChange={setOdontoDirty}
              />
            </div>
          )}
          {visited.has('faceograma') && (
            <div style={{ display: tab === 'faceograma' ? undefined : 'none' }}>
              <TabFaceograma
                record={record}
                patient={patient}
                clinicId={clinicId}
                onSaved={refreshRecord}
                onDirtyChange={setFaceDirty}
              />
            </div>
          )}
          {recordTabs.includes('corpograma') && visited.has('corpograma') && (
            <div style={{ display: tab === 'corpograma' ? undefined : 'none' }}>
              <TabCorpograma
                record={record}
                patient={patient}
                clinicId={clinicId}
                onSaved={refreshRecord}
                onDirtyChange={setBodyDirty}
              />
            </div>
          )}
          {recordTabs.includes('metas') && metasArea && visited.has('metas') && (
            <div style={{ display: tab === 'metas' ? undefined : 'none' }}>
              <TabMetas patient={patient} clinic={clinic} area={metasArea} areas={metasAreasOf(clinicSpecialties)} onDirtyChange={setMetasDirty} />
            </div>
          )}
          {recordTabs.includes('nutri') && visited.has('nutri') && (
            <div style={{ display: tab === 'nutri' ? undefined : 'none' }}>
              <TabNutri patient={patient} clinic={clinic} clinicId={clinicId} onDirtyChange={setNutriDirty} />
            </div>
          )}
          {recordTabs.includes('vet') && visited.has('vet') && (
            <div style={{ display: tab === 'vet' ? undefined : 'none' }}>
              <TabVet patient={patient} clinic={clinic} clinicId={clinicId} />
            </div>
          )}
          {escalas.length > 0 && visited.has('escalas') && (
            <div style={{ display: tab === 'escalas' ? undefined : 'none' }}>
              <TabEscalas
                patient={patient}
                clinicId={clinicId}
                record={record}
                entries={entries}
                entriesLoading={entriesLoading}
                escalas={escalas}
                onSaved={refreshRecord}
                onDirtyChange={setEscalasDirty}
              />
            </div>
          )}
          {recordTabs.includes('comparador') && visited.has('comparador') && (
            <div style={{ display: tab === 'comparador' ? undefined : 'none' }}>
              <TabComparador patient={patient} clinic={clinic} entries={entries} entriesLoading={entriesLoading} />
            </div>
          )}
          {visited.has('timeline') && (
            <div style={{ display: tab === 'timeline' ? undefined : 'none' }}>
              <TabTimeline
                patient={patient}
                record={record}
                entries={entries}
                clinicId={clinicId}
                onSaved={refreshRecord}
                onPendingChange={setTimelinePending}
              />
            </div>
          )}
          {visited.has('documentos') && (
            <div style={{ display: tab === 'documentos' ? undefined : 'none' }}>
              <TabDocumentos patient={patient} contractText={record?.contract_text} planItems={record?.treatment_plan_items ?? []} />
            </div>
          )}
          {CHAT_IA_ATIVO && visited.has('chat') && (
            <div style={{ display: tab === 'chat' ? undefined : 'none' }}>
              <TabChatIA phone={patient.phone} />
            </div>
          )}
          {permsLoaded && canSeeConversas && visited.has('conversas') && (
            <div style={{ display: tab === 'conversas' ? undefined : 'none' }}>
              <TabConversas patientId={patient.id} active={tab === 'conversas'} />
            </div>
          )}
        </div>
      </section>
    </div>
    </PrintRegistryProvider>
  )
}
