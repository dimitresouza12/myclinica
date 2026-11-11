// Dados e contas do corpograma, compartilhados entre a tela (TabCorpograma) e os testes.
//
// Tudo fica em medical_records.body_protocols, uma lista de sessões. O formato antigo (estética) não muda:
// sessão sem `mode` é de tratamento. O modo Dor (fisioterapia) só ESTENDE: a sessão ganha `mode: 'dor'` e
// cada ponto pode ter `eva` (0 a 10). Código antigo que ignora esses campos continua lendo a lista normal.
import { parseDose } from './faceograma'
import type { Rect } from './zoomView'

export interface BodyTool { key: string; label: string; abbr: string; color: string; bg: string }

/** Ferramentas do modo Tratamento (estética). */
export const BODY_TOOLS: BodyTool[] = [
  { key: 'criolipolise',     label: 'Criolipólise',        abbr: 'Cr', color: '#3B82F6', bg: '#DBEAFE' },
  { key: 'radiofrequencia',  label: 'Radiofrequência',     abbr: 'Rf', color: '#F59E0B', bg: '#FEF3C7' },
  { key: 'drenagem',         label: 'Drenagem linfática',  abbr: 'Dr', color: '#10B981', bg: '#D1FAE5' },
  { key: 'massagem',         label: 'Massagem modeladora', abbr: 'Ma', color: '#EC4899', bg: '#FCE7F3' },
  { key: 'carboxiterapia',   label: 'Carboxiterapia',      abbr: 'Ca', color: '#8B5CF6', bg: '#EDE9FE' },
  { key: 'ventosaterapia',   label: 'Ventosaterapia',      abbr: 'Ve', color: '#EF4444', bg: '#FEE2E2' },
]

/** Ferramentas do modo Dor (fisioterapia). A cor do ponto vem da EVA, não do tipo. */
export const PAIN_TOOLS: BodyTool[] = [
  { key: 'dor_aguda',        label: 'Dor localizada',              abbr: 'Dl', color: '#DC2626', bg: '#FEE2E2' },
  { key: 'dor_irradiada',    label: 'Dor irradiada / parestesia',  abbr: 'Ir', color: '#7C3AED', bg: '#EDE9FE' },
  { key: 'ponto_gatilho',    label: 'Ponto-gatilho',               abbr: 'Pg', color: '#D97706', bg: '#FEF3C7' },
  { key: 'edema_fibrose',    label: 'Edema / fibrose',             abbr: 'Ed', color: '#0891B2', bg: '#CFFAFE' },
  { key: 'limitacao_adm',    label: 'Limitação de ADM',            abbr: 'Li', color: '#2563EB', bg: '#DBEAFE' },
  { key: 'cicatriz',         label: 'Cicatriz pós-operatória',     abbr: 'Ci', color: '#DB2777', bg: '#FCE7F3' },
]

export type BodyMode = 'tratamento' | 'dor'
export const BODY_MODE_LABEL: Record<BodyMode, string> = { tratamento: 'Tratamento', dor: 'Dor' }
export const toolsFor = (mode: BodyMode): BodyTool[] => (mode === 'dor' ? PAIN_TOOLS : BODY_TOOLS)

const findTool = (k: string) => [...BODY_TOOLS, ...PAIN_TOOLS].find(t => t.key === k)
export const toolColor = (k: string) => findTool(k)?.color ?? '#6B7280'
export const toolBg    = (k: string) => findTool(k)?.bg    ?? '#F3F4F6'
export const toolAbbr  = (k: string) => findTool(k)?.abbr  ?? '?'
export const toolLabel = (k: string) => findTool(k)?.label ?? k

export interface BodyAnnotation {
  id: string; x: number; y: number; view: 'frente' | 'costas'; type: string; qty: string; note: string
  /** Escala Visual Analógica de dor, inteiro de 0 a 10. Só no modo Dor. */
  eva?: number
}
export interface BodySession {
  id: string; date: string; notes: string; annotations: BodyAnnotation[]
  /** Ausente = tratamento (formato antigo). */
  mode?: 'dor'
}

export const sessionMode = (s: Pick<BodySession, 'mode'>): BodyMode => (s.mode === 'dor' ? 'dor' : 'tratamento')

/** Sessão com algo registrado. Uma sessão em branco não conta como alteração a salvar. */
export const isMeaningfulSession = (s: BodySession) => (s.annotations?.length ?? 0) > 0 || !!s.notes?.trim()

/** Quais modos a clínica usa: estética -> tratamento, fisioterapia -> dor. Sem informação, os dois. */
export function modesForSpecialties(specialties: string[] | null | undefined): BodyMode[] {
  if (!specialties || specialties.length === 0) return ['tratamento', 'dor']
  const out: BodyMode[] = []
  if (specialties.includes('estetica')) out.push('tratamento')
  if (specialties.includes('fisio')) out.push('dor')
  // outra área com a aba ligada (ex.: configuração futura): mantém o comportamento de sempre
  return out.length > 0 ? out : ['tratamento']
}

// ── EVA ─────────────────────────────────────────────────────────────
export const EVA_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

/** Lê a EVA de número ou texto ("7", "7,0"); inteiro de 0 a 10 ou undefined. */
export function parseEva(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  if (!Number.isFinite(n)) return undefined
  const r = Math.round(n)
  return r < 0 || r > 10 ? undefined : r
}

export type EvaLevel = 'sem' | 'leve' | 'moderada' | 'intensa'
/** Faixas da EVA: 0 sem dor, 1-3 leve, 4-6 moderada, 7-10 intensa. */
export function evaLevel(n: number): EvaLevel {
  return n === 0 ? 'sem' : n <= 3 ? 'leve' : n <= 6 ? 'moderada' : 'intensa'
}
export const EVA_LEVEL_LABEL: Record<EvaLevel, string> = { sem: 'Sem dor', leve: 'Dor leve', moderada: 'Dor moderada', intensa: 'Dor intensa' }

// verde -> âmbar -> vermelho; todas com contraste mínimo 4,5:1 para o número branco por cima
const EVA_COLORS = ['#15803D', '#3F8F2B', '#4D7C0F', '#5F7A0A', '#A16207', '#B45309', '#C2410C', '#DC2626', '#C81E1E', '#B91C1C', '#7F1D1D']
export const evaColor = (n: number | undefined): string => (n === undefined ? '#6B7280' : EVA_COLORS[Math.max(0, Math.min(10, n))])
export const EVA_NO_VALUE_COLOR = '#6B7280'

// ── Soma do tratamento (paridade com o faceograma) ──────────────────
export interface BodyTotal { tool: string; unit: string; total: number; points: number }

// "sessão", "sessoes", "sess" viram a mesma unidade para somar 1 sessão com 10 sessões; "ampola" e "ampolas" também
// (o parseDose devolve a forma singular quando o valor é 1, e isso separaria "1 ampola" de "2 ampolas" na soma)
function normalizeUnit(unit: string): string {
  const u = unit.normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (/^sess(ao|oes|\.)?$/.test(u)) return 'sessões'
  if (/^ampolas?$/.test(u)) return 'ampolas'
  return unit
}

/** Soma o que foi digitado em "Sessões / Intensidade" por tipo e unidade; `semDose` conta os pontos sem número. */
export function bodyTotals(annotations: Pick<BodyAnnotation, 'type' | 'qty'>[]): { totals: BodyTotal[]; semDose: number } {
  const map = new Map<string, BodyTotal>()
  let semDose = 0
  for (const a of annotations) {
    const dose = parseDose(a.qty ?? '')
    if (!dose) { semDose++; continue }
    const unit = normalizeUnit(dose.unit)
    const key = `${a.type}|${unit}`
    const cur = map.get(key) ?? { tool: a.type, unit, total: 0, points: 0 }
    cur.total = Math.round((cur.total + dose.value) * 100) / 100
    cur.points++
    map.set(key, cur)
  }
  const order = (t: string) => { const i = BODY_TOOLS.findIndex(x => x.key === t); return i < 0 ? 99 : i }
  return { totals: [...map.values()].sort((a, b) => order(a.tool) - order(b.tool) || a.unit.localeCompare(b.unit)), semDose }
}

export function formatBodyTotal(t: BodyTotal): string {
  const unit = t.total === 1 ? (t.unit === 'sessões' ? 'sessão' : t.unit === 'ampolas' ? 'ampola' : t.unit) : t.unit
  return `${String(t.total).replace('.', ',')}${unit ? ` ${unit}` : ''}`
}

// ── Resumo e histórico da dor ───────────────────────────────────────
export interface PainSummary { points: number; withEva: number; max: number | null; mean: number | null; semEva: number }

export function painSummary(annotations: Pick<BodyAnnotation, 'eva'>[]): PainSummary {
  const values = annotations.map(a => parseEva(a.eva)).filter((v): v is number => v !== undefined)
  const sum = values.reduce((a, b) => a + b, 0)
  return {
    points: annotations.length,
    withEva: values.length,
    max: values.length ? Math.max(...values) : null,
    mean: values.length ? Math.round((sum / values.length) * 10) / 10 : null,
    semEva: annotations.length - values.length,
  }
}

export interface PainPoint { id: string; date: string; max: number; mean: number; points: number }

/** Uma linha por sessão de dor com pelo menos uma EVA, em ordem de data (depois pela ordem de gravação). */
export function painHistory(sessions: BodySession[]): PainPoint[] {
  return sessions
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => sessionMode(s) === 'dor')
    .map(({ s, i }) => ({ s, i, sum: painSummary(s.annotations ?? []) }))
    .filter(({ sum }) => sum.max !== null)
    .sort((a, b) => a.s.date.localeCompare(b.s.date) || a.i - b.i)
    .map(({ s, sum }) => ({ id: s.id, date: s.date, max: sum.max!, mean: sum.mean!, points: sum.withEva }))
}

/** Variação da EVA máxima entre a primeira e a última sessão do histórico; null com menos de duas. */
export function painTrend(history: PainPoint[]): { from: number; to: number; delta: number; direction: 'melhora' | 'piora' | 'estavel' } | null {
  if (history.length < 2) return null
  const from = history[0].max, to = history[history.length - 1].max
  const delta = to - from
  return { from, to, delta, direction: delta < 0 ? 'melhora' : delta > 0 ? 'piora' : 'estavel' }
}

/**
 * Desfazer um ponto: volta ao instantâneo, mas nota e quantidade digitadas depois dele
 * (que não entram na pilha do desfazer) ficam nos pontos que continuam existindo.
 */
export function mergeUndoAnnotations(snapshot: BodyAnnotation[], current: BodyAnnotation[]): BodyAnnotation[] {
  return snapshot.map(a => {
    const c = current.find(x => x.id === a.id)
    return c ? { ...a, note: c.note, qty: c.qty } : a
  })
}

// ── Atalhos de zoom da tela cheia ───────────────────────────────────
// Quadro do desenho (viewBox) e proporção das imagens de referência, centralizadas no quadro ("meet").
export const BODY_VW = 210
export const BODY_VH = 280
const BODY_IMG = { frente: { w: 560, h: 929 }, costas: { w: 560, h: 928 } }

// retângulo em pixels da imagem -> unidades do viewBox
function imgRect(view: 'frente' | 'costas', x0: number, y0: number, x1: number, y1: number): Rect {
  const { w, h } = BODY_IMG[view]
  const k = Math.min(BODY_VW / w, BODY_VH / h)
  const ox = (BODY_VW - w * k) / 2, oy = (BODY_VH - h * k) / 2
  return { x: ox + x0 * k, y: oy + y0 * k, w: (x1 - x0) * k, h: (y1 - y0) * k }
}

/** Regiões para dar zoom. Na frente o lado D do paciente fica à esquerda da tela; nas costas, à direita. */
export function bodyShortcuts(view: 'frente' | 'costas'): { key: string; label: string; rect: Rect }[] {
  const r = (x0: number, y0: number, x1: number, y1: number) => imgRect(view, x0, y0, x1, y1)
  if (view === 'frente') {
    return [
      { key: 'cabeca',  label: 'Cabeça',  rect: r(225, 0, 335, 140) },
      { key: 'tronco',  label: 'Tronco',  rect: r(150, 150, 410, 410) },
      { key: 'abdome',  label: 'Abdome',  rect: r(190, 255, 370, 415) },
      { key: 'bracoD',  label: 'Braço D', rect: r(0, 165, 205, 535) },
      { key: 'bracoE',  label: 'Braço E', rect: r(355, 165, 560, 535) },
      { key: 'coxaD',   label: 'Coxa D',  rect: r(185, 400, 290, 630) },
      { key: 'coxaE',   label: 'Coxa E',  rect: r(270, 400, 375, 630) },
      { key: 'pernaD',  label: 'Perna D', rect: r(190, 610, 295, 929) },
      { key: 'pernaE',  label: 'Perna E', rect: r(265, 610, 370, 929) },
    ]
  }
  return [
    { key: 'cabeca',  label: 'Cabeça',  rect: r(225, 0, 335, 140) },
    { key: 'costas',  label: 'Costas',  rect: r(165, 145, 395, 400) },
    { key: 'bracoD',  label: 'Braço D', rect: r(355, 160, 560, 550) },
    { key: 'bracoE',  label: 'Braço E', rect: r(0, 160, 205, 550) },
    { key: 'coxaD',   label: 'Coxa D',  rect: r(270, 480, 375, 680) },
    { key: 'coxaE',   label: 'Coxa E',  rect: r(185, 480, 290, 680) },
    { key: 'pernaD',  label: 'Perna D', rect: r(265, 660, 370, 928) },
    { key: 'pernaE',  label: 'Perna E', rect: r(190, 660, 295, 928) },
  ]
}
