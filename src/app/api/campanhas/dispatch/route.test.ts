// Disparo de campanha: a conta de demonstração é barrada no servidor, as demais seguem para o n8n.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextResponse } from 'next/server'

const demoRead = vi.hoisted(() => ({ value: false }))
const updates = vi.hoisted(() => ({ calls: [] as { patch: unknown; eqs: [string, unknown][] }[] }))

vi.mock('@/lib/supabaseAdmin', () => ({
  getAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { demo_mode: demoRead.value }, error: null }) }) }),
      update: (patch: unknown) => {
        const call = { patch, eqs: [] as [string, unknown][], table }
        updates.calls.push(call)
        const chain = { eq: (c: string, v: unknown) => { call.eqs.push([c, v]); return chain }, then: (r: (x: unknown) => unknown) => Promise.resolve({ error: null }).then(r) }
        return chain
      },
    }),
  }),
}))
vi.mock('@/lib/whatsapp/auth', () => ({
  requireModulePerm: vi.fn(async (req: Request) =>
    req.headers.get('authorization') ? { clinicId: 'c1', userId: 'u1', userName: 'T' } : NextResponse.json({ error: 'Não autorizado' }, { status: 401 })),
}))

import { POST } from './route'

const CAMP = '44444444-4444-4444-8444-444444444444'
const payload = { campaign_id: CAMP, clinic_name: 'Clínica', message_template: 'Oi {{nome}}', contacts: [{ name: 'A', phone: '85999990000', first_name: 'A' }] }
const req = (body: unknown = payload) =>
  new Request('http://localhost/api/campanhas/dispatch', { method: 'POST', headers: { authorization: 'Bearer tok' }, body: JSON.stringify(body) })

const fetchMock = vi.fn()
beforeEach(() => { fetchMock.mockReset(); updates.calls.length = 0; demoRead.value = false; vi.stubGlobal('fetch', fetchMock) })
afterEach(() => vi.unstubAllGlobals())

describe('POST /api/campanhas/dispatch', () => {
  it('demo → 403 e o webhook n8n não é chamado', async () => {
    demoRead.value = true
    const res = await POST(req())
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('Envio de mensagens desativado na conta de demonstração.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('clínica normal → repassa ao webhook campanha-whatsapp com o token do usuário', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/campanha-whatsapp$/)
    expect(init.headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body)).toEqual(payload)
    // só depois do aceite do n8n a campanha vira 'sent', escopada à clínica da sessão
    expect(updates.calls).toHaveLength(1)
    expect(updates.calls[0].patch).toMatchObject({ status: 'sent' })
    expect(updates.calls[0].eqs).toEqual([['id', CAMP], ['clinic_id', 'c1']])
  })

  it('erro do n8n volta com a mensagem e o status', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Sem WhatsApp' }), { status: 409 }))
    const res = await POST(req())
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Sem WhatsApp')
    expect(updates.calls).toHaveLength(0)
  })

  it('corpo inválido → 400 sem chamar o n8n', async () => {
    const res = await POST(new Request('http://localhost/x', { method: 'POST', headers: { authorization: 'Bearer t' }, body: '[]' }))
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sem sessão → 401', async () => {
    const res = await POST(new Request('http://localhost/x', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rate limit por clínica: o 6o disparo no minuto volta 429 sem chamar o n8n', async () => {
    fetchMock.mockImplementation(async () => new Response('{}', { status: 200 }))
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) statuses.push((await POST(req())).status)
    // a chamada 1 e as 2 anteriores do arquivo já consumiram parte da janela de c1
    expect(statuses).toContain(429)
    expect(fetchMock.mock.calls.length).toBeLessThan(6)
  })
})
