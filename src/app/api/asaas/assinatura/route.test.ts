// Resumo da assinatura: auth, clínica sempre da sessão, valores (preço congelado e promoção), cartão e cobranças
// só com campos seguros, e tolerância a falha do Asaas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { createFakeSupabase } from '@/test/fakeSupabase'

const CLINIC = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

const h = vi.hoisted(() => ({ session: null as unknown, fake: null as unknown, asaas: null as unknown }))
vi.mock('@/lib/sessionAuth', () => ({ requireSession: vi.fn(async () => h.session) }))
vi.mock('@/lib/supabaseAdmin', () => ({ getAdminClient: () => (h.fake as { db: unknown }).db }))
vi.mock('@/lib/asaas', () => ({ get realAsaas() { return h.asaas } }))

import { GET } from './route'

type Mock = { get: ReturnType<typeof vi.fn> }
const asaas = () => h.asaas as Mock
const req = () => new Request('http://localhost/api/asaas/assinatura')

function seed(over: Record<string, unknown> = {}) {
  return {
    clinics: [
      { id: CLINIC, plan: 'completo', custom_monthly_price: null, billing_paid: false, billing_first_due: '2027-01-15',
        billing_promo_full_value: null, asaas_subscription_id: 'sub_1', next_billing_date: null, ...over },
      { id: OTHER, plan: 'essencial', custom_monthly_price: null, billing_paid: false, billing_first_due: null,
        billing_promo_full_value: null, asaas_subscription_id: 'sub_OUTRA', next_billing_date: null },
    ],
  }
}

const SUB = { id: 'sub_1', value: 64.95, nextDueDate: '2027-01-15', status: 'ACTIVE', creditCard: { creditCardNumber: '1111', creditCardBrand: 'VISA', creditCardToken: 'tok_secreto' } }
const PAYS = { data: [
  { id: 'pay_a', value: 64.95, dueDate: '2027-01-15', status: 'PENDING', invoiceUrl: 'https://x/secreto', paymentDate: null },
  { id: 'pay_b', value: 129.9, dueDate: '2026-12-15', status: 'RECEIVED', paymentDate: '2026-12-15', bankSlipUrl: 'https://x/boleto' },
  { id: 'pay_c', value: 1, dueDate: '2026-11-15', status: 'REFUNDED', deleted: true },
] }

beforeEach(() => {
  vi.stubEnv('ASAAS_ENV', 'sandbox')
  h.session = { userId: 'u1', clinicId: CLINIC, role: 'admin', isSuperadmin: false, displayName: null, email: null }
  h.fake = createFakeSupabase(seed())
  h.asaas = { get: vi.fn(async (p: string) => (p.includes('/payments') ? PAYS : SUB)) }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('GET /api/asaas/assinatura', () => {
  it('401 sem sessão', async () => {
    h.session = NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    expect((await GET(req())).status).toBe(401)
    expect(asaas().get).not.toHaveBeenCalled()
  })

  it('usa a assinatura da clínica da sessão e devolve só campos seguros', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(asaas().get.mock.calls.every(c => String(c[0]).includes('sub_1'))).toBe(true)
    expect(j).toMatchObject({
      hasSubscription: true, plan: 'completo', planLabel: 'Completo', fullValue: 129.9, promo: false, firstDue: '2027-01-15',
      nextDueDate: '2027-01-15', card: { brand: 'VISA', last4: '1111' }, asaas: 'ok',
    })
    expect(j.payments).toEqual([
      { dueDate: '2027-01-15', paidAt: null, value: 64.95, situacao: 'pendente' },
      { dueDate: '2026-12-15', paidAt: '2026-12-15', value: 129.9, situacao: 'paga' },
    ])
    const txt = JSON.stringify(j)
    for (const s of ['tok_secreto', 'secreto', 'boleto', 'sub_1', 'pay_a']) expect(txt).not.toContain(s)
  })

  it('promoção: valor cheio vem de billing_promo_full_value e a 1ª cobrança é metade', async () => {
    h.fake = createFakeSupabase(seed({ billing_promo_full_value: 129.9 }))
    const j = await (await GET(req())).json()
    expect(j).toMatchObject({ promo: true, fullValue: 129.9, firstValue: 64.95 })
  })

  it('preço congelado vale como valor cheio; sem ele, o da tabela', async () => {
    h.fake = createFakeSupabase(seed({ custom_monthly_price: 99.9 }))
    expect((await (await GET(req())).json()).fullValue).toBe(99.9)
  })

  it('sem assinatura: não chama o Asaas', async () => {
    h.fake = createFakeSupabase(seed({ asaas_subscription_id: null, billing_first_due: null }))
    const j = await (await GET(req())).json()
    expect(j).toMatchObject({ hasSubscription: false, asaas: 'sem_assinatura', card: null, payments: [] })
    expect(asaas().get).not.toHaveBeenCalled()
  })

  it('Asaas fora do ar: 200 com dados do banco e asaas indisponivel', async () => {
    asaas().get.mockRejectedValue(new Error('Asaas GET /subscriptions/sub_1 [500]: corpo com dados'))
    const res = await GET(req())
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j).toMatchObject({ hasSubscription: true, asaas: 'indisponivel', card: null, payments: [], fullValue: 129.9 })
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('corpo com dados')
  })

  it('fora de produção sem sandbox: não consulta o Asaas', async () => {
    vi.stubEnv('ASAAS_ENV', '')
    const j = await (await GET(req())).json()
    expect(j.asaas).toBe('indisponivel')
    expect(asaas().get).not.toHaveBeenCalled()
  })
})
