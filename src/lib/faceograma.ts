// Dados do faceograma compartilhados entre a tela (TabFaceograma) e a impressão (print.ts).

export const FACE_TOOLS = [
  { key: 'toxina',         label: 'Toxina botulínica', abbr: 'Tx', color: '#3B82F6', bg: '#DBEAFE' },
  { key: 'preenchimento',  label: 'Preenchimento',     abbr: 'Pr', color: '#8B5CF6', bg: '#EDE9FE' },
  { key: 'bioestimulador', label: 'Bioestimulador',    abbr: 'Bi', color: '#F59E0B', bg: '#FEF3C7' },
  { key: 'fio',            label: 'Fio tensor',        abbr: 'Fi', color: '#EC4899', bg: '#FCE7F3' },
  { key: 'ultrassom',      label: 'Ultrassom/Micro',   abbr: 'Us', color: '#10B981', bg: '#D1FAE5' },
]

export interface FaceAnnotation { id: string; x: number; y: number; type: string; qty: string; note: string; region?: string }
export interface FaceSession    { id: string; date: string; notes: string; annotations: FaceAnnotation[] }

// ViewBox dimensioned to match the anatomical reference image aspect ratio (1290×1068)
export const FACE_VW = 300
export const FACE_VH = Math.round(300 * (1068 / 1290)) // ≈ 248

// ── Região do rosto ────────────────────────────────────────────────
// Zonas elípticas no mesmo sistema de coordenadas do desenho (viewBox 300x248, rosto de frente).
// `dx` > 0 repete a zona dos dois lados da linha média (x = 150). O lado direito do paciente
// fica à esquerda na tela.
interface Zone { name: string; cy: number; rx: number; ry: number; dx?: number; cx?: number }
const ZONES: Zone[] = [
  { name: 'Glabela',                 cx: 150, cy: 82,  rx: 11, ry: 7 },
  { name: 'Linhas de coelho',        cx: 150, cy: 102, rx: 14, ry: 6 },
  { name: 'Frontal',                 cx: 150, cy: 52,  rx: 50, ry: 22 },
  { name: 'Sobrancelha',             dx: 28,  cy: 81,  rx: 20, ry: 6 },
  { name: 'Região dos olhos',        dx: 28,  cy: 92,  rx: 14, ry: 7 },
  { name: 'Pé de galinha',           dx: 52,  cy: 95,  rx: 11, ry: 14 },
  { name: 'Olheira',                 dx: 27,  cy: 104, rx: 15, ry: 6 },
  { name: 'Têmpora',                 dx: 62,  cy: 62,  rx: 14, ry: 22 },
  { name: 'Orelha',                  dx: 59,  cy: 105, rx: 7,  ry: 16 },
  { name: 'Malar',                   dx: 42,  cy: 120, rx: 18, ry: 14 },
  { name: 'Nariz',                   cx: 150, cy: 117, rx: 12, ry: 16 },
  { name: 'Sulco nasogeniano',       dx: 24,  cy: 138, rx: 8,  ry: 14 },
  { name: 'Bochecha',                dx: 55,  cy: 138, rx: 18, ry: 16 },
  { name: 'Lábio superior',          cx: 150, cy: 138, rx: 14, ry: 5 },
  { name: 'Lábios',                  cx: 150, cy: 148, rx: 18, ry: 7 },
  { name: 'Linha de marionete',      dx: 22,  cy: 160, rx: 8,  ry: 10 },
  { name: 'Mento',                   cx: 150, cy: 168, rx: 18, ry: 10 },
  { name: 'Mandíbula',               dx: 52,  cy: 160, rx: 16, ry: 16 },
  { name: 'Pescoço',                 cx: 150, cy: 215, rx: 70, ry: 28 },
]

/** Nome da região do rosto em (x, y), por exemplo "Pé de galinha (direito)". */
export function faceRegion(x: number, y: number): string {
  let best: { name: string; d: number } | null = null
  for (const z of ZONES) {
    const centers = z.dx !== undefined ? [{ cx: 150 - z.dx, side: 'direito' }, { cx: 150 + z.dx, side: 'esquerdo' }] : [{ cx: z.cx!, side: '' }]
    for (const c of centers) {
      const d = ((x - c.cx) / z.rx) ** 2 + ((y - z.cy) / z.ry) ** 2
      if (d < 1 && (!best || d < best.d)) best = { name: c.side ? `${z.name} (${c.side})` : z.name, d }
    }
  }
  return best?.name ?? 'Face'
}

// ── Total por produto ──────────────────────────────────────────────
export interface ToolTotal { tool: string; unit: string; total: number; points: number }

/** Lê "20U", "0,5 ml", "1 ampola" em número e unidade. null quando não há número. */
export function parseDose(qty: string): { value: number; unit: string } | null {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*([a-zA-ZµμÀ-ÿ]+)?/.exec(qty)
  if (!m) return null
  const value = parseFloat(m[1].replace(',', '.'))
  const raw = (m[2] ?? '').toLowerCase()
  const unit = ['u', 'ui', 'un', 'unid', 'unidade', 'unidades'].includes(raw) ? 'U'
    : ['a', 'amp', 'ampola', 'ampolas'].includes(raw) ? (value === 1 ? 'ampola' : 'ampolas')
    : raw
  return { value, unit }
}

/** Soma as doses da sessão por produto e unidade; `semDose` conta os pontos sem número. */
export function sessionTotals(annotations: FaceAnnotation[]): { totals: ToolTotal[]; semDose: number } {
  const map = new Map<string, ToolTotal>()
  let semDose = 0
  for (const a of annotations) {
    const dose = parseDose(a.qty ?? '')
    if (!dose) { semDose++; continue }
    const key = `${a.type}|${dose.unit}`
    const cur = map.get(key) ?? { tool: a.type, unit: dose.unit, total: 0, points: 0 }
    cur.total = Math.round((cur.total + dose.value) * 100) / 100
    cur.points++
    map.set(key, cur)
  }
  const order = (t: string) => { const i = FACE_TOOLS.findIndex(x => x.key === t); return i < 0 ? 99 : i }
  return { totals: [...map.values()].sort((a, b) => order(a.tool) - order(b.tool) || a.unit.localeCompare(b.unit)), semDose }
}

export function formatTotal(t: ToolTotal): string {
  return `${String(t.total).replace('.', ',')}${t.unit ? ` ${t.unit}` : ''}`
}
