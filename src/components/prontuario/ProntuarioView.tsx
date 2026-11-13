'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { audit } from '@/lib/audit'
import type { Patient, MedicalRecord, RecordEntry, ClinicType } from '@/types'
import type { AuthClinic } from '@/types'
import { TabFicha } from './TabFicha'
import { escalasParaAreas } from '@/lib/escalas/escalas'
import { AREA_PROFILE, metasAreasOf, resolveMetasArea } from '@/lib/metas/constants'
import { usePermissions } from '@/hooks/usePermissions'
import { AtendimentoBar } from './AtendimentoBar'
import { PillTabs } from '@/components/ui/PillTabs'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import btn from '@/components/ui/button.module.css'
import styles from './ProntuarioView.module.css'
import { PrintMenu, type PrintGroup } from './print/PrintMenu'
import { PrintRegistryProvider, useCreatePrintRegistry } from './print/PrintRegistry'
import { corePrintOptions } from '@/lib/prontuario/printOptions'
import { CHAT_IA_ATIVO, resolveTab, withTab } from '@/lib/prontuario/navigation'
import { canLeave, internalTarget, joinLabels, setLeaveGuard, unsavedLabels } from '@/lib/prontuario/leaveGuard'
import { Icon } from '@/components/ui/Icon'
import { showToast } from '@/components/ui/Toast'
import { AvatarMenu } from './AvatarMenu'
import { PATIENT_AVATAR_OPTIONS, compressAvatar, dataUrlToBlob, isImageFile } from '@/lib/avatar/compress'
import { ImageCompressError } from '@/lib/teamChat/compress'
import { PATIENT_AVATAR_BUCKET, avatarStoragePath, patientAvatarPath } from '@/lib/pacientes/avatarUrl'
import { getSpecialtyConfig, mergeSpecialtyConfigs } from '@/lib/specialtyConfig'
import { Skeleton, SkeletonLines } from '@/components/ui/Skeleton'
import { ENTRIES_FIRST_PAGE, fetchEntriesPage, fetchMedicalRecord, medicalRecordKey } from '@/lib/prontuario/loadRecord'

// Só a Ficha abre com a página; cada aba vira um pedaço separado, baixado na primeira visita (as abas já montam sob demanda via `visited`)
function TabFallback() {
  return (
    <div aria-busy="true" aria-live="polite" style={{ padding: '16px 0' }}>
      <Skeleton height={20} width="40%" style={{ marginBottom: 12 }} />
      <SkeletonLines lines={4} />
    </div>
  )
}
const TabOdontograma = dynamic(() => import('./TabOdontograma').then(m => m.TabOdontograma), { ssr: false, loading: TabFallback })
const TabFaceograma = dynamic(() => import('./TabFaceograma').then(m => m.TabFaceograma), { ssr: false, loading: TabFallback })
const TabCorpograma = dynamic(() => import('./TabCorpograma').then(m => m.TabCorpograma), { ssr: false, loading: TabFallback })
const TabNutri = dynamic(() => import('./nutri/TabNutri').then(m => m.TabNutri), { ssr: false, loading: TabFallback })
const TabVet = dynamic(() => import('./vet/TabVet').then(m => m.TabVet), { ssr: false, loading: TabFallback })
const TabComparador = dynamic(() => import('./comparador/TabComparador').then(m => m.TabComparador), { ssr: false, loading: TabFallback })
const TabTimeline = dynamic(() => import('./TabTimeline').then(m => m.TabTimeline), { ssr: false, loading: TabFallback })
const TabMetas = dynamic(() => import('./metas/TabMetas').then(m => m.TabMetas), { ssr: false, loading: TabFallback })
const TabEscalas = dynamic(() => import('./escalas/TabEscalas').then(m => m.TabEscalas), { ssr: false, loading: TabFallback })
const TabDocumentos = dynamic(() => import('./TabDocumentos').then(m => m.TabDocumentos), { ssr: false, loading: TabFallback })
const TabChatIA = dynamic(() => import('./TabChatIA').then(m => m.TabChatIA), { ssr: false, loading: TabFallback })
const TabConversas = dynamic(() => import('./TabConversas').then(m => m.TabConversas), { ssr: false, loading: TabFallback })
const PortalLinkModal = dynamic(() => import('./portal/PortalLinkModal').then(m => m.PortalLinkModal), { ssr: false })

// Impressão: o módulo (HTML dos documentos) só é baixado quando precisa; é aquecido em ociosidade para o clique abrir a janela na hora
const loadPrint = () => import('@/lib/print')

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
  const queryClient = useQueryClient()
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
  // o rascunho da Ficha só é lido ao abrir o menu Imprimir: em ref, digitar não re-renderiza o prontuário inteiro
  const fichaDraftRef = useRef<FichaDraft | null>(null)
  const handleDraft = useCallback((r: MedicalRecord, area: ClinicType) => { fichaDraftRef.current = { record: r, area } }, [])

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
  const avatarBtnRef = useRef<HTMLButtonElement>(null)
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false)
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
    void loadAvatar()
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

  // aquece o módulo de impressão em ociosidade, para o clique em Imprimir abrir a janela na hora
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void }
    if (w.requestIdleCallback) {
      const h = w.requestIdleCallback(() => { void loadPrint() }, { timeout: 4000 })
      return () => w.cancelIdleCallback?.(h)
    }
    const t = setTimeout(() => { void loadPrint() }, 2500)
    return () => clearTimeout(t)
  }, [])

  async function loadAvatar() {
    try {
      // O upload grava o caminho real (avatar.png, .webp, .jpg...) em patients.avatar_url; o cadastro já traz esse valor
      // (e o upload desta tela atualiza o cache), então não precisa de outra ida ao banco antes de assinar a URL.
      const path = avatarStoragePath(patient.avatar_url, clinicId, patient.id)
      if (!path) return
      const { data } = await supabase.storage
        .from(PATIENT_AVATAR_BUCKET)
        .createSignedUrl(path, 3600)
      if (data?.signedUrl) setAvatarUrl(data.signedUrl)
    } catch {
      // Avatar não encontrado — sem URL
    }
  }

  // `initial`: só o primeiro carregamento (ou troca de paciente) mostra o 'Carregando'. Recarregar depois de salvar
  // mantém as abas montadas, senão o que está digitado e não salvo na Ficha se perde.
  // A ficha clínica libera a Ficha assim que chega; as evoluções vêm em paralelo e em levas (só a Evolução/Imprimir/Escalas as usam).
  async function loadRecord(initial = false) {
    if (initial) { setLoading(true); setEntriesLoading(true) }
    const entriesDone = loadEntries()
    // na 1ª vez reaproveita a busca que a página já disparou em paralelo com o cadastro; depois de salvar, sempre vai ao banco
    const rec = await queryClient.fetchQuery({
      queryKey: medicalRecordKey(clinicId, patient.id),
      queryFn: () => fetchMedicalRecord(clinicId, patient.id),
      staleTime: initial ? 5_000 : 0,
    }).catch(() => null)
    setRecord(rec ?? null)
    setLoading(false)
    await entriesDone
  }

  async function loadEntries() {
    // a primeira leva já preenche Evolução e Antes/depois; "carregando" só acaba com a lista completa (impressão e escalas esperam)
    const first = await fetchEntriesPage(clinicId, patient.id, 0, ENTRIES_FIRST_PAGE - 1)
    setEntries(first)
    let all = first
    let last = first
    while (last.length === ENTRIES_FIRST_PAGE) {
      last = await fetchEntriesPage(clinicId, patient.id, all.length, all.length + ENTRIES_FIRST_PAGE - 1)
      all = [...all, ...last]
      setEntries(all)
    }
    setEntriesLoading(false)
  }

  const refreshRecord = () => { void loadRecord(false) }

  // mantém os caches do paciente coerentes, para reabrir o prontuário e a lista sem a foto antiga
  function patchAvatarCache(value: string | null) {
    queryClient.setQueryData<Patient | null>(['paciente', clinicId, patient.id], cur => (cur ? { ...cur, avatar_url: value } : cur))
    queryClient.setQueryData<{ patients?: Patient[] } | undefined>(['pacientes', clinicId], cur => (cur?.patients ? { ...cur, patients: cur.patients.map(p => (p.id === patient.id ? { ...p, avatar_url: value } : p)) } : cur))
  }

  // grava o caminho em patients.avatar_url e confere que alguma linha mudou (RLS que bloqueia devolve 0 linhas, sem erro)
  async function saveAvatarPath(value: string | null): Promise<boolean> {
    const { data, error } = await supabase.from('patients').update({ avatar_url: value }).eq('id', patient.id).eq('clinic_id', clinicId).select('id')
    return !error && (data?.length ?? 0) > 0
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (uploadingAvatar) return
    if (!isImageFile(file)) { showToast('error', 'Escolha um arquivo de imagem (JPEG, PNG ou WebP).'); return }
    setUploadingAvatar(true)
    try {
      let out
      try {
        out = await compressAvatar(file, PATIENT_AVATAR_OPTIONS)
      } catch (err) {
        showToast('error', err instanceof ImageCompressError ? err.message : 'Não foi possível preparar a foto. Tente outra imagem.')
        return
      }
      const oldPath = avatarStoragePath(patient.avatar_url, clinicId, patient.id)
      const path = patientAvatarPath(clinicId, patient.id, out.mime)
      const { error: upErr } = await supabase.storage
        .from(PATIENT_AVATAR_BUCKET)
        .upload(path, dataUrlToBlob(out.dataUrl), { upsert: true, contentType: out.mime })
      if (upErr) { showToast('error', 'Não foi possível enviar a foto. Verifique a conexão e tente de novo.'); return }
      // Salva o path no banco, não a URL pública
      if (!(await saveAvatarPath(path))) {
        // a foto nova ficou sem registro: desfaz o envio (se o arquivo já era o mesmo, não há o que desfazer)
        if (path !== oldPath) await supabase.storage.from(PATIENT_AVATAR_BUCKET).remove([path]).catch(() => undefined)
        showToast('error', 'A foto foi enviada, mas não foi possível salvá-la no cadastro. Tente de novo.')
        return
      }
      // extensão mudou (ex.: foto antiga .png): apaga o arquivo anterior para não deixar órfão
      if (oldPath && oldPath !== path) await supabase.storage.from(PATIENT_AVATAR_BUCKET).remove([oldPath]).catch(() => undefined)
      patchAvatarCache(path)
      // Gera signed URL para exibição imediata
      const { data } = await supabase.storage.from(PATIENT_AVATAR_BUCKET).createSignedUrl(path, 3600)
      if (data?.signedUrl) setAvatarUrl(data.signedUrl)
      showToast('ok', 'Foto atualizada.')
    } finally {
      setUploadingAvatar(false)
    }
  }

  async function handleAvatarRemove() {
    setAvatarMenuOpen(false)
    if (uploadingAvatar) return
    setUploadingAvatar(true)
    try {
      const oldPath = avatarStoragePath(patient.avatar_url, clinicId, patient.id)
      if (!(await saveAvatarPath(null))) { showToast('error', 'Não foi possível remover a foto. Tente de novo.'); return }
      patchAvatarCache(null)
      setAvatarUrl(null)
      if (oldPath) await supabase.storage.from(PATIENT_AVATAR_BUCKET).remove([oldPath]).catch(() => undefined)
      showToast('ok', 'Foto removida.')
    } finally {
      setUploadingAvatar(false)
    }
  }

  const hasAvatar = !!avatarUrl || !!patient.avatar_url
  // com foto, o toque abre o menu (trocar/remover); sem foto, vai direto para a escolha do arquivo
  function onAvatarClick() {
    if (uploadingAvatar) return
    if (hasAvatar) setAvatarMenuOpen(o => !o)
    else avatarInputRef.current?.click()
  }

  const initials = patient.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  // ── Impressão: um menu só, no cabeçalho ──
  const clinicInfo = { name: clinicName, logo: clinic.logo || undefined, address: clinic.address || undefined, phone: clinic.phone || undefined }
  const tabLabel = tabs.find(t => t.key === tab)?.label ?? ''
  // montado só ao abrir o menu: é aí que se lê o rascunho da Ficha (em ref, sem re-renderizar a cada tecla)
  function getPrintGroups(): PrintGroup[] {
    const draft = fichaDraftRef.current
    const printRecord = draft?.record ?? record
    const printArea: ClinicType = draft?.area ?? user?.specialtyType ?? clinicSpecialties[0]
    const coreOptions = corePrintOptions({ record: printRecord, entries, entriesLoading, planItemCount: printRecord?.treatment_plan_items?.length ?? 0 })
    const coreRunners: Record<string, () => void> = {
      prontuario: () => { void loadPrint().then(m => m.printProntuario(clinicInfo, patient, printRecord, entries, printArea)) },
      ficha: () => { void loadPrint().then(m => m.printProntuario(clinicInfo, patient, printRecord, entries, printArea, { evolucao: false })) },
      evolucao: () => { void loadPrint().then(m => m.printEvolucao(clinicInfo, patient, entries)) },
      orcamento: () => { void loadPrint().then(m => m.printOrcamento(clinicInfo, patient, printRecord?.treatment_plan_items ?? [], printRecord?.treatment_plan)) },
      contrato: () => { void loadPrint().then(m => m.printContrato(clinicInfo, patient, printRecord?.contract_text ?? '')) },
    }
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
          <button ref={avatarBtnRef} type="button" className={styles.avatarWrap} onClick={onAvatarClick} disabled={uploadingAvatar} aria-busy={uploadingAvatar} aria-haspopup={hasAvatar ? 'menu' : undefined} aria-expanded={hasAvatar ? avatarMenuOpen : undefined} aria-label={hasAvatar ? 'Foto do paciente: trocar ou remover' : 'Adicionar foto do paciente'} title={hasAvatar ? 'Trocar ou remover a foto' : 'Adicionar foto'}>
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
        {avatarMenuOpen && (
          <AvatarMenu
            anchorRef={avatarBtnRef}
            onChange={() => { setAvatarMenuOpen(false); avatarInputRef.current?.click() }}
            onRemove={handleAvatarRemove}
            onClose={() => setAvatarMenuOpen(false)}
          />
        )}
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
