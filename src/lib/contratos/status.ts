// Estado dos contratos de paciente. "Vencido" NÃO é gravado: é calculado da vigência (data de término) para um
// contrato já assinado, então nunca fica desatualizado. Funções puras, testadas em contratos.test.ts.

import { parseIsoDay } from '@/lib/documentos/campos'

export const STORED_STATUSES = ['rascunho', 'enviado', 'assinado', 'cancelado'] as const
export type StoredStatus = (typeof STORED_STATUSES)[number]
export type ContractStatus = StoredStatus | 'vencido'

export const STATUS_LABEL: Record<ContractStatus, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  assinado: 'Assinado',
  vencido: 'Vencido',
  cancelado: 'Cancelado',
}

export const STATUS_ORDER: ContractStatus[] = ['rascunho', 'enviado', 'assinado', 'vencido', 'cancelado']

export const EXPIRING_WINDOW_DAYS = 30

export function isStoredStatus(v: unknown): v is StoredStatus {
  return typeof v === 'string' && (STORED_STATUSES as readonly string[]).includes(v)
}

function dayNumber(iso: string): number | null {
  const p = parseIsoDay(iso)
  return p ? Math.round(Date.UTC(p.y, p.m - 1, p.d) / 86_400_000) : null
}

/** Dias de `today` até `iso` (negativo = já passou). null se alguma data for inválida. */
export function daysUntil(iso: string | null | undefined, today: string): number | null {
  if (!iso) return null
  const a = dayNumber(iso)
  const b = dayNumber(today)
  return a === null || b === null ? null : a - b
}

export interface StatusInput {
  status: StoredStatus
  /** Término da vigência, "AAAA-MM-DD". */
  validUntil: string | null
  /** O paciente já assinou (existe documento assinado ligado ao contrato). */
  signed: boolean
}

/** Estado exibido: assinado com vigência já encerrada vira "vencido"; enviado já assinado pelo paciente vira "assinado". */
export function effectiveStatus(c: StatusInput, today: string): ContractStatus {
  if (c.status === 'cancelado') return 'cancelado'
  if (c.signed || c.status === 'assinado') {
    const left = daysUntil(c.validUntil, today)
    return left !== null && left < 0 ? 'vencido' : 'assinado'
  }
  return c.status === 'rascunho' ? 'rascunho' : 'enviado'
}

export type VigenciaState = 'sem_termino' | 'vigente' | 'vencendo' | 'vencido'

export interface VigenciaInfo {
  state: VigenciaState
  /** Dias até o término (negativo se já passou); null sem término. */
  days: number | null
}

/** Situação da vigência de um contrato assinado: "vencendo" quando faltam de 0 a 30 dias. */
export function vigenciaInfo(validUntil: string | null | undefined, today: string, window = EXPIRING_WINDOW_DAYS): VigenciaInfo {
  const days = daysUntil(validUntil, today)
  if (days === null) return { state: 'sem_termino', days: null }
  if (days < 0) return { state: 'vencido', days }
  return { state: days <= window ? 'vencendo' : 'vigente', days }
}

/** Frase curta para o alerta ("vence hoje", "vence em 12 dias", "venceu há 3 dias"); vazio sem término. */
export function vigenciaTexto(validUntil: string | null | undefined, today: string): string {
  const { days } = vigenciaInfo(validUntil, today)
  if (days === null) return ''
  if (days === 0) return 'vence hoje'
  if (days === 1) return 'vence amanhã'
  if (days > 1) return `vence em ${days} dias`
  return days === -1 ? 'venceu ontem' : `venceu há ${-days} dias`
}

export interface ListFilterItem {
  status: ContractStatus
  validUntil: string | null
  patientName: string
  title: string
}

/** Contrato assinado e vigente cujo término cai nos próximos `window` dias (inclusive hoje). */
export function isExpiringSoon(c: Pick<ListFilterItem, 'status' | 'validUntil'>, today: string, window = EXPIRING_WINDOW_DAYS): boolean {
  return c.status === 'assinado' && vigenciaInfo(c.validUntil, today, window).state === 'vencendo'
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export interface ContractFilter {
  status: ContractStatus | 'todos'
  query: string
  /** Só assinados que vencem em até 30 dias. */
  vencendo: boolean
}

/** Filtro da visão geral: estado, busca por paciente ou título (sem acento nem caixa) e "vencendo em 30 dias". */
export function filterContracts<T extends ListFilterItem>(items: T[], f: ContractFilter, today: string): T[] {
  const q = normalize(f.query)
  return items.filter(c => {
    if (f.status !== 'todos' && c.status !== f.status) return false
    if (f.vencendo && !isExpiringSoon(c, today)) return false
    if (q && !normalize(c.patientName).includes(q) && !normalize(c.title).includes(q)) return false
    return true
  })
}

export function countByStatus(items: Pick<ListFilterItem, 'status'>[]): Record<ContractStatus, number> {
  const out: Record<ContractStatus, number> = { rascunho: 0, enviado: 0, assinado: 0, vencido: 0, cancelado: 0 }
  for (const c of items) out[c.status]++
  return out
}
