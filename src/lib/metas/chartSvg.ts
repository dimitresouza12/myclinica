import type { SeriesPoint } from './progress'

export interface LineChartOptions {
  width?: number
  height?: number
  /** cor da linha e dos pontos */
  color: string
  /** cor das linhas de grade */
  grid: string
  /** cor dos textos */
  text: string
  /** descrição para leitor de tela */
  label: string
  /** Rótulos fixos do eixo (padrão 0, 50 e 100%) */
  yTicks?: number[]
  /** sufixo do eixo Y e do tooltip */
  unit?: string
  /** Topo da escala do eixo Y (padrão 100). Escalas de 0 a 27, por exemplo, passam 27. */
  yMax?: number
}

const fmtDay = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

const num = (n: number) => String(Math.round(n * 10) / 10)

/**
 * Gráfico de linha em SVG puro (sem biblioteca), escala 0 a 100 (ou 0 a `yMax`).
 * Devolve uma string para ser usada tanto na tela (dangerouslySetInnerHTML) quanto no HTML impresso.
 * Só entram números e datas YYYY-MM-DD; o rótulo é escapado.
 */
export function lineChartSvg(series: SeriesPoint[], o: LineChartOptions): string {
  if (series.length === 0) return ''
  const W = o.width ?? 560
  const H = o.height ?? 200
  const unit = o.unit ?? '%'
  const padL = 40, padR = 16, padT = 14, padB = 30
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const yMax = o.yMax && o.yMax > 0 ? o.yMax : 100
  const ticks = o.yTicks ?? [0, yMax / 2, yMax]
  const y = (v: number) => padT + innerH - (Math.max(0, Math.min(yMax, v)) / yMax) * innerH
  const x = (i: number) => (series.length === 1 ? padL + innerW / 2 : padL + (innerW * i) / (series.length - 1))
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const grid = ticks.map(t => `<line x1="${padL}" x2="${W - padR}" y1="${num(y(t))}" y2="${num(y(t))}" stroke="${o.grid}" stroke-width="1"/><text x="${padL - 6}" y="${num(y(t) + 3.5)}" font-size="10" text-anchor="end" fill="${o.text}">${t}${unit}</text>`).join('')

  const path = series.length > 1
    ? `<polyline fill="none" stroke="${o.color}" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round" points="${series.map((p, i) => `${num(x(i))},${num(y(p.score))}`).join(' ')}"/>`
    : ''

  const dots = series.map((p, i) => `<circle cx="${num(x(i))}" cy="${num(y(p.score))}" r="4" fill="${o.color}"><title>${fmtDay(p.date)}: ${p.score}${unit}</title></circle>`).join('')

  // no máximo ~6 rótulos de data, sempre incluindo o primeiro e o último
  const step = Math.max(1, Math.ceil(series.length / 6))
  const labels = series.map((p, i) => ({ p, i })).filter(({ i }) => i % step === 0 || i === series.length - 1)
    .map(({ p, i }) => `<text x="${num(x(i))}" y="${H - 10}" font-size="10" text-anchor="middle" fill="${o.text}">${fmtDay(p.date)}</text>`).join('')

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(o.label)}" xmlns="http://www.w3.org/2000/svg" style="display:block;max-width:100%;height:auto">${grid}${path}${dots}${labels}</svg>`
}
