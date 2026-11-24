// Áudio recebido para o n8n: só da clínica, de entrada, áudio e até 3 MB. Evolution mockada; nada vai para disco.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeDb } from './fakeDb'

const state = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof import('./fakeDb').createFakeDb> }))
const evo = vi.hoisted(() => ({ fetchMediaBase64: vi.fn() }))
vi.mock('@/lib/supabaseAdmin', () => ({ getAdminClient: () => state.db.client }))
vi.mock('@/lib/whatsapp/evolution', async (orig) => ({ ...(await orig<typeof import('@/lib/whatsapp/evolution')>()), fetchMediaBase64: evo.fetchMediaBase64 }))

import { buscarAudio, base64Bytes, isMensagemId, MidiaError, MIDIA_MAX_BYTES } from './midia'
import { EvolutionError } from '@/lib/whatsapp/evolution'

const C1 = '11111111-1111-4111-8111-111111111111'
const C2 = '22222222-2222-4222-8222-222222222222'
const PID = '3EB0AUDIO1'
const RAW = { key: { id: PID }, message: { audioMessage: {} } }
const b64 = (bytes: number) => Buffer.alloc(bytes, 1).toString('base64')

const msg = (over: Record<string, unknown> = {}) => ({ id: 'm1', clinic_id: C1, provider_message_id: PID, direction: 'in', kind: 'audio', deleted_at: null, media_size: 5000, media_mime: 'audio/ogg', ...over })
const load = (t: Record<string, Record<string, unknown>[]> = {}) => {
  state.db = createFakeDb({ whatsapp_messages: [msg()], whatsapp_media_source: [{ message_id: 'm1', raw: RAW }], ...t })
}
const erro = async (p: Promise<unknown>) => { try { await p } catch (e) { return e as MidiaError } throw new Error('não lançou') }

beforeEach(() => {
  vi.restoreAllMocks()
  evo.fetchMediaBase64.mockReset().mockResolvedValue({ base64: b64(1000), mimetype: 'audio/ogg; codecs=opus', fileName: null })
  load()
})

describe('base64Bytes / isMensagemId', () => {
  it('conta os bytes sem decodificar', () => {
    for (const n of [1, 2, 3, 4, 1000, 3 * 1024 * 1024]) expect(base64Bytes(b64(n))).toBe(n)
  })
  it('aceita ids do WhatsApp e recusa o resto', () => {
    expect(isMensagemId('3EB0AUDIO1')).toBe(true)
    for (const v of ['', 'a b', 'x'.repeat(201), null, undefined, '../x', 'a;b']) expect(isMensagemId(v)).toBe(false)
  })
})

describe('buscarAudio', () => {
  it('devolve base64 e mimetype (sem parâmetros), buscando pela mensagem guardada e a instância da clínica', async () => {
    const r = await buscarAudio(C1, PID)
    expect(r).toEqual({ mensagemId: PID, mimetype: 'audio/ogg', tamanhoBytes: 1000, base64: b64(1000) })
    expect(evo.fetchMediaBase64).toHaveBeenCalledWith(`mc_${C1.replace(/-/g, '')}`, RAW)
  })
  it('mimetype ausente: usa o guardado; sem nenhum, audio/ogg', async () => {
    evo.fetchMediaBase64.mockResolvedValue({ base64: b64(10), mimetype: null, fileName: null })
    expect((await buscarAudio(C1, PID)).mimetype).toBe('audio/ogg')
    load({ whatsapp_messages: [msg({ media_mime: 'audio/mpeg' })] })
    expect((await buscarAudio(C1, PID)).mimetype).toBe('audio/mpeg')
  })
  it('mensagem de OUTRA clínica: não encontrada, sem chamar a Evolution', async () => {
    load({ whatsapp_messages: [msg({ clinic_id: C2 })] })
    expect(await erro(buscarAudio(C1, PID))).toMatchObject({ status: 404, codigo: 'nao_encontrada' })
    expect(evo.fetchMediaBase64).not.toHaveBeenCalled()
  })
  it('mensagem enviada por nós (direction out), inexistente ou apagada: não encontrada', async () => {
    load({ whatsapp_messages: [msg({ direction: 'out' })] })
    expect((await erro(buscarAudio(C1, PID))).status).toBe(404)
    expect((await erro(buscarAudio(C1, 'OUTRO'))).status).toBe(404)
    load({ whatsapp_messages: [msg({ deleted_at: '2026-11-17T10:00:00Z' })] })
    expect((await erro(buscarAudio(C1, PID))).status).toBe(404)
    expect(evo.fetchMediaBase64).not.toHaveBeenCalled()
  })
  it('não é áudio (imagem, texto): 422 sem baixar nada', async () => {
    for (const kind of ['image', 'text', 'document', 'video']) {
      load({ whatsapp_messages: [msg({ kind })] })
      expect(await erro(buscarAudio(C1, PID))).toMatchObject({ status: 422, codigo: 'nao_e_audio' })
    }
    expect(evo.fetchMediaBase64).not.toHaveBeenCalled()
  })
  it('maior que 3 MB pelo tamanho registrado: 413 sem baixar', async () => {
    load({ whatsapp_messages: [msg({ media_size: MIDIA_MAX_BYTES + 1 })] })
    expect(await erro(buscarAudio(C1, PID))).toMatchObject({ status: 413, codigo: 'muito_grande' })
    expect(evo.fetchMediaBase64).not.toHaveBeenCalled()
  })
  it('tamanho registrado ausente mas o arquivo baixado passa de 3 MB: 413 e nada é devolvido', async () => {
    load({ whatsapp_messages: [msg({ media_size: null })] })
    evo.fetchMediaBase64.mockResolvedValue({ base64: b64(MIDIA_MAX_BYTES + 1), mimetype: 'audio/ogg', fileName: null })
    expect(await erro(buscarAudio(C1, PID))).toMatchObject({ status: 413 })
  })
  it('exatamente 3 MB passa', async () => {
    evo.fetchMediaBase64.mockResolvedValue({ base64: b64(MIDIA_MAX_BYTES), mimetype: 'audio/ogg', fileName: null })
    expect((await buscarAudio(C1, PID)).tamanhoBytes).toBe(MIDIA_MAX_BYTES)
  })
  it('mimetype que não é de áudio: 422', async () => {
    evo.fetchMediaBase64.mockResolvedValue({ base64: b64(10), mimetype: 'image/png', fileName: null })
    expect(await erro(buscarAudio(C1, PID))).toMatchObject({ status: 422 })
  })
  it('sem a origem guardada (já limpa) ou Evolution sem o arquivo: 404 midia_indisponivel', async () => {
    load({ whatsapp_media_source: [] })
    expect(await erro(buscarAudio(C1, PID))).toMatchObject({ status: 404, codigo: 'midia_indisponivel' })
    load()
    evo.fetchMediaBase64.mockRejectedValue(new EvolutionError('sem arquivo', 404))
    expect(await erro(buscarAudio(C1, PID))).toMatchObject({ status: 404, codigo: 'midia_indisponivel' })
  })
  it('Evolution fora do ar: 502, sem vazar o texto do erro', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    evo.fetchMediaBase64.mockRejectedValue(new EvolutionError('segredo interno', 503))
    const e = await erro(buscarAudio(C1, PID))
    expect(e).toMatchObject({ status: 502 })
    expect(e.message).not.toContain('segredo')
  })
  it('erro de leitura do banco: 500', async () => {
    state.db = createFakeDb({}, { errors: { whatsapp_messages: { code: 'XX', message: 'x' } } })
    expect(await erro(buscarAudio(C1, PID))).toMatchObject({ status: 500 })
  })
})
