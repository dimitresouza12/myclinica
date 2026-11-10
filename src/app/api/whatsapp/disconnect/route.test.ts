// Desconectar o WhatsApp: a conta de demonstração é barrada no servidor.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const demoRead = vi.hoisted(() => ({ value: false }))
const stopConnection = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabaseAdmin', () => ({
  getAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { demo_mode: demoRead.value }, error: null }) }) }) }),
  }),
}))
vi.mock('@/lib/whatsapp/auth', () => ({ requireClinicAdmin: vi.fn(async () => ({ clinicId: 'c1', userId: 'u1' })) }))
vi.mock('@/lib/whatsapp/connection', () => ({ stopConnection }))

import { POST } from './route'

const req = () => new Request('http://localhost/x', { method: 'POST', headers: { authorization: 'Bearer t' } })

beforeEach(() => { stopConnection.mockReset(); demoRead.value = false })

describe('POST /api/whatsapp/disconnect', () => {
  it('demo → 403', async () => {
    demoRead.value = true
    expect((await POST(req())).status).toBe(403)
    expect(stopConnection).not.toHaveBeenCalled()
  })

  it('clínica normal → desconecta', async () => {
    stopConnection.mockResolvedValue({ status: 'desconectado', phone: null, connectedAt: null })
    expect((await POST(req())).status).toBe(200)
    expect(stopConnection).toHaveBeenCalledWith('c1')
  })
})
