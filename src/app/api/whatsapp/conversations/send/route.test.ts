// Resposta pela caixa de entrada: a conta de demonstração é barrada no servidor.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const demoRead = vi.hoisted(() => ({ value: false }))
const sendFromInbox = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabaseAdmin', () => ({
  getAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { demo_mode: demoRead.value }, error: null }) }) }) }),
  }),
}))
vi.mock('@/lib/whatsapp/auth', () => ({ requireModulePerm: vi.fn(async () => ({ clinicId: 'c1', userId: 'u1', userName: 'T' })) }))
vi.mock('@/lib/whatsapp/conversations', () => ({ sendFromInbox }))
vi.mock('@/lib/rateLimit', () => ({ rateLimit: () => ({ success: true, remaining: 1, resetAt: 0 }) }))

import { POST } from './route'

const CONV = '22222222-2222-4222-8222-222222222222'
const req = () => new Request('http://localhost/x', { method: 'POST', headers: { authorization: 'Bearer t' }, body: JSON.stringify({ conversationId: CONV, text: 'oi' }) })

beforeEach(() => { sendFromInbox.mockReset(); demoRead.value = false })

describe('POST /api/whatsapp/conversations/send', () => {
  it('demo → 403 e nada é enviado', async () => {
    demoRead.value = true
    const res = await POST(req())
    expect(res.status).toBe(403)
    expect(sendFromInbox).not.toHaveBeenCalled()
  })

  it('clínica normal → envia com a clínica da sessão', async () => {
    sendFromInbox.mockResolvedValue({ ok: true })
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(sendFromInbox).toHaveBeenCalledWith(expect.objectContaining({ clinicId: 'c1', conversationId: CONV, text: 'oi' }))
  })
})
