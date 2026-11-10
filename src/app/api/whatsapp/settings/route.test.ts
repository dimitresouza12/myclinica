// Configurações do WhatsApp: PUT é barrado na demonstração; GET continua livre.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const demoRead = vi.hoisted(() => ({ value: false }))
const saveSettings = vi.hoisted(() => vi.fn())
const loadSettings = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabaseAdmin', () => ({
  getAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { demo_mode: demoRead.value }, error: null }) }) }) }),
  }),
}))
vi.mock('@/lib/whatsapp/auth', () => ({ requireClinicAdmin: vi.fn(async () => ({ clinicId: 'c1', userId: 'u1' })) }))
vi.mock('@/lib/whatsapp/connection', () => ({ saveSettings, loadSettings }))
vi.mock('@/lib/whatsapp/settings', () => ({ validateSettings: (b: unknown) => ({ ok: true, value: b }) }))

import { GET, PUT } from './route'

const put = () => new Request('http://localhost/x', { method: 'PUT', headers: { authorization: 'Bearer t' }, body: JSON.stringify({ confirmEnabled: true }) })
const get = () => new Request('http://localhost/x', { headers: { authorization: 'Bearer t' } })

beforeEach(() => { saveSettings.mockReset(); loadSettings.mockReset(); demoRead.value = false })

describe('/api/whatsapp/settings', () => {
  it('PUT em demo → 403 e nada é salvo', async () => {
    demoRead.value = true
    expect((await PUT(put())).status).toBe(403)
    expect(saveSettings).not.toHaveBeenCalled()
  })

  it('PUT em clínica normal → salva', async () => {
    saveSettings.mockResolvedValue({ ok: true })
    expect((await PUT(put())).status).toBe(200)
    expect(saveSettings).toHaveBeenCalledWith('c1', { confirmEnabled: true })
  })

  it('GET continua livre em demo', async () => {
    demoRead.value = true
    loadSettings.mockResolvedValue({ confirmEnabled: false })
    const res = await GET(get())
    expect(res.status).toBe(200)
    expect(loadSettings).toHaveBeenCalledWith('c1')
  })
})
