// Dados do odontograma compartilhados entre a tela (TabOdontograma) e a impressão (print.ts).

export const TOOTH_STATUS = [
  { key: 'higido',     label: 'Hígido',       color: '#10b981', bg: '#d1fae5' },
  { key: 'cariado',    label: 'Cariado',       color: '#ef4444', bg: '#fee2e2' },
  { key: 'restaurado', label: 'Restaurado',    color: '#3b82f6', bg: '#dbeafe' },
  { key: 'ausente',    label: 'Ausente',       color: '#6b7280', bg: '#f3f4f6' },
  { key: 'implante',   label: 'Implante',      color: '#f59e0b', bg: '#fef3c7' },
  { key: 'coroa',      label: 'Coroa',         color: '#14b8a6', bg: '#ccfbf1' },
  { key: 'tratamento', label: 'Em Tratamento', color: '#ec4899', bg: '#fce7f3' },
  { key: 'fraturado',  label: 'Fraturado',     color: '#ea580c', bg: '#ffedd5' },
  { key: 'selante',    label: 'Selante',       color: '#7c3aed', bg: '#ede9fe' },
  { key: 'extracao',   label: 'Extração Indicada', color: '#b91c1c', bg: '#fecaca' },
  { key: 'protese',    label: 'Prótese',       color: '#0891b2', bg: '#cffafe' },
]

export const DEFAULT_STATUS = 'higido'

// Tratamentos que convivem com qualquer condição do dente (um dente com canal pode ter pino, coroa e braquete ao mesmo tempo),
// por isso ficam em campos próprios de ToothData e não no `status` único. Cada um tem a sua cor e o seu rótulo.
export type ExtraKey = 'endo' | 'pin' | 'bracket'
export const EXTRA_KEYS: ExtraKey[] = ['endo', 'pin', 'bracket']
export const EXTRA_STATUS_OF: Record<ExtraKey, string> = { endo: 'endodontia', pin: 'pino', bracket: 'aparelho' }
export const EXTRA_NAME: Record<ExtraKey, string> = { endo: 'Canal', pin: 'Pino', bracket: 'Aparelho' }
export const EXTRA_STATUS = [
  { key: 'endodontia', label: 'Tratamento de canal',  color: '#e11d48', bg: '#ffe4e6' },
  { key: 'pino',       label: 'Pino intrarradicular', color: '#64748b', bg: '#e2e8f0' },
  { key: 'aparelho',   label: 'Aparelho ortodôntico', color: '#0284c7', bg: '#e0f2fe' },
]
/** Condições + tratamentos extras, para cor e rótulo. */
export const ALL_STATUS = [...TOOTH_STATUS, ...EXTRA_STATUS]

// Ordem FDI como o dentista lê a arcada (direito do paciente à esquerda da tela)
export const UPPER = [18,17,16,15,14,13,12,11, 21,22,23,24,25,26,27,28]
export const LOWER = [48,47,46,45,44,43,42,41, 31,32,33,34,35,36,37,38]
export const ALL_TEETH = [...UPPER, ...LOWER]

// Dentição decídua (dentes de leite), 5 por quadrante: 51-55, 61-65, 71-75, 81-85, na mesma ordem de leitura.
// ALL_TEETH continua sendo só os 32 permanentes (a impressão e os dados antigos dependem disso).
export const UPPER_DECIDUOUS = [55,54,53,52,51, 61,62,63,64,65]
export const LOWER_DECIDUOUS = [85,84,83,82,81, 71,72,73,74,75]
export const ALL_DECIDUOUS = [...UPPER_DECIDUOUS, ...LOWER_DECIDUOUS]
/** Os 32 permanentes mais os 20 decíduos. */
export const EVERY_TOOTH = [...ALL_TEETH, ...ALL_DECIDUOUS]

export type Dentition = 'permanente' | 'decidua' | 'mista'
export const DENTITION_LABEL: Record<Dentition, string> = { permanente: 'Permanente', decidua: 'Decídua', mista: 'Mista' }

export const isDeciduous = (n: number) => ALL_DECIDUOUS.includes(n)
export const isPermanentTooth = (n: number) => ALL_TEETH.includes(n)
export const isValidTooth = (n: number) => isDeciduous(n) || isPermanentTooth(n)
/** Quadrante FDI: 1-4 permanentes, 5-8 decíduos. */
export const quadrantOf = (n: number) => Math.floor(n / 10)
/** Arcada superior (quadrantes 1, 2, 5, 6). */
export const isUpperTooth = (n: number) => [1, 2, 5, 6].includes(quadrantOf(n))
/** Dente decíduo -> permanente que vai substituí-lo (55 -> 15). Null para permanente ou número inválido. */
export function successorOf(n: number): number | null {
  if (!isDeciduous(n)) return null
  return (quadrantOf(n) - 4) * 10 + (n % 10)
}
/** Linhas da arcada (superior e inferior) para o tipo de dentição. Mista = as duas listas, permanentes primeiro. */
export function teethFor(d: Dentition): { upper: number[]; lower: number[] } {
  if (d === 'permanente') return { upper: UPPER, lower: LOWER }
  if (d === 'decidua') return { upper: UPPER_DECIDUOUS, lower: LOWER_DECIDUOUS }
  return { upper: [...UPPER, ...UPPER_DECIDUOUS], lower: [...LOWER, ...LOWER_DECIDUOUS] }
}
/** Todos os dentes visíveis na dentição escolhida. */
export function visibleTeeth(d: Dentition): number[] {
  const { upper, lower } = teethFor(d)
  return [...upper, ...lower]
}

/** Idade em anos completos a partir de "AAAA-MM-DD"; null sem data válida. */
export function ageInYears(birth: string | null | undefined, now: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birth ?? '')
  if (!m) return null
  const y = +m[1], mo = +m[2], d = +m[3]
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  let age = now.getFullYear() - y
  if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) age--
  return age >= 0 && age < 130 ? age : null
}

/**
 * Dentição com que o odontograma abre. Dente decíduo já registrado manda (decídua pura só para criança
 * pequena; senão mista); sem registro, vai pela idade: até 5 anos decídua, 6 a 12 mista, acima disso permanente.
 */
export function suggestDentition(ageYears: number | null, hasDeciduousData: boolean): Dentition {
  if (hasDeciduousData) return ageYears !== null && ageYears < 6 ? 'decidua' : 'mista'
  if (ageYears === null) return 'permanente'
  if (ageYears < 6) return 'decidua'
  if (ageYears <= 12) return 'mista'
  return 'permanente'
}

const POSITION_NAME = ['', 'Incisivo central', 'Incisivo lateral', 'Canino', '1º pré-molar', '2º pré-molar', '1º molar', '2º molar', '3º molar (siso)']
const POSITION_NAME_DECIDUOUS = ['', 'Incisivo central', 'Incisivo lateral', 'Canino', '1º molar', '2º molar']
const QUADRANT_NAME = ['', 'Superior direito', 'Superior esquerdo', 'Inferior esquerdo', 'Inferior direito']
/** "Incisivo central", "1º molar" etc., conforme a dentição do dente. */
export function toothPositionName(n: number): string {
  return (isDeciduous(n) ? POSITION_NAME_DECIDUOUS : POSITION_NAME)[n % 10] ?? ''
}
/** "Superior direito" etc.; os quadrantes 5-8 caem nos mesmos nomes de 1-4. */
export function quadrantName(n: number): string {
  const q = quadrantOf(n)
  return QUADRANT_NAME[q > 4 ? q - 4 : q] ?? ''
}

export type SurfaceKey = 'v' | 'l' | 'm' | 'd' | 'o'
export const FACE_NAME: Record<SurfaceKey, string> = { v: 'Vestibular', l: 'Lingual', m: 'Mesial', d: 'Distal', o: 'Oclusal' }
export const FACE_KEYS = Object.keys(FACE_NAME) as SurfaceKey[]

export const statusColor = (k: string) => ALL_STATUS.find(s => s.key === k)?.color ?? '#10b981'
export const statusBg    = (k: string) => ALL_STATUS.find(s => s.key === k)?.bg    ?? '#d1fae5'
export const statusLabel = (k: string) => ALL_STATUS.find(s => s.key === k)?.label ?? k

// ── Plano de tratamento: marcações "a realizar" ─────────────────────
export type MarkKey = 'all' | SurfaceKey | ExtraKey
export interface PlanTooth {
  status: string
  surfaces: Record<SurfaceKey, string>
  /** quais marcações são do plano ("a realizar") em vez de já existentes; sem a chave = existente */
  planned?: Partial<Record<MarkKey, boolean>>
  /** raízes (0, 1, 2; a ordem é a do desenho do dente) com tratamento de canal */
  endo?: number[]
  /** raízes com pino intrarradicular */
  pin?: number[]
  /** braquete ortodôntico colado na face vestibular */
  bracket?: boolean
}
export interface ToothMark { tooth: number; key: MarkKey; status: string; planned: boolean }

/** Todas as marcações do dente (dente inteiro e faces) que não são hígidas. */
export function toothMarks(tooth: number, d: PlanTooth): ToothMark[] {
  const out: ToothMark[] = []
  if (d.status && d.status !== DEFAULT_STATUS) out.push({ tooth, key: 'all', status: d.status, planned: !!d.planned?.all })
  for (const k of FACE_KEYS) {
    const v = d.surfaces?.[k]
    if (v && v !== DEFAULT_STATUS) out.push({ tooth, key: k, status: v, planned: !!d.planned?.[k] })
  }
  for (const k of EXTRA_KEYS) if (hasExtra(d, k)) out.push({ tooth, key: k, status: EXTRA_STATUS_OF[k], planned: !!d.planned?.[k] })
  return out
}

/** O dente tem esse tratamento extra (canal, pino ou braquete)? */
export function hasExtra(d: PlanTooth | undefined, k: ExtraKey): boolean {
  if (!d) return false
  return k === 'bracket' ? !!d.bracket : !!d[k]?.length
}

export function plannedMarks(teeth: Record<number, PlanTooth | undefined>): ToothMark[] {
  return EVERY_TOOTH.flatMap(n => (teeth[n] ? toothMarks(n, teeth[n]!).filter(m => m.planned) : []))
}

// o que cada condição vira como item de orçamento
const BUDGET_NAME: Record<string, string> = {
  restaurado: 'Restauração', coroa: 'Coroa', implante: 'Implante', selante: 'Selante', extracao: 'Extração',
  protese: 'Prótese', tratamento: 'Tratamento', cariado: 'Tratamento de cárie', fraturado: 'Tratamento de fratura',
  ausente: 'Reposição do dente', endodontia: 'Tratamento de canal', pino: 'Pino intrarradicular', aparelho: 'Aparelho ortodôntico',
}
export function budgetDescription(m: ToothMark): string {
  const name = BUDGET_NAME[m.status] ?? statusLabel(m.status)
  const face = m.key !== 'all' && m.key in FACE_NAME ? ` (face ${FACE_NAME[m.key as SurfaceKey].toLowerCase()})` : ''
  return `${name} no dente ${m.tooth}${face}`
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const PROCEDURE_WORDS: Record<string, string[]> = {
  restaurado: ['restaura'], cariado: ['restaura'], fraturado: ['restaura', 'coroa'], coroa: ['coroa'],
  implante: ['implante'], selante: ['selante'], extracao: ['extra'], protese: ['protese'],
  tratamento: ['canal', 'tratamento'], ausente: ['implante', 'protese'],
  endodontia: ['canal', 'endodon'], pino: ['pino', 'nucleo'], aparelho: ['ortod', 'aparelho', 'braquete'],
}
/** Procedimento do cadastro da clínica que melhor combina com a condição, para sugerir o preço. */
export function suggestProcedure<T extends { name: string; is_active?: boolean }>(status: string, procedures: T[]): T | null {
  for (const w of PROCEDURE_WORDS[status] ?? []) {
    const hit = procedures.find(p => p.is_active !== false && norm(p.name).includes(w))
    if (hit) return hit
  }
  return null
}

// ── Dados salvos de cada dente ──────────────────────────────────────
export interface ToothData extends PlanTooth { note?: string }

export function emptyTooth(): ToothData {
  return { status: DEFAULT_STATUS, surfaces: { v: 'higido', l: 'higido', m: 'higido', d: 'higido', o: 'higido' }, note: '' }
}

/** Liga ou desliga "a realizar" numa marcação; tira as chaves falsas para o dente ficar igual ao que veio do banco. */
export function withPlanned(d: ToothData, key: MarkKey, on: boolean): ToothData {
  const planned = { ...d.planned }
  if (on) planned[key] = true; else delete planned[key]
  return { ...d, planned: Object.keys(planned).length ? planned : undefined }
}

/** Dente sem nenhuma informação (hígido, faces hígidas, sem observação, sem plano). */
export function isEmptyTooth(d: ToothData | undefined): boolean {
  if (!d) return true
  if (EXTRA_KEYS.some(k => hasExtra(d, k))) return false
  if (d.status && d.status !== DEFAULT_STATUS) return false
  if (FACE_KEYS.some(k => d.surfaces?.[k] && d.surfaces[k] !== DEFAULT_STATUS)) return false
  if (d.note?.trim()) return false
  return !Object.values(d.planned ?? {}).some(Boolean)
}

/** Lista de raízes válida (inteiros de 0 a 2, sem repetir, em ordem) ou undefined; dado fora disso é descartado. */
export function cleanRoots(v: unknown): number[] | undefined {
  if (!Array.isArray(v)) return undefined
  const roots = Array.from(new Set(v.filter((r): r is number => Number.isInteger(r) && r >= 0 && r <= 2))).sort()
  return roots.length ? roots : undefined
}

/** Tira dos extras o que não vale (lista vazia, braquete falso) para o dente gravado ficar igual ao antigo quando não usa isso. */
export function cleanExtras<T extends PlanTooth>(d: T): T {
  const out = { ...d }
  const endo = cleanRoots(d.endo), pin = cleanRoots(d.pin)
  if (endo) out.endo = endo; else delete out.endo
  if (pin) out.pin = pin; else delete out.pin
  if (d.bracket === true) out.bracket = true; else delete out.bracket
  return out
}

/**
 * Lê o jsonb `odontogram` (dentes pelo número FDI, `_history` à parte) para os 52 dentes.
 * Aceita o formato antigo em que o dente era só a string da condição.
 */
export function readOdontogram(raw: Record<string, unknown>): Record<number, ToothData> {
  const loaded: Record<number, ToothData> = {}
  for (const num of EVERY_TOOTH) {
    const v = raw[num]
    if (!v) loaded[num] = emptyTooth()
    else if (typeof v === 'string') loaded[num] = { ...emptyTooth(), status: validStatus(v) }
    else {
      const t = v as Partial<ToothData>
      const base = emptyTooth()
      const surfaces = { ...base.surfaces }
      for (const k of FACE_KEYS) if (t.surfaces && k in t.surfaces) surfaces[k] = validStatus(t.surfaces[k])
      loaded[num] = cleanExtras({ ...base, ...t, status: validStatus(t.status), surfaces })
    }
  }
  return loaded
}

/** Condição conhecida (ver ALL_STATUS); texto estranho, de outro formato ou de dado corrompido vira hígido em vez de órfão sem cor nem rótulo. */
export function validStatus(s: unknown): string {
  return typeof s === 'string' && ALL_STATUS.some(x => x.key === s) ? s : DEFAULT_STATUS
}

/**
 * Monta o jsonb a gravar. Os 32 permanentes sempre vão (como sempre foi); os decíduos só quando têm
 * alguma informação, então quem nunca usou a dentição decídua continua com o mesmo formato de antes.
 */
export function serializeOdontogram(teeth: Record<number, ToothData>, history: unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const n of ALL_TEETH) if (teeth[n]) out[n] = teeth[n]
  for (const n of ALL_DECIDUOUS) if (teeth[n] && !isEmptyTooth(teeth[n])) out[n] = teeth[n]
  out._history = history
  return out
}

/** O jsonb tem algum dente decíduo com informação? */
export function hasDeciduousData(raw: Record<string, unknown>): boolean {
  const t = readOdontogram(raw)
  return ALL_DECIDUOUS.some(n => !isEmptyTooth(t[n]))
}
