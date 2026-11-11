// CSV dos relatórios de convênio: mesmo formato do restante do app (ponto e vírgula, BOM, fórmula neutralizada).
import { celulaCsv } from '@/lib/estoque/lotesExport'

export { baixarArquivo } from '@/lib/estoque/lotesExport'

/** Valor em reais para planilha pt-BR: "1234,50" (sem milhar, sem símbolo), para o Excel somar. */
export function valorCsv(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? '' : v.toFixed(2).replace('.', ',')
}

/** "AAAA-MM-DD" → "DD/MM/AAAA"; qualquer outra coisa volta como está. */
export function diaBR(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

export function montarCsv(cabecalho: string[], linhas: Array<Array<string | number>>): string {
  const rows = linhas.map(l => l.map(celulaCsv).join(';'))
  return '﻿' + [cabecalho.map(celulaCsv).join(';'), ...rows].join('\r\n')
}
