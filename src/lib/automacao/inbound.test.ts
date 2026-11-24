// Webhook da automação: PARAR, fora do horário, opt-out e repasse ao n8n. Nada fala com a Evolution de verdade.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeDb } from './fakeDb'

const state = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof import('./fakeDb').createFakeDb> }))
const evo = vi.hoisted(() => ({ sendText: vi.fn() }))
const recordOutgoing = vi.hoisted(() => vi.fn())
const pace = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<boolean | void>>(async () => {}))

vi.mock('@/lib/supabaseAdmin', () => ({ getAdminClient: () => state.db.client }))
vi.mock('@/lib/whatsapp/evolution', async (orig) => ({ ...(await orig<typeof import('@/lib/whatsapp/evolution')>()), sendText: evo.sendText }))
vi.mock('@/lib/whatsapp/conversations', async (orig) => ({ ...(await orig<typeof import('@/lib/whatsapp/conversations')>()), recordOutgoing }))
vi.mock('@/lib/whatsapp/sendGate', async (orig) => ({ ...(await orig<typeof import('@/lib/whatsapp/sendGate')>()), paceClinic: pace }))

import { prepareInbound, processInbound, processInboundAudio, classifyForward, RESPOND_MAX_QUEUE, type InboundCtx } from './inbound'
import { PARAR_CONFIRMACAO_TEXTO } from './config'
import type { IncomingOutcome } from '@/lib/whatsapp/incoming'

const C1 = '11111111-1111-4111-8111-111111111111'
const C2 = '22222222-2222-4222-8222-222222222222'
const KEY = '8599998888'
// 22:00 em Fortaleza (UTC-3) = fora do expediente 07:00-19:30 (padrão); 10:00 = dentro
const NIGHT = new Date('2026-11-18T01:00:00Z')
const DAY = new Date('2026-11-17T13:00:00Z')

const UNIQUE = { automacao_envios: ['chave_idempotencia'], whatsapp_optout: ['clinic_id', 'phone_key'] }

const evolutionMsg = (text: string, jid = '5585999998888@s.whatsapp.net', id = 'MSG1') =>
  ({ key: { remoteJid: jid, fromMe: false, id }, message: { conversation: text }, messageType: 'conversation' })

function seed(over: { wa?: Record<string, unknown>; tables?: Record<string, Record<string, unknown>[]> } = {}) {
  return {
    clinics: [{ id: C1, name: 'Clínica Sol', demo_mode: false, is_active: true }],
    clinic_whatsapp: [{
      clinic_id: C1, instance_name: 'mc_1', status: 'conectado', timezone: 'America/Fortaleza', automacao_gerenciada: false,
      automacao_config: { foraDoHorario: { ativa: true, texto: 'Estamos fechados agora. Respondemos amanhã cedo.' } }, ...over.wa,
    }],
    whatsapp_conversations: [], whatsapp_optout: [], automacao_envios: [], whatsapp_messages: [], appointment_confirmations: [],
    clinic_schedule_settings: [],
    ...over.tables,
  }
}
const load = (over: Parameters<typeof seed>[0] = {}) => { state.db = createFakeDb(seed(over), { unique: UNIQUE }) }
const conv = (over: Record<string, unknown> = {}) => ({ id: 'conv1', clinic_id: C1, phone_key: KEY, jid: '5585999998888@s.whatsapp.net', patient_id: null, last_message_at: '2026-11-10T10:00:00Z', lid: null, ...over })

async function ctxFor(text: string, over: Partial<InboundCtx> = {}): Promise<InboundCtx> {
  const c = await prepareInbound('mc_1', evolutionMsg(text))
  if (!c) throw new Error('prepareInbound devolveu null')
  return { ...c, ...over }
}

beforeEach(() => {
  vi.restoreAllMocks()
  evo.sendText.mockReset().mockResolvedValue({ messageId: 'wamid.out' })
  recordOutgoing.mockReset().mockResolvedValue(undefined)
  pace.mockReset().mockResolvedValue(undefined)
  load()
})

describe('prepareInbound', () => {
  it('não é texto de contato individual: null', async () => {
    expect(await prepareInbound('mc_1', { key: { remoteJid: '5585999998888@s.whatsapp.net', fromMe: true }, message: { conversation: 'oi' } })).toBeNull()
    expect(await prepareInbound('mc_1', { key: { remoteJid: '1203@g.us', fromMe: false }, message: { conversation: 'oi' } })).toBeNull()
    expect(await prepareInbound('mc_1', { key: { remoteJid: '5585999998888@s.whatsapp.net', fromMe: false }, message: {} })).toBeNull()
  })
  it('instância desconhecida: null', async () => { expect(await prepareInbound('mc_x', evolutionMsg('oi'))).toBeNull() })
  it('leitura falha (migração não aplicada): null, sem lançar', async () => {
    state.db = createFakeDb(seed(), { errors: { clinic_whatsapp: { code: '42703', message: 'column does not exist' } } })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await prepareInbound('mc_1', evolutionMsg('oi'))).toBeNull()
  })
  it('lê config, chave do contato e estado anterior da conversa', async () => {
    load({ tables: { whatsapp_conversations: [conv()] } })
    const c = await prepareInbound('mc_1', evolutionMsg('oi'))
    expect(c).toMatchObject({ clinicId: C1, key: KEY, gerenciada: false, connected: true, text: 'oi', previous: { existed: true } })
    expect(c!.previous!.lastMessageAt?.toISOString()).toBe('2026-11-10T10:00:00.000Z')
  })
  it('contato novo: previous.existed = false', async () => {
    expect((await prepareInbound('mc_1', evolutionMsg('oi')))!.previous).toEqual({ existed: false, lastMessageAt: null })
  })
  it('sem nenhuma função ligada não consulta a conversa', async () => {
    load({ wa: { automacao_config: {} } })
    const c = await prepareInbound('mc_1', evolutionMsg('oi'))
    expect(c!.previous).toBeNull()
    expect(state.db.log.some(l => l.table === 'whatsapp_conversations')).toBe(false)
  })
})

describe('PARAR', () => {
  it.each(['parar', 'PARAR', 'Pare', 'sair', 'STOP', ' Stop. '])('"%s": grava o opt-out e responde com texto fixo, uma vez', async texto => {
    const ctx = await ctxFor(texto)
    const r = await processInbound(ctx, 'sem_confirmacao', { now: DAY })
    expect(r).toEqual({ acao: 'parar', respondeu: true })
    expect(state.db.tables.whatsapp_optout).toEqual([expect.objectContaining({ clinic_id: C1, phone_key: KEY })])
    expect(evo.sendText).toHaveBeenCalledTimes(1)
    expect(evo.sendText).toHaveBeenCalledWith('mc_1', '5585999998888', PARAR_CONFIRMACAO_TEXTO)
    expect(recordOutgoing).toHaveBeenCalledWith(expect.objectContaining({ clinicId: C1, text: PARAR_CONFIRMACAO_TEXTO, origin: 'automatico' }))

    // de novo: não responde outra vez
    const again = await processInbound(ctx, 'sem_confirmacao', { now: DAY })
    expect(again).toEqual({ acao: 'parar', respondeu: false })
    expect(evo.sendText).toHaveBeenCalledTimes(1)
    expect(state.db.tables.whatsapp_optout).toHaveLength(1)
  })

  it('vale em clínica sem nenhuma função ligada', async () => {
    load({ wa: { automacao_config: {} } })
    const r = await processInbound(await ctxFor('parar'), 'ignorada', { now: DAY })
    expect(r).toEqual({ acao: 'parar', respondeu: true })
  })

  it('só texto exato: frases com a palavra não contam', async () => {
    for (const t of ['quero parar', 'pare de me mandar', 'não quero sair', 'parar!!! agora']) {
      const r = await processInbound(await ctxFor(t), 'sem_confirmacao', { now: DAY })
      expect(r.acao).not.toBe('parar')
    }
    expect(state.db.tables.whatsapp_optout).toHaveLength(0)
  })

  it('palavras configuradas pela clínica', async () => {
    load({ wa: { automacao_config: { parar: { palavras: ['cancelar mensagens'] } } } })
    expect((await processInbound(await ctxFor('Cancelar mensagens'), 'ignorada', { now: DAY })).acao).toBe('parar')
    expect((await processInbound(await ctxFor('parar'), 'ignorada', { now: DAY })).acao).not.toBe('parar')
  })

  it('o opt-out é por clínica', async () => {
    await processInbound(await ctxFor('parar'), 'ignorada', { now: DAY })
    expect(state.db.tables.whatsapp_optout.every(r => r.clinic_id === C1)).toBe(true)
  })

  it('clínica demo: registra o opt-out mas não envia nada', async () => {
    load({ tables: { clinics: [{ id: C1, name: 'Demo', demo_mode: true, is_active: true }] } })
    const r = await processInbound(await ctxFor('parar'), 'ignorada', { now: DAY })
    expect(r).toEqual({ acao: 'parar', respondeu: false })
    expect(state.db.tables.whatsapp_optout).toHaveLength(1)
    expect(evo.sendText).not.toHaveBeenCalled()
  })

  it('falha ao enviar a confirmação não desfaz o opt-out nem lança', async () => {
    evo.sendText.mockRejectedValueOnce(new Error('rede'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await processInbound(await ctxFor('parar'), 'ignorada', { now: DAY })
    expect(r).toEqual({ acao: 'parar', respondeu: false })
    expect(state.db.tables.whatsapp_optout).toHaveLength(1)
  })

  it('contato só com @lid usa a chave lid:<id>', async () => {
    const c = await prepareInbound('mc_1', evolutionMsg('parar', '98765432100@lid'))
    expect(c!.key).toBe('lid:98765432100')
    await processInbound(c!, 'ignorada', { now: DAY })
    expect(state.db.tables.whatsapp_optout[0].phone_key).toBe('lid:98765432100')
    expect(evo.sendText).toHaveBeenCalledWith('mc_1', '98765432100@lid', PARAR_CONFIRMACAO_TEXTO)
  })
})

describe('resposta fora do horário', () => {
  const texto = 'Estamos fechados agora. Respondemos amanhã cedo.'

  it('contato novo, fora do expediente, função ligada: texto fixo, sem IA', async () => {
    const r = await processInbound(await ctxFor('Boa noite, vocês atendem sábado?'), 'sem_confirmacao', { now: NIGHT })
    expect(r).toEqual({ acao: 'fora_do_horario', enviou: true })
    expect(evo.sendText).toHaveBeenCalledWith('mc_1', '5585999998888', texto)
    expect(recordOutgoing).toHaveBeenCalledWith(expect.objectContaining({ text: texto, origin: 'automatico' }))
    expect(state.db.tables.automacao_envios[0]).toMatchObject({ clinic_id: C1, funcao: 'fora_do_horario', status: 'enviado' })
  })

  it('dentro do expediente: não responde', async () => {
    expect((await processInbound(await ctxFor('oi'), 'sem_confirmacao', { now: DAY })).acao).toBe('nada')
    expect(evo.sendText).not.toHaveBeenCalled()
  })

  it('função desligada: não responde', async () => {
    load({ wa: { automacao_config: { foraDoHorario: { ativa: false, texto } } } })
    expect((await processInbound(await ctxFor('oi'), 'sem_confirmacao', { now: NIGHT })).acao).toBe('nada')
    expect(evo.sendText).not.toHaveBeenCalled()
  })

  it('ligada mas sem texto: fica desligada', async () => {
    load({ wa: { automacao_config: { foraDoHorario: { ativa: true, texto: '' } } } })
    expect((await processInbound(await ctxFor('oi'), 'sem_confirmacao', { now: NIGHT })).acao).toBe('nada')
  })

  it('conversa em andamento (última mensagem há menos de 12h): não responde de novo', async () => {
    load({ tables: { whatsapp_conversations: [conv({ last_message_at: '2026-11-17T23:00:00Z' })] } })
    expect((await processInbound(await ctxFor('e então?'), 'sem_confirmacao', { now: NIGHT })).acao).toBe('nada')
    expect(evo.sendText).not.toHaveBeenCalled()
  })

  it('contato antigo sem conversa recente: responde', async () => {
    load({ tables: { whatsapp_conversations: [conv({ last_message_at: '2026-11-10T10:00:00Z' })] } })
    expect((await processInbound(await ctxFor('oi'), 'sem_confirmacao', { now: NIGHT })).acao).toBe('fora_do_horario')
  })

  it('paciente respondendo à confirmação de consulta não recebe aviso de fechado', async () => {
    for (const outcome of ['confirmada', 'pediu_remarcacao', 'respondeu', 'varias_pendentes'] as IncomingOutcome[]) {
      expect((await processInbound(await ctxFor('sim'), outcome, { now: NIGHT })).acao).not.toBe('fora_do_horario')
    }
    expect(evo.sendText).not.toHaveBeenCalled()
  })

  it('evento repetido da Evolution (mesma mensagem): uma resposta só', async () => {
    const ctx = await ctxFor('oi')
    await processInbound(ctx, 'sem_confirmacao', { now: NIGHT })
    const again = await processInbound(ctx, 'sem_confirmacao', { now: NIGHT })
    expect(again).toEqual({ acao: 'fora_do_horario', enviou: false })
    expect(evo.sendText).toHaveBeenCalledTimes(1)
  })

  it('contato em opt-out nunca recebe', async () => {
    load({ tables: { whatsapp_optout: [{ clinic_id: C1, phone_key: KEY }] } })
    expect(await processInbound(await ctxFor('oi'), 'sem_confirmacao', { now: NIGHT })).toEqual({ acao: 'optout' })
    expect(evo.sendText).not.toHaveBeenCalled()
  })

  it('opt-out de outra clínica não bloqueia', async () => {
    load({ tables: { whatsapp_optout: [{ clinic_id: C2, phone_key: KEY }] } })
    expect((await processInbound(await ctxFor('oi'), 'sem_confirmacao', { now: NIGHT })).acao).toBe('fora_do_horario')
  })

  it('clínica demo: nada sai', async () => {
    load({ tables: { clinics: [{ id: C1, name: 'Demo', demo_mode: true, is_active: true }] } })
    expect(await processInbound(await ctxFor('oi'), 'sem_confirmacao', { now: NIGHT })).toEqual({ acao: 'fora_do_horario', enviou: false })
    expect(evo.sendText).not.toHaveBeenCalled()
  })

  it('WhatsApp desconectado: não envia', async () => {
    load({ wa: { status: 'desconectado' } })
    expect(await processInbound(await ctxFor('oi'), 'sem_confirmacao', { now: NIGHT })).toEqual({ acao: 'fora_do_horario', enviou: false })
    expect(evo.sendText).not.toHaveBeenCalled()
  })

  it('número em pausa por falhas: não envia (portão do número) e libera a chave', async () => {
    load({ tables: { appointment_confirmations: [1, 2, 3].map(i => ({ clinic_id: C1, appointment_id: `x${i}`, kind: 'confirmacao', appointment_at: `2026-11-1${i}T10:00:00Z`, status: 'falhou', error: 'timeout', updated_at: '2026-11-18T00:50:00Z' })) } })
    expect(await processInbound(await ctxFor('oi'), 'sem_confirmacao', { now: NIGHT })).toEqual({ acao: 'fora_do_horario', enviou: false })
    expect(evo.sendText).not.toHaveBeenCalled()
    expect(state.db.tables.automacao_envios).toHaveLength(0)
  })

  it('passa pelo ritmo entre envios antes de enviar, com fila máxima', async () => {
    const order: string[] = []
    pace.mockImplementation(async () => { order.push('pace') })
    evo.sendText.mockImplementation(async () => { order.push('send'); return { messageId: 'w' } })
    expect(await processInbound(await ctxFor('oi'), 'sem_confirmacao', { now: NIGHT })).toEqual({ acao: 'fora_do_horario', enviou: true })
    expect(order).toEqual(['pace', 'send'])
    expect(pace).toHaveBeenCalledWith(C1, { maxQueue: RESPOND_MAX_QUEUE })
  })

  it('fila do ritmo cheia: descarta a resposta (não segura o webhook) e libera a chave', async () => {
    pace.mockResolvedValue(false)
    expect(await processInbound(await ctxFor('oi'), 'sem_confirmacao', { now: NIGHT })).toEqual({ acao: 'fora_do_horario', enviou: false })
    expect(evo.sendText).not.toHaveBeenCalled()
    expect(state.db.tables.automacao_envios).toHaveLength(0)
  })

  it('reavalia a pausa depois da espera do ritmo', async () => {
    pace.mockImplementation(async () => {
      for (let i = 0; i < 3; i++) state.db.tables.automacao_envios.push({ id: `f${i}`, chave_idempotencia: `f-${i}-xxxxxxx`, clinic_id: C1, funcao: 'lembrete_vespera', status: 'falhou', erro: 'evolution_400', atualizado_em: '2026-11-18T00:59:00Z' })
    })
    expect(await processInbound(await ctxFor('oi'), 'sem_confirmacao', { now: NIGHT })).toEqual({ acao: 'fora_do_horario', enviou: false })
    expect(evo.sendText).not.toHaveBeenCalled()
  })

  it('PARAR responde sem passar pela fila (precisa confirmar mesmo com o número em pausa)', async () => {
    await processInbound(await ctxFor('parar'), 'ignorada', { now: DAY })
    expect(pace).not.toHaveBeenCalled()
  })

  it('usa o horário de funcionamento da clínica e o fuso dela', async () => {
    // expediente 08:00-12:00: 13:00 UTC = 10:00 em Fortaleza (dentro); 16:00 UTC = 13:00 (fora)
    load({ tables: { clinic_schedule_settings: [{ clinic_id: C1, opening_hours: { start: '08:00', end: '12:00' } }] } })
    expect((await processInbound(await ctxFor('oi'), 'sem_confirmacao', { now: new Date('2026-11-17T13:00:00Z') })).acao).toBe('nada')
    expect((await processInbound(await ctxFor('oi2'), 'sem_confirmacao', { now: new Date('2026-11-17T16:00:00Z') })).acao).toBe('fora_do_horario')
  })

  it('falha ao enviar: não lança, registra a falha', async () => {
    evo.sendText.mockRejectedValueOnce(new Error('rede'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await processInbound(await ctxFor('oi'), 'sem_confirmacao', { now: NIGHT })).toEqual({ acao: 'fora_do_horario', enviou: false })
    expect(state.db.tables.automacao_envios[0]).toMatchObject({ status: 'falhou', erro: 'erro_envio' })
  })

  it('o texto enviado nunca vem de IA nem tem emoji: é o da configuração', async () => {
    await processInbound(await ctxFor('oi'), 'sem_confirmacao', { now: NIGHT })
    expect(evo.sendText.mock.calls[0][2]).toBe(texto)
  })
})

describe('classifyForward', () => {
  const now = new Date('2026-11-17T13:00:00Z')
  const base = { isPatient: false, now, diasSemConversar: 30 }
  const recent = { existed: true, lastMessageAt: new Date('2026-11-16T13:00:00Z') }
  const old = { existed: true, lastMessageAt: new Date('2026-09-01T13:00:00Z') }
  it('contato novo: boas_vindas', () => {
    expect(classifyForward({ ...base, outcome: 'sem_confirmacao', previous: { existed: false, lastMessageAt: null } })).toBe('boas_vindas')
    expect(classifyForward({ ...base, outcome: 'ignorada', previous: null })).toBe('boas_vindas')
  })
  it('sem conversa há mais de N dias: boas_vindas; conversa recente: outro', () => {
    expect(classifyForward({ ...base, outcome: 'sem_confirmacao', previous: old })).toBe('boas_vindas')
    expect(classifyForward({ ...base, outcome: 'sem_confirmacao', previous: recent })).toBe('outro')
    expect(classifyForward({ ...base, outcome: 'sem_confirmacao', previous: old, diasSemConversar: 365 })).toBe('outro')
  })
  it('resposta ambígua à confirmação ou vários pendentes: resposta_confirmacao (mesmo para paciente)', () => {
    expect(classifyForward({ ...base, isPatient: true, outcome: 'respondeu', previous: recent })).toBe('resposta_confirmacao')
    expect(classifyForward({ ...base, isPatient: true, outcome: 'varias_pendentes', previous: recent })).toBe('resposta_confirmacao')
  })
  it('SIM/NÃO exatos já resolvidos pelo MyClinica: não repassa', () => {
    expect(classifyForward({ ...base, isPatient: true, outcome: 'confirmada', previous: recent })).toBeNull()
    expect(classifyForward({ ...base, outcome: 'pediu_remarcacao', previous: recent })).toBeNull()
  })
  it('paciente cadastrado fora de confirmação: não é da automação', () => {
    expect(classifyForward({ ...base, isPatient: true, outcome: 'sem_confirmacao', previous: old })).toBeNull()
  })
})

describe('repasse ao n8n', () => {
  const forward = vi.fn()
  beforeEach(() => { forward.mockReset().mockResolvedValue(true) })
  const gerenciada = (tables: Record<string, Record<string, unknown>[]> = {}) =>
    load({ wa: { automacao_gerenciada: true, automacao_config: {} }, tables })

  it('contato novo: repassa boas_vindas só com os campos combinados (phoneKey, nunca o telefone completo)', async () => {
    gerenciada()
    const ctx = await ctxFor('Olá, gostaria de informações')
    // a conversa passa a existir depois que o webhook guarda a mensagem
    state.db.tables.whatsapp_conversations.push(conv({ last_message_at: '2026-11-17T13:00:00Z' }))
    const r = await processInbound(ctx, 'sem_confirmacao', { now: DAY, forward })
    expect(r).toEqual({ acao: 'repassada', tipo: 'boas_vindas', ok: true })
    expect(forward).toHaveBeenCalledWith({ clinicId: C1, conversationId: 'conv1', phoneKey: KEY, texto: 'Olá, gostaria de informações', tipo: 'boas_vindas' })
    expect(JSON.stringify(forward.mock.calls)).not.toContain('5585999998888')
  })

  it('resposta ambígua à confirmação: resposta_confirmacao', async () => {
    gerenciada({ whatsapp_conversations: [conv({ patient_id: 'p1', last_message_at: '2026-11-17T10:00:00Z' })] })
    const r = await processInbound(await ctxFor('sim, mas posso chegar mais tarde?'), 'respondeu', { now: DAY, forward })
    expect(r).toMatchObject({ acao: 'repassada', tipo: 'resposta_confirmacao' })
  })

  describe('consulta da confirmação pendente no repasse', () => {
    const pend = (id: string, over: Record<string, unknown> = {}) => ({ clinic_id: C1, appointment_id: id, kind: 'confirmacao', status: 'enviado', phone_key: KEY, appointment_at: '2026-11-18T14:00:00Z', sent_at: '2026-11-17T09:00:00Z', ...over })
    const base = { whatsapp_conversations: [conv({ patient_id: 'p1', last_message_at: '2026-11-17T10:00:00Z' })] }

    it('uma pendente: leva appointmentId e a lista', async () => {
      gerenciada({ ...base, appointment_confirmations: [pend('ap1')] })
      const ctx = await ctxFor('sim, mas posso chegar mais tarde?')
      expect(ctx.pendentes).toEqual(['ap1'])
      await processInbound(ctx, 'respondeu', { now: DAY, forward })
      expect(forward).toHaveBeenCalledWith({
        clinicId: C1, conversationId: 'conv1', phoneKey: KEY, texto: 'sim, mas posso chegar mais tarde?', tipo: 'resposta_confirmacao',
        appointmentId: 'ap1', appointmentIds: ['ap1'],
      })
    })

    it('mais de uma: appointmentId nulo e a lista (a recepção resolve)', async () => {
      gerenciada({ ...base, appointment_confirmations: [pend('ap1', { sent_at: '2026-11-17T08:00:00Z' }), pend('ap2')] })
      const ctx = await ctxFor('sim')
      await processInbound(ctx, 'varias_pendentes', { now: DAY, forward })
      expect(forward.mock.calls[0][0]).toMatchObject({ tipo: 'resposta_confirmacao', appointmentId: null, appointmentIds: ['ap2', 'ap1'] })
    })

    it('lê ANTES de handleIncoming: mesmo com a confirmação já marcada como respondida, o repasse leva a consulta', async () => {
      gerenciada({ ...base, appointment_confirmations: [pend('ap1')] })
      const ctx = await ctxFor('talvez')
      // handleIncoming roda depois do prepare e tira a confirmação de 'enviado'
      state.db.tables.appointment_confirmations[0].status = 'respondeu'
      await processInbound(ctx, 'respondeu', { now: DAY, forward })
      expect(forward.mock.calls[0][0]).toMatchObject({ appointmentId: 'ap1', appointmentIds: ['ap1'] })
    })

    it('sem pendente (ou de outra clínica): appointmentId nulo e lista vazia', async () => {
      gerenciada({ ...base, appointment_confirmations: [pend('ap1', { clinic_id: C2 })] })
      await processInbound(await ctxFor('talvez'), 'respondeu', { now: DAY, forward })
      expect(forward.mock.calls[0][0]).toMatchObject({ appointmentId: null, appointmentIds: [] })
    })

    it('boas_vindas e outro não levam campos de consulta', async () => {
      gerenciada({ whatsapp_conversations: [conv({ patient_id: null, last_message_at: '2026-11-17T10:00:00Z' })], appointment_confirmations: [pend('ap1')] })
      await processInbound(await ctxFor('quanto custa?'), 'sem_confirmacao', { now: DAY, forward })
      expect(forward.mock.calls[0][0]).not.toHaveProperty('appointmentIds')
    })

    it('clínica sem automacao_gerenciada não lê pendentes', async () => {
      load({ tables: { ...base, appointment_confirmations: [pend('ap1')] } })
      expect((await ctxFor('oi')).pendentes).toEqual([])
    })

    it('falha ao ler as pendentes não derruba o preparo', async () => {
      state.db = createFakeDb(seed({ wa: { automacao_gerenciada: true, automacao_config: {} } }), { unique: UNIQUE, errors: { appointment_confirmations: { code: 'XX', message: 'x' } } })
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect((await ctxFor('oi')).pendentes).toEqual([])
    })
  })

  it('SIM exato: o MyClinica resolve, nada é repassado', async () => {
    gerenciada({ whatsapp_conversations: [conv({ patient_id: 'p1' })] })
    expect((await processInbound(await ctxFor('sim'), 'confirmada', { now: DAY, forward })).acao).toBe('nada')
    expect(forward).not.toHaveBeenCalled()
  })

  it('paciente falando de outro assunto: não repassa; contato não paciente: outro', async () => {
    gerenciada({ whatsapp_conversations: [conv({ patient_id: 'p1', last_message_at: '2026-11-17T10:00:00Z' })] })
    expect((await processInbound(await ctxFor('bom dia'), 'sem_confirmacao', { now: DAY, forward })).acao).toBe('nada')
    gerenciada({ whatsapp_conversations: [conv({ patient_id: null, last_message_at: '2026-11-17T10:00:00Z' })] })
    expect(await processInbound(await ctxFor('quanto custa?'), 'sem_confirmacao', { now: DAY, forward })).toEqual({ acao: 'repassada', tipo: 'outro', ok: true })
  })

  it('clínica sem automacao_gerenciada: nunca repassa', async () => {
    load({ wa: { automacao_gerenciada: false, automacao_config: {} }, tables: { whatsapp_conversations: [conv()] } })
    expect((await processInbound(await ctxFor('oi'), 'sem_confirmacao', { now: DAY, forward })).acao).toBe('nada')
    expect(forward).not.toHaveBeenCalled()
  })

  it('contato em opt-out: não repassa', async () => {
    gerenciada({ whatsapp_conversations: [conv()], whatsapp_optout: [{ clinic_id: C1, phone_key: KEY }] })
    expect(await processInbound(await ctxFor('oi'), 'sem_confirmacao', { now: DAY, forward })).toEqual({ acao: 'optout' })
    expect(forward).not.toHaveBeenCalled()
  })

  it('já respondeu fora do horário: não repassa boas-vindas em dobro', async () => {
    load({ wa: { automacao_gerenciada: true, automacao_config: { foraDoHorario: { ativa: true, texto: 'Fechado.' } } } })
    const ctx = await ctxFor('oi')
    state.db.tables.whatsapp_conversations.push(conv({ last_message_at: '2026-11-18T01:00:00Z' }))
    const r = await processInbound(ctx, 'sem_confirmacao', { now: NIGHT, forward })
    expect(r.acao).toBe('fora_do_horario')
    expect(forward).not.toHaveBeenCalled()
  })

  it('sem conversa guardada (falha ao guardar): não repassa', async () => {
    gerenciada()
    expect((await processInbound(await ctxFor('oi'), 'sem_confirmacao', { now: DAY, forward })).acao).toBe('nada')
    expect(forward).not.toHaveBeenCalled()
  })

  it('sem AUTOMACAO_N8N_WEBHOOK_URL o repasse padrão não faz nada (ok:false, sem lançar)', async () => {
    gerenciada({ whatsapp_conversations: [conv()] })
    const r = await processInbound(await ctxFor('oi'), 'sem_confirmacao', { now: DAY })
    expect(r).toMatchObject({ acao: 'repassada', ok: false })
  })
})


describe('opt-out pelo lid (conversa liga telefone e lid)', () => {
  const lidConv = () => conv({ lid: '98765432100' })

  it('PARAR vindo pelo lid também bloqueia o telefone da conversa', async () => {
    load({ tables: { whatsapp_conversations: [lidConv()] } })
    const c = await prepareInbound('mc_1', evolutionMsg('parar', '98765432100@lid'))
    await processInbound(c!, 'ignorada', { now: DAY })
    const keys = state.db.tables.whatsapp_optout.map(r => r.phone_key).sort()
    expect(keys).toEqual([KEY, 'lid:98765432100'].sort())
  })

  it('opt-out gravado só pelo telefone vale quando o contato escreve só pelo lid: nada é respondido', async () => {
    load({ tables: { whatsapp_conversations: [lidConv()], whatsapp_optout: [{ clinic_id: C1, phone_key: KEY }] } })
    const c = await prepareInbound('mc_1', evolutionMsg('oi', '98765432100@lid'))
    expect(await processInbound(c!, 'sem_confirmacao', { now: NIGHT })).toEqual({ acao: 'optout' })
    expect(evo.sendText).not.toHaveBeenCalled()
  })
})

describe('áudio recebido (possível resposta à confirmação)', () => {
  const forward = vi.fn()
  const AUDIO_ID = '3EB0AUDIO1'
  const audioMsg = (jid = '5585999998888@s.whatsapp.net', over: Record<string, unknown> = {}) => ({
    key: { remoteJid: jid, fromMe: false, id: AUDIO_ID }, messageTimestamp: 1_760_000_000,
    message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus', seconds: 4, ptt: true, url: 'https://mmg.whatsapp.net/secreto' } }, ...over,
  })
  const pendente = (over: Record<string, unknown> = {}) => ({ clinic_id: C1, appointment_id: 'ap1', kind: 'confirmacao', status: 'enviado', phone_key: KEY, appointment_at: '2026-11-18T14:00:00Z', ...over })
  const gerenciada = (tables: Record<string, Record<string, unknown>[]> = {}) =>
    load({ wa: { automacao_gerenciada: true, automacao_config: {} }, tables: { whatsapp_conversations: [conv()], appointment_confirmations: [pendente()], ...tables } })
  beforeEach(() => { forward.mockReset().mockResolvedValue(true) })

  it('repassa tipo resposta_confirmacao_audio com o id da mensagem e SEM o arquivo', async () => {
    gerenciada()
    const r = await processInboundAudio('mc_1', audioMsg(), { now: DAY, forward })
    expect(r).toEqual({ acao: 'repassada', tipo: 'resposta_confirmacao_audio', ok: true })
    expect(forward).toHaveBeenCalledWith({ clinicId: C1, conversationId: 'conv1', phoneKey: KEY, texto: '', tipo: 'resposta_confirmacao_audio', mensagemId: AUDIO_ID, appointmentId: 'ap1', appointmentIds: ['ap1'] })
    expect(JSON.stringify(forward.mock.calls)).not.toContain('mmg.whatsapp.net')
    expect(JSON.stringify(forward.mock.calls)).not.toContain('5585999998888')
  })

  it('funciona quando o áudio chega só pelo lid (a conversa liga ao telefone)', async () => {
    gerenciada({ whatsapp_conversations: [conv({ lid: '98765432100' })] })
    const r = await processInboundAudio('mc_1', audioMsg('98765432100@lid'), { now: DAY, forward })
    expect(r).toMatchObject({ acao: 'repassada', tipo: 'resposta_confirmacao_audio' })
    expect(forward.mock.calls[0][0]).toMatchObject({ conversationId: 'conv1', phoneKey: KEY })
  })

  it.each([
    ['sem confirmação aguardando', { appointment_confirmations: [] }],
    ['confirmação já respondida', { appointment_confirmations: [pendente({ status: 'respondeu' })] }],
    ['consulta que já passou', { appointment_confirmations: [pendente({ appointment_at: '2026-11-10T14:00:00Z' })] }],
    ['confirmação de outra clínica', { appointment_confirmations: [pendente({ clinic_id: C2 })] }],
    ['contato em opt-out', { whatsapp_optout: [{ clinic_id: C1, phone_key: KEY }] }],
    ['sem conversa guardada', { whatsapp_conversations: [] }],
  ])('não repassa: %s', async (_n, tables) => {
    gerenciada(tables as Record<string, Record<string, unknown>[]>)
    expect((await processInboundAudio('mc_1', audioMsg(), { now: DAY, forward })).acao).not.toBe('repassada')
    expect(forward).not.toHaveBeenCalled()
  })

  it('clínica sem automacao_gerenciada, instância desconhecida, mensagem nossa, áudio de grupo ou não-áudio: nada', async () => {
    load({ wa: { automacao_gerenciada: false, automacao_config: {} }, tables: { whatsapp_conversations: [conv()], appointment_confirmations: [pendente()] } })
    expect((await processInboundAudio('mc_1', audioMsg(), { now: DAY, forward })).acao).toBe('nada')
    gerenciada()
    expect((await processInboundAudio('mc_x', audioMsg(), { now: DAY, forward })).acao).toBe('nada')
    expect((await processInboundAudio('mc_1', audioMsg(undefined, { key: { remoteJid: '5585999998888@s.whatsapp.net', fromMe: true, id: 'X' } }), { now: DAY, forward })).acao).toBe('nada')
    expect((await processInboundAudio('mc_1', audioMsg('1203@g.us'), { now: DAY, forward })).acao).toBe('nada')
    expect((await processInboundAudio('mc_1', evolutionMsg('oi'), { now: DAY, forward })).acao).toBe('nada')
    expect(forward).not.toHaveBeenCalled()
  })
})
