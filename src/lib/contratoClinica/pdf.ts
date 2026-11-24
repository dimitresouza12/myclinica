// PDF do contrato assinado, gerado no servidor com jsPDF (sem navegador). Texto corrido + manifesto de assinatura
// na última página. O texto assinado é o `content_text` gravado no rascunho, sem reescrever nada.
// SÓ NO SERVIDOR (devolve bytes). Fontes padrão do PDF (Helvetica) cobrem o português; o que sair do Latin-1 é
// trocado por um equivalente seguro em `pdfSafe`.

import { jsPDF } from 'jspdf'
import { LOGO_PDF_PNG } from './logoPdf'

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 20
const TEXT_W = PAGE_W - MARGIN * 2
const BOTTOM = PAGE_H - 18

const REPLACEMENTS: Record<string, string> = {
  '‘': "'", '’': "'", '‚': "'", '“': '"', '”': '"', '„': '"',
  '–': '-', '—': '-', '−': '-', '…': '...', '•': '-', ' ': ' ', ' ': ' ',
}

/** Troca caracteres que a fonte padrão do PDF não desenha (fora do Latin-1) por equivalentes ASCII. */
export function pdfSafe(text: string): string {
  let out = ''
  for (const ch of text.normalize('NFC')) {
    const code = ch.codePointAt(0)!
    if (ch === '\n' || ch === '\t' || (code >= 0x20 && code <= 0x7e) || (code >= 0xa1 && code <= 0xff)) out += ch
    else if (REPLACEMENTS[ch]) out += REPLACEMENTS[ch]
    else if (code < 0x20 || code === 0x7f) out += ' '
    else out += '?'
  }
  return out
}

export interface ParteAssinante {
  nome: string
  /** CPF ou CNPJ já formatado. */
  documento: string
  /** Ex.: "Assinado eletronicamente em 24/11/2026 às 12:30". */
  assinadoEm: string
  /** true = ainda não assinou: o bloco sai sem nome em itálico acima da linha. */
  pendente?: boolean
  /** data:image/png;base64,... (desenho) ou null (usa o nome em itálico). */
  imagem: string | null
}

export interface ContractPdfInput {
  title: string
  text: string
  manifest: [string, string][]
  /** data:image/png;base64,... do desenho (ou null no modo digitado). */
  signatureImage: string | null
  signerName: string
  /** Quadro de resumo da primeira página: [rótulo, valor]. */
  resumo?: [string, string][]
  contratada?: ParteAssinante
  contratante?: ParteAssinante
  /** Código curto de conferência, impresso no rodapé de todas as páginas. */
  verificacao?: string
  /** Dados da CONTRATADA impressos no papel timbrado da primeira página. */
  timbre?: { nome: string; documento: string; local: string; site?: string }
}

// Paleta da marca (RGB)
const TEAL: [number, number, number] = [15, 118, 110]
const TEAL_CLARO: [number, number, number] = [240, 253, 250]
const TEAL_BORDA: [number, number, number] = [153, 230, 218]
const CINZA: [number, number, number] = [100, 108, 116]

/** Largura x altura de um PNG em data URL (lê o cabeçalho IHDR). null se não conseguir. */
export function pngSize(dataUrl: string): { w: number; h: number } | null {
  const b64 = dataUrl.split(',')[1]
  if (!b64) return null
  const head = Buffer.from(b64.slice(0, 64), 'base64')
  if (head.length < 24 || head.toString('latin1', 1, 4) !== 'PNG') return null
  const w = head.readUInt32BE(16)
  const h = head.readUInt32BE(20)
  return w > 0 && h > 0 ? { w, h } : null
}

export function buildContractPdf(input: ContractPdfInput): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  doc.setProperties({ title: pdfSafe(input.title), subject: 'Contrato MyClinica assinado eletronicamente', creator: 'MyClinica' })

  const HEADER_H = 26
  const INK: [number, number, number] = [13, 36, 33]
  let y = MARGIN

  // Páginas seguintes: cabeçalho compacto.
  const cabecalho = () => {
    doc.addImage(LOGO_PDF_PNG, 'PNG', MARGIN, 10, 9, 9)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...TEAL)
    doc.text('MyCl\u00ednica', MARGIN + 11.5, 16.4)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...CINZA)
    doc.text('Contrato de presta\u00e7\u00e3o de servi\u00e7os', PAGE_W - MARGIN, 16.4, { align: 'right' })
    doc.setDrawColor(...TEAL_BORDA); doc.setLineWidth(0.4); doc.line(MARGIN, 22, PAGE_W - MARGIN, 22)
    doc.setTextColor(0); doc.setDrawColor(0); doc.setLineWidth(0.2)
  }

  // Primeira página: papel timbrado (faixa, marca, dados da contratada e filete duplo).
  const timbrado = () => {
    doc.setFillColor(...TEAL); doc.rect(0, 0, PAGE_W, 5, 'F')
    doc.addImage(LOGO_PDF_PNG, 'PNG', MARGIN, 13, 15, 15)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...TEAL)
    doc.text('MyCl\u00ednica', MARGIN + 18.5, 22.5)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...CINZA)
    doc.text('Sistema de gest\u00e3o para cl\u00ednicas', MARGIN + 18.5, 27.2)
    const t = input.timbre
    if (t) {
      const rx = PAGE_W - MARGIN
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...INK)
      doc.text(pdfSafe(t.nome), rx, 16.5, { align: 'right' })
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...CINZA)
      doc.text(pdfSafe(t.documento), rx, 21, { align: 'right' })
      doc.text(pdfSafe(t.local), rx, 25.2, { align: 'right' })
      if (t.site) { doc.setTextColor(...TEAL); doc.text(pdfSafe(t.site), rx, 29.4, { align: 'right' }) }
    }
    doc.setDrawColor(...TEAL); doc.setLineWidth(0.7); doc.line(MARGIN, 35, PAGE_W - MARGIN, 35)
    doc.setDrawColor(...TEAL_BORDA); doc.setLineWidth(0.25); doc.line(MARGIN, 36.6, PAGE_W - MARGIN, 36.6)
    doc.setTextColor(0); doc.setDrawColor(0); doc.setLineWidth(0.2)
  }
  const novaPagina = () => { doc.addPage(); cabecalho(); y = HEADER_H + 6 }
  const ensure = (h: number) => { if (y + h > BOTTOM) novaPagina() }

  timbrado()
  y = 46

  const linhas = pdfSafe(input.text).split('\n')
  const iTitulo = linhas.findIndex(l => l.trim() !== '' && l === l.toUpperCase() && !/^CL[\u00c1A]USULA/i.test(l) && l.length > 20)

  // Aviso de rascunho (se houver) em caixa discreta
  const aviso = iTitulo > 0 ? linhas.slice(0, iTitulo).filter(l => l.trim()).join(' ') : ''
  if (aviso) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
    const al = doc.splitTextToSize(aviso, TEXT_W - 8) as string[]
    const h = al.length * 4 + 6
    doc.setFillColor(254, 243, 199); doc.setDrawColor(245, 158, 11)
    doc.roundedRect(MARGIN, y, TEXT_W, h, 1.5, 1.5, 'FD')
    doc.setTextColor(120, 53, 15)
    al.forEach((l, i) => doc.text(l, MARGIN + 4, y + 5 + i * 4))
    doc.setTextColor(0); doc.setDrawColor(0)
    y += h + 6
  }

  // T\u00edtulo
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...TEAL)
  doc.text('INSTRUMENTO PARTICULAR', PAGE_W / 2, y, { align: 'center' })
  y += 7
  doc.setFont('times', 'bold'); doc.setFontSize(17); doc.setTextColor(...INK)
  const tl = doc.splitTextToSize(pdfSafe(input.title), TEXT_W - 10) as string[]
  tl.forEach(l => { doc.text(l, PAGE_W / 2, y, { align: 'center' }); y += 7.2 })
  doc.setTextColor(0)
  doc.setDrawColor(...TEAL); doc.setLineWidth(0.7); doc.line(PAGE_W / 2 - 12, y - 2, PAGE_W / 2 + 12, y - 2)
  doc.setLineWidth(0.2); doc.setDrawColor(0)
  y += 6

  // Quadro de resumo: filetes finos em vez de caixa colorida
  if (input.resumo && input.resumo.length) {
    const cols = Math.min(input.resumo.length, 4)
    const cw = TEXT_W / cols
    const rows = Math.ceil(input.resumo.length / cols)
    const rowH = 15
    const boxH = rows * rowH
    doc.setDrawColor(...TEAL); doc.setLineWidth(0.5)
    doc.line(MARGIN, y, PAGE_W - MARGIN, y); doc.line(MARGIN, y + boxH, PAGE_W - MARGIN, y + boxH)
    doc.setDrawColor(...TEAL_BORDA); doc.setLineWidth(0.25)
    for (let c = 1; c < cols; c++) doc.line(MARGIN + c * cw, y + 3, MARGIN + c * cw, y + boxH - 3)
    input.resumo.forEach(([rot, val], i) => {
      const cx = MARGIN + (i % cols) * cw + (i % cols === 0 ? 0 : 5)
      const cy = y + 6.5 + Math.floor(i / cols) * rowH
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...CINZA)
      doc.text(pdfSafe(rot).toUpperCase(), cx, cy)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...INK)
      doc.text(pdfSafe(val), cx, cy + 5.5, { maxWidth: cw - 8 })
    })
    doc.setTextColor(0); doc.setDrawColor(0); doc.setLineWidth(0.2)
    y += boxH + 9
  }

  // Corpo
  const lineH = 5.1
  const corpo = iTitulo >= 0 ? linhas.slice(iTitulo + 1) : linhas
  let rodapeNota = ''
  for (const raw of corpo) {
    if (raw.trim() === '') { y += 1.6; continue }
    if (/^Contrato gerado em/i.test(raw)) { rodapeNota = raw; continue }
    const cl = /^CL[\u00c1A]USULA\s+(.+?)\s+-\s+(.+)$/i.exec(raw)
    if (cl) {
      ensure(14)
      y += 3
      doc.setFillColor(...TEAL); doc.rect(MARGIN, y - 4, 1.2, 5.6, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...TEAL)
      doc.text(`Cl\u00e1usula ${cl[1]}`, MARGIN + 3.5, y)
      doc.setTextColor(30)
      doc.text(cl[2].charAt(0) + cl[2].slice(1).toLowerCase(), MARGIN + 3.5 + doc.getTextWidth(`Cl\u00e1usula ${cl[1]}  `), y)
      doc.setTextColor(0)
      y += 6.2
      continue
    }
    doc.setFontSize(10.5)
    const num = /^(\d+\.\d+\.)\s+(.*)$/.exec(raw)
    const lab = /^(CONTRATADA|CONTRATANTE):\s+(.*)$/.exec(raw)
    if (/^E, por estarem/.test(raw)) ensure(80)
    if (num) {
      doc.setFont('times', 'normal')
      const ls = doc.splitTextToSize(num[2], TEXT_W - 10) as string[]
      ls.forEach((l, i) => {
        ensure(lineH)
        if (i === 0) { doc.setFont('times', 'bold'); doc.setTextColor(...TEAL); doc.text(num[1], MARGIN, y); doc.setTextColor(0) }
        doc.setFont('times', 'normal'); doc.text(l, MARGIN + 10, y); y += lineH
      })
    } else if (lab) {
      doc.setFont('times', 'bold')
      const lw = doc.getTextWidth(`${lab[1]}:  `)
      doc.setFont('times', 'normal')
      const ls = doc.splitTextToSize(lab[2], TEXT_W - lw) as string[]
      ls.forEach((l, i) => {
        ensure(lineH)
        if (i === 0) { doc.setFont('times', 'bold'); doc.text(`${lab[1]}:`, MARGIN, y); doc.setFont('times', 'normal') }
        doc.text(l, MARGIN + (i === 0 ? lw : 0), y); y += lineH
      })
    } else {
      doc.setFont('times', 'normal')
      for (const l of doc.splitTextToSize(raw, TEXT_W) as string[]) { ensure(lineH); doc.text(l, MARGIN, y); y += lineH }
    }
  }

  // Assinaturas das partes
  if (input.contratada || input.contratante) {
    ensure(62)
    y += 8
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...CINZA)
    if (rodapeNota) { doc.text(rodapeNota, MARGIN, y); y += 6 }
    doc.setTextColor(0)
    const colW = (TEXT_W - 10) / 2
    const bloco = (x: number, papel: string, p: ParteAssinante | undefined) => {
      if (!p) return
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...TEAL)
      doc.text(papel, x, y)
      doc.setTextColor(0)
      const size = p.imagem ? pngSize(p.imagem) : null
      if (p.imagem && size) {
        const sc = Math.min(colW / size.w, 22 / size.h)
        doc.addImage(p.imagem, 'PNG', x, y + 2, size.w * sc, size.h * sc)
      } else if (!p.pendente) {
        doc.setFont('times', 'italic'); doc.setFontSize(17)
        doc.text(pdfSafe(p.nome), x, y + 15, { maxWidth: colW })
      }
      doc.setDrawColor(130); doc.line(x, y + 25, x + colW, y + 25); doc.setDrawColor(0)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
      doc.text(pdfSafe(p.nome), x, y + 29.5, { maxWidth: colW })
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...CINZA)
      doc.text(pdfSafe(p.documento), x, y + 33.5)
      doc.text(pdfSafe(p.assinadoEm), x, y + 37.5, { maxWidth: colW })
      doc.setTextColor(0)
    }
    bloco(MARGIN, 'CONTRATADA', input.contratada)
    bloco(MARGIN + colW + 10, 'CONTRATANTE', input.contratante)
    y += 44
  }

  // Registro da assinatura (p\u00e1gina final)
  novaPagina()
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...TEAL)
  doc.text('Registro da assinatura eletr\u00f4nica', MARGIN, y)
  doc.setTextColor(0)
  y += 4
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...CINZA)
  doc.text('Prova do ato de assinar, gerada automaticamente pelo sistema.', MARGIN, y + 3)
  doc.setTextColor(0)
  y += 10
  const labelW = 48
  let zebra = false
  for (const [label, value] of input.manifest) {
    const mono = /hash|c\u00f3digo|ip/i.test(label) && /^[0-9a-f]{16,}$/i.test(value.replace(/\s/g, ''))
    doc.setFontSize(mono ? 7.5 : 9)
    doc.setFont(mono ? 'courier' : 'helvetica', 'normal')
    const vLines = doc.splitTextToSize(pdfSafe(value), TEXT_W - labelW - 4) as string[]
    const h = vLines.length * 4.2 + 3.4
    ensure(h)
    if (zebra) { doc.setFillColor(...TEAL_CLARO); doc.rect(MARGIN, y - 3.8, TEXT_W, h, 'F') }
    zebra = !zebra
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...TEAL)
    doc.text(pdfSafe(label), MARGIN + 2, y)
    doc.setTextColor(0); doc.setFontSize(mono ? 7.5 : 9)
    doc.setFont(mono ? 'courier' : 'helvetica', 'normal')
    vLines.forEach((line, i) => doc.text(line, MARGIN + labelW, y + i * 4.2))
    y += h
  }

  // Rodap\u00e9 em todas as p\u00e1ginas
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setDrawColor(230); doc.line(MARGIN, PAGE_H - 14, PAGE_W - MARGIN, PAGE_H - 14); doc.setDrawColor(0)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...CINZA)
    doc.text(input.verificacao ? `Documento assinado eletronicamente  |  Verifica\u00e7\u00e3o: ${pdfSafe(input.verificacao)}` : 'Documento assinado eletronicamente', MARGIN, PAGE_H - 9.5)
    doc.text(`P\u00e1gina ${p} de ${total}`, PAGE_W - MARGIN, PAGE_H - 9.5, { align: 'right' })
    doc.setTextColor(0)
  }

  return new Uint8Array(doc.output('arraybuffer'))
}
