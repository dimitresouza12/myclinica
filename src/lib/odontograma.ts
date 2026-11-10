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

// Ordem FDI como o dentista lê a arcada (direito do paciente à esquerda da tela)
export const UPPER = [18,17,16,15,14,13,12,11, 21,22,23,24,25,26,27,28]
export const LOWER = [48,47,46,45,44,43,42,41, 31,32,33,34,35,36,37,38]
export const ALL_TEETH = [...UPPER, ...LOWER]

export type SurfaceKey = 'v' | 'l' | 'm' | 'd' | 'o'
export const FACE_NAME: Record<SurfaceKey, string> = { v: 'Vestibular', l: 'Lingual', m: 'Mesial', d: 'Distal', o: 'Oclusal' }
export const FACE_KEYS = Object.keys(FACE_NAME) as SurfaceKey[]

export const statusColor = (k: string) => TOOTH_STATUS.find(s => s.key === k)?.color ?? '#10b981'
export const statusBg    = (k: string) => TOOTH_STATUS.find(s => s.key === k)?.bg    ?? '#d1fae5'
export const statusLabel = (k: string) => TOOTH_STATUS.find(s => s.key === k)?.label ?? k

// ── Plano de tratamento: marcações "a realizar" ─────────────────────
export type MarkKey = 'all' | SurfaceKey
export interface PlanTooth {
  status: string
  surfaces: Record<SurfaceKey, string>
  /** quais marcações são do plano ("a realizar") em vez de já existentes; sem a chave = existente */
  planned?: Partial<Record<MarkKey, boolean>>
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
  return out
}

export function plannedMarks(teeth: Record<number, PlanTooth | undefined>): ToothMark[] {
  return ALL_TEETH.flatMap(n => (teeth[n] ? toothMarks(n, teeth[n]!).filter(m => m.planned) : []))
}

// o que cada condição vira como item de orçamento
const BUDGET_NAME: Record<string, string> = {
  restaurado: 'Restauração', coroa: 'Coroa', implante: 'Implante', selante: 'Selante', extracao: 'Extração',
  protese: 'Prótese', tratamento: 'Tratamento', cariado: 'Tratamento de cárie', fraturado: 'Tratamento de fratura',
  ausente: 'Reposição do dente',
}
export function budgetDescription(m: ToothMark): string {
  const name = BUDGET_NAME[m.status] ?? statusLabel(m.status)
  return `${name} no dente ${m.tooth}${m.key === 'all' ? '' : ` (face ${FACE_NAME[m.key].toLowerCase()})`}`
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const PROCEDURE_WORDS: Record<string, string[]> = {
  restaurado: ['restaura'], cariado: ['restaura'], fraturado: ['restaura', 'coroa'], coroa: ['coroa'],
  implante: ['implante'], selante: ['selante'], extracao: ['extra'], protese: ['protese'],
  tratamento: ['canal', 'tratamento'], ausente: ['implante', 'protese'],
}
/** Procedimento do cadastro da clínica que melhor combina com a condição, para sugerir o preço. */
export function suggestProcedure<T extends { name: string; is_active?: boolean }>(status: string, procedures: T[]): T | null {
  for (const w of PROCEDURE_WORDS[status] ?? []) {
    const hit = procedures.find(p => p.is_active !== false && norm(p.name).includes(w))
    if (hit) return hit
  }
  return null
}
