// Troca de cartão em assinatura existente: auth, sem assinatura, caminho feliz com cobrança em aberto e recusa.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { createFakeSupabase } from '@/test/fakeSupabase'

const CLINIC = '11111111-1111-4111-8111-111111111111'
const h = vi.hoisted(() => ({ session: null as unknown, fake: null as unknown, asaas: null as unknown }))

vi.mock('@/lib/sessionAuth', () => ({ requireSession: vi.fn(async () => h.session) }))
vi.mock('@/lib/supabaseAdmin', () => ({ getAdminClient: () => (h.fake as { db: unknown }).db }))
vi.mock('@/lib/asaas', () => ({ get realAsaas() { return h.asaas } }))

import { POST } from './route'

type Mock = { post: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> }
const asaas = () => h.asaas as Mock

const body = () => ({
  card: { holderName: 'FULANO DE TAL', number: '4111111111111111', expiryMonth: '12', expiryYear: '2035', ccv: '737' },
  holder: { name: 'Fulano de Tal', email: 'f@x.com', cpfCnpj: '52998224725', postalCode: '60000000', addressNumber: '100', phone: '85999998888' },
})
const req = () => new Request('http://localhost/x', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' }, body: JSON.stringify(body()) })

beforeEach(() => {
  vi.stubEnv('ASAAS_ENV', 'sandbox')
  h.session = { userId: 'u1', clinicId: CLINIC, role: 'admin', isSuperadmin: false, displayName: null, email: null }
  h.fake = createFakeSupabase({ clinics: [{ id: CLINIC, asaas_subscription_id: 'sub_1' }] })
  h.asaas = {
    put: vi.fn(async () => ({ creditCard: { creditCardNumber: '1111', creditCardBrand: 'VISA', creditCardToken: 'tok_1' } })),
    get: vi.fn(async () => ({ data: [{ id: 'pay_1', status: 'OVERDUE', dueDate: '2026-11-01' }] })),
    post: vi.fn(async () => ({})),
  }
  for (const m of ['log', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('POST /api/asaas/assinatura-cartao/atualizar', () => {
  it('401 sem sessão', async () => {
    h.session = NextResponse.json({ error: 'x' }, { status: 401 })
    expect((await POST(req())).status).toBe(401)
  })

  it('409 quando a clínica não tem assinatura', async () => {
    h.fake = createFakeSupabase({ clinics: [{ id: CLINIC, asaas_subscription_id: null }] })
    expect((await POST(req())).status).toBe(409)
    expect(asaas().put).not.toHaveBeenCalled()
  })

  it('troca o cartão e cobra a fatura atrasada com o token, sem devolver o token', async () => {
    const res = await POST(req())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toEqual({ ok: true, charged: true, cardLast4: '1111', cardBrand: 'VISA' })
    expect(asaas().put.mock.calls[0][0]).toBe('/subscriptions/sub_1/creditCard')
    expect(asaas().post).toHaveBeenCalledWith('/payments/pay_1/payWithCreditCard', { creditCardToken: 'tok_1', remoteIp: '203.0.113.9' })
    expect(JSON.stringify(json)).not.toContain('tok_1')
  })

  it('sem fatura em aberto só troca o cartão', async () => {
    asaas().get.mockResolvedValue({ data: [] })
    const json = await (await POST(req())).json()
    expect(json.charged).toBe(false)
    expect(asaas().post).not.toHaveBeenCalled()
  })

  it('422 quando a cobrança é recusada, com o cartão já salvo', async () => {
    asaas().post.mockRejectedValue(new Error('Asaas POST x [400]: {"errors":[{"code":"invalid_creditCard","description":"Transação não autorizada"}]}'))
    const res = await POST(req())
    expect(res.status).toBe(422)
    expect((await res.json()).code).toBe('cartao_recusado')
  })
})
