// API de integração Gestor -> MyClinica (Fase C do plano "Admin da MyClinica no Gestor").
//
// Chamadas servidor-a-servidor, autenticadas por segredo compartilhado
// (GESTOR_INTEGRATION_KEY) em vez de sessão. Usa o service role, então TODA
// leitura/escrita aqui é escopada por clinic_id explicitamente e a resposta
// só carrega colunas da whitelist (nunca tokens, ids de assinatura Stripe/Asaas
// ou dado de paciente além da contagem).
//
// As regras de edição reproduzem as do ClinicEditModal do /admin, mas sem
// chamadas externas (Asaas): o que fica de fora volta em `warnings`.

import { createHash, timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { computeClinicStatus } from '@/lib/clinicStatus'
import { SELLABLE_PLANS, type SellablePlan } from '@/lib/planCatalog'
import { maskBrPhone, phoneInputError } from '@/lib/phoneFormat'

// ─── Resposta ────────────────────────────────────────────────────────────────

export function gestorJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export function gestorError(error: string, status: number): NextResponse {
  return gestorJson({ error }, status)
}

// ─── Autenticação ────────────────────────────────────────────────────────────

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest()

/**
 * Compara em tempo constante. Os dois lados passam por SHA-256 antes, então os
 * buffers têm sempre 32 bytes: timingSafeEqual não lança com tamanhos
 * diferentes e o tamanho do segredo não vaza pelo tempo de resposta.
 */
export function secretsMatch(provided: string, expected: string): boolean {
  return timingSafeEqual(sha256(provided), sha256(expected))
}

/**
 * Devolve null se a chamada está autorizada; senão, a resposta de erro pronta.
 * Falha fechada: sem GESTOR_INTEGRATION_KEY configurada nada passa (503).
 * Nunca loga o segredo nem o valor recebido.
 */
export function authenticateGestor(req: Request): NextResponse | null {
  const expected = process.env.GESTOR_INTEGRATION_KEY
  if (!expected) {
    console.error('[gestor-integration] GESTOR_INTEGRATION_KEY não configurada; integração desligada')
    return gestorError('Integração não configurada', 503)
  }

  const header = req.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  if (!match || !secretsMatch(match[1], expected)) {
    return gestorError('Não autorizado', 401)
  }
  return null
}

// ─── Tipos e mapeamento linha -> JSON ────────────────────────────────────────

export interface GestorClinic {
  id: string
  name: string
  slug: string
  clinicType: string
  plan: string | null
  /** Status calculado (computeClinicStatus), o mesmo que o /admin mostra: active | trial | trial_expired | suspended. */
  status: string
  isActive: boolean
  trialEndsAt: string | null
  maxPatients: number | null
  maxUsers: number | null
  customMonthlyPrice: number | null
  billingDueDay: number | null
  billingPaid: boolean
  billingPhone: string | null
  billingOverdueSince: string | null
  nextBillingDate: string | null
  phone: string | null
  email: string | null
  asaasCustomerId: string | null
  createdAt: string
  usersCount: number
  patientsCount: number
  specialties: string[]
  /** Conta de demonstração (clinics.demo_mode). false quando a coluna ainda não existe. Só leitura: não é editável pelo PATCH. */
  demoMode: boolean
}

/** Colunas lidas de `clinics` (whitelist; sem stripe_*, asaas_subscription_id, etc.). */
export const CLINIC_COLUMNS =
  'id, name, slug, clinic_type, plan, status, is_active, trial_ends_at, max_patients, max_users, ' +
  'custom_monthly_price, billing_due_day, billing_paid, billing_phone, billing_overdue_since, ' +
  'next_billing_date, phone, email, asaas_customer_id, created_at, specialties'

export interface ClinicRow {
  id: string
  name: string
  slug: string
  clinic_type: string
  plan: string | null
  status: string
  is_active: boolean | null
  trial_ends_at: string | null
  max_patients: number | null
  max_users: number | null
  custom_monthly_price: number | string | null
  billing_due_day: number | null
  billing_paid: boolean
  billing_phone: string | null
  billing_overdue_since: string | null
  next_billing_date: string | null
  phone: string | null
  email: string | null
  asaas_customer_id: string | null
  created_at: string
  specialties: string[] | null
}

export function computedStatusOf(row: Pick<ClinicRow, 'trial_ends_at' | 'billing_paid' | 'billing_overdue_since'>): string {
  return computeClinicStatus(row)
}

/**
 * `demoMode` vem de fora (demoClinicIds, que falha aberto): demo_mode fica fora de CLINIC_COLUMNS de
 * propósito, para uma coluna ausente não derrubar a listagem inteira.
 */
export function mapClinicRow(row: ClinicRow, usersCount: number, patientsCount: number, demoMode = false): GestorClinic {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    clinicType: row.clinic_type,
    plan: row.plan,
    status: computedStatusOf(row),
    isActive: row.is_active ?? true,
    trialEndsAt: row.trial_ends_at,
    maxPatients: row.max_patients,
    maxUsers: row.max_users,
    customMonthlyPrice: row.custom_monthly_price == null ? null : Number(row.custom_monthly_price),
    billingDueDay: row.billing_due_day,
    billingPaid: row.billing_paid,
    billingPhone: row.billing_phone,
    billingOverdueSince: row.billing_overdue_since,
    nextBillingDate: row.next_billing_date,
    phone: row.phone,
    email: row.email,
    asaasCustomerId: row.asaas_customer_id,
    createdAt: row.created_at,
    usersCount,
    patientsCount,
    specialties: row.specialties ?? [],
    demoMode,
  }
}

// ─── Listagem: parâmetros ────────────────────────────────────────────────────

export const LIST_STATUSES = ['active', 'trial', 'trial_expired', 'suspended'] as const

export interface ListParams {
  search: string
  plan: string
  status: string
  limit: number
  offset: number
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

/** Escapa %, _ e \ para uso literal dentro de um padrão ilike. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, c => `\\${c}`)
}

/**
 * Monta o filtro `or` do PostgREST (nome/slug/email). Tira vírgula, parênteses e
 * aspas do termo: são o separador/gramática do `or(...)` e abririam brecha pra
 * injetar condição extra.
 */
export function buildSearchFilter(search: string): string | null {
  const cleaned = search.replace(/[,()"']/g, ' ').trim()
  if (!cleaned) return null
  const pattern = `%${escapeLike(cleaned)}%`
  return `name.ilike.${pattern},slug.ilike.${pattern},email.ilike.${pattern}`
}

export function parseListParams(sp: URLSearchParams): Parsed<ListParams> {
  const search = (sp.get('search') ?? '').trim().slice(0, 100)
  const plan = (sp.get('plan') ?? '').trim()
  const status = (sp.get('status') ?? '').trim()

  if (status && !(LIST_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: `status inválido. Use: ${LIST_STATUSES.join(', ')}.` }
  }

  const intParam = (name: string, def: number): number | null => {
    const raw = sp.get(name)
    if (raw === null || raw === '') return def
    if (!/^\d+$/.test(raw)) return null
    return Number(raw)
  }
  const limitRaw = intParam('limit', 50)
  const offset = intParam('offset', 0)
  if (limitRaw === null || limitRaw < 1) return { ok: false, error: 'limit deve ser um inteiro entre 1 e 100.' }
  if (offset === null) return { ok: false, error: 'offset deve ser um inteiro >= 0.' }

  return { ok: true, value: { search, plan, status, limit: Math.min(limitRaw, 100), offset } }
}

// ─── PATCH: validação e whitelist ────────────────────────────────────────────

export const PATCHABLE_FIELDS = [
  'plan', 'maxPatients', 'maxUsers', 'trialEndsAt', 'customMonthlyPrice', 'billingDueDay', 'billingPaid', 'billingPhone',
] as const

export interface ClinicPatchInput {
  plan?: SellablePlan
  maxPatients?: number
  maxUsers?: number | null
  /** ISO já normalizado (UTC) ou null = acesso permanente. */
  trialEndsAt?: string | null
  customMonthlyPrice?: number | null
  billingDueDay?: number | null
  billingPaid?: boolean
  /** Já mascarado como o modal grava: "(88) 99223-3203". */
  billingPhone?: string | null
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)

/** Aceita ISO completo ou "YYYY-MM-DD" (vira fim do dia em Fortaleza, igual ao modal: T23:59:59 local). */
function normalizeTrialEndsAt(v: string): string | null {
  const s = v.trim()
  const raw = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T23:59:59-03:00` : s
  if (!/^\d{4}-\d{2}-\d{2}T/.test(raw)) return null
  const t = Date.parse(raw)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

export function validateClinicPatch(body: unknown): Parsed<ClinicPatchInput> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Corpo da requisição deve ser um objeto JSON.' }
  }
  const input = body as Record<string, unknown>

  const unknown = Object.keys(input).filter(k => !(PATCHABLE_FIELDS as readonly string[]).includes(k))
  if (unknown.length > 0) {
    return { ok: false, error: `Campo(s) não permitido(s): ${unknown.join(', ')}. Permitidos: ${PATCHABLE_FIELDS.join(', ')}.` }
  }
  if (Object.keys(input).length === 0) {
    return { ok: false, error: 'Informe ao menos um campo para alterar.' }
  }

  const out: ClinicPatchInput = {}

  if ('plan' in input) {
    if (typeof input.plan !== 'string' || !(SELLABLE_PLANS as string[]).includes(input.plan)) {
      return { ok: false, error: `plan inválido. Use: ${SELLABLE_PLANS.join(', ')}.` }
    }
    out.plan = input.plan as SellablePlan
  }

  if ('maxPatients' in input) {
    if (!isInt(input.maxPatients) || input.maxPatients < 0) {
      return { ok: false, error: 'maxPatients deve ser um inteiro >= 0.' }
    }
    out.maxPatients = input.maxPatients
  }

  if ('maxUsers' in input) {
    if (input.maxUsers !== null && (!isInt(input.maxUsers) || input.maxUsers < 0)) {
      return { ok: false, error: 'maxUsers deve ser um inteiro >= 0 ou null.' }
    }
    out.maxUsers = input.maxUsers as number | null
  }

  if ('trialEndsAt' in input) {
    if (input.trialEndsAt === null) {
      out.trialEndsAt = null
    } else {
      const iso = typeof input.trialEndsAt === 'string' ? normalizeTrialEndsAt(input.trialEndsAt) : null
      if (!iso) return { ok: false, error: 'trialEndsAt deve ser uma data ISO válida ou null (acesso permanente).' }
      out.trialEndsAt = iso
    }
  }

  if ('customMonthlyPrice' in input) {
    const p = input.customMonthlyPrice
    if (p !== null && (typeof p !== 'number' || !Number.isFinite(p) || p < 0)) {
      return { ok: false, error: 'customMonthlyPrice deve ser um número >= 0 ou null.' }
    }
    out.customMonthlyPrice = p === null ? null : Math.round((p as number) * 100) / 100
  }

  if ('billingDueDay' in input) {
    const d = input.billingDueDay
    // 1..28 como o /admin e a rota asaas/billing-action (dia 29-31 não existe em todo mês)
    if (d !== null && (!isInt(d) || d < 1 || d > 28)) {
      return { ok: false, error: 'billingDueDay deve ser um inteiro entre 1 e 28, ou null.' }
    }
    out.billingDueDay = d as number | null
  }

  if ('billingPaid' in input) {
    if (typeof input.billingPaid !== 'boolean') return { ok: false, error: 'billingPaid deve ser booleano.' }
    out.billingPaid = input.billingPaid
  }

  if ('billingPhone' in input) {
    const p = input.billingPhone
    if (p === null || (typeof p === 'string' && p.trim() === '')) {
      out.billingPhone = null
    } else if (typeof p !== 'string') {
      return { ok: false, error: 'billingPhone deve ser texto ou null.' }
    } else {
      const err = phoneInputError(p)
      if (err) return { ok: false, error: `billingPhone inválido. ${err}` }
      out.billingPhone = maskBrPhone(p)
    }
  }

  return { ok: true, value: out }
}

// ─── PATCH: cálculo do update (puro, sem rede) ───────────────────────────────

/** Subconjunto da linha que o cálculo precisa (inclui o id da assinatura Asaas SÓ para gerar warning). */
export interface ClinicPatchBase {
  plan: string | null
  max_patients: number | null
  max_users: number | null
  trial_ends_at: string | null
  custom_monthly_price: number | string | null
  billing_due_day: number | null
  billing_paid: boolean
  billing_phone: string | null
  billing_overdue_since: string | null
  status: string
  is_active: boolean | null
  asaas_subscription_id?: string | null
}

export interface ClinicUpdatePlan {
  /** Colunas a gravar (vazio = nada mudou). */
  update: Record<string, unknown>
  before: Record<string, unknown>
  after: Record<string, unknown>
  changed: string[]
  warnings: string[]
}

/**
 * O CHECK clinics_status_check do banco só aceita active/inactive/suspended/pending/trial.
 * 'trial_expired' é um status calculado (nunca gravável): na coluna, vira 'trial', que é o que
 * as clínicas com trial vencido já têm hoje. A API devolve o status calculado, não a coluna.
 */
export function storedStatusFor(computed: string): 'active' | 'trial' | 'suspended' {
  if (computed === 'suspended') return 'suspended'
  if (computed === 'active') return 'active'
  return 'trial'
}

const sameValue = (a: unknown, b: unknown) => {
  if (a == null || b == null) return a == null && b == null
  // numeric do Postgres pode chegar como string ("99.90"): compara por valor
  if (typeof a !== 'boolean' && typeof b !== 'boolean' && a !== '' && b !== '' && !isNaN(Number(a)) && !isNaN(Number(b))) {
    return Number(a) === Number(b)
  }
  return String(a) === String(b)
}

export function buildClinicUpdate(current: ClinicPatchBase, patch: ClinicPatchInput): ClinicUpdatePlan {
  const update: Record<string, unknown> = {}
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  const changed: string[] = []
  const warnings: string[] = []

  const set = (key: string, column: keyof ClinicPatchBase, next: unknown) => {
    const prev = current[column]
    if (sameValue(prev, next)) return
    update[column] = next
    before[key] = prev ?? null
    after[key] = next
    changed.push(key)
  }

  if (patch.plan !== undefined) set('plan', 'plan', patch.plan)
  if (patch.maxPatients !== undefined) set('maxPatients', 'max_patients', patch.maxPatients)
  if (patch.maxUsers !== undefined) set('maxUsers', 'max_users', patch.maxUsers)
  if (patch.trialEndsAt !== undefined) {
    // timestamptz: compara instantes, não texto (o banco devolve "+00:00", o patch vem em "Z")
    const prevT = current.trial_ends_at ? Date.parse(current.trial_ends_at) : null
    const nextT = patch.trialEndsAt ? Date.parse(patch.trialEndsAt) : null
    if (prevT !== nextT) set('trialEndsAt', 'trial_ends_at', patch.trialEndsAt)
  }
  if (patch.customMonthlyPrice !== undefined) set('customMonthlyPrice', 'custom_monthly_price', patch.customMonthlyPrice)
  if (patch.billingDueDay !== undefined) set('billingDueDay', 'billing_due_day', patch.billingDueDay)
  if (patch.billingPaid !== undefined) set('billingPaid', 'billing_paid', patch.billingPaid)
  if (patch.billingPhone !== undefined) set('billingPhone', 'billing_phone', patch.billingPhone)

  // Status/is_active só são recalculados quando algo que entra na conta mudou
  // (trial, pago, atraso). Mexer só em plano/limites não deve reescrever o status:
  // o status gravado de muita clínica está defasado do calculado e uma edição de
  // limite não é motivo pra suspender/reativar ninguém.
  const statusInputsChanged = 'trial_ends_at' in update || 'billing_paid' in update
  if (statusInputsChanged) {
    const nextPaid = (update.billing_paid as boolean | undefined) ?? current.billing_paid
    const nextTrial = 'trial_ends_at' in update ? (update.trial_ends_at as string | null) : current.trial_ends_at
    // Marcar como paga também limpa o atraso (espelha o modal e o webhook do Asaas)
    const nextOverdue = nextPaid ? null : current.billing_overdue_since
    const computed = computeClinicStatus({ trial_ends_at: nextTrial, billing_paid: nextPaid, billing_overdue_since: nextOverdue })
    const nextStatus = storedStatusFor(computed)
    const nextActive = computed !== 'suspended'

    if (!sameValue(current.billing_overdue_since, nextOverdue)) {
      update.billing_overdue_since = nextOverdue
      before.billingOverdueSince = current.billing_overdue_since
      after.billingOverdueSince = nextOverdue
    }
    if (current.status !== nextStatus) {
      update.status = nextStatus
      before.status = current.status
      after.status = nextStatus
    }
    if ((current.is_active ?? true) !== nextActive) {
      update.is_active = nextActive
      before.isActive = current.is_active ?? true
      after.isActive = nextActive
    }
  }

  // Efeitos do /admin que dependem de Asaas e NÃO são reproduzidos aqui
  if ('billing_due_day' in update && update.billing_due_day !== null && current.asaas_subscription_id) {
    warnings.push(
      'billingDueDay foi gravado só no banco: a assinatura existente na Asaas NÃO foi atualizada ' +
      '(o /admin da MyClinica empurra o novo nextDueDate para a Asaas via /api/asaas/billing-action).',
    )
  }

  return { update, before, after, changed, warnings }
}

// ─── Auditoria ───────────────────────────────────────────────────────────────

export interface AuditEntry {
  clinicId: string
  changed: string[]
  before: Record<string, unknown>
  after: Record<string, unknown>
  ip: string | null
  userAgent: string | null
}

/** Linha de audit_logs para 'gestor.clinic_update'. user_id fica null (não há usuário da MyClinica por trás). */
export function buildAuditRow(e: AuditEntry) {
  return {
    action: 'gestor.clinic_update',
    module: 'gestor',
    clinic_id: e.clinicId,
    resource_id: e.clinicId,
    user_id: null,
    ip_address: e.ip,
    user_agent: e.userAgent ? e.userAgent.slice(0, 255) : null,
    details: { origin: 'gestor', changed: e.changed, before: e.before, after: e.after },
  }
}

export function requestMeta(req: Request): { ip: string | null; userAgent: string | null } {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? null
  return { ip, userAgent: req.headers.get('user-agent') }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
