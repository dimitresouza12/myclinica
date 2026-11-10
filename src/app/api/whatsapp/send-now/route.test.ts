// Rota "Enviar confirmação agora": a conta de demonstração é barrada no servidor.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const demoRead = vi.hoisted(() => ({ value: false }))
const sendConfirmationNow = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabaseAdmin', () => ({
  getAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { demo_mode: demoRead.value }, error: null }) }) }) }),
  }),
}))
vi.mock('@/lib/whatsapp/auth', () => ({
  requireAgendaEditor: vi.fn(async (req: Request) =>
    req.headers.get('authorization') ? { clinicId: 'clinic-da-sessao', userId: 'u1', userName: 'Teste' } : NextResponse.json({ error: 'Não autorizado' }, { status: 401 })),
}))
vi.mock('@/lib/whatsapp/run', () => ({ sendConfirmationNow }))

import { POST } from './route'

const APPT = '11111111-1111-4111-8111-111111111111'
const req = (headers: Record<string, string> = { authorization: 'Bearer t' }) =>
  new Request('http://localhost/api/whatsapp/send-now', { method: 'POST', headers, body: JSON.stringify({ appointmentId: APPT }) })

beforeEach(() => { sendConfirmationNow.mockReset(); demoRead.value = false })

describe('POST /api/whatsapp/send-now', () => {
  it('demo → 403 e nada é enviado', async () => {
    demoRead.value = true
    const res = await POST(req())
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('Envio de mensagens desativado na conta de demonstração.')
    expect(sendConfirmationNow).not.toHaveBeenCalled()
  })

  it('clínica normal → envia usando a clínica da sessão', async () => {
    sendConfirmationNow.mockResolvedValue({ ok: true, kind: 'confirmacao' })
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(sendConfirmationNow).toHaveBeenCalledWith('clinic-da-sessao', APPT)
  })

  it('sem sessão → 401 (a autenticação vem antes do guard)', async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(401)
    expect(sendConfirmationNow).not.toHaveBeenCalled()
  })
})
