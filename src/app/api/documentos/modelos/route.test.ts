// Modelos de texto da clínica: só grava o que foi confirmado e passou na validação; a clínica vem da sessão.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const state = vi.hoisted(() => ({ saved: [] as Record<string, unknown>[], audits: [] as Record<string, unknown>[], failMotivo: null as null | string }))

vi.mock('@/lib/whatsapp/auth', () => ({
  requireModulePerm: vi.fn(async (req: Request) =>
    req.headers.get('authorization') ? { clinicId: 'c1', userId: 'u1', userName: 'T' } : NextResponse.json({ error: 'Não autorizado' }, { status: 401 })),
}))
vi.mock('@/lib/ia/escribaServer', () => ({ recordEscribaUsage: async (a: Record<string, unknown>) => { state.audits.push(a) } }))
vi.mock('@/lib/documentos/modelosServer', async () => {
  const actual = await vi.importActual<typeof import('@/lib/documentos/modelosServer')>('@/lib/documentos/modelosServer')
  return {
    ...actual,
    listarModelos: async () => (state.failMotivo ? { ok: false, motivo: state.failMotivo } : { ok: true, modelos: [] }),
    salvarModelo: async (clinicId: string, userId: string, input: Record<string, unknown>) => {
      if (state.failMotivo) return { ok: false, motivo: state.failMotivo }
      state.saved.push({ clinicId, userId, ...input })
      return { ok: true, modelo: { key: input.key, name: input.name, body: input.body, source: input.source, updatedAt: 'x' } }
    },
    removerModelo: async () => ({ ok: true }),
  }
})

import { DELETE, GET, POST } from './route'

const req = (method: string, body?: unknown, url = 'http://t/api/documentos/modelos', auth = true) =>
  new Request(url, { method, headers: { ...(auth ? { authorization: 'Bearer x' } : {}), 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
const ok = { tipo: 'atestado', finalidade: 'afastamento', nome: 'Meu atestado', texto: 'Atesto que {{paciente}} precisa de {{dias_texto}} de afastamento.', confirmadoPelaPessoa: true }

beforeEach(() => { state.saved = []; state.audits = []; state.failMotivo = null })

describe('/api/documentos/modelos', () => {
  it('sem sessão: 401', async () => {
    expect((await GET(req('GET', undefined, undefined, false))).status).toBe(401)
    expect((await POST(req('POST', ok, undefined, false))).status).toBe(401)
    expect((await DELETE(req('DELETE', undefined, 'http://t/api/documentos/modelos?tipo=laudo', false))).status).toBe(401)
  })
  it('grava com a clínica da sessão (ignora clinicId do corpo) e a chave do tipo', async () => {
    const r = await POST(req('POST', { ...ok, clinicId: 'outra' }))
    expect(r.status).toBe(200)
    expect(state.saved[0]).toMatchObject({ clinicId: 'c1', userId: 'u1', key: 'atestado.afastamento', name: 'Meu atestado', source: 'foto_ia' })
    expect(state.audits[0]).toMatchObject({ action: 'documentos.modelo_salvo' })
    expect(JSON.stringify(state.audits[0])).not.toContain('Atesto')
  })
  it('sem confirmação humana, campo inválido, marcador solto ou HTML: não grava', async () => {
    expect((await POST(req('POST', { ...ok, confirmadoPelaPessoa: false }))).status).toBe(400)
    expect((await POST(req('POST', { ...ok, texto: 'Atesto que {{senha}} precisa de {{dias_texto}} de afastamento.' }))).status).toBe(400)
    expect((await POST(req('POST', { ...ok, texto: 'Atesto que [[M1]] precisa de {{dias_texto}} de afastamento.' }))).status).toBe(400)
    expect((await POST(req('POST', { ...ok, texto: 'Atesto <script>x</script> {{paciente}} de afastamento ok.' }))).status).toBe(400)
    expect((await POST(req('POST', { ...ok, tipo: 'receita_comum' }))).status).toBe(400)
    expect((await POST(req('POST', { ...ok, nome: '' }))).status).toBe(400)
    // campo de afastamento não vale para comparecimento
    expect((await POST(req('POST', { ...ok, finalidade: 'comparecimento' }))).status).toBe(400)
    expect(state.saved).toHaveLength(0)
  })
  it('tabela ausente: 503 com mensagem neutra', async () => {
    state.failMotivo = 'sem_tabela'
    const r = await POST(req('POST', ok))
    expect(r.status).toBe(503)
    expect((await r.json()).error).toMatch(/ainda não estão ativos/)
    expect((await GET(req('GET'))).status).toBe(503)
  })
  it('DELETE valida tipo e finalidade', async () => {
    expect((await DELETE(req('DELETE', undefined, 'http://t/api/documentos/modelos?tipo=atestado&finalidade=aptidao'))).status).toBe(200)
    expect((await DELETE(req('DELETE', undefined, 'http://t/api/documentos/modelos?tipo=atestado'))).status).toBe(400)
  })
})
