// Envio de arquivo pela caixa de entrada: em demo nada é gravado no Storage nem enviado.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const demoRead = vi.hoisted(() => ({ value: false }))
const sendMediaFromInbox = vi.hoisted(() => vi.fn())
const putMedia = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabaseAdmin', () => ({
  getAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { demo_mode: demoRead.value }, error: null }) }) }) }),
  }),
}))
vi.mock('@/lib/whatsapp/auth', () => ({ requireModulePerm: vi.fn(async () => ({ clinicId: 'c1', userId: 'u1', userName: 'T' })) }))
vi.mock('@/lib/whatsapp/conversations', () => ({ sendMediaFromInbox }))
vi.mock('@/lib/whatsapp/media-store', () => ({ putMedia, newMediaPath: vi.fn(), removeMedia: vi.fn() }))
vi.mock('@/lib/rateLimit', () => ({ rateLimit: () => ({ success: true, remaining: 1, resetAt: 0 }) }))

import { POST } from './route'

const CONV = '22222222-2222-4222-8222-222222222222'
function req() {
  const form = new FormData()
  form.set('conversationId', CONV)
  // PNG mínimo (assinatura) para passar na checagem de tipo
  form.set('file', new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0])], 'a.png', { type: 'image/png' }))
  return new Request('http://localhost/x', { method: 'POST', headers: { authorization: 'Bearer t' }, body: form })
}

beforeEach(() => { sendMediaFromInbox.mockReset(); putMedia.mockReset(); demoRead.value = false })

describe('POST /api/whatsapp/conversations/send-media', () => {
  it('demo → 403; nem o envio nem a gravação do arquivo acontecem', async () => {
    demoRead.value = true
    const res = await POST(req())
    expect(res.status).toBe(403)
    expect(sendMediaFromInbox).not.toHaveBeenCalled()
    expect(putMedia).not.toHaveBeenCalled()
  })

  it('clínica normal → segue para o envio', async () => {
    sendMediaFromInbox.mockResolvedValue({ ok: true })
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(sendMediaFromInbox).toHaveBeenCalledWith(expect.objectContaining({ clinicId: 'c1', conversationId: CONV }))
  })
})
