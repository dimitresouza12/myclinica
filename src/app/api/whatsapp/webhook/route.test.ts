// Webhook da Evolution: ordem (estado da automação -> guardar -> resposta à confirmação -> automação)
// e garantia de que falha da automação nunca derruba o webhook nem a confirmação.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls = vi.hoisted(() => [] as string[])
const fn = vi.hoisted(() => ({
  storeIncoming: vi.fn(), handleIncoming: vi.fn(), applyStatusUpdate: vi.fn(),
  prepareInbound: vi.fn(), processInbound: vi.fn(), processInboundAudio: vi.fn(),
}))
vi.mock('@/lib/whatsapp/conversations', () => ({ storeIncoming: fn.storeIncoming, applyStatusUpdate: fn.applyStatusUpdate }))
vi.mock('@/lib/whatsapp/incoming', () => ({ handleIncoming: fn.handleIncoming }))
vi.mock('@/lib/whatsapp/connection', () => ({ getConnectionByInstance: vi.fn() }))
vi.mock('@/lib/automacao/inbound', () => ({ prepareInbound: fn.prepareInbound, processInbound: fn.processInbound, processInboundAudio: fn.processInboundAudio }))

import { POST } from './route'

const TOKEN = 'token-webhook'
const body = (over: Record<string, unknown> = {}) => ({
  event: 'messages.upsert', instance: 'mc_abc', data: { key: { remoteJid: '5585999998888@s.whatsapp.net', fromMe: false }, message: { conversation: 'oi' } }, ...over,
})
const req = (b: unknown, token: string | null = TOKEN) =>
  new Request('http://localhost/api/whatsapp/webhook', { method: 'POST', headers: token ? { 'x-webhook-token': token } : {}, body: JSON.stringify(b) })

beforeEach(() => {
  vi.stubEnv('WHATSAPP_WEBHOOK_TOKEN', TOKEN)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  calls.length = 0
  for (const f of Object.values(fn)) f.mockReset()
  fn.prepareInbound.mockImplementation(async () => { calls.push('prepare'); return { ctx: 1 } })
  fn.storeIncoming.mockImplementation(async () => { calls.push('store'); return 'guardada' })
  fn.handleIncoming.mockImplementation(async () => { calls.push('incoming'); return 'respondeu' })
  fn.processInbound.mockImplementation(async () => { calls.push('automacao'); return { acao: 'nada' } })
  fn.processInboundAudio.mockImplementation(async () => { calls.push('audio'); return { acao: 'nada' } })
})

describe('POST /api/whatsapp/webhook (automação)', () => {
  it('ordem: estado da automação antes de guardar; automação depois da resposta à confirmação, com o resultado dela', async () => {
    const res = await POST(req(body()))
    expect(res.status).toBe(200)
    expect(calls).toEqual(['prepare', 'store', 'incoming', 'automacao'])
    expect(fn.processInbound).toHaveBeenCalledWith({ ctx: 1 }, 'respondeu')
  })

  it('mensagem que não é texto (prepare null): áudio é avaliado DEPOIS de guardar, com instância e dados', async () => {
    fn.prepareInbound.mockImplementation(async () => { calls.push('prepare'); return null })
    const b = body()
    expect((await POST(req(b))).status).toBe(200)
    expect(calls).toEqual(['prepare', 'store', 'incoming', 'audio'])
    expect(fn.processInboundAudio).toHaveBeenCalledWith('mc_abc', b.data)
    expect(fn.processInbound).not.toHaveBeenCalled()
  })

  it('texto: o caminho do áudio não roda', async () => {
    await POST(req(body()))
    expect(fn.processInboundAudio).not.toHaveBeenCalled()
  })

  it('falha no repasse de áudio nunca derruba o webhook (200)', async () => {
    fn.prepareInbound.mockResolvedValue(null)
    fn.processInboundAudio.mockRejectedValue(new Error('n8n fora do ar'))
    expect((await POST(req(body()))).status).toBe(200)
  })

  it('token errado: 401 e nada roda', async () => {
    expect((await POST(req(body(), 'errado'))).status).toBe(401)
    expect(calls).toEqual([])
  })

  it('mensagem que não é texto de contato (prepare devolve null): webhook como antes, sem automação', async () => {
    fn.prepareInbound.mockResolvedValue(null)
    expect((await POST(req(body()))).status).toBe(200)
    expect(fn.processInbound).not.toHaveBeenCalled()
    expect(fn.storeIncoming).toHaveBeenCalled()
    expect(fn.handleIncoming).toHaveBeenCalled()
  })

  it('falha no preparo da automação: segue guardando e tratando a confirmação', async () => {
    fn.prepareInbound.mockRejectedValue(new Error('boom'))
    expect((await POST(req(body()))).status).toBe(200)
    expect(fn.storeIncoming).toHaveBeenCalled()
    expect(fn.handleIncoming).toHaveBeenCalled()
    expect(fn.processInbound).not.toHaveBeenCalled()
  })

  it('falha na automação nunca derruba o webhook (200)', async () => {
    fn.processInbound.mockRejectedValue(new Error('n8n fora do ar'))
    expect((await POST(req(body()))).status).toBe(200)
  })

  it('falha em guardar a mensagem não impede confirmação nem automação', async () => {
    fn.storeIncoming.mockRejectedValue(new Error('db'))
    expect((await POST(req(body()))).status).toBe(200)
    expect(fn.handleIncoming).toHaveBeenCalled()
    expect(fn.processInbound).toHaveBeenCalled()
  })

  it('falha em handleIncoming: a automação roda mesmo assim (PARAR não pode ser perdido)', async () => {
    fn.handleIncoming.mockRejectedValue(new Error('db'))
    expect((await POST(req(body()))).status).toBe(200)
    expect(fn.processInbound).toHaveBeenCalledWith({ ctx: 1 }, 'ignorada')
  })

  it('outros eventos não passam pela automação', async () => {
    fn.applyStatusUpdate.mockResolvedValue(undefined)
    await POST(req(body({ event: 'messages.update', data: {} })))
    await POST(req(body({ event: 'connection.update', data: { state: 'open' } })))
    expect(fn.prepareInbound).not.toHaveBeenCalled()
    expect(fn.processInbound).not.toHaveBeenCalled()
  })

  it('instância que não é mc_: ignorada', async () => {
    expect((await POST(req(body({ instance: 'outra' })))).status).toBe(200)
    expect(calls).toEqual([])
  })
})
