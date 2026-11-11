'use client'
import { formatBrPhone } from '@/lib/phoneFormat'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { buildDocumentoHtml, printDocumento, printHtmlInWindow } from '@/lib/print'
import { exportNodeAsImage, exportNodeAsPdf, safeFilename } from '@/lib/documentExport'
import { composeCalibratedDoc, downloadBlob, openPrintWindow, printBlobInWindow, DocumentRenderError, EXPORT_PDF_TARGET_WIDTH, type RenderableField } from '@/lib/documentRender'
import { resolveDocumentOptions } from '@/lib/specialtyConfig'
import { councilForProfessional, formatRqe } from '@/lib/professionalCouncil'
import { buildDefaultTemplate, buildLetterheadPatientBlock, escapeHtml, syncSignerBlocks } from '@/lib/documentHtml'
import { useProfessionals } from '@/hooks/useClinicData'
import { useTemplateBackground, renderPdfPageToDataUrl, isImageUrl, type TemplateBackground } from '@/hooks/useTemplateBackground'
import { Portal } from '@/components/ui/Portal'
import { Icon } from '@/components/ui/Icon'
import { TemplateFieldCanvas } from '@/components/documentos/TemplateFieldCanvas'
import { getTemplateCanvasSize } from '@/lib/templateCanvasSize'
import { REVIEW_NOTE } from '@/lib/documentBodyTemplates'
import { contentHash } from '@/lib/assinatura/hash'
import { buildVerificationStamp } from '@/lib/assinatura/carimbo'
import { formatCode, isVerifiableDocType } from '@/lib/assinatura/tipos'
import { qrDataUri } from '@/lib/qr/qr'
import { emitVerifiable } from './portal/portalApi'
import { PillTabs } from '@/components/ui/PillTabs'
import { hojeBrasil } from '@/lib/brasilDate'
import { resolveDocFields } from '@/lib/documentos/campos'
import { isStructuredKind, textToBodyHtml } from '@/lib/documentos/atestado'
import { AtestadoEstruturado } from './documentos/AtestadoEstruturado'
import { ImportarModelo } from './documentos/ImportarModelo'
import { listarModelosDaClinica, modelosComoMapa, type ModeloClinicaItem } from './documentos/modelosApi'
import { usePermissions } from '@/hooks/usePermissions'
import { ContratosPaciente } from './contratos/ContratosPaciente'
import type { Patient, ClinicDocumentTemplate, DocumentTemplateType, FieldPosition, TreatmentPlanItem } from '@/types'
import styles from './TabDocumentos.module.css'
import structured from './documentos/atestadoEstruturado.module.css'
import { SelectMenu } from '@/components/ui/SelectMenu'
import btn from '@/components/ui/button.module.css'
import { showToast } from '@/components/ui/Toast'
import { usePrintActions } from './print/PrintRegistry'

interface Props {
  patient: Patient
  /** Texto do contrato que já estava salvo na Ficha (leitura; o contrato não é mais editado lá). */
  contractText?: string | null
  /** Itens do orçamento da Ficha: base do valor e do serviço sugeridos ao criar um contrato. */
  planItems?: TreatmentPlanItem[]
}

export function TabDocumentos({ patient, contractText, planItems = [] }: Props) {
  const { clinic, user } = useAuthStore()

  // Profissional responsável pelo documento — assina e empresta o registro
  // (CRO, CRM, CRMV, CREFITO, CRP...) pro cabeçalho, em vez de assumir que é
  // sempre quem está logado (a recepção pode estar preenchendo em nome de
  // outro profissional).
  const { data: professionals = [], isLoading: professionalsLoading } = useProfessionals(clinic?.id)
  const loggedInProfessional = user?.professionalId ? professionals.find(p => p.id === user.professionalId) : undefined
  const [manualProfessionalId, setManualProfessionalId] = useState('')
  // Só mostra o seletor quando quem logou não é profissional E existe mais
  // de um pra escolher — clínica de profissional único resolve sozinha, sem UI extra.
  const needsProfessionalPicker = !loggedInProfessional && professionals.length > 1
  useEffect(() => {
    if (needsProfessionalPicker && !manualProfessionalId && professionals[0]) {
      setManualProfessionalId(professionals[0].id)
    }
  }, [needsProfessionalPicker, manualProfessionalId, professionals])
  const responsibleProfessional =
    loggedInProfessional
    ?? (manualProfessionalId ? professionals.find(p => p.id === manualProfessionalId) : undefined)
    ?? (professionals.length === 1 ? professionals[0] : undefined)
  // Só semeia o editor depois que os profissionais carregaram (e, com seletor,
  // depois de ele ter um valor) — senão o 1º documento sairia com o nome de
  // quem está logado e o registro em branco.
  const professionalsReady = !professionalsLoading && (!needsProfessionalPicker || !!manualProfessionalId)
  // Modelos de TEXTO próprios da clínica (importados por foto): o formulário estruturado usa o da clínica no lugar do
  // padrão. Sem a tabela ou sem rede segue com o padrão do sistema, sem ruído na tela.
  const { canEdit: canEditProntuario } = usePermissions('prontuario')
  const [clinicModels, setClinicModels] = useState<ModeloClinicaItem[]>([])
  const reloadClinicModels = useCallback(() => {
    listarModelosDaClinica().then(setClinicModels).catch(() => setClinicModels([]))
  }, [])
  useEffect(() => { if (clinic?.id) reloadClinicModels() }, [clinic?.id, reloadClinicModels])
  const clinicModelMap = useMemo(() => modelosComoMapa(clinicModels), [clinicModels])
  const [templates, setTemplates] = useState<ClinicDocumentTemplate[]>([])
  const [templatesLoaded, setTemplatesLoaded] = useState(false)
  // Documentos seguem a ÁREA do profissional responsável (em clínica multi-área,
  // o fisio e o psicólogo veem cada um os seus); sem ela, a do usuário e, por
  // fim, a união das áreas da clínica. Tipos que a clínica já tem modelo salvo
  // nunca somem. Ver resolveDocumentOptions.
  const savedTypesKey = templates.map(t => t.type).sort().join(',')
  const clinicSpecialties = clinic?.specialties
  const DOC_TYPES = useMemo(() => resolveDocumentOptions({
    clinicType: clinic?.type,
    clinicSpecialties,
    professionalType: responsibleProfessional?.specialty_type,
    professionalSpecialty: responsibleProfessional?.specialty,
    userType: user?.specialtyType,
    savedTypes: savedTypesKey ? (savedTypesKey.split(',') as DocumentTemplateType[]) : [],
  }), [clinic?.type, clinicSpecialties, responsibleProfessional?.specialty_type, responsibleProfessional?.specialty, user?.specialtyType, savedTypesKey])
  const council = councilForProfessional({
    specialtyType: responsibleProfessional?.specialty_type,
    specialty: responsibleProfessional?.specialty,
    clinicType: clinic?.type,
  })
  const [section, setSection] = useState<'documentos' | 'contratos'>(() => {
    try { return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('secao') === 'contratos' ? 'contratos' : 'documentos' } catch { return 'documentos' }
  })
  // Atestado, declaração e laudo genéricos nascem de um formulário curto; o editor livre fica recolhido (avançado)
  const [editorOpen, setEditorOpen] = useState(false)
  const [bodyRequest, setBodyRequest] = useState<{ seq: number; text: string } | null>(null)
  const appliedSeqRef = useRef(0)
  const requestSeqRef = useRef(0)
  const [pickedType, setPickedType] = useState<DocumentTemplateType>(DOC_TYPES[0]?.type ?? 'declaracao_comparecimento')
  function setSelectedType(t: DocumentTemplateType) {
    setPickedType(t)
    setEditorOpen(false)
    setBodyRequest(null)
  }
  // Trocou de profissional/área e o tipo escolhido não existe mais na lista → cai no primeiro.
  const selectedType: DocumentTemplateType = DOC_TYPES.some(d => d.type === pickedType)
    ? pickedType
    : (DOC_TYPES[0]?.type ?? 'declaracao_comparecimento')
  const selectedDocInfo = DOC_TYPES.find(d => d.type === selectedType)
  const structuredKind = isStructuredKind(selectedType) && !selectedDocInfo?.body ? selectedType : null
  const editorHidden = structuredKind !== null && !editorOpen
  const structuredFields = useMemo(() => resolveDocFields({
    patientName: patient.name, patientCpf: patient.cpf, guardianName: patient.guardian_name, guardianCpf: patient.guardian_cpf, clinicName: clinic?.name,
    professionalName: responsibleProfessional?.name ?? user?.displayName,
    registrationNumber: responsibleProfessional?.registration_number, rqe: responsibleProfessional?.rqe,
    council, today: hojeBrasil(),
  }), [patient.name, patient.cpf, patient.guardian_name, patient.guardian_cpf, clinic?.name, responsibleProfessional, user?.displayName, council])
  // Guarda também o tamanho NATURAL do papel timbrado (imagem enviada ou
  // página de PDF renderizada) — sem isso, o CSS não tem como saber a
  // altura real necessária (corta o fundo) nem evitar ampliar além da
  // resolução do arquivo (borra), ver bgStyle abaixo. Hook compartilhado com
  // o calibrador de campos (Configurações) — mesma conta nos dois lugares.
  const { bg: bgImage, loading: loadingBg, error: bgError, load: loadTemplateBg } = useTemplateBackground()
  const editorRef = useRef<HTMLDivElement>(null)
  const editorWrapRef = useRef<HTMLDivElement>(null)
  const [editorWidth, setEditorWidth] = useState(0)
  // Tipo já semeado no editor — evita que reloads de `templates` sobrescrevam o que o usuário digitou
  const seededTypeRef = useRef<DocumentTemplateType | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Modelo calibrado (campos posicionados pela própria clínica em cima do
  // papel timbrado dela) — quando existe, o preenchimento usa TemplateFieldCanvas
  // em vez do editor único de sempre. Ver documentFieldCatalog.ts / TemplateFieldCanvas.tsx.
  const activeTpl = templates.find(t => t.type === selectedType)
  const activeFields: FieldPosition[] = activeTpl?.field_positions ?? []
  const hasCalibratedFields = activeFields.length > 0
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const canvasRef = useRef<HTMLDivElement>(null)
  const lastFocusedFieldKeyRef = useRef<string | null>(null)
  const seededFieldsTypeRef = useRef<DocumentTemplateType | null>(null)
  // Guarda de quem era o profissional na última vez que os campos
  // automáticos foram preenchidos — detecta troca no seletor (ver efeito
  // de re-sincronização abaixo, resolve o bug "assina com o registro errado").
  const lastProfessionalIdRef = useRef<string | undefined>(undefined)
  // Mensagem específica de erro de geração (baixar/imprimir) — nunca mais
  // um clique que simplesmente não faz nada (D5 da auditoria).
  const [exportError, setExportError] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)
  // QR verificador (atestado, declaração, laudo, receita comum): cada impressão/download registra o documento emitido
  const [includeQr, setIncludeQr] = useState(true)

  // Menu "Baixar" (PDF ou imagem) — popover posicionado, mesmo padrão do SelectMenu
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false)
  const [exporting, setExporting] = useState<'pdf' | 'image' | null>(null)
  const [menuCoords, setMenuCoords] = useState({ top: 0, left: 0 })
  const downloadTriggerRef = useRef<HTMLButtonElement>(null)
  const downloadPopoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!downloadMenuOpen) return
    function updatePosition() {
      const rect = downloadTriggerRef.current?.getBoundingClientRect()
      if (!rect) return
      setMenuCoords({ top: rect.bottom + 6, left: Math.max(rect.right - 200, 12) })
    }
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    function handleClick(e: MouseEvent) {
      if (
        downloadTriggerRef.current && !downloadTriggerRef.current.contains(e.target as Node) &&
        downloadPopoverRef.current && !downloadPopoverRef.current.contains(e.target as Node)
      ) setDownloadMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [downloadMenuOpen])

  // Resolve o timbrado na MELHOR resolução disponível pra exportar — imagem
  // usa a URL original (já é o arquivo do cliente, natural); PDF é
  // RE-renderizado numa largura maior só na hora de exportar, porque a tela
  // usa um raster leve (~1600px, suficiente pra editar, borrado pra imprimir).
  async function resolveExportBg(): Promise<TemplateBackground> {
    const url = activeTpl?.pdf_url
    if (!url) throw new DocumentRenderError('bg-load-failed', 'Sem modelo cadastrado.')
    if (isImageUrl(url)) {
      if (!bgImage) throw new DocumentRenderError('bg-load-failed', 'O papel timbrado ainda não carregou.')
      return { url, naturalW: bgImage.naturalW, naturalH: bgImage.naturalH }
    }
    return renderPdfPageToDataUrl(url, EXPORT_PDF_TARGET_WIDTH)
  }

  function exportErrorMessage(err: unknown): string {
    if (err instanceof DocumentRenderError) {
      if (err.reason === 'bg-load-failed') return 'Não foi possível carregar o papel timbrado. Verifique sua conexão e tente de novo.'
      if (err.reason === 'canvas-empty') return 'Não foi possível gerar o documento — tente novamente.'
    }
    return 'Não foi possível gerar o arquivo. Tente novamente.'
  }

  function currentRenderableFields(): RenderableField[] {
    return activeFields.map(f => ({ ...f, html: fieldRefs.current[f.key]?.innerHTML ?? '' }))
  }

  // Selo de verificação (QR + código + hash curto). Registra o documento emitido no servidor e devolve o HTML do
  // selo; null quando o tipo não recebe QR ou a opção está desligada. Falha vira erro visível (nunca imprime sem
  // avisar que o QR não saiu).
  async function buildStamp(): Promise<string | null> {
    if (!isVerifiableDocType(selectedType) || !includeQr || !clinic) return null
    const text = hasCalibratedFields
      ? activeFields.map(f => fieldRefs.current[f.key]?.innerText ?? '').join('\n')
      : (editorRef.current?.innerText ?? '')
    const hash = await contentHash(text)
    const r = await emitVerifiable({ patientId: patient.id, docType: selectedType, contentHash: hash, professionalId: responsibleProfessional?.id })
    return buildVerificationStamp({ qrDataUri: qrDataUri(r.url), url: r.url, code: formatCode(r.code), contentHash: hash })
  }

  function stampFailureMessage(err: unknown): string {
    const base = err instanceof Error ? err.message : 'Não foi possível gerar o QR de verificação.'
    return `${base} Desmarque "QR de verificação" para continuar sem ele.`
  }

  // O selo entra como um campo extra no rodapé do papel timbrado (mesmo gerador do download e da impressão).
  function withStampField(fields: RenderableField[], stampHtml: string | null): RenderableField[] {
    if (!stampHtml) return fields
    return [...fields, { key: '__verificacao', label: 'Verificação', kind: 'body', xPct: 6, yPct: 90, widthPct: 70, fontPt: 7, align: 'left', bold: false, html: stampHtml }]
  }

  async function handleDownload(kind: 'pdf' | 'image') {
    setDownloadMenuOpen(false)
    setExportError(null)
    const docInfo = DOC_TYPES.find(d => d.type === selectedType)
    const dateStr = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')
    const filename = safeFilename([patient.name, docInfo?.title ?? 'Documento', dateStr], kind === 'pdf' ? 'pdf' : 'png')
    setExporting(kind)
    try {
      let stamp: string | null = null
      try { stamp = await buildStamp() } catch (err) { setExportError(stampFailureMessage(err)); return }
      if (hasCalibratedFields) {
        // Gerador único (documentRender.ts) — o mesmo PDF que sai daqui é o
        // que a impressão usa, em resolução de impressão de verdade (300dpi,
        // encaixado numa A4 física), não uma captura da tela.
        const bg = await resolveExportBg()
        const { pdfBlob, pngBlob } = await composeCalibratedDoc(bg.url, bg.naturalW, bg.naturalH, withStampField(currentRenderableFields(), stamp))
        downloadBlob(kind === 'pdf' ? pdfBlob : pngBlob, filename)
      } else {
        const node = editorRef.current
        if (!node) throw new DocumentRenderError('unknown', 'O editor não está pronto.')
        // selo só durante a captura: sai do editor logo depois, sem sujar o rascunho
        const stampEl = stamp ? document.createElement('div') : null
        if (stampEl && stamp) { stampEl.innerHTML = stamp; node.appendChild(stampEl) }
        try {
          if (kind === 'pdf') await exportNodeAsPdf(node, filename)
          else await exportNodeAsImage(node, filename)
        } finally {
          stampEl?.remove()
        }
      }
    } catch (err) {
      setExportError(exportErrorMessage(err))
    } finally {
      setExporting(null)
    }
  }

  // Valor real de cada campo calibrado, pela chave do catálogo
  // (documentFieldCatalog.ts) — 'corpo' e os campos de comprador/fornecedor
  // ficam em branco de propósito (texto livre / preenchido na farmácia).
  function resolveFieldValue(key: string): string {
    const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    switch (key) {
      // Vira innerHTML do campo (fillFieldEl) — todo dado de usuário escapado.
      case 'paciente': return escapeHtml(patient.name)
      case 'data': return hoje
      case 'medico': return escapeHtml(responsibleProfessional?.name ?? user?.displayName ?? '')
      case 'registro': return escapeHtml(responsibleProfessional?.registration_number ?? '')
      case 'rqe': return escapeHtml(formatRqe(responsibleProfessional?.rqe))
      case 'endereco_paciente': return escapeHtml(patient.address ?? '')
      default: return ''
    }
  }

  // Autosave dos campos calibrados (debounce) — mesmo princípio do
  // handleInput de baixo, só que salva um mapa {chave: html} em vez de um
  // único blob, já que agora existem várias regiões editáveis.
  function handleFieldInput() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const values: Record<string, string> = {}
      for (const f of activeFields) values[f.key] = fieldRefs.current[f.key]?.innerHTML ?? ''
      try { localStorage.setItem(draftKey(selectedType), JSON.stringify(values)) } catch { /* ignore */ }
    }, 500)
  }

  const draftKey = (type: DocumentTemplateType) => `doc-draft:${patient.id}:${type}`

  useEffect(() => {
    // TabDocumentos só renderiza dentro do app autenticado (clinic sempre presente).
    if (!clinic?.id) return
    supabase
      .from('clinic_document_templates')
      .select('*')
      .eq('clinic_id', clinic.id)
      .then(({ data }) => {
        setTemplates((data ?? []) as ClinicDocumentTemplate[])
        setTemplatesLoaded(true)
      })
  }, [clinic?.id])

  useEffect(() => {
    loadTemplateBg(activeTpl?.pdf_url ?? null)
  }, [activeTpl?.pdf_url, loadTemplateBg])

  // Preenche o editor com o template padrão do tipo (sobrescreve o conteúdo atual)
  const seedEditor = useCallback((type: DocumentTemplateType, bodyHtml?: string) => {
    if (!editorRef.current) return
    const docInfo = DOC_TYPES.find(d => d.type === type) ?? DOC_TYPES[0]
    const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    const tpl = templates.find(t => t.type === type)

    if (tpl) {
      // Com modelo PDF: conteúdo mínimo por cima do fundo
      editorRef.current.innerHTML = buildLetterheadPatientBlock(patient.name, hoje) + (bodyHtml ?? '')
    } else {
      // Sem modelo: template HTML padrão do sistema (letterhead clínico-editorial)
      editorRef.current.innerHTML = buildDefaultTemplate({
        type,
        title: docInfo.title,
        patientName: patient.name,
        patientAddress: patient.address ?? '',
        date: hoje,
        clinicName: clinic?.name ?? '',
        clinicAddress: clinic?.address ?? '',
        clinicPhone: formatBrPhone(clinic?.phone),
        clinicColor: clinic?.color || '#4DD9C0',
        doctorName: responsibleProfessional?.name ?? user?.displayName ?? '',
        registrationNumber: responsibleProfessional?.registration_number ?? '',
        council,
        rqe: responsibleProfessional?.rqe ?? '',
        professionalId: responsibleProfessional?.id,
        body: bodyHtml ?? docInfo.body ?? '',
        clinicLogo: clinic?.logo,
      })
    }
  }, [templates, patient.name, patient.address, clinic?.name, clinic?.address, clinic?.phone, clinic?.color, clinic?.logo, user?.displayName, responsibleProfessional, DOC_TYPES, council])

  // Ao trocar de tipo (ou na 1ª carga): restaura rascunho salvo ou semeia o template.
  // Só roda quando o TIPO muda — nunca em reloads de `templates` — para não apagar a edição.
  // Modelo calibrado tem sua própria semeadura (efeito abaixo, perto do render) —
  // aqui é só o caminho de sempre (sem calibração).
  useEffect(() => {
    if (hasCalibratedFields) {
      // O <div> "freeform" (key="freeform") é desmontado enquanto estamos
      // num tipo calibrado — invalida o cache pra reseemar do zero quando
      // voltar pra um tipo sem calibração, já que o node antigo não existe
      // mais (sem isso, "já semeei esse tipo antes" ficava errado e o
      // editor voltava vazio).
      seededTypeRef.current = null
      return
    }
    if (!templatesLoaded || !professionalsReady || !editorRef.current) return
    if (seededTypeRef.current === selectedType) return
    seededTypeRef.current = selectedType

    let draft: string | null = null
    try { draft = localStorage.getItem(draftKey(selectedType)) } catch { /* ignore */ }
    if (draft) {
      editorRef.current.innerHTML = draft
    } else {
      seedEditor(selectedType)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType, templatesLoaded, professionalsReady, hasCalibratedFields])

  // Trocou o profissional responsável (ou os profissionais terminaram de
  // carregar depois do seed) no editor padrão: troca SÓ o bloco de assinatura
  // (nome + conselho/registro) — o resto do texto, já editado, fica intacto.
  // Os blocos levam o id do profissional que os gerou (data-prof), então isso
  // também corrige rascunhos restaurados de outro responsável. Rascunho antigo
  // sem essas marcas não é tocado (não há como separar a assinatura do texto).
  useEffect(() => {
    if (hasCalibratedFields || !templatesLoaded || !professionalsReady) return
    const root = editorRef.current
    if (!root || seededTypeRef.current !== selectedType) return
    syncSignerBlocks(root, {
      doctorName: responsibleProfessional?.name ?? user?.displayName ?? '',
      registrationNumber: responsibleProfessional?.registration_number ?? '',
      council,
      rqe: responsibleProfessional?.rqe ?? '',
      professionalId: responsibleProfessional?.id,
      clinicAddress: clinic?.address ?? '',
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responsibleProfessional?.id, selectedType, templatesLoaded, professionalsReady, hasCalibratedFields])

  // Autosave do conteúdo (debounce) — protege contra "saiu e perdeu"
  function handleInput() {
    if (!editorRef.current) return
    const html = editorRef.current.innerHTML
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      try { localStorage.setItem(draftKey(selectedType), html) } catch { /* ignore */ }
    }, 500)
  }

  // Limpa o rascunho e recomeça do template padrão (ou dos valores reais, se calibrado)
  function handleClear() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    try { localStorage.removeItem(draftKey(selectedType)) } catch { /* ignore */ }
    if (hasCalibratedFields) {
      for (const f of activeFields) fillFieldEl(f.key, resolveFieldValue(f.key))
    } else {
      seedEditor(selectedType)
    }
  }

  // Escreve o valor de um campo calibrado E dispara 'input' — o
  // ResizeObserver do TemplateFieldCanvas nem sempre pega quando o campo
  // ENCOLHE (só innerHTML mudando por fora do React, sem digitação real);
  // o evento força o recálculo da altura do canvas pelo mesmo caminho que
  // já funciona quando o profissional digita de verdade, evitando ficar
  // com um canvas "crescido demais" depois de Limpar/trocar de tipo.
  function fillFieldEl(key: string, html: string) {
    const el = fieldRefs.current[key]
    if (!el) return
    el.innerHTML = html
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }

  function execCmd(cmd: string, value?: string) {
    document.execCommand(cmd, false, value)
    if (hasCalibratedFields) {
      const key = lastFocusedFieldKeyRef.current
      if (key) { fieldRefs.current[key]?.focus(); handleFieldInput() }
    } else {
      editorRef.current?.focus()
      handleInput()
    }
  }

  async function handlePrint() {
    setExportError(null)
    if (hasCalibratedFields) {
      // A aba de impressão abre AGORA, síncrono, ainda dentro do clique —
      // não depois do PDF pronto. composeCalibratedDoc é assíncrono (1-3s,
      // renderiza em 300dpi) e abrir a aba só depois desse await perde o
      // "gesto do usuário": o navegador bloqueia o popup em silêncio (
      // confirmado ao vivo). Mesmo gerador do download (documentRender.ts)
      // — imprime o PDF que acabou de ser montado, não um HTML paralelo:
      // impresso ≡ baixado, sempre os mesmos bytes.
      const printWin = openPrintWindow()
      if (!printWin) {
        setExportError('Não abriu a impressão — seu navegador bloqueou o pop-up. Libere pop-ups para este site e tente de novo.')
        return
      }
      setPrinting(true)
      try {
        let stamp: string | null = null
        try { stamp = await buildStamp() } catch (err) { printWin.close(); setExportError(stampFailureMessage(err)); return }
        const bg = await resolveExportBg()
        const { pdfBlob } = await composeCalibratedDoc(bg.url, bg.naturalW, bg.naturalH, withStampField(currentRenderableFields(), stamp))
        printBlobInWindow(printWin, pdfBlob)
      } catch (err) {
        printWin.close()
        setExportError(exportErrorMessage(err))
      } finally {
        setPrinting(false)
      }
    } else {
      if (!editorRef.current) return
      if (!(isVerifiableDocType(selectedType) && includeQr)) {
        printDocumento(editorRef.current.innerHTML, bgImage?.url ?? null)
        return
      }
      // Com QR há uma chamada ao servidor antes de imprimir: a aba abre AGORA, ainda dentro do clique.
      const printWin = openPrintWindow()
      if (!printWin) {
        setExportError('Não abriu a impressão — seu navegador bloqueou o pop-up. Libere pop-ups para este site e tente de novo.')
        return
      }
      setPrinting(true)
      try {
        const stamp = await buildStamp()
        await printHtmlInWindow(printWin, buildDocumentoHtml(editorRef.current.innerHTML + (stamp ?? ''), bgImage?.url ?? null))
      } catch (err) {
        printWin.close()
        setExportError(stampFailureMessage(err))
      } finally {
        setPrinting(false)
      }
    }
  }

  const hasPdf = templates.some(t => t.type === selectedType)

  // Mede a largura real disponível pra calcular o tamanho do fundo — precisa
  // ser em px (não % do CSS) porque o limite é o tamanho NATURAL da imagem,
  // não o container. Observa o WRAP (não o editor em si) porque no modo
  // calibrado não existe um único ".editor" — o wrap é o único elemento
  // presente nos dois modos. Reobserva quando a janela muda de largura
  // (resize, mobile↔desktop) pra não deixar o fundo desatualizado.
  useEffect(() => {
    if (!editorWrapRef.current) return
    const el = editorWrapRef.current
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w) setEditorWidth(w)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // backgroundSize nunca amplia além do tamanho natural do arquivo (evita o
  // borrão); minHeight garante que a altura da caixa acompanha a proporção
  // real do papel timbrado (evita cortar a parte de baixo quando o texto
  // digitado é curto — antes a altura vinha só do conteúdo, nunca do fundo).
  const bgCanvasSize = bgImage ? getTemplateCanvasSize(editorWidth, bgImage.naturalW, bgImage.naturalH) : { width: 0, height: 0 }
  const bgRenderedWidth = bgCanvasSize.width
  const bgStyle = bgImage && bgRenderedWidth
    ? {
        backgroundImage: `url(${bgImage.url})`,
        backgroundSize: `${bgRenderedWidth}px auto`,
        backgroundRepeat: 'no-repeat' as const,
        backgroundPosition: 'top center',
        minHeight: bgCanvasSize.height,
      }
    : undefined

  // Semeadura dos campos calibrados — só roda quando o CANVAS já tem
  // tamanho real (bgCanvasSize.width > 0), já que TemplateFieldCanvas só
  // existe no DOM (e fieldRefs só ficam populados) depois que o fundo
  // carrega. Reusa rascunho salvo (mapa {chave: html}) se existir.
  useEffect(() => {
    if (!hasCalibratedFields) {
      // Simétrico ao freeform: o canvas calibrado (key="calibrated") também
      // é desmontado enquanto estamos num tipo sem calibração — invalida o
      // cache pra reseemar do zero na próxima vez que entrar num calibrado.
      seededFieldsTypeRef.current = null
      return
    }
    if (!bgCanvasSize.width) return
    if (seededFieldsTypeRef.current === selectedType) return
    seededFieldsTypeRef.current = selectedType
    lastProfessionalIdRef.current = responsibleProfessional?.id

    let draft: Record<string, string> | null = null
    try {
      const raw = localStorage.getItem(draftKey(selectedType))
      if (raw) draft = JSON.parse(raw)
    } catch { /* ignore */ }

    for (const f of activeFields) fillFieldEl(f.key, draft?.[f.key] ?? resolveFieldValue(f.key))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCalibratedFields, bgCanvasSize.width, selectedType])

  // Trocar o profissional responsável (seletor no topo, quando a recepção
  // preenche em nome de outro) reescreve SÓ os campos automáticos ligados a
  // ele (nome, registro) — sem isso, o documento calibrado ficava assinado
  // com o nome/registro de quem estava selecionado quando a página abriu,
  // mesmo depois de trocar. Roda separado da semeadura (acima) pra não
  // apagar o que já foi digitado no corpo/campos livres.
  useEffect(() => {
    if (!hasCalibratedFields) return
    if (seededFieldsTypeRef.current !== selectedType) return
    const profId = responsibleProfessional?.id
    if (lastProfessionalIdRef.current === profId) return
    lastProfessionalIdRef.current = profId
    for (const f of activeFields) {
      if (f.key === 'medico' || f.key === 'registro' || f.key === 'rqe') fillFieldEl(f.key, resolveFieldValue(f.key))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCalibratedFields, selectedType, responsibleProfessional?.id])

  // "Gerar documento" do formulário estruturado: abre o editor e, assim que ele (ou o canvas calibrado) estiver pronto,
  // escreve o texto no corpo. Em papel timbrado calibrado o texto vai para o campo "Texto do documento".
  useEffect(() => {
    if (!bodyRequest || appliedSeqRef.current === bodyRequest.seq || !editorOpen || !templatesLoaded || !professionalsReady) return
    const html = textToBodyHtml(bodyRequest.text)
    if (hasCalibratedFields) {
      if (seededFieldsTypeRef.current !== selectedType || !fieldRefs.current.corpo) {
        if (!activeFields.some(f => f.key === 'corpo')) {
          appliedSeqRef.current = bodyRequest.seq
          showToast('error', 'O papel timbrado deste documento não tem o campo "Texto do documento". Calibre-o em Configurações ou use o editor livre.')
        }
        return
      }
      fillFieldEl('corpo', html)
      handleFieldInput()
    } else {
      if (!editorRef.current || seededTypeRef.current !== selectedType) return
      seedEditor(selectedType, html)
      handleInput()
    }
    appliedSeqRef.current = bodyRequest.seq
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyRequest, editorOpen, templatesLoaded, professionalsReady, hasCalibratedFields, bgCanvasSize.width, selectedType])

  // A impressão do documento em edição vai para o menu "Imprimir" do prontuário (não há botão próprio aqui)
  const docLabel = DOC_TYPES.find(d => d.type === selectedType)?.label ?? 'Documento'
  const docBusy = exporting !== null || printing
  usePrintActions('documentos', [{
    id: 'documento-editor',
    label: `Documento em edição: ${docLabel}`,
    includes: [
      'O texto como está no editor agora, com o papel timbrado da clínica quando houver',
      ...(isVerifiableDocType(selectedType) && includeQr ? ['QR de verificação do documento'] : []),
    ],
    disabledReason: editorHidden ? 'Preencha o formulário e clique em Gerar documento' : docBusy ? 'Gerando o documento, aguarde' : hasCalibratedFields && loadingBg ? 'Aguardando o papel timbrado carregar' : undefined,
    run: handlePrint,
  }])

  return (
    <div className={styles.wrap}>
      <PillTabs
        label="Documentos e contratos"
        options={[{ value: 'documentos', label: 'Documentos clínicos' }, { value: 'contratos', label: 'Contratos' }]}
        value={section}
        onChange={setSection}
      />
      <div style={{ display: section === 'documentos' ? undefined : 'none' }} className={styles.wrap}>
      {/* Seletor de tipo */}
      <div className={styles.typeTabs}>
        {DOC_TYPES.map(d => (
          <button
            key={d.type}
            className={`${styles.typeTab} ${selectedType === d.type ? styles.typeTabActive : ''}`}
            onClick={() => setSelectedType(d.type)}
          >
            {d.label}
          </button>
        ))}
      </div>

      {needsProfessionalPicker && (
        <div className={styles.professionalPicker}>
          <label htmlFor="doc-professional-select">Profissional responsável</label>
          <SelectMenu
            variant="field"
            id="doc-professional-select"
            value={manualProfessionalId}
            onChange={setManualProfessionalId}
            options={professionals.map(p => ({ value: p.id, label: p.name }))}
          />
        </div>
      )}

      {structuredKind && (
        <>
          <AtestadoEstruturado
            key={structuredKind}
            kind={structuredKind}
            fields={structuredFields}
            modelos={clinicModelMap}
            loading={!templatesLoaded || !professionalsReady}
            onApply={text => { setBodyRequest({ seq: ++requestSeqRef.current, text }); setEditorOpen(true) }}
          />
          <ImportarModelo kind={structuredKind} modelos={clinicModels} canEdit={canEditProntuario} onChanged={reloadClinicModels} />
          <div className={structured.advanced}>
            <p className={structured.advancedHint}>{editorOpen ? 'Documento pronto abaixo. Você pode ajustar o texto direto no editor.' : 'Quer escrever o documento por conta própria? O editor livre fica recolhido.'}</p>
            <button type="button" className={btn.secondary} aria-expanded={editorOpen} onClick={() => setEditorOpen(o => !o)}>{editorOpen ? 'Recolher o editor livre' : 'Abrir o editor livre (avançado)'}</button>
          </div>
        </>
      )}

      <div className={editorHidden ? structured.hiddenKeepMounted : undefined}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <button className={styles.toolBtn} onMouseDown={e => { e.preventDefault(); execCmd('bold') }} title="Negrito"><b>N</b></button>
        <button className={styles.toolBtn} onMouseDown={e => { e.preventDefault(); execCmd('italic') }} title="Itálico"><i>I</i></button>
        <button className={styles.toolBtn} onMouseDown={e => { e.preventDefault(); execCmd('underline') }} title="Sublinhado"><u>S</u></button>
        <button className={styles.toolBtn} onMouseDown={e => { e.preventDefault(); execCmd('insertUnorderedList') }} title="Lista">≡</button>
        <div className={styles.toolSep} />
        <select className={styles.toolSelect} onChange={e => execCmd('fontSize', e.target.value)} defaultValue="3">
          <option value="2">Pequeno</option>
          <option value="3">Normal</option>
          <option value="4">Grande</option>
        </select>
        <div className={styles.toolSep} />
        <button className={styles.toolBtn} onClick={handleClear} title="Limpar e recomeçar do modelo">Limpar</button>
        {isVerifiableDocType(selectedType) && (
          <label className={styles.qrToggle} title="Imprime um QR que leva à página pública de verificação (clínica, tipo, data, profissional e hash). Não mostra o conteúdo.">
            <input type="checkbox" checked={includeQr} onChange={e => setIncludeQr(e.target.checked)} />
            QR de verificação
          </label>
        )}
        <button
          ref={downloadTriggerRef}
          className={styles.btnDownload}
          onClick={() => setDownloadMenuOpen(o => !o)}
          disabled={editorHidden || exporting !== null || printing || (hasCalibratedFields && loadingBg)}
          title={hasCalibratedFields && loadingBg ? 'Aguardando o papel timbrado carregar...' : undefined}
        >
          <Icon name="download" size={14} />
          {exporting ? 'Gerando...' : 'Baixar'}
        </button>
      </div>

      {exportError && (
        <div className={styles.exportErrorBanner} role="alert">
          {exportError}
          <button className={styles.exportErrorClose} onClick={() => setExportError(null)} aria-label="Fechar">
            <span aria-hidden>×</span>
          </button>
        </div>
      )}

      {downloadMenuOpen && (
        <Portal>
          <div ref={downloadPopoverRef} className={styles.downloadPopover} style={{ top: menuCoords.top, left: menuCoords.left }}>
            <button className={styles.downloadOption} onClick={() => handleDownload('pdf')}>Baixar como PDF</button>
            <button className={styles.downloadOption} onClick={() => handleDownload('image')}>Baixar como imagem</button>
          </div>
        </Portal>
      )}

      {DOC_TYPES.find(d => d.type === selectedType)?.reviewNote && !hasCalibratedFields && (
        <p className={styles.reviewNote} role="note">
          <Icon name="info" size={14} /> {REVIEW_NOTE}
        </p>
      )}

      {/* Área de edição */}
      <div className={styles.editorWrap} ref={editorWrapRef}>
        {loadingBg && <div className={styles.bgLoading}>Carregando modelo...</div>}
        {!loadingBg && bgError && hasPdf && (
          <div className={styles.bgLoading}>Não foi possível carregar o papel timbrado. Recarregue a página e tente de novo.</div>
        )}
        {hasCalibratedFields && bgImage ? (
          // key força o React a desmontar o node anterior em vez de reaproveitar
          // o mesmo <div> — o ramo de baixo escreve innerHTML por fora do React
          // (ref.innerHTML =), então sem isso o React não sabia que precisava
          // limpar aquele conteúdo ao trocar de ramo e ele ficava sobrando,
          // sobreposto ao canvas novo.
          <div key="calibrated" className={styles.calibratedScroll}>
            <TemplateFieldCanvas
              ref={canvasRef}
              bgUrl={bgImage.url}
              width={bgCanvasSize.width}
              height={bgCanvasSize.height}
              fields={activeFields}
              mode="fill"
              fieldRefs={fieldRefs}
              onFieldInput={handleFieldInput}
              onFieldFocus={key => { lastFocusedFieldKeyRef.current = key }}
            />
          </div>
        ) : (
          <div
            key="freeform"
            className={styles.editor}
            style={bgStyle}
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            spellCheck
            onInput={handleInput}
          />
        )}
        {!hasPdf && (
          <p className={styles.noTemplateHint}>
            Sem modelo PDF cadastrado — usando template padrão. Para usar seu papel timbrado,{' '}
            <a href="/configuracoes" className={styles.hintLink}>acesse Configurações → Modelos de Documentos</a>.
          </p>
        )}
      </div>
      </div>
      </div>
      {/* Contratos do paciente (com status). Fica montado para o menu Imprimir enxergar os assinados. */}
      <div style={{ display: section === 'contratos' ? undefined : 'none' }}>
        <ContratosPaciente patient={patient} legacyText={contractText ?? ''} planItems={planItems} defaultProfessionalId={responsibleProfessional?.id ?? null} />
      </div>
    </div>
  )
}
