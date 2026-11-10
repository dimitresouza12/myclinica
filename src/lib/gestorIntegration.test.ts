import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  authenticateGestor,
  secretsMatch,
  escapeLike,
  buildSearchFilter,
  parseListParams,
  validateClinicPatch,
  buildClinicUpdate,
  buildAuditRow,
  storedStatusFor,
  mapClinicRow,
  PATCHABLE_FIELDS,
  CLINIC_COLUMNS,
  type ClinicPatchBase,
  type ClinicRow,
} from './gestorIntegration'

const DAY = 86_400_000
const future = () => new Date(Date.now() + 10 * DAY).toISOString()
const past = () => new Date(Date.now() - 10 * DAY).toISOString()

const base = (over: Partial<ClinicPatchBase> = {}): ClinicPatchBase => ({
  plan: 'completo', max_patients: 200, max_users: null, trial_ends_at: null, custom_monthly_price: null,
  billing_due_day: null, billing_paid: false, billing_phone: null, billing_overdue_since: null,
  status: 'active', is_active: true, asaas_subscription_id: null, ...over,
})

function req(auth?: string) {
  return new Request('http://x/api', { headers: auth ? { authorization: auth } : {} })
}

describe('authenticateGestor', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

  it('sem GESTOR_INTEGRATION_KEY configurada: falha fechada (503)', async () => {
    vi.stubEnv('GESTOR_INTEGRATION_KEY', '')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = authenticateGestor(req('Bearer qualquer'))
    expect(res?.status).toBe(503)
  })

  it('sem header, esquema errado ou chave errada: 401', () => {
    vi.stubEnv('GESTOR_INTEGRATION_KEY', 'segredo-de-teste')
    expect(authenticateGestor(req())?.status).toBe(401)
    expect(authenticateGestor(req('Basic segredo-de-teste'))?.status).toBe(401)
    expect(authenticateGestor(req('Bearer errado'))?.status).toBe(401)
    expect(authenticateGestor(req('Bearer '))?.status).toBe(401)
  })

  it('chave certa passa (null)', () => {
    vi.stubEnv('GESTOR_INTEGRATION_KEY', 'segredo-de-teste')
    expect(authenticateGestor(req('Bearer segredo-de-teste'))).toBeNull()
  })

  it('secretsMatch não lança com tamanhos diferentes', () => {
    expect(secretsMatch('a', 'abcdefghijklmnop')).toBe(false)
    expect(secretsMatch('abc', 'abc')).toBe(true)
  })
})

describe('busca e listagem', () => {
  it('escapeLike neutraliza % _ e \\', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\')
  })

  it('buildSearchFilter tira separadores do or() e escapa curingas', () => {
    expect(buildSearchFilter('   ')).toBeNull()
    const f = buildSearchFilter('a,b)(%')!
    expect(f).not.toMatch(/[()]/)
    expect(f.split(',')).toHaveLength(3) // só os 3 campos: name, slug, email
    expect(f).toContain('\\%')
  })

  it('parseListParams: padrões, teto de 100 e rejeições', () => {
    expect(parseListParams(new URLSearchParams())).toEqual({ ok: true, value: { search: '', plan: '', status: '', limit: 50, offset: 0 } })
    const big = parseListParams(new URLSearchParams('limit=9999&offset=20'))
    expect(big.ok && big.value.limit).toBe(100)
    expect(parseListParams(new URLSearchParams('limit=0')).ok).toBe(false)
    expect(parseListParams(new URLSearchParams('limit=abc')).ok).toBe(false)
    expect(parseListParams(new URLSearchParams('offset=-1')).ok).toBe(false)
    expect(parseListParams(new URLSearchParams('status=banana')).ok).toBe(false)
    expect(parseListParams(new URLSearchParams('status=trial_expired')).ok).toBe(true)
  })
})

describe('validateClinicPatch (whitelist e tipos)', () => {
  it('campo fora da whitelist => erro, mesmo status/isActive', () => {
    for (const k of ['status', 'isActive', 'name', 'slug', 'asaasCustomerId', 'id']) {
      const r = validateClinicPatch({ [k]: 'x' })
      expect(r.ok).toBe(false)
    }
    expect(validateClinicPatch({ plan: 'essencial', status: 'active' }).ok).toBe(false)
  })

  it('corpo vazio, array ou não-objeto => erro', () => {
    expect(validateClinicPatch({}).ok).toBe(false)
    expect(validateClinicPatch([]).ok).toBe(false)
    expect(validateClinicPatch(null).ok).toBe(false)
    expect(validateClinicPatch('x').ok).toBe(false)
  })

  it('plan só aceita os vendáveis', () => {
    expect(validateClinicPatch({ plan: 'ilimitado' }).ok).toBe(true)
    expect(validateClinicPatch({ plan: 'avancado' }).ok).toBe(false)
    expect(validateClinicPatch({ plan: 5 }).ok).toBe(false)
  })

  it('maxPatients / maxUsers: inteiro >= 0 (maxUsers aceita null)', () => {
    expect(validateClinicPatch({ maxPatients: 0 }).ok).toBe(true)
    expect(validateClinicPatch({ maxPatients: -1 }).ok).toBe(false)
    expect(validateClinicPatch({ maxPatients: 1.5 }).ok).toBe(false)
    expect(validateClinicPatch({ maxPatients: null }).ok).toBe(false)
    expect(validateClinicPatch({ maxPatients: '10' }).ok).toBe(false)
    expect(validateClinicPatch({ maxUsers: null }).ok).toBe(true)
    expect(validateClinicPatch({ maxUsers: 3 }).ok).toBe(true)
    expect(validateClinicPatch({ maxUsers: -2 }).ok).toBe(false)
  })

  it('trialEndsAt: ISO, data simples (fim do dia -03:00) ou null', () => {
    const iso = validateClinicPatch({ trialEndsAt: '2030-01-15T10:00:00Z' })
    expect(iso.ok && iso.value.trialEndsAt).toBe('2030-01-15T10:00:00.000Z')
    const d = validateClinicPatch({ trialEndsAt: '2030-01-15' })
    expect(d.ok && d.value.trialEndsAt).toBe('2030-01-16T02:59:59.000Z')
    const n = validateClinicPatch({ trialEndsAt: null })
    expect(n.ok && n.value.trialEndsAt).toBeNull()
    expect(validateClinicPatch({ trialEndsAt: 'amanhã' }).ok).toBe(false)
    expect(validateClinicPatch({ trialEndsAt: '2030-13-45' }).ok).toBe(false)
    expect(validateClinicPatch({ trialEndsAt: 123 }).ok).toBe(false)
  })

  it('customMonthlyPrice: >= 0, arredonda centavos, aceita null', () => {
    const p = validateClinicPatch({ customMonthlyPrice: 99.999 })
    expect(p.ok && p.value.customMonthlyPrice).toBe(100)
    expect(validateClinicPatch({ customMonthlyPrice: null }).ok).toBe(true)
    expect(validateClinicPatch({ customMonthlyPrice: -1 }).ok).toBe(false)
    expect(validateClinicPatch({ customMonthlyPrice: '10' }).ok).toBe(false)
    expect(validateClinicPatch({ customMonthlyPrice: Infinity }).ok).toBe(false)
  })

  it('billingDueDay: 1..28 ou null (mesma regra do /admin)', () => {
    expect(validateClinicPatch({ billingDueDay: 1 }).ok).toBe(true)
    expect(validateClinicPatch({ billingDueDay: 28 }).ok).toBe(true)
    expect(validateClinicPatch({ billingDueDay: null }).ok).toBe(true)
    expect(validateClinicPatch({ billingDueDay: 0 }).ok).toBe(false)
    expect(validateClinicPatch({ billingDueDay: 29 }).ok).toBe(false)
    expect(validateClinicPatch({ billingDueDay: 10.5 }).ok).toBe(false)
  })

  it('billingPaid booleano; billingPhone válido é mascarado, inválido rejeitado, vazio vira null', () => {
    expect(validateClinicPatch({ billingPaid: true }).ok).toBe(true)
    expect(validateClinicPatch({ billingPaid: 'true' }).ok).toBe(false)
    const ph = validateClinicPatch({ billingPhone: '88992233203' })
    expect(ph.ok && ph.value.billingPhone).toBe('(88) 99223-3203')
    expect(validateClinicPatch({ billingPhone: '123' }).ok).toBe(false)
    expect(validateClinicPatch({ billingPhone: 5 }).ok).toBe(false)
    const e = validateClinicPatch({ billingPhone: '  ' })
    expect(e.ok && e.value.billingPhone).toBeNull()
  })
})

describe('buildClinicUpdate (status recalculado, nunca do cliente)', () => {
  it('nada mudou => sem update, sem changed', () => {
    const r = buildClinicUpdate(base(), { plan: 'completo', maxPatients: 200 })
    expect(r.changed).toEqual([])
    expect(r.update).toEqual({})
  })

  it('só plano/limite: NÃO mexe em status nem is_active', () => {
    const r = buildClinicUpdate(base({ status: 'trial', is_active: false, billing_paid: true }), { maxPatients: 300 })
    expect(r.update).toEqual({ max_patients: 300 })
    expect(r.before).toEqual({ maxPatients: 200 })
    expect(r.after).toEqual({ maxPatients: 300 })
  })

  it('trial no futuro, não pago => status trial', () => {
    const r = buildClinicUpdate(base({ status: 'active' }), { trialEndsAt: future() })
    expect(r.update.status).toBe('trial')
    expect(r.update.is_active).toBeUndefined() // continua ativa
  })

  it('trial vencido, não pago => computado trial_expired, gravado como trial (CHECK do banco), ainda ativa', () => {
    expect(storedStatusFor('trial_expired')).toBe('trial')
    const r = buildClinicUpdate(base({ status: 'active' }), { trialEndsAt: past() })
    expect(r.update.status).toBe('trial')
    expect(r.update.is_active).toBeUndefined()
  })

  it('trialEndsAt null => acesso permanente => active', () => {
    const r = buildClinicUpdate(base({ status: 'trial', trial_ends_at: future() }), { trialEndsAt: null })
    expect(r.update.trial_ends_at).toBeNull()
    expect(r.update.status).toBe('active')
  })

  it('billingPaid=true limpa o atraso e reativa', () => {
    const r = buildClinicUpdate(
      base({ status: 'suspended', is_active: false, billing_overdue_since: past() }),
      { billingPaid: true },
    )
    expect(r.update).toMatchObject({ billing_paid: true, billing_overdue_since: null, status: 'active', is_active: true })
    expect(r.changed).toContain('billingPaid')
  })

  it('billingPaid=false com atraso existente => continua suspensa (nada de status mudar)', () => {
    const r = buildClinicUpdate(
      base({ status: 'suspended', is_active: false, billing_paid: true, billing_overdue_since: past() }),
      { billingPaid: false },
    )
    expect(r.update.billing_paid).toBe(false)
    expect(r.update.status).toBeUndefined()
    expect(r.update.is_active).toBeUndefined()
    expect(r.update.billing_overdue_since).toBeUndefined()
  })

  it('trialEndsAt com mesmo instante em formato diferente não conta como mudança', () => {
    const r = buildClinicUpdate(base({ trial_ends_at: '2030-01-15T10:00:00+00:00' }), { trialEndsAt: '2030-01-15T10:00:00.000Z' })
    expect(r.changed).toEqual([])
  })

  it('customMonthlyPrice numeric vindo como string compara por valor', () => {
    const r = buildClinicUpdate(base({ custom_monthly_price: '99.90' }), { customMonthlyPrice: 99.9 })
    expect(r.changed).toEqual([])
  })

  it('mudar o dia de vencimento com assinatura Asaas => warning; sem assinatura => sem warning', () => {
    const withSub = buildClinicUpdate(base({ asaas_subscription_id: 'sub_x' }), { billingDueDay: 10 })
    expect(withSub.warnings).toHaveLength(1)
    expect(withSub.warnings[0]).toMatch(/Asaas/)
    expect(buildClinicUpdate(base(), { billingDueDay: 10 }).warnings).toEqual([])
  })
})

describe('auditoria e mapeamento', () => {
  it('buildAuditRow: ação, origem e só os campos alterados', () => {
    const row = buildAuditRow({ clinicId: 'c1', changed: ['plan'], before: { plan: 'a' }, after: { plan: 'b' }, ip: '1.2.3.4', userAgent: 'ua' })
    expect(row).toMatchObject({ action: 'gestor.clinic_update', module: 'gestor', clinic_id: 'c1', resource_id: 'c1', user_id: null })
    expect(row.details).toEqual({ origin: 'gestor', changed: ['plan'], before: { plan: 'a' }, after: { plan: 'b' } })
  })

  it('mapClinicRow: camelCase, status calculado, sem campos sensíveis', () => {
    const row = {
      id: 'i', name: 'n', slug: 's', clinic_type: 'odonto', plan: 'completo', status: 'trial', is_active: true,
      trial_ends_at: past(), max_patients: 200, max_users: null, custom_monthly_price: '129.90', billing_due_day: 10,
      billing_paid: false, billing_phone: null, billing_overdue_since: null, next_billing_date: null, phone: null,
      email: null, asaas_customer_id: 'cus_1', created_at: 'now', specialties: null,
      stripe_customer_id: 'cus_stripe', asaas_subscription_id: 'sub_1',
    } as unknown as ClinicRow
    const c = mapClinicRow(row, 2, 5)
    expect(c.status).toBe('trial_expired')
    expect(c.customMonthlyPrice).toBe(129.9)
    expect(c.specialties).toEqual([])
    expect(c.usersCount).toBe(2)
    expect(c.patientsCount).toBe(5)
    expect(c.demoMode).toBe(false)
    expect(Object.keys(c)).not.toContain('stripeCustomerId')
    expect(JSON.stringify(c)).not.toContain('sub_1')
    expect(JSON.stringify(c)).not.toContain('cus_stripe')
  })

  it('mapClinicRow: demoMode vem de fora (false por padrão) e não depende de demo_mode na linha', () => {
    const row = {
      id: 'i', name: 'n', slug: 's', clinic_type: 'odonto', plan: 'completo', status: 'active', is_active: true,
      trial_ends_at: null, max_patients: 200, max_users: null, custom_monthly_price: null, billing_due_day: null,
      billing_paid: true, billing_phone: null, billing_overdue_since: null, next_billing_date: null, phone: null,
      email: null, asaas_customer_id: null, created_at: 'now', specialties: ['odonto'], demo_mode: true,
    } as unknown as ClinicRow
    expect(mapClinicRow(row, 1, 1).demoMode).toBe(false)
    expect(mapClinicRow(row, 1, 1, true).demoMode).toBe(true)
  })

  it('demoMode não é campo editável pelo PATCH', () => {
    const r = validateClinicPatch({ demoMode: true })
    expect(r.ok).toBe(false)
    expect(PATCHABLE_FIELDS as readonly string[]).not.toContain('demoMode')
    expect(CLINIC_COLUMNS).not.toContain('demo_mode')
  })
})
