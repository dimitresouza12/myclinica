// Exporta o conteúdo do editor de documentos (prontuário) como PDF ou imagem
// de verdade, direto no navegador — sem depender do diálogo de impressão nem
// de servidor. Captura o próprio nó do editor (WYSIWYG real: papel timbrado
// de fundo + texto digitado), igual ao que já aparece na tela. Usado no
// caminho SEM calibração (editor livre) — o caminho calibrado tem seu
// próprio gerador de alta resolução, ver documentRender.ts.

// html2canvas/jsPDF dependem de window/canvas — dynamic import evita
// problema de SSR no Next.js, mesmo padrão já usado neste projeto pra
// pdfjs-dist (ver TabDocumentos.tsx).

import { downloadBlob } from './documentRender'

export async function exportNodeAsImage(node: HTMLElement, filename: string) {
  const { default: html2canvas } = await import('html2canvas')
  const canvas = await html2canvas(node, { useCORS: true, scale: 3, backgroundColor: '#ffffff' })
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Não foi possível gerar a imagem.')
  // Blob em vez de data: URL — um PNG grande em base64 falha silenciosamente
  // ao baixar em vários navegadores (Chrome recusa data URL muito longa,
  // Safari abre em aba em vez de salvar).
  downloadBlob(blob, filename)
}

export async function exportNodeAsPdf(node: HTMLElement, filename: string) {
  const { default: html2canvas } = await import('html2canvas')
  const { jsPDF } = await import('jspdf')
  const canvas = await html2canvas(node, { useCORS: true, scale: 3, backgroundColor: '#ffffff' })
  if (canvas.width === 0 || canvas.height === 0) throw new Error('Não foi possível gerar o documento.')
  const pdf = new jsPDF('p', 'mm', 'a4')
  const pageW = 210
  const pageH = 297
  const imgH = (canvas.height * pageW) / canvas.width
  // JPEG em vez de PNG — mesmo resultado visual pra um documento de texto
  // sobre papel, arquivo bem menor (documento de várias páginas parava de
  // pesar vários MB à toa).
  const img = canvas.toDataURL('image/jpeg', 0.95)

  // Conteúdo mais alto que uma A4 (ex: laudo longo) — fatia em várias
  // páginas, cada uma desenhando a mesma imagem deslocada verticalmente.
  let heightLeft = imgH
  let position = 0
  pdf.addImage(img, 'JPEG', 0, position, pageW, imgH)
  heightLeft -= pageH
  while (heightLeft > 0) {
    position = heightLeft - imgH
    pdf.addPage()
    pdf.addImage(img, 'JPEG', 0, position, pageW, imgH)
    heightLeft -= pageH
  }
  downloadBlob(pdf.output('blob'), filename)
}

// Nome de arquivo seguro — remove caracteres inválidos em nomes de arquivo
export function safeFilename(parts: string[], ext: string) {
  return parts.map(p => p.replace(/[/\\:*?"<>|]/g, '').trim()).filter(Boolean).join(' - ') + '.' + ext
}
