// Checkout: clínica com assinatura no cartão recebe a fatura em aberto em vez de um link novo (que duplicaria a assinatura).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { createFakeSupabase } from '@/test/fakeSupabase'

const CLINIC = '11111111-1111-4111-8111-111111111111'

const h = vi.hoisted(() => ({
  session: null as unknown,
  fake: null as unknown,
  post: null as unknown,
  get: null as unknown,
}))

vi.mock('@/lib/sessionAuth', () => ({ requireSession: vi.fn(async () => h.session) }))
vi.mock('@/lib/supabaseAdmin', () => ({ getAdminClient: () => (h.fake as { db: unknown }).db }))
vi.mock('@/lib/asaas', () => ({
  asaasPost: (...a: unknown[]) => (h.post as (...x: unknown[]) => unknown)(...a),
  asaasGet: (...a: unknown[]) => (h.get as (...x: unknown[]) => unknown)(...a),
  daysUntilNextOccurrence: () => 5,
}))

import { POST } from './route'

const post = () => h.post as ReturnType<typeof vi.fn>
const get = () => h.get as ReturnType<typeof vi.fn>
const req = (b: unknown) => new Request('http://localhost/api/asaas/checkout', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b),
})
const seed = (over: Record<string, unknown> = {}) => ({
  clinics: [{ id: CLINIC, name: 'Clinica X', plan: 'completo', asaas_customer_id: null, billing_due_day: null, custom_monthly_price: null, asaas_subscription_id: null, billing_first_due: null, ...over }],
})

beforeEach(() => {
  h.session = { userId: 'u1', clinicId: CLINIC, role: 'admin', isSuperadmin: false, displayName: null, email: null }
  h.fake = createFakeSupabase(seed())
  h.post = vi.fn(async () => ({ id: 'link_1', url: 'https://www.asaas.com/c/link_1' }))
  h.get = vi.fn()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/asaas/checkout', () => {
  it('401 sem sessão', async () => {
    h.session = NextResponse.json({ error: 'x' }, { status: 401 })
    expect((await POST(req({ clinicId: CLINIC }))).status).toBe(401)
  })

  it('sem assinatura no cartão: segue o fluxo antigo (cria payment link)', async () => {
    const res = await POST(req({ clinicId: CLINIC }))
    expect(await res.json()).toEqual({ url: 'https://www.asaas.com/c/link_1' })
    expect(post()).toHaveBeenCalled()
  })

  it('só asaas_subscription_id, sem billing_first_due: fluxo antigo', async () => {
    h.fake = createFakeSupabase(seed({ asaas_subscription_id: 'sub_1' }))
    await POST(req({ clinicId: CLINIC }))
    expect(get()).not.toHaveBeenCalled()
    expect(post()).toHaveBeenCalled()
  })

  describe('com assinatura no cartão', () => {
    beforeEach(() => { h.fake = createFakeSupabase(seed({ asaas_subscription_id: 'sub_1', billing_first_due: '2027-01-15' })) })
    const payments = (data: unknown[]) => get().mockResolvedValue({ data })

    it('devolve a invoiceUrl da cobrança OVERDUE mais antiga, sem criar link', async () => {
      payments([
        { id: 'p3', status: 'PENDING', dueDate: '2027-02-15', invoiceUrl: 'https://asaas/i/p3' },
        { id: 'p2', status: 'OVERDUE', dueDate: '2027-02-01', invoiceUrl: 'https://asaas/i/p2' },
        { id: 'p1', status: 'OVERDUE', dueDate: '2027-01-15', invoiceUrl: 'https://asaas/i/p1' },
        { id: 'p0', status: 'RECEIVED', dueDate: '2026-12-15', invoiceUrl: 'https://asaas/i/p0' },
      ])
      const res = await POST(req({ clinicId: CLINIC }))
      expect(await res.json()).toEqual({ url: 'https://asaas/i/p1' })
      expect(get().mock.calls[0][0]).toBe('/subscriptions/sub_1/payments?limit=100')
      expect(post()).not.toHaveBeenCalled()
    })

    it('sem vencida, devolve a PENDING mais próxima', async () => {
      payments([
        { id: 'a', status: 'PENDING', dueDate: '2027-03-15', invoiceUrl: 'https://asaas/i/a' },
        { id: 'b', status: 'PENDING', dueDate: '2027-02-15', invoiceUrl: 'https://asaas/i/b' },
        { id: 'c', status: 'CONFIRMED', dueDate: '2027-01-15', invoiceUrl: 'https://asaas/i/c' },
      ])
      expect(await (await POST(req({ clinicId: CLINIC }))).json()).toEqual({ url: 'https://asaas/i/b' })
      expect(post()).not.toHaveBeenCalled()
    })

    it('ignora cobrança apagada e sem invoiceUrl', async () => {
      payments([
        { id: 'a', status: 'OVERDUE', dueDate: '2027-01-15', invoiceUrl: null },
        { id: 'b', status: 'OVERDUE', dueDate: '2027-01-20', invoiceUrl: 'https://asaas/i/b', deleted: true },
        { id: 'c', status: 'PENDING', dueDate: '2027-02-15', invoiceUrl: 'https://asaas/i/c' },
      ])
      expect(await (await POST(req({ clinicId: CLINIC }))).json()).toEqual({ url: 'https://asaas/i/c' })
    })

    it('nenhuma cobrança aberta: cai no fluxo antigo', async () => {
      payments([{ id: 'p', status: 'RECEIVED', dueDate: '2027-01-15', invoiceUrl: 'https://asaas/i/p' }])
      expect(await (await POST(req({ clinicId: CLINIC }))).json()).toEqual({ url: 'https://www.asaas.com/c/link_1' })
      expect(post()).toHaveBeenCalled()
    })

    it('consulta falhou: 502, sem criar link novo', async () => {
      get().mockRejectedValue(new Error('rede'))
      const res = await POST(req({ clinicId: CLINIC }))
      expect(res.status).toBe(502)
      expect(post()).not.toHaveBeenCalled()
    })
  })
})
