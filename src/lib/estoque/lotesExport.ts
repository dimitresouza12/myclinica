// Lista de lotes para imprimir ou baixar (CSV). Funções puras; a impressão em si (janela) fica no fim do arquivo.
import { diasAteValidade, formatarDia, saldoDoLote, textoValidade, type RecallResumo, type StockLot } from './lotes'

export interface LinhaLote {
  produto: string
  unidade: string
  lote: string
  validade: string
  situacao: string
  saldo: number
  fornecedor: string
  notaFiscal: string
}

export function linhasDeLotes(lots: StockLot[], itens: Record<string, { name: string; unit: string }>, hoje: string): LinhaLote[] {
  return lots.map(l => ({
    produto: itens[l.stock_item_id]?.name ?? '-',
    unidade: itens[l.stock_item_id]?.unit ?? '',
    lote: l.lote,
    validade: formatarDia(l.validade),
    situacao: saldoDoLote(l) <= 0 ? 'Esgotado' : textoValidade(diasAteValidade(l.validade, hoje)),
    saldo: saldoDoLote(l),
    fornecedor: l.fornecedor ?? '',
    notaFiscal: l.nota_fiscal ?? '',
  }))
}

/** Uma célula de CSV: aspas quando há separador, aspas ou quebra de linha; e neutraliza fórmula (=, +, -, @) aberta no Excel. */
export function celulaCsv(v: string | number): string {
  let s = String(v)
  if (/^[=+\-@]/.test(s) && typeof v === 'string') s = `'${s}`
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV com ponto e vírgula e BOM, que é o que o Excel em português abre sem estragar os acentos. */
export function lotesParaCsv(linhas: LinhaLote[]): string {
  const head = ['Produto', 'Lote', 'Validade', 'Situação', 'Saldo', 'Unidade', 'Fornecedor', 'Nota fiscal']
  const rows = linhas.map(l => [l.produto, l.lote, l.validade, l.situacao, l.saldo, l.unidade, l.fornecedor, l.notaFiscal].map(celulaCsv).join(';'))
  return '﻿' + [head.join(';'), ...rows].join('\r\n')
}

export function recallParaCsv(lote: Pick<StockLot, 'lote' | 'validade'>, produto: string, r: RecallResumo): string {
  const head = ['Produto', 'Lote', 'Validade', 'Paciente', 'Telefone', 'Data', 'Quantidade']
  const rows: string[] = []
  for (const p of r.pacientes) {
    for (const u of p.usos) {
      const d = new Date(u.data)
      const data = Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(d)
      rows.push([produto, lote.lote, formatarDia(lote.validade), p.nome, p.telefone ?? '', data, u.quantidade].map(celulaCsv).join(';'))
    }
  }
  return '﻿' + [head.join(';'), ...rows].join('\r\n')
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function lotesParaHtml(linhas: LinhaLote[], opts: { clinica: string; titulo: string; filtro: string; geradoEm: string }): string {
  const body = linhas.length === 0
    ? '<tr><td colspan="7" style="text-align:center;padding:24px;color:#666">Nenhum lote nesta lista.</td></tr>'
    : linhas.map(l => `<tr>
        <td>${esc(l.produto)}</td><td>${esc(l.lote)}</td><td>${esc(l.validade)}</td><td>${esc(l.situacao)}</td>
        <td class="n">${l.saldo} ${esc(l.unidade)}</td><td>${esc(l.fornecedor)}</td><td>${esc(l.notaFiscal)}</td></tr>`).join('')
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(opts.titulo)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 24px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  p { margin: 0 0 14px; color: #555; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #555; border-bottom: 2px solid #333; padding: 6px 8px; }
  td { padding: 7px 8px; border-bottom: 1px solid #ddd; vertical-align: top; }
  td.n { text-align: right; white-space: nowrap; }
  tr { page-break-inside: avoid; }
</style></head><body>
<h1>${esc(opts.titulo)}</h1>
<p>${esc(opts.clinica)} &middot; ${esc(opts.filtro)} &middot; gerado em ${esc(opts.geradoEm)} &middot; ${linhas.length} ${linhas.length === 1 ? 'lote' : 'lotes'}</p>
<table><thead><tr><th>Produto</th><th>Lote</th><th>Validade</th><th>Situação</th><th style="text-align:right">Saldo</th><th>Fornecedor</th><th>Nota fiscal</th></tr></thead>
<tbody>${body}</tbody></table></body></html>`
}

// ── Navegador ────────────────────────────────────────────────────────────────

export function baixarArquivo(nome: string, conteudo: string, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Abre a lista numa janela e chama o diálogo de impressão. Devolve false se o navegador bloqueou o pop-up. */
export function imprimirHtml(html: string): boolean {
  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) return false
  w.document.write(html)
  w.document.close()
  w.focus()
  w.print()
  return true
}
