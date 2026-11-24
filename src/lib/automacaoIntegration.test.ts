import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'

const clinicRow = vi.hoisted(() => ({ value: null as unknown, error: null as unknown }))
vi.mock('@/lib/supabaseAdmin', () => ({
  getAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: clinicRow.value, error: clinicRow.error }) }) }) }),
  }),
}))

import {
  authenticateAutomacao, loadAutomacaoClinic, readJsonBody, isUuid, AUTOMACAO_RATE_LIMIT,
} from './automacaoIntegration'

const KEY = 'chave-de-teste-automacao'
const CLINIC = '11111111-1111-4111-8111-111111111111'
const req = (auth?: string, ip = '1.1.1.1') =>
  new Request('http://x/api/automacao/consultas', { headers: { ...(auth ? { authorization: auth } : {}), 'x-forwarded-for': ip } })

beforeEach(() => { clinicRow.value = null; clinicRow.error = null })
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('authenticateAutomacao', () => {
  it('sem AUTOMACAO_N8N_KEY: falha fechada (503)', () => {
    vi.stubEnv('AUTOMACAO_N8N_KEY', '')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(authenticateAutomacao(req(`Bearer ${KEY}`))?.status).toBe(503)
  })

  it('sem cabeçalho, esquema errado ou chave errada: 401', () => {
    vi.stubEnv('AUTOMACAO_N8N_KEY', KEY)
    expect(authenticateAutomacao(req())?.status).toBe(401)
    expect(authenticateAutomacao(req(`Basic ${KEY}`))?.status).toBe(401)
    expect(authenticateAutomacao(req('Bearer outra'))?.status).toBe(401)
    expect(authenticateAutomacao(req(`Bearer ${KEY}x`))?.status).toBe(401)
  })

  it('chave correta passa (null)', () => {
    vi.stubEnv('AUTOMACAO_N8N_KEY', KEY)
    expect(authenticateAutomacao(req(`Bearer ${KEY}`))).toBeNull()
  })

  it('não confunde com a chave do Gestor', () => {
    vi.stubEnv('AUTOMACAO_N8N_KEY', KEY)
    vi.stubEnv('GESTOR_INTEGRATION_KEY', 'gestor')
    expect(authenticateAutomacao(req('Bearer gestor'))?.status).toBe(401)
  })

  it('a resposta de erro nunca ecoa o segredo', async () => {
    vi.stubEnv('AUTOMACAO_N8N_KEY', KEY)
    const res = authenticateAutomacao(req('Bearer errada-123'))
    const txt = JSON.stringify(await res!.json())
    expect(txt).not.toContain(KEY)
    expect(txt).not.toContain('errada-123')
  })

  it('limita as chamadas autorizadas (429 com Retry-After)', async () => {
    vi.resetModules() // o limitador é um Map do módulo: começa limpo
    const m = await import('./automacaoIntegration')
    vi.stubEnv('AUTOMACAO_N8N_KEY', KEY)
    for (let i = 0; i < AUTOMACAO_RATE_LIMIT.limit; i++) {
      expect(m.authenticateAutomacao(req(`Bearer ${KEY}`))).toBeNull()
    }
    const res = m.authenticateAutomacao(req(`Bearer ${KEY}`))
    expect(res?.status).toBe(429)
    expect(res?.headers.get('Retry-After')).toBeTruthy()
  })

  it('tentativas com chave errada por IP também são limitadas (429)', async () => {
    vi.resetModules()
    const m = await import('./automacaoIntegration')
    vi.stubEnv('AUTOMACAO_N8N_KEY', KEY)
    let last = 0
    for (let i = 0; i < 40; i++) last = m.authenticateAutomacao(req('Bearer errada', '9.9.9.9'))!.status
    expect(last).toBe(429)
    // outro IP segue recebendo 401
    expect(m.authenticateAutomacao(req('Bearer errada', '8.8.8.8'))?.status).toBe(401)
  })
})

describe('isUuid / readJsonBody', () => {
  it('valida uuid', () => {
    expect(isUuid(CLINIC)).toBe(true)
    expect(isUuid('nao-e-uuid')).toBe(false)
    expect(isUuid(undefined)).toBe(false)
  })

  it('corpo inválido ou não-objeto devolve erro 400', async () => {
    const bad = await readJsonBody(new Request('http://x', { method: 'POST', body: '{nope' }))
    expect(bad.ok).toBe(false)
    const arr = await readJsonBody(new Request('http://x', { method: 'POST', body: '[1]' }))
    expect(arr.ok).toBe(false)
    const ok = await readJsonBody(new Request('http://x', { method: 'POST', body: '{"a":1}' }))
    expect(ok).toEqual({ ok: true, value: { a: 1 } })
  })

  it('corpo grande demais é recusado', async () => {
    const big = await readJsonBody(new Request('http://x', { method: 'POST', body: JSON.stringify({ t: 'x'.repeat(70_000) }) }))
    expect(big.ok).toBe(false)
  })
})

describe('loadAutomacaoClinic', () => {
  it('uuid inválido: 404 sem consultar o banco', async () => {
    const r = await loadAutomacaoClinic('xyz')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.response.status).toBe(404)
  })

  it('clínica inexistente: 404', async () => {
    const r = await loadAutomacaoClinic(CLINIC)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.response.status).toBe(404)
  })

  it('clínica inativa: 403', async () => {
    clinicRow.value = { id: CLINIC, name: 'C', is_active: false }
    const r = await loadAutomacaoClinic(CLINIC)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.response.status).toBe(403)
  })

  it('clínica ativa: devolve id e nome', async () => {
    clinicRow.value = { id: CLINIC, name: 'Clínica X', is_active: true }
    const r = await loadAutomacaoClinic(CLINIC)
    expect(r).toEqual({ ok: true, clinic: { id: CLINIC, name: 'Clínica X' } })
  })

  it('is_active nulo conta como ativa (padrão do /admin)', async () => {
    clinicRow.value = { id: CLINIC, name: 'C', is_active: null }
    expect((await loadAutomacaoClinic(CLINIC)).ok).toBe(true)
  })

  it('erro de leitura: 500, sem vazar detalhe', async () => {
    clinicRow.error = { message: 'segredo interno', code: 'XX' }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await loadAutomacaoClinic(CLINIC)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.response.status).toBe(500)
      expect(JSON.stringify(await r.response.json())).not.toContain('segredo')
    }
  })
})
