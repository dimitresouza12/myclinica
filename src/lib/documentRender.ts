import { fitContainA4, ptToPx, resolveFontPt } from './templateCanvasSize'
import type { FieldPosition } from '@/types'

// Gerador ÚNICO do documento calibrado (papel timbrado + campos
// posicionados) — baixar em PDF, baixar como imagem e imprimir usam
// exatamente este mesmo resultado, então nunca podem divergir entre si.
// Antes disso, baixar rasterizava a TELA (html2canvas sobre o nó visível,
// preso ao tamanho do container) e imprimir montava um HTML totalmente
// separado (printDocumentoCalibrado, removido) — os dois caminhos podiam
// (e às vezes deviam) sair diferentes. Ver auditoria D1–D6 no plano.

// 96 CSS px = 1in = 72pt = referência "de tela"; 300dpi = referência "de
// impressão". Construir o nó offscreen em px96 permite reusar EXATAMENTE a
// mesma matemática de ptToPx()/percentuais do preview ao vivo
// (TemplateFieldCanvas) — só a escala final (html2canvas scale:EXPORT_SCALE)
// muda a resolução do raster, nunca a proporção de nada.
const SCREEN_DPI = 96
const EXPORT_DPI = 300
const EXPORT_SCALE = EXPORT_DPI / SCREEN_DPI // 3.125
const MM_TO_PX96 = 793.7 / 210 // ≈3.7795
const PAGE_W_PX96 = 210 * MM_TO_PX96 // 793.7
const PAGE_H_PX96 = 297 * MM_TO_PX96 // ≈1122.6

// Largura de referência pra re-renderizar um PDF em alta resolução na hora
// de exportar (a tela usa ~1600px, leve; exportar mira o teto de uma A4 a
// 300dpi) — ver renderPdfPageToDataUrl em useTemplateBackground.ts.
export const EXPORT_PDF_TARGET_WIDTH = 2480

export interface RenderableField extends FieldPosition {
  html: string
}

export interface ComposedDoc {
  pdfBlob: Blob
  pngBlob: Blob
}

export class DocumentRenderError extends Error {
  constructor(public reason: 'bg-load-failed' | 'canvas-empty' | 'unknown', message: string) {
    super(message)
  }
}

// Constrói o documento calibrado em alta resolução, encaixado numa A4
// física de verdade (fitContainA4 — nunca estica nem corta o papel do
// cliente, qualquer que seja a proporção do arquivo dele, resolve D1).
export async function composeCalibratedDoc(
  bgUrl: string,
  naturalW: number,
  naturalH: number,
  fields: RenderableField[]
): Promise<ComposedDoc> {
  const { default: html2canvas } = await import('html2canvas')
  const { jsPDF } = await import('jspdf')

  const fit = fitContainA4(naturalW, naturalH)
  const imageBoxWidthPx = fit.widthMm * MM_TO_PX96
  const imageBoxHeightPx = fit.heightMm * MM_TO_PX96
  const offsetXPx = fit.offsetXMm * MM_TO_PX96
  const offsetYPx = fit.offsetYMm * MM_TO_PX96

  const page = document.createElement('div')
  page.style.position = 'fixed'
  page.style.left = '-99999px'
  page.style.top = '0'
  page.style.width = `${PAGE_W_PX96}px`
  page.style.height = `${PAGE_H_PX96}px`
  page.style.background = '#ffffff'
  page.style.overflow = 'visible'

  const imgBox = document.createElement('div')
  imgBox.style.position = 'absolute'
  imgBox.style.left = `${offsetXPx}px`
  imgBox.style.top = `${offsetYPx}px`
  imgBox.style.width = `${imageBoxWidthPx}px`
  imgBox.style.height = `${imageBoxHeightPx}px`
  imgBox.style.backgroundImage = `url("${bgUrl}")`
  imgBox.style.backgroundSize = `${imageBoxWidthPx}px ${imageBoxHeightPx}px`
  imgBox.style.backgroundRepeat = 'no-repeat'
  page.appendChild(imgBox)

  const fieldEls: HTMLElement[] = []
  for (const f of fields) {
    const el = document.createElement('div')
    el.innerHTML = f.html
    const fontPt = resolveFontPt(f)
    el.style.position = 'absolute'
    el.style.left = `${(f.xPct / 100) * imageBoxWidthPx}px`
    el.style.top = `${(f.yPct / 100) * imageBoxHeightPx}px`
    el.style.width = `${(f.widthPct / 100) * imageBoxWidthPx}px`
    el.style.fontSize = `${ptToPx(fontPt, imageBoxWidthPx)}px`
    el.style.textAlign = f.align
    el.style.fontWeight = f.bold ? '700' : '400'
    el.style.fontFamily = 'Arial, sans-serif'
    el.style.color = '#111'
    el.style.lineHeight = '1.4'
    el.style.whiteSpace = 'pre-wrap'
    el.style.wordBreak = 'break-word'
    imgBox.appendChild(el)
    fieldEls.push(el)
  }

  document.body.appendChild(page)
  try {
    // D2 (adaptado pro DOM real, não iframe): espera o timbrado carregar
    // de verdade antes de capturar — sem isso, capturava com o fundo em
    // branco em conexões lentas ou PDFs pesados.
    const bgOk = await waitForImage(bgUrl)
    if (!bgOk) throw new DocumentRenderError('bg-load-failed', 'O papel timbrado não carregou a tempo.')

    // Corpo mais longo que a área calibrada — mede a borda inferior real
    // de cada campo (já com quebra de linha aplicada pelo navegador) e
    // cresce a PÁGINA (não a imagem) pra não cortar texto, mesmo princípio
    // já validado no preview ao vivo (TemplateFieldCanvas.tsx).
    let maxBottomPx = imageBoxHeightPx
    for (const el of fieldEls) {
      const bottom = el.offsetTop + el.offsetHeight
      if (bottom > maxBottomPx) maxBottomPx = bottom
    }
    const extraPx = Math.max(0, Math.ceil(maxBottomPx - imageBoxHeightPx))
    const totalHeightPx96 = PAGE_H_PX96 + extraPx
    if (extraPx > 0) page.style.height = `${totalHeightPx96}px`

    // Tamanho de captura FIXO (nunca depende do tamanho da tela/container)
    // — resolve D4: sempre a mesma resolução previsível, nunca perto do
    // teto de canvas do iOS Safari mesmo com texto bem longo.
    const canvas = await html2canvas(page, {
      useCORS: true,
      scale: EXPORT_SCALE,
      backgroundColor: '#ffffff',
      width: PAGE_W_PX96,
      height: totalHeightPx96,
      windowWidth: PAGE_W_PX96,
      windowHeight: totalHeightPx96,
    })
    if (canvas.width === 0 || canvas.height === 0) {
      throw new DocumentRenderError('canvas-empty', 'Não foi possível gerar a imagem do documento.')
    }

    const pdf = new jsPDF('p', 'mm', 'a4')
    const pageHeightMm = 297
    const totalHeightMm = pageHeightMm * (totalHeightPx96 / PAGE_H_PX96)
    // JPEG em vez de PNG (resolve D6) — mesmo resultado visual, arquivo
    // ordens de grandeza menor. Fatiamento multipágina recorta a FAIXA de
    // cada página do canvas (em vez de reembutir a imagem inteira em cada
    // uma, que inflava o PDF de laudos longos à toa).
    let renderedMm = 0
    let first = true
    while (renderedMm < totalHeightMm - 0.01) {
      const sliceHeightMm = Math.min(pageHeightMm, totalHeightMm - renderedMm)
      const slice = sliceOfCanvas(canvas, renderedMm / totalHeightMm, sliceHeightMm / totalHeightMm)
      const sliceData = slice.toDataURL('image/jpeg', 0.95)
      if (!first) pdf.addPage()
      pdf.addImage(sliceData, 'JPEG', 0, 0, 210, (slice.height / slice.width) * 210)
      renderedMm += sliceHeightMm
      first = false
    }

    const pdfBlob: Blob = pdf.output('blob')
    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new DocumentRenderError('canvas-empty', 'Não foi possível gerar a imagem.')), 'image/png')
    })
    return { pdfBlob, pngBlob }
  } finally {
    document.body.removeChild(page)
  }
}

function sliceOfCanvas(source: HTMLCanvasElement, startFrac: number, fracHeight: number): HTMLCanvasElement {
  const sy = Math.round(startFrac * source.height)
  const sh = Math.max(1, Math.round(fracHeight * source.height))
  const out = document.createElement('canvas')
  out.width = source.width
  out.height = sh
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(source, 0, sy, source.width, sh, 0, 0, source.width, sh)
  return out
}

function waitForImage(url: string, timeoutMs = 8000): Promise<boolean> {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const timer = setTimeout(() => resolve(false), timeoutMs)
    img.onload = () => { clearTimeout(timer); resolve(true) }
    img.onerror = () => { clearTimeout(timer); resolve(false) }
    img.src = url
  })
}

// Download por blob (resolve D3) — um data: URL de um PNG grande em base64
// falha silenciosamente em baixar em vários navegadores; blob: não tem
// esse teto de tamanho prático.
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// Impressão a partir do MESMO pdf gerado pra baixar (resolve D2 e garante
// baixado ≡ impresso). Abre numa ABA NOVA (window.open), não num <iframe>
// oculto — a primeira versão usava iframe e funcionava em teste manual, mas
// a live QA pegou um CSP real do site (next.config.ts: `frame-src
// https://accounts.google.com`, só pro popup de login do Google) que
// bloqueia qualquer OUTRO frame, inclusive blob: — o iframe de impressão
// simplesmente não carregava em produção. window.open é uma NAVEGAÇÃO (nova
// aba), não um frame embutido, então essa política nem se aplica; abrir a
// política de frame-src só pra isso enfraqueceria a proteção contra
// clickjacking à toa.
//
// Duas funções, não uma — abrir a aba tem que acontecer ANTES do PDF ficar
// pronto: composeCalibratedDoc é assíncrono e leva 1-3s (renderiza em
// 300dpi). Chamar window.open só DEPOIS desse await perde o "gesto do
// usuário" que autoriza popups — confirmado ao vivo (window.open depois do
// await voltou null, popup bloqueado em silêncio). openPrintWindow() abre a
// aba em branco na hora do clique (síncrono, ainda dentro do gesto);
// printBlobInWindow() só navega essa aba já aberta pro PDF quando ele fica
// pronto.
export function openPrintWindow(): Window | null {
  return window.open('', '_blank')
}

export function printBlobInWindow(win: Window, blob: Blob) {
  const url = URL.createObjectURL(blob)
  // O visualizador de PDF nativo do navegador assume a aba — chama print()
  // assim que possível (tenta no load do documento E num fallback por
  // tempo, porque o evento de load de um PDF embutido nem sempre dispara de
  // forma confiável entre navegadores). Se o navegador não deixar controlar
  // print() de um PDF embutido por script, o usuário ainda tem o próprio
  // botão de imprimir do visualizador — nunca fica sem alternativa.
  const tryPrint = () => { try { win.focus(); win.print() } catch { /* usuário usa o botão do próprio visualizador */ } }
  win.addEventListener('load', tryPrint, { once: true })
  win.location.href = url
  setTimeout(tryPrint, 1200)
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
