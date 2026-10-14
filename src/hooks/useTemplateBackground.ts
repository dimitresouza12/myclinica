import { useState, useCallback } from 'react'

export interface TemplateBackground { url: string; naturalW: number; naturalH: number }

export function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(url)
}

// Renderiza a 1ª página de um PDF num PNG, numa largura de referência
// escolhida por quem chama — extraída como função pura (sem estado de
// hook) pra poder ser reusada tanto na tela (useTemplateBackground, largura
// de referência leve, ~1600px) quanto na exportação em alta resolução
// (documentRender.ts, ~2480px = 300dpi de A4), sem duplicar a leitura do
// PDF nos dois lugares.
export async function renderPdfPageToDataUrl(url: string, targetWidth: number): Promise<TemplateBackground> {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
  GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const res = await fetch(url)
  const buf = await res.arrayBuffer()
  const pdf = await getDocument({ data: buf }).promise
  const page = await pdf.getPage(1)
  const baseViewport = page.getViewport({ scale: 1 })
  const scale = Math.max(1, targetWidth / baseViewport.width)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')!
  await page.render({ canvasContext: ctx, viewport, canvas }).promise
  return { url: canvas.toDataURL('image/png'), naturalW: viewport.width, naturalH: viewport.height }
}

// Carrega o papel timbrado (imagem OU PDF, 1ª página) e mede o tamanho
// NATURAL do arquivo — usado tanto no preenchimento real (TabDocumentos)
// quanto no calibrador de campos (Configurações). Um único lugar faz essa
// conta pra nunca divergir entre onde o campo foi calibrado e onde ele
// aparece depois. PDF mira uma largura de referência de ~1600px (nunca
// pior que scale 1) — sem isso saía borrado em telas maiores; a
// exportação em alta resolução (documentRender.ts) re-renderiza o PDF
// numa largura maior na hora de baixar/imprimir, em vez de reusar este raster leve.
export function useTemplateBackground() {
  const [bg, setBg] = useState<TemplateBackground | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const load = useCallback(async (url: string | null) => {
    if (!url) { setBg(null); setError(false); return }
    setLoading(true)
    setError(false)
    try {
      if (isImageUrl(url)) {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('load failed'))
          img.src = url
        })
        setBg({ url, naturalW: img.naturalWidth, naturalH: img.naturalHeight })
      } else {
        setBg(await renderPdfPageToDataUrl(url, 1600))
      }
    } catch {
      setBg(null)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  return { bg, loading, error, load }
}
