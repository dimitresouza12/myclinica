// Apagar mensagem para todos: a conta de demonstração é barrada no servidor.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const demoRead = vi.hoisted(() => ({ value: false }))
const deleteOwnMessage = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabaseAdmin', () => ({
  getAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { demo_mode: demoRead.value }, error: null }) }) }) }),
  }),
}))
vi.mock('@/lib/whatsapp/auth', () => ({ requireModulePerm: vi.fn(async () => ({ clinicId: 'c1', userId: 'u1', userName: 'T' })) }))
vi.mock('@/lib/whatsapp/conversations', () => ({ deleteOwnMessage }))
vi.mock('@/lib/rateLimit', () => ({ rateLimit: () => ({ success: true, remaining: 1, resetAt: 0 }) }))

import { POST } from './route'

const MSG = '33333333-3333-4333-8333-333333333333'
const req = () => new Request('http://localhost/x', { method: 'POST', headers: { authorization: 'Bearer t' }, body: JSON.stringify({ messageId: MSG }) })

beforeEach(() => { deleteOwnMessage.mockReset(); demoRead.value = false })

describe('POST /api/whatsapp/messages/delete', () => {
  it('demo → 403', async () => {
    demoRead.value = true
    expect((await POST(req())).status).toBe(403)
    expect(deleteOwnMessage).not.toHaveBeenCalled()
  })

  it('clínica normal → apaga', async () => {
    deleteOwnMessage.mockResolvedValue({ ok: true })
    expect((await POST(req())).status).toBe(200)
    expect(deleteOwnMessage).toHaveBeenCalledWith({ clinicId: 'c1', messageId: MSG })
  })
})
