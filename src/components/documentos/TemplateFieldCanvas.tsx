'use client'
import { forwardRef, useRef, useState, useEffect, useCallback } from 'react'
import type { FieldPosition } from '@/types'
import { ptToPx, resolveFontPt } from '@/lib/templateCanvasSize'
import styles from './TemplateFieldCanvas.module.css'

interface Props {
  bgUrl: string
  width: number
  height: number
  fields: FieldPosition[]
  // 'fill': documento real — campos editáveis, conteúdo semeado de fora via
  // fieldRefs (igual ao editorRef.current.innerHTML de antes, mas por campo).
  // 'calibrate': tela de Configurações — campos arrastáveis/redimensionáveis,
  // mostrando o rótulo (ou um valor de exemplo) em vez de conteúdo real.
  mode: 'fill' | 'calibrate'
  fieldRefs?: React.MutableRefObject<Record<string, HTMLDivElement | null>>
  onFieldInput?: (key: string) => void
  onFieldFocus?: (key: string) => void
  previewText?: Record<string, string>
  selectedKey?: string | null
  onSelectField?: (key: string) => void
  onFieldChange?: (key: string, patch: Partial<FieldPosition>) => void
}

// Peça compartilhada entre o calibrador (Configurações) e o preenchimento
// real (TabDocumentos) — o mesmo cálculo de tamanho (getTemplateCanvasSize)
// e a mesma disposição em % garantem que uma posição calibrada bata 100%
// com o que aparece depois na tela, no PDF e na impressão.
export const TemplateFieldCanvas = forwardRef<HTMLDivElement, Props>(function TemplateFieldCanvas(
  { bgUrl, width, height, fields, mode, fieldRefs, onFieldInput, onFieldFocus, previewText, selectedKey, onSelectField, onFieldChange },
  ref
) {
  // Handlers de arrastar/redimensionar precisam de identidade ESTÁVEL: são
  // registrados em `window` no pointerdown e removidos no pointerup — se a
  // função mudasse de referência a cada render (o que aconteceria com
  // useCallback dependente de width/height/onFieldChange, já que cada tick
  // do drag causa um re-render), o removeEventListener não encontraria o
  // mesmo listener e ficaria vazando handlers. Por isso o estado corrente
  // fica num ref lido de dentro de uma função criada uma única vez.
  const liveRef = useRef({ width, height, onFieldChange })
  liveRef.current = { width, height, onFieldChange }

  const dragRef = useRef<{ key: string; kind: 'move' | 'resize'; startX: number; startY: number; startField: FieldPosition } | null>(null)

  const onPointerMoveRef = useRef((e: PointerEvent) => {
    const drag = dragRef.current
    const { width, height, onFieldChange } = liveRef.current
    if (!drag || !width || !height) return
    const dxPct = ((e.clientX - drag.startX) / width) * 100
    const dyPct = ((e.clientY - drag.startY) / height) * 100
    if (drag.kind === 'move') {
      const xPct = Math.min(96, Math.max(0, drag.startField.xPct + dxPct))
      const yPct = Math.min(96, Math.max(0, drag.startField.yPct + dyPct))
      onFieldChange?.(drag.key, { xPct, yPct })
    } else {
      const widthPct = Math.min(100 - drag.startField.xPct, Math.max(6, drag.startField.widthPct + dxPct))
      onFieldChange?.(drag.key, { widthPct })
    }
  })

  const onPointerUpRef = useRef(() => {
    dragRef.current = null
    window.removeEventListener('pointermove', onPointerMoveRef.current)
    window.removeEventListener('pointerup', onPointerUpRef.current)
  })

  function startDrag(e: React.PointerEvent, key: string, kind: 'move' | 'resize') {
    if (mode !== 'calibrate') return
    e.preventDefault()
    e.stopPropagation()
    const field = fields.find(f => f.key === key)
    if (!field) return
    onSelectField?.(key)
    dragRef.current = { key, kind, startX: e.clientX, startY: e.clientY, startField: field }
    window.addEventListener('pointermove', onPointerMoveRef.current)
    window.addEventListener('pointerup', onPointerUpRef.current)
  }

  // Documento real tem quebra de linha — um campo de texto livre (kind
  // 'body') ou até um nome longo pode ocupar mais de uma linha e crescer
  // além do papel timbrado calibrado. Como cada campo é position:absolute,
  // ele NÃO empurra a altura do canvas sozinho (filho absoluto não conta
  // pro tamanho do pai) — sem medir isso, o texto que passasse do fundo
  // ficava simplesmente cortado no download (html2canvas mede a caixa, não
  // o conteúdo transbordado). Mede a borda inferior real de cada campo e
  // cresce o canvas pra caber, sem nunca encolher abaixo do tamanho do papel.
  const [extraHeight, setExtraHeight] = useState(0)
  const measureRef = useRef<() => void>(() => {})
  measureRef.current = () => {
    let maxBottom = height
    for (const f of fields) {
      const el = fieldRefs?.current[f.key]
      if (!el) continue
      const top = (f.yPct / 100) * height
      const bottom = top + el.offsetHeight
      if (bottom > maxBottom) maxBottom = bottom
    }
    setExtraHeight(Math.max(0, Math.ceil(maxBottom - height)))
  }

  useEffect(() => {
    if (!fieldRefs) return
    const els = fields.map(f => fieldRefs.current[f.key]).filter((el): el is HTMLDivElement => !!el)
    if (els.length === 0) return
    const observer = new ResizeObserver(() => measureRef.current())
    els.forEach(el => observer.observe(el))
    measureRef.current()
    return () => observer.disconnect()
  }, [fields, fieldRefs, height])

  const canvasHeight = height + extraHeight

  // Posição em PX (calculada a partir de `width`/`height` fixos, não % do
  // CSS) — se usasse %, o crescimento do canvas por transbordamento (acima)
  // reposicionaria todo campo já calibrado, porque % é relativo ao tamanho
  // ATUAL do container, que passa a variar.
  const px = useCallback((pct: number, base: number) => Math.round((pct / 100) * base), [])

  return (
    <div
      ref={ref}
      style={{
        position: 'relative',
        width: width || undefined,
        height: canvasHeight || undefined,
        backgroundImage: bgUrl ? `url(${bgUrl})` : undefined,
        // Altura do fundo sempre em PX fixo (nunca %) — assim o papel
        // timbrado nunca estica mesmo quando o canvas cresce pra caber texto.
        backgroundSize: `100% ${height}px`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'top left',
        flexShrink: 0,
      }}
    >
      {fields.map(f => {
        const isSelected = mode === 'calibrate' && selectedKey === f.key
        // Fonte em PT (não px absoluto) — escala com a largura RENDERIZADA
        // da imagem, exatamente como xPct/widthPct já fazem. É o que
        // garante que o mesmo campo saia do mesmo tamanho relativo na
        // tela, no PDF baixado e na impressão, qualquer que seja a largura
        // em que a imagem esteja sendo mostrada no momento.
        const fontPt = resolveFontPt(f)
        const fontPx = ptToPx(fontPt, width)
        // Em modo fill, um campo vazio (principalmente 'corpo') é um alvo
        // de clique invisível sobre o timbrado — fundo/borda leve deixam a
        // área de digitação óbvia; some no export/impressão porque aquele
        // caminho monta o nó do zero sem essa classe (ver documentRender.ts).
        return (
          <div
            key={f.key}
            className={mode === 'fill' ? styles.field : undefined}
            ref={el => { if (fieldRefs) fieldRefs.current[f.key] = el }}
            contentEditable={mode === 'fill'}
            suppressContentEditableWarning
            spellCheck={mode === 'fill'}
            data-field-key={f.key}
            data-empty-hint={mode === 'fill' && f.kind === 'body' ? 'Digite aqui o conteúdo do documento' : undefined}
            onInput={mode === 'fill' ? () => { onFieldInput?.(f.key); measureRef.current() } : undefined}
            onFocus={mode === 'fill' ? () => onFieldFocus?.(f.key) : undefined}
            onPointerDown={mode === 'calibrate' ? e => startDrag(e, f.key, 'move') : undefined}
            style={{
              position: 'absolute',
              left: px(f.xPct, width),
              top: px(f.yPct, height),
              width: px(f.widthPct, width),
              minHeight: f.kind === 'body' && f.heightPct ? px(f.heightPct, height) : Math.round(fontPx * 1.4),
              fontSize: fontPx,
              textAlign: f.align,
              fontWeight: f.bold ? 700 : 400,
              fontFamily: 'Arial, sans-serif',
              color: '#111',
              lineHeight: 1.4,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              outline: mode === 'calibrate' ? (isSelected ? '2px dashed #4DD9C0' : '1px dashed rgba(0,0,0,.2)') : 'none',
              background: mode === 'fill' ? 'rgba(77,217,192,.06)' : undefined,
              border: mode === 'fill' ? '1px dashed rgba(77,217,192,.4)' : undefined,
              cursor: mode === 'calibrate' ? 'move' : 'text',
              userSelect: mode === 'calibrate' ? 'none' : 'text',
            }}
          >
            {mode === 'calibrate' ? (previewText?.[f.key] ?? f.label) : undefined}
            {isSelected && (
              <span
                onPointerDown={e => startDrag(e, f.key, 'resize')}
                style={{
                  position: 'absolute', right: -7, bottom: -7, width: 14, height: 14,
                  background: '#4DD9C0', borderRadius: '50%', cursor: 'ew-resize',
                  border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)',
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
})
