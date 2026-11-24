import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextResponse } from 'next/server'

const C1 = '11111111-1111-4111-8111-111111111111'
const KEY = 'chave-de-teste-automacao'
const asaas = vi.hoisted(() => ({ asaasPut: vi.fn() }))
const demo = vi.hoisted(() => ({ rejectIfDemo: vi.fn() }))
const db = vi.hoisted(() => ({ atual: { custom_monthly_price: null as number | null, asaas_subscription_id: null as string | null } as { custom_monthly_price: number | null; asaas_subscription_id: string | null } | null, update: vi.fn(), insert: vi.fn() }))
vi.mock('@/lib/asaas', () => asaas)
vi.mock('@/lib/demoGuard', () => demo)
vi.mock('@/lib/supabaseAdmin', () => ({
  getAdminClient: () => ({
    from: (t: string) => t === 'audit_logs'
      ? { insert: db.insert }
      : {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.atual, error: null }) }) }),
          update: (v: unknown) => ({ eq: async () => db.update(v) }),
        },
  }),
}))
vi.mock('@/lib/automacaoIntegration', async (orig) => ({
  ...(await orig<typeof import('@/lib/automacaoIntegration')>()),
  loadAutomacaoClinic: async (id: unknown) => (id === C1 ? { ok: true, clinic: { id: C1, name: 'Sol' } } : { ok: false, response: NextResponse.json({ ok: false, error: 'Clínica não encontrada.' }, { status: 404 }) }),
}))

import { POST } from './cobranca-valor/route'

const auth = { authorization: `Bearer ${KEY}` }
const post = (b: unknown, h: Record<string, string> = auth) => new Request('http://localhost/x', { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) })

beforeEach(() => {
  vi.stubEnv('AUTOMACAO_N8N_KEY', KEY)
  asaas.asaasPut.mockReset().mockResolvedValue({})
  demo.rejectIfDemo.mockReset().mockResolvedValue(null)
  db.atual = { custom_monthly_price: null, asaas_subscription_id: null }
  db.update.mockReset().mockReturnValue({ error: null })
  db.insert.mockReset().mockResolvedValue({ error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('POST /api/automacao/cobranca-valor', () => {
  it('sem chave 401; clínica inexistente 404', async () => {
    expect((await POST(post({ clinicId: C1, valor: 100 }, {}))).status).toBe(401)
    expect((await POST(post({ clinicId: 'x', valor: 100 }))).status).toBe(404)
  })
  it('valor inválido: 400 e nada é gravado', async () => {
    for (const valor of [0, -5, 'a', 1e9, undefined]) expect((await POST(post({ clinicId: C1, valor }))).status).toBe(400)
    expect(db.update).not.toHaveBeenCalled()
  })
  it('demo: devolve a recusa do guard', async () => {
    demo.rejectIfDemo.mockResolvedValue(NextResponse.json({ ok: false }, { status: 403 }))
    expect((await POST(post({ clinicId: C1, valor: 100 }))).status).toBe(403)
    expect(db.update).not.toHaveBeenCalled()
  })
  it('sem assinatura: grava e audita, sem chamar o Asaas', async () => {
    const res = await POST(post({ clinicId: C1, valor: 149.9 }))
    const j = await res.json()
    expect(res.status).toBe(200)
    expect(j).toMatchObject({ ok: true, valorMensalPersonalizado: 149.9, assinaturaAtualizada: false })
    expect(asaas.asaasPut).not.toHaveBeenCalled()
    expect(db.update).toHaveBeenCalledWith({ custom_monthly_price: 149.9 })
    expect(db.insert.mock.calls[0][0].details).toMatchObject({ before: { customMonthlyPrice: null }, after: { customMonthlyPrice: 149.9 } })
  })
  it('com assinatura: atualiza o Asaas antes, só para as próximas cobranças', async () => {
    db.atual = { custom_monthly_price: 100, asaas_subscription_id: 'sub_1' }
    const j = await (await POST(post({ clinicId: C1, valor: 120 }))).json()
    expect(asaas.asaasPut).toHaveBeenCalledWith('/subscriptions/sub_1', { value: 120, updatePendingPayments: false })
    expect(j.assinaturaAtualizada).toBe(true)
  })
  it('Asaas falha: 502 e nada muda', async () => {
    db.atual = { custom_monthly_price: 100, asaas_subscription_id: 'sub_1' }
    asaas.asaasPut.mockRejectedValue(new Error('x'))
    expect((await POST(post({ clinicId: C1, valor: 120 }))).status).toBe(502)
    expect(db.update).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
  })
  it('voltar à tabela (null) com assinatura: não chama o Asaas e avisa', async () => {
    db.atual = { custom_monthly_price: 100, asaas_subscription_id: 'sub_1' }
    const j = await (await POST(post({ clinicId: C1, valor: null }))).json()
    expect(asaas.asaasPut).not.toHaveBeenCalled()
    expect(db.update).toHaveBeenCalledWith({ custom_monthly_price: null })
    expect(j.aviso).toMatch(/continua com o valor anterior/)
  })
  it('mesmo valor: não faz nada', async () => {
    db.atual = { custom_monthly_price: 100, asaas_subscription_id: 'sub_1' }
    await POST(post({ clinicId: C1, valor: 100 }))
    expect(asaas.asaasPut).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
  })
})
