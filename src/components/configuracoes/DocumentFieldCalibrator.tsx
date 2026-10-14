'use client'
import { useState, useEffect } from 'react'
import { useTemplateBackground } from '@/hooks/useTemplateBackground'
import { getTemplateCanvasSize } from '@/lib/templateCanvasSize'
import { TemplateFieldCanvas } from '@/components/documentos/TemplateFieldCanvas'
import { getFieldCatalog, defaultFieldPosition, type FieldCatalogEntry } from '@/lib/documentFieldCatalog'
import { resolveFontPt } from '@/lib/templateCanvasSize'
import { Portal } from '@/components/ui/Portal'
import type { DocumentTemplateType, FieldPosition } from '@/types'
import styles from './DocumentFieldCalibrator.module.css'
import { IntegerInput } from '@/components/ui/NumericInput'

interface Props {
  type: DocumentTemplateType
  pdfUrl: string
  initialFields: FieldPosition[]
  onSave: (fields: FieldPosition[]) => void
  onClose: () => void
}

// Valores de exemplo pro toggle "Prévia com dados de exemplo" — só pra dar
// noção visual de como vai ficar, nunca são salvos.
const SAMPLE_VALUES: Record<string, string> = {
  paciente: 'Maria da Silva',
  data: '31 de agosto de 2026',
  medico: 'Dr. Rafael Toledo',
  registro: 'CRM-SP 123456',
  endereco_paciente: 'Rua das Flores, 123 — São Paulo/SP',
  comprador_nome: 'Maria da Silva',
  comprador_doc: 'RG 12.345.678-9',
  fornecedor_nome: 'Farmácia Central',
  corpo: 'Uso contínuo — 1 comprimido ao dia, por 30 dias.',
}

export function DocumentFieldCalibrator({ type, pdfUrl, initialFields, onSave, onClose }: Props) {
  const { bg, loading, load } = useTemplateBackground()
  useEffect(() => { load(pdfUrl) }, [pdfUrl, load])

  // Ref por callback (não useRef comum): o conteúdo real só entra no DOM
  // depois que o Portal roda seu próprio efeito de montagem (padrão
  // SSR-safe — 1º render retorna null, só no 2º chama createPortal). Um
  // useRef normal + useEffect com [] ficaria preso vendo `current: null`
  // pra sempre, porque o efeito já rodou antes do Portal revelar o nó real.
  // Callback ref dispara de novo assim que o elemento realmente existe.
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  useEffect(() => {
    if (!containerEl) return
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w) setContainerWidth(w)
    })
    observer.observe(containerEl)
    return () => observer.disconnect()
  }, [containerEl])

  const [fields, setFields] = useState<FieldPosition[]>(initialFields)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)

  const catalog = getFieldCatalog(type)
  const size = bg ? getTemplateCanvasSize(containerWidth, bg.naturalW, bg.naturalH) : { width: 0, height: 0 }
  const selected = fields.find(f => f.key === selectedKey) ?? null

  function addField(entry: FieldCatalogEntry) {
    if (fields.some(f => f.key === entry.key)) { setSelectedKey(entry.key); return }
    setFields(prev => [...prev, defaultFieldPosition(entry)])
    setSelectedKey(entry.key)
  }

  function removeField(key: string) {
    setFields(prev => prev.filter(f => f.key !== key))
    setSelectedKey(prev => prev === key ? null : prev)
  }

  function patchField(key: string, patch: Partial<FieldPosition>) {
    setFields(prev => prev.map(f => f.key === key ? { ...f, ...patch } : f))
  }

  return (
    <Portal>
      <div className={styles.overlay} onClick={onClose}>
        <div className={styles.modal} onClick={e => e.stopPropagation()}>
          <div className={styles.header}>
            <h2 className={styles.title}>Calibrar campos</h2>
            <button className={styles.closeBtn} onClick={onClose} aria-label="Fechar">
              <span aria-hidden>×</span>
            </button>
          </div>
          <p className={styles.subtitle}>Marque onde cada dado aparece no seu modelo — feito uma vez, vale pra todo documento deste tipo daqui pra frente.</p>

          <div className={styles.body}>
            <div className={styles.palette}>
              <p className={styles.paletteHint}>Clique num campo pra adicionar, arraste sobre o modelo pra posicionar. A alça no canto ajusta a largura.</p>
              <div className={styles.paletteList}>
                {catalog.map(entry => {
                  const active = fields.some(f => f.key === entry.key)
                  const isSelected = selectedKey === entry.key
                  return (
                    <div key={entry.key} className={`${styles.paletteItem} ${active ? styles.paletteItemActive : ''} ${isSelected ? styles.paletteItemSelected : ''}`}>
                      <button className={styles.paletteItemBtn} onClick={() => active ? setSelectedKey(entry.key) : addField(entry)}>
                        {entry.label}
                      </button>
                      {active && (
                        <button className={styles.removeFieldBtn} onClick={() => removeField(entry.key)} title="Remover deste modelo" aria-label="Remover">
                          <span aria-hidden>×</span>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              <label className={styles.previewToggle}>
                <input type="checkbox" checked={preview} onChange={e => setPreview(e.target.checked)} />
                Prévia com dados de exemplo
              </label>

              {selected && (
                <div className={styles.fieldOptions}>
                  <h3 className={styles.fieldOptionsTitle}>{selected.label}</h3>
                  <label className={styles.optionRow}>
                    Tamanho da fonte (pt)
                    <IntegerInput
                      min={6} max={36} value={resolveFontPt(selected)}
                      onChange={v => patchField(selected.key, { fontPt: Number(v) || resolveFontPt(selected) })}
                    />
                  </label>
                  {selected.kind === 'body' && (
                    <label className={styles.optionRow}>
                      Altura mínima
                      <IntegerInput
                        min={5} max={90} value={selected.heightPct ?? 30}
                        onChange={v => patchField(selected.key, { heightPct: Number(v) || 30 })}
                      />
                    </label>
                  )}
                  <div className={styles.alignRow}>
                    {(['left', 'center', 'right'] as const).map(a => (
                      <button
                        key={a}
                        className={`${styles.alignBtn} ${selected.align === a ? styles.alignBtnActive : ''}`}
                        onClick={() => patchField(selected.key, { align: a })}
                      >
                        {a === 'left' ? 'Esquerda' : a === 'center' ? 'Centro' : 'Direita'}
                      </button>
                    ))}
                  </div>
                  <label className={styles.boldToggle}>
                    <input type="checkbox" checked={selected.bold} onChange={e => patchField(selected.key, { bold: e.target.checked })} />
                    Negrito
                  </label>
                </div>
              )}
            </div>

            <div className={styles.canvasArea} ref={setContainerEl}>
              {loading && <p className={styles.loadingHint}>Carregando modelo...</p>}
              {!loading && bg && size.width > 0 && (
                <TemplateFieldCanvas
                  bgUrl={bg.url}
                  width={size.width}
                  height={size.height}
                  fields={fields}
                  mode="calibrate"
                  previewText={preview ? SAMPLE_VALUES : undefined}
                  selectedKey={selectedKey}
                  onSelectField={setSelectedKey}
                  onFieldChange={patchField}
                />
              )}
              {!loading && !bg && <p className={styles.loadingHint}>Não foi possível carregar o modelo.</p>}
            </div>
          </div>

          <div className={styles.footer}>
            <button className={styles.btnCancel} onClick={onClose}>Cancelar</button>
            <button className={styles.btnSave} onClick={() => onSave(fields)}>Salvar calibração</button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
