// Regras puras do cadastro de convênios: registro ANS, tabela de valores, validade da carteirinha.
import { onlyDigits } from '@/lib/numericFormat'
import type { InsurancePlan } from './types'

export const ANS_DIGITS = 6

/** Só os números do registro ANS, no máximo 6. */
export function maskAnsRegistry(input: string | null | undefined): string {
  return onlyDigits(input).slice(0, ANS_DIGITS)
}

/** Registro ANS é opcional; se vier, precisa ter 6 números. */
export function ansRegistryError(value: string | null | undefined): string | null {
  const v = (value ?? '').trim()
  if (!v) return null
  return /^\d{6}$/.test(v) ? null : 'O registro ANS tem 6 números.'
}

/** Lê procedure_prices do banco: só entram valores numéricos finitos e não negativos. */
export function normalizePrices(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN
    if (k && Number.isFinite(n) && n >= 0) out[k] = Math.round(n * 100) / 100
  }
  return out
}

/** Linha crua de insurance_plans → InsurancePlan (tolera coluna faltando). */
export function toInsurancePlan(row: Record<string, unknown>): InsurancePlan {
  return {
    id: String(row.id),
    clinic_id: String(row.clinic_id),
    name: String(row.name ?? ''),
    ans_registry: row.ans_registry ? String(row.ans_registry) : null,
    procedure_prices: normalizePrices(row.procedure_prices),
    notes: row.notes ? String(row.notes) : null,
    is_active: row.is_active !== false,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  }
}

export interface PlanDraft {
  name: string
  ans_registry: string
  notes: string
  /** valor por procedimento como texto decimal ("150.00"); vazio = sem valor específico */
  prices: Record<string, string>
}

export function validatePlanDraft(d: PlanDraft): string | null {
  const name = d.name.trim()
  if (name.length < 2) return 'Informe o nome do convênio.'
  if (name.length > 80) return 'Nome muito longo (máx. 80 caracteres).'
  return ansRegistryError(d.ans_registry)
}

/** Rascunho do formulário → colunas gravadas (valores vazios ou inválidos ficam de fora da tabela). */
export function planDraftToColumns(d: PlanDraft): { name: string; ans_registry: string | null; notes: string | null; procedure_prices: Record<string, number> } {
  return {
    name: d.name.trim(),
    ans_registry: d.ans_registry.trim() || null,
    notes: d.notes.trim() || null,
    procedure_prices: normalizePrices(Object.fromEntries(Object.entries(d.prices).filter(([, v]) => v.trim() !== ''))),
  }
}

export function planToDraft(p: InsurancePlan | null): PlanDraft {
  return {
    name: p?.name ?? '',
    ans_registry: p?.ans_registry ?? '',
    notes: p?.notes ?? '',
    prices: Object.fromEntries(Object.entries(p?.procedure_prices ?? {}).map(([k, v]) => [k, v.toFixed(2)])),
  }
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

/** Convênio cadastrado do paciente: pelo vínculo (insurance_plan_id) ou, sem ele, pelo nome digitado. */
export function findPlan(plans: InsurancePlan[], link: { insurance_plan_id?: string | null; convenio?: string | null }): InsurancePlan | null {
  if (link.insurance_plan_id) {
    const byId = plans.find(p => p.id === link.insurance_plan_id)
    if (byId) return byId
  }
  const n = norm(link.convenio)
  return n ? (plans.find(p => norm(p.name) === n) ?? null) : null
}

/** Valor do procedimento na tabela do convênio; null quando não há valor cadastrado. */
export function planPrice(plan: InsurancePlan | null | undefined, procedureId: string | null | undefined): number | null {
  if (!plan || !procedureId) return null
  const v = plan.procedure_prices[procedureId]
  return typeof v === 'number' ? v : null
}

export type CarteirinhaStatus = 'sem_validade' | 'ok' | 'vencida'

/** Carteirinha vencida = validade anterior a hoje (os dois em AAAA-MM-DD, fuso de Brasília). */
export function carteirinhaStatus(validade: string | null | undefined, hoje: string): CarteirinhaStatus {
  const v = (validade ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'sem_validade'
  return v < hoje ? 'vencida' : 'ok'
}
