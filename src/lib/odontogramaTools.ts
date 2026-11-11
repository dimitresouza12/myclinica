// Ferramentas clínicas do odontograma e o que cada uma faz no dente. Lógica pura (testada em
// odontogramaTools.test.ts); a tela só chama applyTool e desenha o resultado.

import type { OdontogramHistoryEntry } from '@/types'
import {
  DEFAULT_STATUS, EXTRA_KEYS, EXTRA_STATUS_OF, FACE_KEYS, cleanExtras, emptyTooth, hasExtra, isUpperTooth, withPlanned,
  type MarkKey, type SurfaceKey, type ToothData,
} from './odontograma'
import { faceLabel, mainRoot, rootCount, rootName, toothKind } from './odontogramaGeometry'

export type ToolKey =
  | 'select' | 'carie' | 'restauracao' | 'canal' | 'pino' | 'aparelho' | 'coroa' | 'ausente'
  | 'implante' | 'fraturado' | 'selante' | 'extracao' | 'protese' | 'tratamento' | 'limpar'

/**
 * Como a ferramenta age:
 *  - face: pinta uma face (na vista oclusal, a face clicada; na frontal, a coroa é a vestibular);
 *  - whole: marca o dente inteiro, onde quer que se clique;
 *  - canal / pino: raiz clicada, ou todas / a principal quando se clica na coroa;
 *  - aparelho: braquete no dente;
 *  - limpar: apaga o que a zona clicada mostra;
 *  - select: só escolhe o dente.
 */
export type ToolMode = 'select' | 'face' | 'whole' | 'canal' | 'pino' | 'aparelho' | 'limpar'

export interface ToolDef {
  key: ToolKey
  label: string
  mode: ToolMode
  /** condição gravada (status do dente ou da face) */
  status?: string
  color: string
  /** face que a coroa da vista frontal representa para as ferramentas de face */
  crownFace?: SurfaceKey
  group: 'main' | 'more' | 'util'
  hint: string
}

export const TOOLS: ToolDef[] = [
  { key: 'select',      label: 'Selecionar',    mode: 'select',   color: '#0b9b85', group: 'util', hint: 'Clique num dente para escolher. Clique no número para abrir o histórico e as observações.' },
  { key: 'carie',       label: 'Cárie',         mode: 'face',     status: 'cariado',    color: '#EF4444', crownFace: 'v', group: 'main', hint: 'Clique numa face da vista oclusal ou na coroa (face vestibular).' },
  { key: 'restauracao', label: 'Restauração',   mode: 'face',     status: 'restaurado', color: '#3B82F6', crownFace: 'v', group: 'main', hint: 'Clique numa face da vista oclusal ou na coroa (face vestibular).' },
  { key: 'canal',       label: 'Canal',         mode: 'canal',    status: 'endodontia', color: '#e11d48', group: 'main', hint: 'Clique numa raiz para tratar só ela, ou na coroa para tratar todas.' },
  { key: 'pino',        label: 'Pino',          mode: 'pino',     status: 'pino',       color: '#64748b', group: 'main', hint: 'Clique numa raiz, ou na coroa para o pino na raiz principal.' },
  { key: 'aparelho',    label: 'Aparelho',      mode: 'aparelho', status: 'aparelho',   color: '#0284c7', group: 'main', hint: 'Clique no dente. Dentes vizinhos com braquete são ligados pelo fio.' },
  { key: 'coroa',       label: 'Coroa',         mode: 'whole',    status: 'coroa',      color: '#14b8a6', group: 'main', hint: 'Clique no dente para marcar a coroa protética.' },
  { key: 'ausente',     label: 'Ausente',       mode: 'whole',    status: 'ausente',    color: '#6b7280', group: 'main', hint: 'Clique no dente para marcar como ausente ou extraído.' },
  { key: 'implante',    label: 'Implante',      mode: 'whole',    status: 'implante',   color: '#f59e0b', group: 'more', hint: 'Clique no dente para marcar o implante.' },
  { key: 'tratamento',  label: 'Em tratamento', mode: 'whole',    status: 'tratamento', color: '#ec4899', group: 'more', hint: 'Clique no dente para marcar tratamento em andamento.' },
  { key: 'fraturado',   label: 'Fraturado',     mode: 'whole',    status: 'fraturado',  color: '#ea580c', group: 'more', hint: 'Clique no dente para marcar a fratura.' },
  { key: 'selante',     label: 'Selante',       mode: 'face',     status: 'selante',    color: '#7c3aed', crownFace: 'o', group: 'more', hint: 'Clique na face oclusal.' },
  { key: 'extracao',    label: 'Extração',      mode: 'whole',    status: 'extracao',   color: '#b91c1c', group: 'more', hint: 'Clique no dente para indicar a extração.' },
  { key: 'protese',     label: 'Prótese',       mode: 'whole',    status: 'protese',    color: '#0891b2', group: 'more', hint: 'Clique no dente para marcar a prótese.' },
  { key: 'limpar',      label: 'Limpar',        mode: 'limpar',   color: '#6b7280', group: 'util', hint: 'Clique numa face, na coroa ou numa raiz para apagar o que está marcado ali.' },
]
export const TOOL_BY_KEY: Record<ToolKey, ToolDef> = Object.fromEntries(TOOLS.map(t => [t.key, t])) as Record<ToolKey, ToolDef>

/** O que foi clicado no desenho: uma face (vista oclusal), a coroa ou uma raiz (vista frontal). */
export type Zone = { kind: 'face'; face: SurfaceKey } | { kind: 'crown' } | { kind: 'root'; root: number }

const toggleRoot = (list: number[] | undefined, r: number): number[] => {
  const cur = list ?? []
  return cur.includes(r) ? cur.filter(x => x !== r) : [...cur, r].sort()
}

/**
 * Aplica a ferramenta à zona e devolve o dente novo (nunca altera o recebido). Clicar de novo no que já está
 * marcado desmarca. `planned` marca o que for criado como "a realizar". Dente ausente não recebe canal, pino nem aparelho.
 */
export function applyTool(d: ToothData, tool: ToolDef, zone: Zone, num: number, planned: boolean): ToothData {
  const kind = toothKind(num)
  const upper = isUpperTooth(num)
  const roots = rootCount(kind, upper)
  const absent = d.status === 'ausente'

  if (tool.mode === 'select') return d

  if (tool.mode === 'face') {
    const status = tool.status!
    // raiz: não há face a pintar, a marca vale para o dente inteiro
    if (zone.kind === 'root') return toggleWhole(d, status, planned)
    const face = zone.kind === 'face' ? zone.face : (tool.crownFace ?? 'v')
    const next = d.surfaces[face] === status ? DEFAULT_STATUS : status
    const nd = { ...d, surfaces: { ...d.surfaces, [face]: next } }
    return withPlanned(nd, face, next !== DEFAULT_STATUS && planned)
  }

  if (tool.mode === 'whole') return toggleWhole(d, tool.status!, planned)

  if (tool.mode === 'canal' || tool.mode === 'pino') {
    if (absent) return d
    const key = tool.mode === 'canal' ? 'endo' : 'pin'
    const cur = d[key]
    let next: number[]
    if (zone.kind === 'root') next = toggleRoot(cur, zone.root)
    else if (tool.mode === 'canal') {
      const all = Array.from({ length: roots }, (_, i) => i)
      next = all.every(r => cur?.includes(r)) ? [] : all
    } else {
      const m = mainRoot(kind, upper)
      next = toggleRoot(cur, m)
    }
    const nd = cleanExtras(key === 'endo' ? { ...d, endo: next } : { ...d, pin: next })
    return withPlanned(nd, key, hasExtra(nd, key) && planned)
  }

  if (tool.mode === 'aparelho') {
    if (absent) return d
    const nd = cleanExtras({ ...d, bracket: !d.bracket })
    return withPlanned(nd, 'bracket', !!nd.bracket && planned)
  }

  // limpar
  if (zone.kind === 'face') {
    return withPlanned({ ...d, surfaces: { ...d.surfaces, [zone.face]: DEFAULT_STATUS } }, zone.face, false)
  }
  if (zone.kind === 'root') {
    let nd = cleanExtras<ToothData>({ ...d, endo: d.endo?.filter(r => r !== zone.root), pin: d.pin?.filter(r => r !== zone.root) })
    if (!hasExtra(nd, 'endo')) nd = withPlanned(nd, 'endo', false)
    if (!hasExtra(nd, 'pin')) nd = withPlanned(nd, 'pin', false)
    return nd
  }
  // coroa: condição do dente inteiro, face vestibular e braquete
  let nd: ToothData = { ...d, status: DEFAULT_STATUS, surfaces: { ...d.surfaces, v: DEFAULT_STATUS } }
  nd = cleanExtras({ ...nd, bracket: false })
  for (const k of ['all', 'v', 'bracket'] as MarkKey[]) nd = withPlanned(nd, k, false)
  return nd
}

/** Tira canal, pino e braquete (e o "a realizar" deles): dente ausente não tem nada disso. */
function stripExtras(d: ToothData): ToothData {
  let nd = cleanExtras<ToothData>({ ...d, endo: undefined, pin: undefined, bracket: false })
  for (const k of EXTRA_KEYS) nd = withPlanned(nd, k, false)
  return nd
}

/**
 * Liga ou desliga a condição do dente inteiro (clicar de novo na marcada desmarca). Marcar `ausente` leva embora
 * canal, pino e aparelho, que não existem num dente que não está lá.
 */
export function toggleWhole(d: ToothData, status: string, planned: boolean): ToothData {
  const next = d.status === status ? DEFAULT_STATUS : status
  const nd = next === 'ausente' ? stripExtras({ ...d, status: next }) : { ...d, status: next }
  return withPlanned(nd, 'all', next !== DEFAULT_STATUS && planned)
}

/** "Hígido" no dente inteiro: limpa a condição e as faces, mas mantém canal, pino e aparelho (e o "a realizar" deles). */
export function clearToothConditions(d: ToothData): ToothData {
  const planned: NonNullable<ToothData['planned']> = {}
  for (const k of EXTRA_KEYS) if (hasExtra(d, k) && d.planned?.[k]) planned[k] = true
  return { ...d, status: DEFAULT_STATUS, surfaces: emptyTooth().surfaces, planned: Object.keys(planned).length ? planned : undefined }
}

/** Condições do dente, a do dente inteiro primeiro, depois as das faces e os tratamentos extras (sem repetir). */
export function toothAlterations(d: ToothData): string[] {
  const out: string[] = []
  if (d.status !== DEFAULT_STATUS) out.push(d.status)
  for (const k of FACE_KEYS) {
    const v = d.surfaces[k]
    if (v && v !== DEFAULT_STATUS && !out.includes(v)) out.push(v)
  }
  for (const k of EXTRA_KEYS) if (hasExtra(d, k) && !out.includes(EXTRA_STATUS_OF[k])) out.push(EXTRA_STATUS_OF[k])
  return out
}

const PLAN_KEYS: MarkKey[] = ['all', 'v', 'l', 'm', 'd', 'o', 'endo', 'pin', 'bracket']
const sameList = (a?: number[], b?: number[]) => JSON.stringify(a ?? []) === JSON.stringify(b ?? [])

/** O dente mudou em relação ao último salvamento? */
export function toothChanged(a: ToothData | undefined, b: ToothData | undefined): boolean {
  if (!a || !b) return false
  return a.status !== b.status || (a.note ?? '') !== (b.note ?? '') ||
    FACE_KEYS.some(k => a.surfaces[k] !== b.surfaces[k]) ||
    !sameList(a.endo, b.endo) || !sameList(a.pin, b.pin) || !!a.bracket !== !!b.bracket ||
    PLAN_KEYS.some(k => !!a.planned?.[k] !== !!b.planned?.[k])
}

/** Linhas de histórico do que mudou desde o último salvamento (dente inteiro, faces e tratamentos extras). */
export function pendingHistoryEntries(
  nums: number[], teeth: Record<number, ToothData | undefined>, saved: Record<number, ToothData | undefined>, by: string, at: string,
): OdontogramHistoryEntry[] {
  const out: OdontogramHistoryEntry[] = []
  for (const num of nums) {
    const now = teeth[num], before = saved[num]
    if (!now || !before) continue
    const isPlanned = (d: ToothData, k: MarkKey, on: boolean) => on && !!d.planned?.[k]
    const add = (face: string | undefined, status: string, planned: boolean) =>
      out.push({ at, tooth: num, ...(face ? { face } : {}), status, by, ...(planned ? { planned: true } : {}) })

    const pNow = isPlanned(now, 'all', now.status !== DEFAULT_STATUS), pBefore = isPlanned(before, 'all', before.status !== DEFAULT_STATUS)
    if (now.status !== before.status || pNow !== pBefore) add(undefined, now.status, pNow)
    for (const k of FACE_KEYS) {
      const on = now.surfaces[k] !== DEFAULT_STATUS, was = before.surfaces[k] !== DEFAULT_STATUS
      const p = isPlanned(now, k, on)
      if (now.surfaces[k] !== before.surfaces[k] || p !== isPlanned(before, k, was)) add(k, now.surfaces[k], p)
    }
    for (const k of EXTRA_KEYS) {
      const on = hasExtra(now, k), was = hasExtra(before, k)
      const p = isPlanned(now, k, on)
      const changed = k === 'bracket' ? on !== was : !sameList(now[k], before[k])
      if (changed || p !== isPlanned(before, k, was)) add(k, on ? EXTRA_STATUS_OF[k] : DEFAULT_STATUS, p)
    }
  }
  return out
}

// ── Texto para leitor de tela ───────────────────────────────────
const STATUS_NOUN: Record<string, string> = {
  higido: 'sem alteração', cariado: 'cárie', restaurado: 'restauração', ausente: 'ausente', implante: 'implante',
  coroa: 'coroa protética', tratamento: 'em tratamento', fraturado: 'fraturado', selante: 'selante',
  extracao: 'extração indicada', protese: 'prótese', endodontia: 'canal tratado', pino: 'pino intrarradicular', aparelho: 'aparelho ortodôntico',
}
export const statusNoun = (k: string) => STATUS_NOUN[k] ?? k

/** "Dente 36, face mesial, cárie": o rótulo de acessibilidade de cada zona clicável. */
export function zoneLabel(num: number, zone: Zone, d: ToothData): string {
  const base = `Dente ${num}`
  const planned = (k: MarkKey) => (d.planned?.[k] ? ' (a realizar)' : '')
  if (zone.kind === 'face') {
    const v = d.surfaces[zone.face]
    return `${base}, face ${faceLabel(num, zone.face).toLowerCase()}, ${statusNoun(v ?? DEFAULT_STATUS)}${v && v !== DEFAULT_STATUS ? planned(zone.face) : ''}`
  }
  const parts: string[] = []
  if (zone.kind === 'crown') {
    parts.push('coroa')
    if (d.status !== DEFAULT_STATUS) parts.push(statusNoun(d.status) + planned('all'))
    if (d.surfaces.v !== DEFAULT_STATUS) parts.push(`face vestibular, ${statusNoun(d.surfaces.v)}${planned('v')}`)
    if (d.bracket) parts.push('com braquete' + planned('bracket'))
    return [base, ...parts].join(', ')
  }
  const kind = toothKind(num)
  parts.push(`raiz ${rootName(kind, isUpperTooth(num), zone.root).toLowerCase()}`)
  if (d.endo?.includes(zone.root)) parts.push('canal tratado' + planned('endo'))
  if (d.pin?.includes(zone.root)) parts.push('pino intrarradicular' + planned('pin'))
  return [base, ...parts].join(', ')
}

/** Zona <-> texto de atributo data-zone ("face:m", "crown", "root:1", "num"). */
export const zoneToken = (z: Zone) => (z.kind === 'face' ? `face:${z.face}` : z.kind === 'root' ? `root:${z.root}` : 'crown')
export function parseZoneToken(t: string | null | undefined): Zone | null {
  if (!t) return null
  if (t === 'crown') return { kind: 'crown' }
  const [k, v] = t.split(':')
  if (k === 'face' && (FACE_KEYS as string[]).includes(v)) return { kind: 'face', face: v as SurfaceKey }
  if (k === 'root' && /^[0-2]$/.test(v)) return { kind: 'root', root: Number(v) }
  return null
}
