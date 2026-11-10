// Conectar o WhatsApp: a conta de demonstração não pode parear um número real.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const demoRead = vi.hoisted(() => ({ value: false }))
const startConnection = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabaseAdmin', () => ({
  getAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { demo_mode: demoRead.value }, error: null }) }) }) }),
  }),
}))
vi.mock('@/lib/whatsapp/auth', () => ({ requireClinicAdmin: vi.fn(async () => ({ clinicId: 'c1', userId: 'u1' })) }))
vi.mock('@/lib/whatsapp/connection', () => ({ startConnection }))

import { POST } from './route'

const req = () => new Request('http://localhost/x', { method: 'POST', headers: { authorization: 'Bearer t' } })

beforeEach(() => { startConnection.mockReset(); demoRead.value = false })

describe('POST /api/whatsapp/connect', () => {
  it('demo → 403 e nenhuma instância é criada', async () => {
    demoRead.value = true
    expect((await POST(req())).status).toBe(403)
    expect(startConnection).not.toHaveBeenCalled()
  })

  it('clínica normal → inicia a conexão', async () => {
    startConnection.mockResolvedValue({ status: 'aguardando_qr', phone: null, connectedAt: null, qr: 'data:x' })
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(startConnection).toHaveBeenCalledWith('c1')
  })
})
