import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextResponse } from 'next/server'
import { EvolutionError } from '@/lib/whatsapp/evolution'

const C1 = '11111111-1111-4111-8111-111111111111'
const KEY = 'chave-de-teste-automacao'
const conn = vi.hoisted(() => ({ getConnection: vi.fn(), startConnection: vi.fn(), stopConnection: vi.fn() }))
const demo = vi.hoisted(() => ({ rejectIfDemo: vi.fn() }))
vi.mock('@/lib/whatsapp/connection', () => conn)
vi.mock('@/lib/demoGuard', () => demo)
vi.mock('@/lib/automacaoIntegration', async (orig) => ({
  ...(await orig<typeof import('@/lib/automacaoIntegration')>()),
  loadAutomacaoClinic: async (id: unknown) => (id === C1 ? { ok: true, clinic: { id: C1, name: 'Sol' } } : { ok: false, response: NextResponse.json({ ok: false, error: 'Clínica não encontrada.' }, { status: 404 }) }),
}))

import { GET as status } from './whatsapp-status/route'
import { POST as conectar } from './whatsapp-conectar/route'
import { POST as desconectar } from './whatsapp-desconectar/route'

const auth = { authorization: `Bearer ${KEY}` }
const get = (q: string, h: Record<string, string> = auth) => new Request(`http://localhost/api/automacao/whatsapp-status?${q}`, { headers: h })
const post = (b: unknown, h: Record<string, string> = auth) => new Request('http://localhost/x', { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) })

beforeEach(() => {
  vi.stubEnv('AUTOMACAO_N8N_KEY', KEY)
  Object.values(conn).forEach((f) => f.mockReset())
  demo.rejectIfDemo.mockReset().mockResolvedValue(null)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('rotas /api/automacao/whatsapp-*', () => {
  it('sem chave: 401 nas três', async () => {
    expect((await status(get(`clinicId=${C1}`, {}))).status).toBe(401)
    expect((await conectar(post({ clinicId: C1 }, {}))).status).toBe(401)
    expect((await desconectar(post({ clinicId: C1 }, {}))).status).toBe(401)
  })
  it('clínica inexistente: 404', async () => {
    expect((await status(get('clinicId=x'))).status).toBe(404)
    expect((await conectar(post({ clinicId: 'x' }))).status).toBe(404)
  })
  it('status mascara o telefone e não devolve QR nem instância', async () => {
    conn.getConnection.mockResolvedValue({ status: 'conectado', phone: '5585999998888', connectedAt: '2026-11-17T10:00:00Z', qr: 'QR' })
    const j = await (await status(get(`clinicId=${C1}`))).json()
    expect(j).toEqual({ ok: true, status: 'conectado', telefone: '****8888', conectadoEm: '2026-11-17T10:00:00Z' })
  })
  it('conectar devolve o QR e respeita a trava de demo', async () => {
    conn.startConnection.mockResolvedValue({ status: 'aguardando_qr', phone: null, connectedAt: null, qr: 'data:qr' })
    const j = await (await conectar(post({ clinicId: C1 }))).json()
    expect(j).toMatchObject({ ok: true, status: 'aguardando_qr', qr: 'data:qr', telefone: null })
    demo.rejectIfDemo.mockResolvedValue(NextResponse.json({ error: 'demo' }, { status: 403 }))
    expect((await conectar(post({ clinicId: C1 }))).status).toBe(403)
    expect(conn.startConnection).toHaveBeenCalledTimes(1)
  })
  it('desconectar chama stopConnection; demo é recusada', async () => {
    conn.stopConnection.mockResolvedValue({ status: 'desconectado', phone: null, connectedAt: null })
    expect(await (await desconectar(post({ clinicId: C1 }))).json()).toEqual({ ok: true, status: 'desconectado' })
    demo.rejectIfDemo.mockResolvedValue(NextResponse.json({ error: 'demo' }, { status: 403 }))
    expect((await desconectar(post({ clinicId: C1 }))).status).toBe(403)
  })
  it('erro da Evolution vira texto em português sem detalhe', async () => {
    conn.getConnection.mockRejectedValue(new EvolutionError('boom http://interno', 502))
    const r = await status(get(`clinicId=${C1}`))
    expect(r.status).toBe(502)
    expect(JSON.stringify(await r.json())).not.toContain('interno')
  })
})
