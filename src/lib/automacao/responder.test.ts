// Resposta de texto livre do n8n numa conversa existente: mesmas travas do /enviar, mais "humano assumiu".
// Evolution mockada: nada sai de verdade.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeDb } from './fakeDb'

const state = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof import('./fakeDb').createFakeDb> }))
const evo = vi.hoisted(() => ({ sendText: vi.fn(), checkNumbers: vi.fn() }))
const recordOutgoing = vi.hoisted(() => vi.fn())
const pace = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<boolean | void>>(async () => {}))

vi.mock('@/lib/supabaseAdmin', () => ({ getAdminClient: () => state.db.client }))
vi.mock('@/lib/whatsapp/evolution', async (orig) => ({ ...(await orig<typeof import('@/lib/whatsapp/evolution')>()), sendText: evo.sendText, checkNumbers: evo.checkNumbers }))
vi.mock('@/lib/whatsapp/conversations', () => ({ recordOutgoing }))
vi.mock('@/lib/whatsapp/sendGate', async (orig) => ({ ...(await orig<typeof import('@/lib/whatsapp/sendGate')>()), paceClinic: pace }))

import { responderAutomacao, validateResponderBody, type ResponderInput } from './responder'
import { EvolutionError } from '@/lib/whatsapp/evolution'

const C1 = '11111111-1111-4111-8111-111111111111'
const C2 = '22222222-2222-4222-8222-222222222222'
const V1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const NOW = new Date('2026-11-17T12:00:00Z')
const clinic = { id: C1, name: 'Clínica Sol' }
const UNIQUE = { automacao_envios: ['chave_idempotencia'], whatsapp_optout: ['clinic_id', 'phone_key'] }

const conv = (over: Record<string, unknown> = {}) => ({
  id: V1, clinic_id: C1, phone_key: '8599998888', jid: '5585999998888@s.whatsapp.net', lid: null, patient_id: null,
  last_message_at: '2026-11-17T11:50:00Z', last_inbound_at: '2026-11-17T11:50:00Z', ...over,
})
const msg = (origin: string, at: string, direction = 'out') => ({ id: `m-${origin}-${at}`, clinic_id: C1, conversation_id: V1, direction, origin, created_at: at })

function seed(over: Record<string, Record<string, unknown>[]> = {}) {
  return {
    clinics: [{ id: C1, name: 'Clínica Sol', demo_mode: false, is_active: true }],
    clinic_whatsapp: [{ clinic_id: C1, instance_name: 'mc_1', status: 'conectado', timezone: 'America/Fortaleza', automacao_gerenciada: true }],
    whatsapp_conversations: [conv()], whatsapp_messages: [], whatsapp_optout: [], automacao_envios: [], appointment_confirmations: [],
    ...over,
  }
}
const load = (over: Record<string, Record<string, unknown>[]> = {}) => { state.db = createFakeDb(seed(over), { unique: UNIQUE }) }
const input = (over: Partial<ResponderInput> = {}): ResponderInput => ({ clinicId: C1, conversationId: V1, texto: 'Claro, o horário é às 14h.', chave: 'resp:c1:msg-1234', modoTeste: false, numeroTeste: null, ...over })

beforeEach(() => {
  vi.restoreAllMocks()
  evo.sendText.mockReset().mockResolvedValue({ messageId: 'wamid.1' })
  evo.checkNumbers.mockReset().mockImplementation(async (_i: string, nums: string[]) => [{ number: nums[0], exists: true, jid: `${nums[0]}@s.whatsapp.net` }])
  recordOutgoing.mockReset().mockResolvedValue(undefined)
  pace.mockReset().mockResolvedValue(undefined)
  load()
})

describe('validateResponderBody', () => {
  const ok = { clinicId: C1, conversationId: V1, texto: 'Oi', chave: 'chave-12345' }
  it('aceita o corpo mínimo e tira espaços do texto', () => {
    expect(validateResponderBody({ ...ok, texto: '  Oi  ' })).toMatchObject({ ok: true, value: { texto: 'Oi' } })
  })
  it.each([
    ['clinicId', { clinicId: 'x' }], ['conversationId', { conversationId: '1' }], ['texto vazio', { texto: '   ' }],
    ['texto com 1001 caracteres', { texto: 'a'.repeat(1001) }], ['texto não string', { texto: 5 }],
    ['chave curta', { chave: 'abc' }], ['chave com prefixo teste:', { chave: 'teste:chave-12345' }],
  ])('recusa %s', (_n, over) => { expect(validateResponderBody({ ...ok, ...over }).ok).toBe(false) })
  it('modoTeste exige numeroTeste válido; sem modoTeste o número é ignorado', () => {
    expect(validateResponderBody({ ...ok, modoTeste: true }).ok).toBe(false)
    expect(validateResponderBody({ ...ok, modoTeste: true, numeroTeste: '123' }).ok).toBe(false)
    expect(validateResponderBody({ ...ok, modoTeste: 'sim' }).ok).toBe(false)
    expect(validateResponderBody({ ...ok, modoTeste: true, numeroTeste: '(85) 98888-7777' })).toMatchObject({ ok: true, value: { modoTeste: true, numeroTeste: '(85) 98888-7777' } })
    expect(validateResponderBody({ ...ok, numeroTeste: '85988887777' })).toMatchObject({ ok: true, value: { modoTeste: false, numeroTeste: null } })
  })
  it('texto de exatamente 1000 caracteres passa', () => { expect(validateResponderBody({ ...ok, texto: 'a'.repeat(1000) }).ok).toBe(true) })
})

describe('responderAutomacao: travas', () => {
  it('clínica demo: 403 e nada sai', async () => {
    load({ clinics: [{ id: C1, name: 'Demo', demo_mode: true, is_active: true }] })
    expect((await responderAutomacao(clinic, input(), NOW)).status).toBe(403)
    expect(evo.sendText).not.toHaveBeenCalled()
  })
  it('WhatsApp desconectado: 409; sem automacao_gerenciada: 409', async () => {
    load({ clinic_whatsapp: [{ clinic_id: C1, instance_name: 'mc_1', status: 'desconectado', timezone: 'America/Fortaleza', automacao_gerenciada: true }] })
    expect((await responderAutomacao(clinic, input(), NOW)).status).toBe(409)
    load({ clinic_whatsapp: [{ clinic_id: C1, instance_name: 'mc_1', status: 'conectado', timezone: 'America/Fortaleza', automacao_gerenciada: false }] })
    expect((await responderAutomacao(clinic, input(), NOW)).body.codigo).toBe('automacao_nao_habilitada')
    expect(evo.sendText).not.toHaveBeenCalled()
  })
  it('conversa de OUTRA clínica: 404', async () => {
    load({ whatsapp_conversations: [conv({ clinic_id: C2 })] })
    expect((await responderAutomacao(clinic, input(), NOW)).status).toBe(404)
    expect(evo.sendText).not.toHaveBeenCalled()
  })
  it('opt-out pelo telefone ou só pelo lid da conversa: não envia', async () => {
    load({ whatsapp_optout: [{ clinic_id: C1, phone_key: '8599998888' }] })
    expect((await responderAutomacao(clinic, input(), NOW)).body).toMatchObject({ enviado: false, motivo: 'opt_out' })
    load({ whatsapp_conversations: [conv({ lid: '555111' })], whatsapp_optout: [{ clinic_id: C1, phone_key: 'lid:555111' }] })
    expect((await responderAutomacao(clinic, input(), NOW)).body).toMatchObject({ enviado: false, motivo: 'opt_out' })
    expect(evo.sendText).not.toHaveBeenCalled()
    expect(state.db.tables.automacao_envios).toHaveLength(0)
  })
  it('humano respondeu DEPOIS da mensagem do contato (sistema ou celular): não envia', async () => {
    for (const origin of ['sistema', 'celular']) {
      load({ whatsapp_messages: [msg(origin, '2026-11-17T11:55:00Z')] })
      expect((await responderAutomacao(clinic, input(), NOW)).body).toMatchObject({ enviado: false, motivo: 'humano_assumiu' })
    }
    expect(evo.sendText).not.toHaveBeenCalled()
    expect(state.db.tables.automacao_envios).toHaveLength(0)
  })
  it('resposta humana ANTERIOR à mensagem do contato, ou resposta automática, não bloqueia', async () => {
    load({ whatsapp_messages: [msg('sistema', '2026-11-17T10:00:00Z'), msg('automatico', '2026-11-17T11:55:00Z')] })
    expect((await responderAutomacao(clinic, input(), NOW)).body.enviado).toBe(true)
  })
  it('humano em OUTRA conversa ou OUTRA clínica não bloqueia', async () => {
    load({ whatsapp_messages: [{ ...msg('sistema', '2026-11-17T11:55:00Z'), conversation_id: 'outra' }, { ...msg('sistema', '2026-11-17T11:56:00Z'), clinic_id: C2 }] })
    expect((await responderAutomacao(clinic, input(), NOW)).body.enviado).toBe(true)
  })
  it('sem mensagem do contato registrada, qualquer saída humana bloqueia', async () => {
    load({ whatsapp_conversations: [conv({ last_inbound_at: null })], whatsapp_messages: [msg('celular', '2026-11-01T10:00:00Z')] })
    expect((await responderAutomacao(clinic, input(), NOW)).body.motivo).toBe('humano_assumiu')
  })
  it('humano que escreveu enquanto a chamada esperava na fila: não envia e libera a chave', async () => {
    pace.mockImplementation(async () => { state.db.tables.whatsapp_messages.push(msg('sistema', '2026-11-17T11:59:00Z')) })
    expect((await responderAutomacao(clinic, input(), NOW)).body).toMatchObject({ enviado: false, motivo: 'humano_assumiu' })
    expect(evo.sendText).not.toHaveBeenCalled()
    expect(state.db.tables.automacao_envios).toHaveLength(0)
  })
})

describe('responderAutomacao: portão do número', () => {
  const failures = [1, 2, 3].map(i => ({ chave_idempotencia: `f-${i}-xxxxxxx`, clinic_id: C1, funcao: 'lembrete_vespera', status: 'falhou', erro: 'evolution_400', atualizado_em: '2026-11-17T11:55:00Z' }))
  it('pausada por falhas: não envia, libera a chave', async () => {
    load({ automacao_envios: failures })
    expect((await responderAutomacao(clinic, input(), NOW)).body).toMatchObject({ enviado: false, motivo: 'pausada', tentarNovamente: true })
    expect(evo.sendText).not.toHaveBeenCalled()
    expect(state.db.tables.automacao_envios).toHaveLength(3)
  })
  it('aquecimento no limite do dia', async () => {
    load({
      whatsapp_messages: [{ clinic_id: C1, direction: 'out', origin: 'automatico', created_at: '2026-11-17T11:00:00Z' }],
      automacao_envios: Array.from({ length: 20 }, (_, i) => ({ chave_idempotencia: `ok-${i}-xxxxxxx`, clinic_id: C1, funcao: 'lembrete_vespera', status: 'enviado', enviado_em: '2026-11-17T11:00:00Z', atualizado_em: '2026-11-17T11:00:00Z' })),
    })
    expect((await responderAutomacao(clinic, input(), NOW)).body.motivo).toBe('aquecimento')
  })
  it('fila do ritmo cheia: tente depois, com a fila máxima pedida', async () => {
    pace.mockResolvedValue(false)
    const r = await responderAutomacao(clinic, input(), NOW)
    expect(r.body).toMatchObject({ enviado: false, motivo: 'ritmo', tentarNovamente: true })
    expect(pace).toHaveBeenCalledWith(C1, { maxQueue: 3 })
    expect(state.db.tables.automacao_envios).toHaveLength(0)
  })
  it('exceção no portão: 502 com tentarNovamente e nada fica reservado', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    pace.mockRejectedValue(new Error('boom'))
    expect(await responderAutomacao(clinic, input(), NOW)).toMatchObject({ status: 502, body: { tentarNovamente: true } })
    expect(state.db.tables.automacao_envios).toHaveLength(0)
  })
})

describe('responderAutomacao: envio', () => {
  it('envia o texto exato para o jid da conversa, registra a conversa e o envio', async () => {
    const r = await responderAutomacao(clinic, input(), NOW)
    expect(r).toEqual({ status: 200, body: { ok: true, enviado: true, modoTeste: false } })
    expect(evo.sendText).toHaveBeenCalledWith('mc_1', '5585999998888', 'Claro, o horário é às 14h.')
    expect(recordOutgoing).toHaveBeenCalledWith(expect.objectContaining({ clinicId: C1, jid: '5585999998888@s.whatsapp.net', origin: 'automatico' }))
    expect(state.db.tables.automacao_envios[0]).toMatchObject({ clinic_id: C1, funcao: 'responder', status: 'enviado', paciente_id: null })
    expect(JSON.stringify(state.db.tables.automacao_envios)).not.toContain('horário')
  })
  it('conversa só com @lid responde pelo @lid', async () => {
    load({ whatsapp_conversations: [conv({ jid: '98765432100@lid', phone_key: 'lid:98765432100', lid: '98765432100' })] })
    await responderAutomacao(clinic, input(), NOW)
    expect(evo.sendText.mock.calls[0][1]).toBe('98765432100@lid')
  })
  it('idempotente: a mesma chave duas vezes (ou simultâneas) envia uma só', async () => {
    const rs = await Promise.all([1, 2, 3].map(() => responderAutomacao(clinic, input(), NOW)))
    expect(rs.filter(r => r.body.enviado === true)).toHaveLength(1)
    expect((await responderAutomacao(clinic, input(), NOW)).body).toMatchObject({ enviado: false, motivo: 'ja_enviado' })
    expect(evo.sendText).toHaveBeenCalledTimes(1)
  })
  it('falha passageira: 502, libera para tentar de novo com a mesma chave', async () => {
    evo.sendText.mockRejectedValueOnce(new EvolutionError('x', 503))
    expect(await responderAutomacao(clinic, input(), NOW)).toMatchObject({ status: 502, body: { tentarNovamente: true } })
    expect((await responderAutomacao(clinic, input(), NOW)).body.enviado).toBe(true)
  })
  it('erro definitivo: só o código fica registrado, nunca o texto', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    evo.sendText.mockRejectedValueOnce(new EvolutionError('Claro, o horário', 400))
    const r = await responderAutomacao(clinic, input(), NOW)
    expect(r.status).toBe(502)
    expect(state.db.tables.automacao_envios[0].erro).toBe('evolution_400')
    expect(JSON.stringify(r.body)).not.toContain('horário')
  })
  it('Evolution 404: marca a clínica desconectada e libera a chave', async () => {
    evo.sendText.mockRejectedValueOnce(new EvolutionError('nao existe', 404))
    expect((await responderAutomacao(clinic, input(), NOW)).status).toBe(409)
    expect(state.db.tables.clinic_whatsapp[0].status).toBe('desconectado')
    expect(state.db.tables.automacao_envios).toHaveLength(0)
  })
  it('chave de OUTRA clínica: 409 sem revelar nada', async () => {
    load({ automacao_envios: [{ chave_idempotencia: input().chave, clinic_id: C2, funcao: 'responder', status: 'enviado', atualizado_em: NOW.toISOString() }] })
    const r = await responderAutomacao(clinic, input(), NOW)
    expect(r.status).toBe(409)
    expect(JSON.stringify(r.body)).not.toContain(C2)
  })
})


describe('responderAutomacao: modo teste', () => {
  const teste = (over: Partial<ResponderInput> = {}) => input({ modoTeste: true, numeroTeste: '(85) 98888-7777', ...over })
  const newNumber = [{ clinic_id: C1, direction: 'out', origin: 'automatico', created_at: '2026-11-17T11:00:00Z' }]

  it('envia só para o número de teste, nunca para o contato da conversa', async () => {
    const r = await responderAutomacao(clinic, teste(), NOW)
    expect(r.body).toMatchObject({ enviado: true, modoTeste: true })
    expect(evo.checkNumbers.mock.calls[0][1]).toEqual(['5585988887777', '558588887777'])
    expect(evo.sendText.mock.calls[0][1]).toBe('5585988887777')
    expect(JSON.stringify(evo.sendText.mock.calls)).not.toContain('99999')
  })
  it('número de teste sem WhatsApp: 422 e nada sai', async () => {
    evo.checkNumbers.mockResolvedValue([{ number: '5585988887777', exists: false, jid: null }])
    expect((await responderAutomacao(clinic, teste(), NOW)).status).toBe(422)
    expect(evo.sendText).not.toHaveBeenCalled()
  })
  it('não grava na caixa de entrada', async () => {
    await responderAutomacao(clinic, teste(), NOW)
    expect(recordOutgoing).not.toHaveBeenCalled()
  })
  it('a chave é gravada com prefixo teste: e a mesma chave em produção continua livre', async () => {
    await responderAutomacao(clinic, teste(), NOW)
    expect(state.db.tables.automacao_envios[0].chave_idempotencia).toBe(`teste:${input().chave}`)
    expect((await responderAutomacao(clinic, input(), NOW)).body.enviado).toBe(true)
  })
  it('não conta para o aquecimento nem para a pausa', async () => {
    load({
      whatsapp_messages: newNumber,
      automacao_envios: Array.from({ length: 20 }, (_, i) => ({ chave_idempotencia: `teste:ok-${i}-xxxxx`, clinic_id: C1, funcao: 'responder', status: 'enviado', enviado_em: '2026-11-17T11:00:00Z', atualizado_em: '2026-11-17T11:00:00Z' })),
    })
    expect((await responderAutomacao(clinic, input(), NOW)).body.enviado).toBe(true)
  })
  it('funciona em clínica sem automacao_gerenciada, e a conversa ainda precisa ser da clínica', async () => {
    load({ clinic_whatsapp: [{ clinic_id: C1, instance_name: 'mc_1', status: 'conectado', timezone: 'America/Fortaleza', automacao_gerenciada: false }] })
    expect((await responderAutomacao(clinic, teste(), NOW)).body.enviado).toBe(true)
    load({ whatsapp_conversations: [conv({ clinic_id: C2 })] })
    expect((await responderAutomacao(clinic, teste(), NOW)).status).toBe(404)
  })
  it('demo bloqueia até em modo teste', async () => {
    load({ clinics: [{ id: C1, name: 'Demo', demo_mode: true, is_active: true }] })
    expect((await responderAutomacao(clinic, teste(), NOW)).status).toBe(403)
    expect(evo.sendText).not.toHaveBeenCalled()
  })
  it('opt-out do contato não impede o teste; opt-out do número de teste impede', async () => {
    load({ whatsapp_optout: [{ clinic_id: C1, phone_key: '8599998888' }] })
    expect((await responderAutomacao(clinic, teste(), NOW)).body.enviado).toBe(true)
    load({ whatsapp_optout: [{ clinic_id: C1, phone_key: '8588887777' }] })
    expect((await responderAutomacao(clinic, teste(), NOW)).body.motivo).toBe('opt_out')
  })
  it('humano na conversa não impede o teste (a mensagem não vai ao contato)', async () => {
    load({ whatsapp_messages: [msg('sistema', '2026-11-17T11:55:00Z')] })
    expect((await responderAutomacao(clinic, teste(), NOW)).body.enviado).toBe(true)
  })
})
