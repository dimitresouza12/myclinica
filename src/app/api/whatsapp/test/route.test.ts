// Mensagem de teste do WhatsApp: a conta de demonstração é barrada no servidor.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const demoRead = vi.hoisted(() => ({ value: false }))
const sendText = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabaseAdmin', () => ({
  getAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { demo_mode: demoRead.value }, error: null }) }) }) }),
  }),
}))
vi.mock('@/lib/whatsapp/auth', () => ({ requireClinicAdmin: vi.fn(async () => ({ clinicId: 'c1', userId: 'u1' })) }))
vi.mock('@/lib/whatsapp/connection', () => ({ connectedInstanceFor: vi.fn(async () => 'inst-1') }))
vi.mock('@/lib/whatsapp/evolution', () => ({
  EvolutionError: class extends Error { status = 500 },
  checkNumbers: vi.fn(async () => [{ exists: true, number: '5585999990000', jid: '5585999990000@s.whatsapp.net' }]),
  sendText,
}))
vi.mock('@/lib/rateLimit', () => ({ rateLimit: () => ({ success: true, resetAt: 0 }) }))

import { POST } from './route'

const req = () => new Request('http://localhost/api/whatsapp/test', { method: 'POST', headers: { authorization: 'Bearer t' }, body: JSON.stringify({ number: '85999990000' }) })

beforeEach(() => { sendText.mockReset(); demoRead.value = false })

describe('POST /api/whatsapp/test', () => {
  it('demo → 403 e nada é enviado', async () => {
    demoRead.value = true
    const res = await POST(req())
    expect(res.status).toBe(403)
    expect(sendText).not.toHaveBeenCalled()
  })

  it('clínica normal → envia o teste', async () => {
    sendText.mockResolvedValue({ messageId: 'm1' })
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(sendText).toHaveBeenCalledTimes(1)
  })
})
