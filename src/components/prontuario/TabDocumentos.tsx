'use client'
import { formatBrPhone } from '@/lib/phoneFormat'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { printDocumento } from '@/lib/print'
import { exportNodeAsImage, exportNodeAsPdf, safeFilename } from '@/lib/documentExport'
import { composeCalibratedDoc, downloadBlob, openPrintWindow, printBlobInWindow, DocumentRenderError, EXPORT_PDF_TARGET_WIDTH, type RenderableField } from '@/lib/documentRender'
import { getSpecialtyConfig } from '@/lib/specialtyConfig'
import { useProfessionals } from '@/hooks/useClinicData'
import { useTemplateBackground, renderPdfPageToDataUrl, isImageUrl, type TemplateBackground } from '@/hooks/useTemplateBackground'
import { Portal } from '@/components/ui/Portal'
import { Icon } from '@/components/ui/Icon'
import { TemplateFieldCanvas } from '@/components/documentos/TemplateFieldCanvas'
import { getTemplateCanvasSize } from '@/lib/templateCanvasSize'
import type { Patient, ClinicDocumentTemplate, DocumentTemplateType, FieldPosition } from '@/types'
import styles from './TabDocumentos.module.css'

interface Props {
  patient: Patient
}

export function TabDocumentos({ patient }: Props) {
  const { clinic, user } = useAuthStore()
  const DOC_TYPES = getSpecialtyConfig(clinic?.type).documents

  // Profissional responsável pelo documento — assina e empresta o registro
  // (CRO/CRM) pro cabeçalho, em vez de assumir que é sempre quem está
  // logado (a recepção pode estar preenchendo em nome de outro profissional).
  const { data: professionals = [] } = useProfessionals(clinic?.id)
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
  const [selectedType, setSelectedType] = useState<DocumentTemplateType>(DOC_TYPES[0]?.type ?? 'declaracao_comparecimento')
  const [templates, setTemplates] = useState<ClinicDocumentTemplate[]>([])
  const [templatesLoaded, setTemplatesLoaded] = useState(false)
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

  async function handleDownload(kind: 'pdf' | 'image') {
    setDownloadMenuOpen(false)
    setExportError(null)
    const docInfo = DOC_TYPES.find(d => d.type === selectedType)
    const dateStr = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')
    const filename = safeFilename([patient.name, docInfo?.title ?? 'Documento', dateStr], kind === 'pdf' ? 'pdf' : 'png')
    setExporting(kind)
    try {
      if (hasCalibratedFields) {
        // Gerador único (documentRender.ts) — o mesmo PDF que sai daqui é o
        // que a impressão usa, em resolução de impressão de verdade (300dpi,
        // encaixado numa A4 física), não uma captura da tela.
        const bg = await resolveExportBg()
        const { pdfBlob, pngBlob } = await composeCalibratedDoc(bg.url, bg.naturalW, bg.naturalH, currentRenderableFields())
        downloadBlob(kind === 'pdf' ? pdfBlob : pngBlob, filename)
      } else {
        const node = editorRef.current
        if (!node) throw new DocumentRenderError('unknown', 'O editor não está pronto.')
        if (kind === 'pdf') await exportNodeAsPdf(node, filename)
        else await exportNodeAsImage(node, filename)
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
      case 'paciente': return patient.name
      case 'data': return hoje
      case 'medico': return responsibleProfessional?.name ?? user?.displayName ?? ''
      case 'registro': return responsibleProfessional?.registration_number ?? ''
      case 'endereco_paciente': return patient.address ?? ''
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
  const seedEditor = useCallback((type: DocumentTemplateType) => {
    if (!editorRef.current) return
    const docInfo = DOC_TYPES.find(d => d.type === type)!
    const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    const tpl = templates.find(t => t.type === type)

    if (tpl) {
      // Com modelo PDF: conteúdo mínimo por cima do fundo
      editorRef.current.innerHTML = `<p><strong>Paciente:</strong> ${patient.name}</p><p><strong>Data:</strong> ${hoje}</p><br><p></p>`
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
        clinicLogo: clinic?.logo,
      })
    }
  }, [templates, patient.name, patient.address, clinic?.name, clinic?.address, clinic?.phone, clinic?.color, clinic?.logo, user?.displayName, responsibleProfessional])

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
    if (!templatesLoaded || !editorRef.current) return
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
  }, [selectedType, templatesLoaded, hasCalibratedFields])

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
        const bg = await resolveExportBg()
        const { pdfBlob } = await composeCalibratedDoc(bg.url, bg.naturalW, bg.naturalH, currentRenderableFields())
        printBlobInWindow(printWin, pdfBlob)
      } catch (err) {
        printWin.close()
        setExportError(exportErrorMessage(err))
      } finally {
        setPrinting(false)
      }
    } else {
      if (!editorRef.current) return
      printDocumento(editorRef.current.innerHTML, bgImage?.url ?? null)
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
      if (f.key === 'medico' || f.key === 'registro') fillFieldEl(f.key, resolveFieldValue(f.key))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCalibratedFields, selectedType, responsibleProfessional?.id])

  return (
    <div className={styles.wrap}>
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
          <select
            id="doc-professional-select"
            value={manualProfessionalId}
            onChange={e => setManualProfessionalId(e.target.value)}
          >
            {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

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
        <button
          ref={downloadTriggerRef}
          className={styles.btnDownload}
          onClick={() => setDownloadMenuOpen(o => !o)}
          disabled={exporting !== null || printing || (hasCalibratedFields && loadingBg)}
          title={hasCalibratedFields && loadingBg ? 'Aguardando o papel timbrado carregar...' : undefined}
        >
          <Icon name="download" size={14} />
          {exporting ? 'Gerando...' : 'Baixar'}
        </button>
        <button
          className={styles.btnPrint}
          onClick={handlePrint}
          disabled={exporting !== null || printing || (hasCalibratedFields && loadingBg)}
          title={hasCalibratedFields && loadingBg ? 'Aguardando o papel timbrado carregar...' : undefined}
        >
          {printing ? 'Gerando...' : 'Imprimir'}
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
  )
}

interface DefaultTemplateArgs {
  type: DocumentTemplateType
  title: string
  patientName: string
  patientAddress: string
  date: string
  clinicName: string
  clinicAddress: string
  clinicPhone: string
  clinicColor: string
  doctorName: string
  registrationNumber: string
  clinicLogo?: string
}

// Linha de campo — quando tem valor, mostra "Rótulo: valor"; sem valor,
// mostra "Rótulo:" com um traço em branco pra preencher à mão.
function fieldLine(label: string, value: string) {
  return value
    ? `<p style="margin:0 0 9px">${label}: <strong>${value}</strong></p>`
    : `<p style="margin:0 0 9px">${label}: <span style="display:inline-block;min-width:140px;border-bottom:1px solid #5B665F">&nbsp;</span></p>`
}

// Modelo padrão do sistema (sem PDF próprio cadastrado) — direção
// "clínico-editorial": letterhead com filete na cor da clínica, título em
// caixa alta, corpo em serif (reforça "documento oficial"), rodapé de
// contato. Mesma estrutura de dados de sempre (paciente/data/assinatura),
// só a apresentação mudou.
function buildDefaultTemplate({ type, title, patientName, patientAddress, date, clinicName, clinicAddress, clinicPhone, clinicColor, doctorName, registrationNumber, clinicLogo }: DefaultTemplateArgs) {
  const initials = clinicName.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || 'C'
  const contactLine = [clinicAddress, clinicPhone].filter(Boolean).join(' · ')

  const letterhead = `
    <div style="height:3px;width:100%;background:${clinicColor};margin-bottom:22px"></div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding-bottom:16px;border-bottom:1px solid #E1E6E2;margin-bottom:24px;font-family:-apple-system,sans-serif">
      <div style="display:flex;align-items:center;gap:12px">
        ${clinicLogo
          ? `<img src="${clinicLogo}" alt="Logo" style="height:40px;width:auto;max-width:80px;object-fit:contain" />`
          : `<div style="width:38px;height:38px;border-radius:50%;background:${clinicColor};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0">${initials}</div>`
        }
        <p style="font-size:16px;font-weight:700;margin:0;color:#1D2421;font-family:Georgia,'Times New Roman',serif">${clinicName}</p>
      </div>
      ${contactLine ? `<div style="font-size:11px;line-height:1.5;color:#5B665F;text-align:right;white-space:nowrap">${contactLine}</div>` : ''}
    </div>`

  const footer = contactLine ? `
    <div style="height:1px;background:${clinicColor};opacity:.55;margin:30px 0 10px"></div>
    <p style="font-family:-apple-system,sans-serif;font-size:10px;color:#5B665F;text-align:center;margin:0">${clinicName} · ${contactLine}</p>
  ` : ''

  if (type === 'receita_especial') {
    // Estrutura legal da receita de controle especial: identificação do
    // emitente (com registro profissional), paciente, prescrição, e os
    // blocos de comprador/fornecedor que a farmácia preenche na hora da
    // compra (sempre em branco — não tem como o sistema saber isso antes).
    return `
      ${letterhead}
      <h2 style="text-align:center;font-size:14px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#1D2421;margin:4px 0 2px;font-family:Georgia,'Times New Roman',serif">${title}</h2>
      <p style="font-family:-apple-system,sans-serif;font-size:11px;color:#5B665F;text-align:right;line-height:1.5;margin:0 0 16px">1ª via — Retenção da farmácia ou drogaria<br>2ª via — Orientação ao paciente</p>

      <div style="border:1px solid #5B665F;border-radius:2px;margin-bottom:14px">
        <div style="font-family:-apple-system,sans-serif;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;background:#F3F6F4;color:#1D2421;padding:5px 10px;border-bottom:1px solid #5B665F">Identificação do emitente</div>
        <div style="padding:10px 12px 12px;font-family:-apple-system,sans-serif;font-size:12px;color:#2B3430">
          ${fieldLine('Nome completo', doctorName)}
          ${registrationNumber ? fieldLine('Registro profissional', registrationNumber) : `<p style="margin:0 0 9px">CRO/CRM: <span style="display:inline-block;min-width:70px;border-bottom:1px solid #5B665F">&nbsp;</span> &nbsp;&nbsp; UF: <span style="display:inline-block;min-width:70px;border-bottom:1px solid #5B665F">&nbsp;</span></p>`}
          ${fieldLine('Endereço', clinicAddress)}
        </div>
      </div>

      <div style="font-family:-apple-system,sans-serif;font-size:12px;color:#2B3430">
        ${fieldLine('Paciente', patientName)}
        ${fieldLine('Endereço', patientAddress)}
      </div>

      <p style="font-family:-apple-system,sans-serif;font-size:12px;font-weight:700;color:#1D2421;margin:12px 0 6px">Prescrição</p>
      <div style="border:1px solid #E1E6E2;border-radius:2px;min-height:170px;padding:8px"><p><br></p></div>

      <p style="text-align:right;font-family:Georgia,'Times New Roman',serif;font-size:13px;color:#2B3430;margin:14px 0 16px">Data ____ / ____ / ${new Date().getFullYear()}</p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div style="border:1px solid #5B665F;border-radius:2px">
          <div style="font-family:-apple-system,sans-serif;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;background:#F3F6F4;color:#1D2421;padding:5px 10px;border-bottom:1px solid #5B665F">Identificação do comprador</div>
          <div style="padding:10px 12px 12px;font-family:-apple-system,sans-serif;font-size:11px;color:#2B3430">
            <p style="margin:0 0 8px">Nome: <span style="display:inline-block;min-width:60%;border-bottom:1px solid #5B665F">&nbsp;</span></p>
            <p style="margin:0 0 8px">Ident.: <span style="display:inline-block;min-width:55%;border-bottom:1px solid #5B665F">&nbsp;</span></p>
            <p style="margin:0 0 8px">Órgão emissor: <span style="display:inline-block;min-width:40%;border-bottom:1px solid #5B665F">&nbsp;</span></p>
            <p style="margin:0 0 8px">Endereço: <span style="display:inline-block;min-width:55%;border-bottom:1px solid #5B665F">&nbsp;</span></p>
            <p style="margin:0 0 8px">Cidade: <span style="display:inline-block;min-width:35%;border-bottom:1px solid #5B665F">&nbsp;</span> &nbsp; UF: <span style="display:inline-block;min-width:12%;border-bottom:1px solid #5B665F">&nbsp;</span></p>
            <p style="margin:0">Telefone: <span style="display:inline-block;min-width:50%;border-bottom:1px solid #5B665F">&nbsp;</span></p>
          </div>
        </div>
        <div style="border:1px solid #5B665F;border-radius:2px;display:flex;flex-direction:column">
          <div style="font-family:-apple-system,sans-serif;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;background:#F3F6F4;color:#1D2421;padding:5px 10px;border-bottom:1px solid #5B665F">Identificação do fornecedor</div>
          <div style="padding:10px 12px 12px;flex:1;display:flex;align-items:flex-end">
            <p style="width:100%;display:flex;justify-content:space-between;font-family:-apple-system,sans-serif;font-size:10px;color:#5B665F;margin:0;padding-top:8px;border-top:1px solid #5B665F">
              <span>Assinatura do farmacêutico</span><span>Data ___/___/___</span>
            </p>
          </div>
        </div>
      </div>
      ${footer}
    `
  }

  return `
    ${letterhead}
    <h2 style="text-align:center;font-size:14px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#1D2421;margin:0 0 26px">${title}</h2>
    <p style="font-family:-apple-system,sans-serif;font-size:12px;color:#5B665F;margin:0 0 4px"><strong style="color:#2B3430">Paciente:</strong> ${patientName}</p>
    <p style="font-family:-apple-system,sans-serif;font-size:12px;color:#5B665F;margin:0 0 24px"><strong style="color:#2B3430">Data:</strong> ${date}</p>
    <p></p>
    <br><br><br>
    <div style="margin:0 auto 4px;padding-top:10px;border-top:1px solid #1D2421;width:62%;text-align:center">
      <p style="margin:0;font-size:13px">${doctorName}</p>
      <p style="font-family:-apple-system,sans-serif;font-size:10px;color:#5B665F;margin-top:2px">Assinatura e carimbo</p>
    </div>
    ${footer}
  `
}
