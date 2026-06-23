'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { printDocumento } from '@/lib/print'
import type { Patient, ClinicDocumentTemplate, DocumentTemplateType } from '@/types'
import styles from './TabDocumentos.module.css'

const DOC_TYPES: { type: DocumentTemplateType; label: string; title: string }[] = [
  { type: 'receita_comum',               label: 'Receita Comum',               title: 'RECEITA MÉDICA' },
  { type: 'receita_especial',            label: 'Receita Especial',             title: 'RECEITA DE CONTROLE ESPECIAL' },
  { type: 'declaracao_comparecimento',   label: 'Declaração de Comparecimento', title: 'DECLARAÇÃO DE COMPARECIMENTO' },
  { type: 'atestado',                    label: 'Atestado',                     title: 'ATESTADO MÉDICO' },
]

interface Props {
  patient: Patient
}

export function TabDocumentos({ patient }: Props) {
  const { clinic, user } = useAuthStore()
  const [selectedType, setSelectedType] = useState<DocumentTemplateType>('receita_comum')
  const [templates, setTemplates] = useState<ClinicDocumentTemplate[]>([])
  const [templatesLoaded, setTemplatesLoaded] = useState(false)
  const [bgImage, setBgImage] = useState<string | null>(null)
  const [loadingBg, setLoadingBg] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  // Tipo já semeado no editor — evita que reloads de `templates` sobrescrevam o que o usuário digitou
  const seededTypeRef = useRef<DocumentTemplateType | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const loadBackground = useCallback(async (type: DocumentTemplateType) => {
    const tpl = templates.find(t => t.type === type)
    if (!tpl) { setBgImage(null); return }
    setLoadingBg(true)
    try {
      const url = tpl.pdf_url
      const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(url)
      if (isImage) {
        // Imagem: usa diretamente como background
        setBgImage(url)
      } else {
        // PDF: converte primeira página via pdfjs
        const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
        GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
        const res = await fetch(url)
        const buf = await res.arrayBuffer()
        const pdf = await getDocument({ data: buf }).promise
        const page = await pdf.getPage(1)
        const viewport = page.getViewport({ scale: 1.5 })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')!
        await page.render({ canvasContext: ctx, viewport, canvas }).promise
        setBgImage(canvas.toDataURL('image/png'))
      }
    } catch {
      setBgImage(null)
    } finally {
      setLoadingBg(false)
    }
  }, [templates])

  useEffect(() => {
    loadBackground(selectedType)
  }, [selectedType, loadBackground])

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
      // Sem modelo: template HTML padrão do sistema
      editorRef.current.innerHTML = buildDefaultTemplate(docInfo.title, patient.name, hoje, clinic?.name ?? '', user?.displayName ?? '', clinic?.logo)
    }
  }, [templates, patient.name, clinic?.name, clinic?.logo, user?.displayName])

  // Ao trocar de tipo (ou na 1ª carga): restaura rascunho salvo ou semeia o template.
  // Só roda quando o TIPO muda — nunca em reloads de `templates` — para não apagar a edição.
  useEffect(() => {
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
  }, [selectedType, templatesLoaded])

  // Autosave do conteúdo (debounce) — protege contra "saiu e perdeu"
  function handleInput() {
    if (!editorRef.current) return
    const html = editorRef.current.innerHTML
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      try { localStorage.setItem(draftKey(selectedType), html) } catch { /* ignore */ }
    }, 500)
  }

  // Limpa o rascunho e recomeça do template padrão
  function handleClear() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    try { localStorage.removeItem(draftKey(selectedType)) } catch { /* ignore */ }
    seedEditor(selectedType)
  }

  function execCmd(cmd: string, value?: string) {
    document.execCommand(cmd, false, value)
    editorRef.current?.focus()
    handleInput()
  }

  function handlePrint() {
    if (!editorRef.current) return
    printDocumento(editorRef.current.innerHTML, bgImage)
  }

  const hasPdf = templates.some(t => t.type === selectedType)

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
        <button className={styles.btnPrint} onClick={handlePrint}>Imprimir</button>
      </div>

      {/* Área de edição */}
      <div className={styles.editorWrap}>
        {loadingBg && <div className={styles.bgLoading}>Carregando modelo...</div>}
        <div
          className={styles.editor}
          style={bgImage ? { backgroundImage: `url(${bgImage})`, backgroundSize: '100% auto', backgroundRepeat: 'no-repeat' } : undefined}
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          onInput={handleInput}
        />
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

function buildDefaultTemplate(title: string, patientName: string, date: string, clinicName: string, doctorName: string, clinicLogo?: string) {
  return `
    <div style="display:flex;align-items:center;justify-content:center;gap:16px;border-bottom:2px solid #333;padding-bottom:12px;margin-bottom:20px">
      ${clinicLogo ? `<img src="${clinicLogo}" alt="Logo" style="height:56px;width:auto;object-fit:contain" />` : ''}
      <p style="font-size:18px;font-weight:800;margin:0">${clinicName}</p>
    </div>
    <h2 style="text-align:center;font-size:15px;letter-spacing:2px;margin-bottom:20px">${title}</h2>
    <p><strong>Paciente:</strong> ${patientName}</p>
    <p><strong>Data:</strong> ${date}</p>
    <br>
    <p>_____________________________________________</p>
    <br><br><br><br>
    <div style="margin-top:60px;border-top:1px solid #333;padding-top:8px;text-align:center;width:260px;margin-left:auto">
      <p style="margin:0">${doctorName}</p>
      <p style="font-size:11px;color:#666">Assinatura e Carimbo</p>
    </div>
  `
}
