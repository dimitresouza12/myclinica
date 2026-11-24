import { describe, it, expect, vi, afterEach } from 'vitest'
import { forwardToN8n, FORWARD_TIMEOUT_MS, type ForwardPayload } from './forward'

const payload: ForwardPayload = {
  clinicId: '11111111-1111-4111-8111-111111111111', conversationId: '22222222-2222-4222-8222-222222222222',
  phoneKey: '8599998888', texto: 'Oi, tudo bem?', tipo: 'boas_vindas',
}
const ok = () => vi.fn(async () => new Response('{}', { status: 200 }))

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('forwardToN8n', () => {
  it('sem AUTOMACAO_N8N_WEBHOOK_URL: não repassa nada', async () => {
    vi.stubEnv('AUTOMACAO_N8N_WEBHOOK_URL', '')
    const f = ok()
    expect(await forwardToN8n(payload, { fetchImpl: f as unknown as typeof fetch })).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })

  it('URL inválida ou de outro protocolo: não repassa', async () => {
    const f = ok()
    for (const url of ['nao-e-url', 'ftp://x/y', 'javascript:alert(1)']) {
      expect(await forwardToN8n(payload, { url, fetchImpl: f as unknown as typeof fetch })).toBe(false)
    }
    expect(f).not.toHaveBeenCalled()
  })

  it('http só para o próprio computador: http em host remoto é recusado (token e id do contato iriam em claro)', async () => {
    const f = ok()
    for (const url of ['http://n8n.exemplo.test/w', 'http://192.168.0.10/w', 'http://localhost.exemplo.test/w']) {
      expect(await forwardToN8n(payload, { url, fetchImpl: f as unknown as typeof fetch })).toBe(false)
    }
    expect(f).not.toHaveBeenCalled()
    for (const url of ['http://localhost:5678/w', 'http://127.0.0.1:5678/w', 'http://[::1]:5678/w', 'https://n8n.exemplo.test/w']) {
      expect(await forwardToN8n(payload, { url, fetchImpl: f as unknown as typeof fetch })).toBe(true)
    }
  })

  it('áudio: leva o id da mensagem e nenhum arquivo', async () => {
    const f = ok()
    const audio: ForwardPayload = { ...payload, texto: '', tipo: 'resposta_confirmacao_audio', mensagemId: '3EB0ABC' }
    await forwardToN8n(audio, { url: 'https://n8n.exemplo.test/w', fetchImpl: f as unknown as typeof fetch })
    expect(JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual(audio)
    // sem mensagemId, o campo nem existe
    const g = ok()
    await forwardToN8n(payload, { url: 'https://n8n.exemplo.test/w', fetchImpl: g as unknown as typeof fetch })
    expect(JSON.parse((g.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).not.toHaveProperty('mensagemId')
  })

  it('resposta de confirmação: leva a consulta (ou a lista, com appointmentId nulo)', async () => {
    const f = ok()
    const um: ForwardPayload = { ...payload, tipo: 'resposta_confirmacao', appointmentId: 'ap1', appointmentIds: ['ap1'] }
    await forwardToN8n(um, { url: 'https://n8n.exemplo.test/w', fetchImpl: f as unknown as typeof fetch })
    expect(JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toMatchObject({ appointmentId: 'ap1', appointmentIds: ['ap1'] })
    const varios: ForwardPayload = { ...payload, tipo: 'resposta_confirmacao', appointmentId: null, appointmentIds: ['ap1', 'ap2'] }
    await forwardToN8n(varios, { url: 'https://n8n.exemplo.test/w', fetchImpl: f as unknown as typeof fetch })
    expect(JSON.parse((f.mock.calls[1] as unknown as [string, RequestInit])[1].body as string)).toMatchObject({ appointmentId: null, appointmentIds: ['ap1', 'ap2'] })
  })

  it('lê a URL do ambiente e envia só os campos combinados', async () => {
    vi.stubEnv('AUTOMACAO_N8N_WEBHOOK_URL', 'https://n8n.exemplo.test/webhook/automacao')
    const f = ok()
    const polluted = { ...payload, telefone: '5585999998888', nome: 'Maria', jid: '5585999998888@s.whatsapp.net' } as ForwardPayload
    expect(await forwardToN8n(polluted, { fetchImpl: f as unknown as typeof fetch })).toBe(true)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://n8n.exemplo.test/webhook/automacao')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(payload)
    expect(init.body as string).not.toContain('5585999998888')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('envia o token no cabeçalho só quando configurado', async () => {
    const f = ok()
    await forwardToN8n(payload, { url: 'https://n8n.exemplo.test/w', token: 'segredo-n8n', fetchImpl: f as unknown as typeof fetch })
    expect(((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>)['x-webhook-token']).toBe('segredo-n8n')
    const g = ok()
    await forwardToN8n(payload, { url: 'https://n8n.exemplo.test/w', token: undefined, fetchImpl: g as unknown as typeof fetch })
    expect((g.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>).not.toHaveProperty('x-webhook-token')
  })

  it('falha silenciosa: rede, estouro de tempo e resposta de erro devolvem false sem lançar nem logar o conteúdo', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const deps = (f: unknown) => ({ url: 'https://n8n.exemplo.test/w', fetchImpl: f as typeof fetch })
    expect(await forwardToN8n(payload, deps(vi.fn(async () => { throw new TypeError('fetch failed') })))).toBe(false)
    expect(await forwardToN8n(payload, deps(vi.fn(async () => { throw new DOMException('timeout', 'TimeoutError') })))).toBe(false)
    expect(await forwardToN8n(payload, deps(vi.fn(async () => new Response('x', { status: 500 }))))).toBe(false)
    const logged = JSON.stringify(warn.mock.calls)
    expect(logged).not.toContain('Oi, tudo bem')
    expect(logged).not.toContain('n8n.exemplo')
  })

  it('timeout curto', () => { expect(FORWARD_TIMEOUT_MS).toBeLessThanOrEqual(5000) })
})
