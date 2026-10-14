// Único lugar que calcula "em que tamanho o papel timbrado do cliente
// realmente cai na tela" — usado tanto no preenchimento real (TabDocumentos)
// quanto no calibrador de campos (Configurações), pra garantir que uma
// posição calibrada bata 100% com o que aparece depois. Nunca amplia além
// do tamanho NATURAL do arquivo (evita borrão); a largura é limitada pelo
// container disponível (evita cortar).
export function getTemplateCanvasSize(containerWidth: number, naturalW: number, naturalH: number) {
  if (!containerWidth || !naturalW || !naturalH) return { width: 0, height: 0 }
  const width = Math.min(containerWidth, naturalW)
  const height = Math.round(width * (naturalH / naturalW))
  return { width, height }
}

// Largura de uma folha A4 em pontos (595.28pt = 210mm) — âncora física que
// nunca muda, ao contrário da largura renderizada da imagem (varia por
// tela/PDF/impressão). Ver FieldPosition.fontPt em types/index.ts.
export const A4_WIDTH_PT = 595.28
export const A4_HEIGHT_PT = 841.89
// 96 CSS px = 1in = 72pt, então 1pt = 96/72 px. Como o campo é sempre
// posicionado dentro da caixa da IMAGEM (não da folha), a fonte precisa
// escalar com a largura RENDERIZADA dessa caixa, não com um px fixo —
// exatamente como já funciona pra xPct/widthPct.
export function ptToPx(fontPt: number, renderedImageWidthPx: number) {
  return (fontPt * renderedImageWidthPx) / A4_WIDTH_PT
}

// Fallback pra registros salvos antes da migração pt (guardavam px "cru",
// pensado pra uma largura de referência de ~800px de tela) — só de leitura.
export function resolveFontPt(field: { fontPt?: number; fontSize?: number }): number {
  if (field.fontPt) return field.fontPt
  if (field.fontSize) return field.fontSize * (A4_WIDTH_PT / 800)
  return 12
}

export interface ContainFit {
  widthMm: number
  heightMm: number
  offsetXMm: number
  offsetYMm: number
}

// Encaixa o papel timbrado do cliente inteiro dentro de uma folha A4 física
// (210×297mm), sem esticar nem cortar — necessário pra impressão/PDF, onde
// a página tem tamanho FIXO (diferente da tela, que acompanha o conteúdo).
// Um timbrado mais "alto" que a proporção de A4 encolhe pra caber na altura
// (sobra branco nas laterais); mais "largo" encolhe pra caber na largura
// (sobra embaixo). Sem isso, um timbrado fora da proporção de A4 saía
// cortado ao meio ou pulava pra uma 2ª página em branco.
export function fitContainA4(naturalW: number, naturalH: number, pageWidthMm = 210, pageHeightMm = 297): ContainFit {
  const pageAspect = pageWidthMm / pageHeightMm
  const imgAspect = naturalW / naturalH
  let widthMm: number, heightMm: number
  if (imgAspect > pageAspect) {
    widthMm = pageWidthMm
    heightMm = pageWidthMm / imgAspect
  } else {
    heightMm = pageHeightMm
    widthMm = pageHeightMm * imgAspect
  }
  return {
    widthMm,
    heightMm,
    offsetXMm: (pageWidthMm - widthMm) / 2,
    offsetYMm: (pageHeightMm - heightMm) / 2,
  }
}
