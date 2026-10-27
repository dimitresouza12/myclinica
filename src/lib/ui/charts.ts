// Geometria dos gráficos em SVG puro (Sparkline, Gauge). Sem dependência de React,
// para testar sem DOM.

export type Point = [number, number]

const r2 = (n: number) => Math.round(n * 100) / 100

/** Curva suave que passa por todos os pontos (Catmull-Rom convertido em Bézier cúbica). */
export function smoothPath(points: Point[]): string {
  if (points.length === 0) return ''
  const [fx, fy] = points[0]
  let d = `M${r2(fx)},${r2(fy)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C${r2(c1x)},${r2(c1y)} ${r2(c2x)},${r2(c2y)} ${r2(p2[0])},${r2(p2[1])}`
  }
  return d
}

/** Converte valores em coordenadas dentro de width x height, com folga nas bordas.
 *  O maior valor fica no topo; série constante ou de um ponto só fica no meio. */
export function scalePoints(values: number[], width: number, height: number, padding: number): Point[] {
  if (values.length === 0) return []
  const v = values.map(n => (Number.isFinite(n) ? n : 0))
  const min = Math.min(...v)
  const max = Math.max(...v)
  const innerW = width - 2 * padding
  const innerH = height - 2 * padding
  return v.map((n, i) => {
    const x = v.length === 1 ? width / 2 : padding + (i * innerW) / (v.length - 1)
    const y = max === min ? height / 2 : padding + (1 - (n - min) / (max - min)) * innerH
    return [r2(x), r2(y)]
  })
}

/** Medidor em meia-lua num viewBox de 200 x 112: trilha inteira, arco até a fração e ponto final. */
export function gaugeArc(fraction: number) {
  const cx = 100
  const cy = 100
  const r = 84
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0
  const at = (t: number): Point => [r2(cx - r * Math.cos(Math.PI * t)), r2(cy - r * Math.sin(Math.PI * t))]
  const arcTo = (t: number) => {
    const [x, y] = at(t)
    return `M${cx - r},${cy} A${r},${r} 0 0 1 ${x},${y}`
  }
  return { cx, cy, r, fraction: f, track: arcTo(1), arc: arcTo(f), end: at(f) }
}
