// Envio da automação: idempotência, travas (demo, opt-out, pausa, aquecimento), escopo por clínica, texto montado no servidor.
// Nada aqui fala com a Evolution de verdade: sendText/checkNumbers são mocks.
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

import { enviarAutomacao, validateEnvioBody, type EnvioInput } from './envio'
import { EvolutionError } from '@/lib/whatsapp/evolution'
import { REPLY_INSTRUCTION } from '@/lib/whatsapp/message'

const C1 = '11111111-1111-4111-8111-111111111111'
const C2 = '22222222-2222-4222-8222-222222222222'
const A1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NOW = new Date('2026-11-17T12:00:00Z')
const APPT_AT = '2026-11-18T14:00:00Z' // amanhã 11h em Fortaleza
const clinic = { id: C1, name: 'Clínica Sol' }

const UNIQUE = {
  automacao_envios: ['chave_idempotencia'],
  appointment_confirmations: ['appointment_id', 'kind', 'appointment_at'],
  whatsapp_optout: ['clinic_id', 'phone_key'],
}

function seed(over: Record<string, Record<string, unknown>[]> = {}) {
  return {
    clinics: [{ id: C1, name: 'Clínica Sol', demo_mode: false, is_active: true }, { id: C2, name: 'Outra', demo_mode: false, is_active: true }],
    clinic_whatsapp: [{ clinic_id: C1, instance_name: 'mc_1', status: 'conectado', timezone: 'America/Fortaleza', automacao_gerenciada: true }],
    appointments: [{
      id: A1, clinic_id: C1, status: 'agendado', scheduled_at: APPT_AT, created_at: '2026-11-10T10:00:00Z',
      patients: { name: 'Maria da Silva', phone: '(85) 99999-8888' }, professionals: { name: 'Dra. Ana' },
    }],
    appointment_confirmations: [], automacao_envios: [], whatsapp_optout: [], whatsapp_messages: [],
    ...over,
  }
}

const input = (over: Partial<EnvioInput> = {}): EnvioInput => ({
  clinicId: C1, appointmentId: A1, pacienteId: null, modelo: 'confirmacao_dia', textoModelo: 'Olá, {paciente}! Sua consulta na {clinica} é {data} às {hora}{com_profissional}.',
  chave: 'c1:confirmacao_dia:a1:2026-11-18', modoTeste: false, numeroTeste: null, ...over,
})

const load = (over: Record<string, Record<string, unknown>[]> = {}) => { state.db = createFakeDb(seed(over), { unique: UNIQUE }) }

beforeEach(() => {
  vi.restoreAllMocks()
  evo.sendText.mockReset().mockResolvedValue({ messageId: 'wamid.1' })
  evo.checkNumbers.mockReset().mockImplementation(async (_i: string, nums: string[]) => [{ number: nums[0], exists: true, jid: `${nums[0]}@s.whatsapp.net` }])
  recordOutgoing.mockReset().mockResolvedValue(undefined)
  pace.mockReset().mockResolvedValue(undefined)
  load()
})

describe('validateEnvioBody', () => {
  const ok = { clinicId: C1, appointmentId: A1, modelo: 'lembrete_vespera', textoModelo: 'Oi {paciente}', chave: 'chave-12345' }
  it('aceita o corpo mínimo', () => { expect(validateEnvioBody(ok)).toMatchObject({ ok: true, value: { modoTeste: false, numeroTeste: null } }) })
  it.each([
    ['clinicId', { clinicId: 'x' }], ['appointmentId', { appointmentId: '1' }], ['modelo', { modelo: 'inexistente' }], ['aniversario sem pacienteId', { modelo: 'aniversario', appointmentId: undefined }], ['chave de produção com prefixo teste:', { chave: 'teste:chave-12345' }],
    ['textoModelo vazio', { textoModelo: '  ' }], ['textoModelo longo', { textoModelo: 'a'.repeat(1001) }],
    ['chave curta', { chave: 'abc' }], ['chave com espaço', { chave: 'chave com espaco' }], ['modoTeste não booleano', { modoTeste: 'sim' }],
  ])('recusa %s', (_n, over) => { expect(validateEnvioBody({ ...ok, ...over }).ok).toBe(false) })
  it('modoTeste sem número válido é recusado (nunca cai para o paciente)', () => {
    expect(validateEnvioBody({ ...ok, modoTeste: true }).ok).toBe(false)
    expect(validateEnvioBody({ ...ok, modoTeste: true, numeroTeste: '123' }).ok).toBe(false)
    expect(validateEnvioBody({ ...ok, modoTeste: true, numeroTeste: '(85) 98888-7777' })).toMatchObject({ ok: true, value: { modoTeste: true, numeroTeste: '(85) 98888-7777' } })
  })
  it('numeroTeste sem modoTeste é ignorado', () => {
    expect(validateEnvioBody({ ...ok, numeroTeste: '85988887777' })).toMatchObject({ ok: true, value: { modoTeste: false, numeroTeste: null } })
  })
})

describe('enviarAutomacao: travas', () => {
  it('clínica demo: 403 e nada sai', async () => {
    load({ clinics: [{ id: C1, name: 'Demo', demo_mode: true, is_active: true }] })
    const r = await enviarAutomacao(clinic, input(), NOW)
    expect(r.status).toBe(403)
    expect(evo.sendText).not.toHaveBeenCalled()
    expect(state.db.tables.automacao_envios).toHaveLength(0)
  })

  it('demo bloqueia até em modo teste', async () => {
    load({ clinics: [{ id: C1, name: 'Demo', demo_mode: true, is_active: true }] })
    const r = await enviarAutomacao(clinic, input({ modoTeste: true, numeroTeste: '85988887777' }), NOW)
    expect(r.status).toBe(403)
    expect(evo.sendText).not.toHaveBeenCalled()
  })

  it('WhatsApp desconectado: 409', async () => {
    load({ clinic_whatsapp: [{ clinic_id: C1, instance_name: 'mc_1', status: 'desconectado', timezone: 'America/Fortaleza', automacao_gerenciada: true }] })
    expect((await enviarAutomacao(clinic, input(), NOW)).status).toBe(409)
    expect(evo.sendText).not.toHaveBeenCalled()
  })

  it('clínica sem automacao_gerenciada: 409 (evita mensagem em dobro com a rotina antiga)', async () => {
    load({ clinic_whatsapp: [{ clinic_id: C1, instance_name: 'mc_1', status: 'conectado', timezone: 'America/Fortaleza', automacao_gerenciada: false }] })
    const r = await enviarAutomacao(clinic, input(), NOW)
    expect(r.status).toBe(409)
    expect(r.body.codigo).toBe('automacao_nao_habilitada')
    expect(evo.sendText).not.toHaveBeenCalled()
  })

  it('consulta de OUTRA clínica: 404 (escopo por clínica)', async () => {
    load({ appointments: [{ id: A1, clinic_id: C2, status: 'agendado', scheduled_at: APPT_AT, patients: { name: 'X', phone: '85999998888' }, professionals: null }] })
    const r = await enviarAutomacao(clinic, input(), NOW)
    expect(r.status).toBe(404)
    expect(evo.sendText).not.toHaveBeenCalled()
  })

  it('consulta sem paciente (bloqueio de agenda): 422', async () => {
    load({ appointments: [{ id: A1, clinic_id: C1, status: 'agendado', scheduled_at: APPT_AT, patients: null, professionals: null }] })
    expect((await enviarAutomacao(clinic, input(), NOW)).status).toBe(422)
  })

  it.each([
    ['confirmacao_dia', 'cancelado', 'consulta_nao_elegivel'],
    ['confirmacao_dia', 'confirmado', 'ja_confirmada'],
    ['lembrete_vespera', 'cancelado', 'consulta_nao_elegivel'],
    ['lembrete_vespera', 'faltou', 'consulta_nao_elegivel'],
    ['quem_faltou', 'agendado', 'consulta_nao_elegivel'],
    ['quem_faltou', 'concluido', 'consulta_nao_elegivel'],
  ] as const)('%s com consulta %s: não envia (%s)', async (modelo, status, motivo) => {
    load({ appointments: [{ id: A1, clinic_id: C1, status, scheduled_at: APPT_AT, patients: { name: 'M', phone: '85999998888' }, professionals: null }] })
    const r = await enviarAutomacao(clinic, input({ modelo }), NOW)
    expect(r).toMatchObject({ status: 200, body: { enviado: false, motivo } })
    expect(evo.sendText).not.toHaveBeenCalled()
  })

  it('consulta que já passou não recebe confirmação nem lembrete', async () => {
    load({ appointments: [{ id: A1, clinic_id: C1, status: 'agendado', scheduled_at: '2026-11-17T08:00:00Z', patients: { name: 'M', phone: '85999998888' }, professionals: null }] })
    expect((await enviarAutomacao(clinic, input(), NOW)).body.motivo).toBe('consulta_nao_elegivel')
  })

  it('contato em whatsapp_optout: não envia, qualquer formato de telefone do cadastro', async () => {
    load({ whatsapp_optout: [{ clinic_id: C1, phone_key: '8599998888' }] })
    const r = await enviarAutomacao(clinic, input(), NOW)
    expect(r).toMatchObject({ status: 200, body: { enviado: false, motivo: 'opt_out' } })
    expect(evo.sendText).not.toHaveBeenCalled()
    expect(state.db.tables.automacao_envios).toHaveLength(0)
  })

  it('opt-out de outra clínica não bloqueia esta', async () => {
    load({ whatsapp_optout: [{ clinic_id: C2, phone_key: '8599998888' }] })
    expect((await enviarAutomacao(clinic, input(), NOW)).body.enviado).toBe(true)
  })

  it('erro ao ler o opt-out: falha fechada (500) e não envia', async () => {
    state.db = createFakeDb(seed(), { unique: UNIQUE, errors: { whatsapp_optout: { code: 'XX', message: 'boom' } } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await enviarAutomacao(clinic, input(), NOW)).status).toBe(500)
    expect(evo.sendText).not.toHaveBeenCalled()
  })

  it('pausa por falhas recentes: não envia, libera a chave e pede para tentar depois', async () => {
    load({
      appointment_confirmations: [1, 2, 3].map(i => ({ clinic_id: C1, appointment_id: `x${i}`, kind: 'confirmacao', appointment_at: `2026-11-1${i}T10:00:00Z`, status: 'falhou', error: 'timeout', updated_at: '2026-11-17T11:50:00Z' })),
    })
    const r = await enviarAutomacao(clinic, input(), NOW)
    expect(r).toMatchObject({ status: 200, body: { enviado: false, motivo: 'pausada', tentarNovamente: true } })
    expect(evo.sendText).not.toHaveBeenCalled()
    expect(state.db.tables.automacao_envios).toHaveLength(0)
  })

  it('falhas da própria automação (automacao_envios) também pausam', async () => {
    load({
      automacao_envios: [1, 2, 3].map(i => ({ chave_idempotencia: `k-${i}-xxxxxxx`, clinic_id: C1, funcao: 'lembrete_vespera', status: 'falhou', erro: 'evolution_400', atualizado_em: '2026-11-17T11:55:00Z' })),
    })
    expect((await enviarAutomacao(clinic, input(), NOW)).body.motivo).toBe('pausada')
  })

  it('aquecimento: número novo no limite do dia não envia', async () => {
    // 1 mensagem enviada há 1 hora (número "novo"): limite do dia 1 = 20; 20 envios já feitos hoje
    load({
      whatsapp_messages: [{ clinic_id: C1, direction: 'out', created_at: '2026-11-17T11:00:00Z' }],
      appointment_confirmations: Array.from({ length: 20 }, (_, i) => ({ clinic_id: C1, appointment_id: `y${i}`, kind: 'confirmacao', appointment_at: `2026-11-2${i % 9}T10:00:00Z`, status: 'enviado', sent_at: '2026-11-17T11:00:00Z', updated_at: '2026-11-17T11:00:00Z' })),
    })
    const r = await enviarAutomacao(clinic, input(), NOW)
    expect(r.body).toMatchObject({ enviado: false, motivo: 'aquecimento', tentarNovamente: true })
    expect(evo.sendText).not.toHaveBeenCalled()
  })

  it('aquecimento conta também os envios da automação (lembrete, quem faltou)', async () => {
    load({
      whatsapp_messages: [{ clinic_id: C1, direction: 'out', created_at: '2026-11-17T11:00:00Z' }],
      automacao_envios: Array.from({ length: 20 }, (_, i) => ({ chave_idempotencia: `ok-${i}-xxxxxxx`, clinic_id: C1, funcao: 'lembrete_vespera', status: 'enviado', enviado_em: '2026-11-17T11:00:00Z', atualizado_em: '2026-11-17T11:00:00Z' })),
    })
    expect((await enviarAutomacao(clinic, input({ chave: 'nova-chave-1234' }), NOW)).body.motivo).toBe('aquecimento')
  })
})

describe('enviarAutomacao: envio', () => {
  it('confirmação do dia: monta o texto no servidor, pede SIM/NÃO, grava a confirmação e o envio', async () => {
    const r = await enviarAutomacao(clinic, input(), NOW)
    expect(r).toEqual({ status: 200, body: { ok: true, enviado: true, modelo: 'confirmacao_dia', modoTeste: false } })

    expect(evo.sendText).toHaveBeenCalledTimes(1)
    const [instance, to, text] = evo.sendText.mock.calls[0]
    expect(instance).toBe('mc_1')
    expect(to).toBe('5585999998888')
    expect(text).toContain('Olá, Maria!') // só o primeiro nome
    expect(text).toContain('Clínica Sol')
    expect(text).toContain('amanhã (18/11)')
    expect(text).toContain('11h') // 14:00 UTC = 11:00 em Fortaleza
    expect(text).toContain('com Dra. Ana')
    expect(text).toContain(REPLY_INSTRUCTION)
    expect(/\p{Extended_Pictographic}/u.test(text)).toBe(false)

    const conf = state.db.tables.appointment_confirmations
    expect(conf).toHaveLength(1)
    expect(conf[0]).toMatchObject({ clinic_id: C1, appointment_id: A1, kind: 'confirmacao', status: 'enviado', phone_key: '8599998888', provider_message_id: 'wamid.1' })
    expect(state.db.tables.automacao_envios[0]).toMatchObject({ clinic_id: C1, funcao: 'confirmacao_dia', appointment_id: A1, status: 'enviado' })
    expect(recordOutgoing).toHaveBeenCalledWith(expect.objectContaining({ clinicId: C1, origin: 'automatico' }))
    expect(pace).toHaveBeenCalledWith(C1, { maxQueue: 3 })
  })

  it('lembrete da véspera: sem pedido de resposta e sem linha em appointment_confirmations', async () => {
    const r = await enviarAutomacao(clinic, input({ modelo: 'lembrete_vespera', chave: 'c1:lembrete:a1:2026-11-17' }), NOW)
    expect(r.body.enviado).toBe(true)
    expect(evo.sendText.mock.calls[0][2]).not.toContain(REPLY_INSTRUCTION)
    expect(state.db.tables.appointment_confirmations).toHaveLength(0)
    expect(state.db.tables.automacao_envios[0].funcao).toBe('lembrete_vespera')
  })

  it('lembrete também vai para consulta confirmada', async () => {
    load({ appointments: [{ id: A1, clinic_id: C1, status: 'confirmado', scheduled_at: APPT_AT, patients: { name: 'Maria', phone: '85999998888' }, professionals: null }] })
    expect((await enviarAutomacao(clinic, input({ modelo: 'lembrete_vespera' }), NOW)).body.enviado).toBe(true)
  })

  it('quem faltou: só para consulta com status faltou', async () => {
    load({ appointments: [{ id: A1, clinic_id: C1, status: 'faltou', scheduled_at: '2026-11-17T09:00:00Z', patients: { name: 'Maria', phone: '85999998888' }, professionals: null }] })
    const r = await enviarAutomacao(clinic, input({ modelo: 'quem_faltou', textoModelo: 'Sentimos sua falta, {paciente}.', chave: 'c1:faltou:a1:2026-11-17' }), NOW)
    expect(r.body.enviado).toBe(true)
    expect(evo.sendText.mock.calls[0][2]).toBe('Sentimos sua falta, Maria.')
  })

  it('idempotente: a mesma chave duas vezes envia uma só', async () => {
    const a = await enviarAutomacao(clinic, input(), NOW)
    const b = await enviarAutomacao(clinic, input(), NOW)
    expect(a.body.enviado).toBe(true)
    expect(b).toMatchObject({ status: 200, body: { enviado: false, motivo: 'ja_enviado' } })
    expect(evo.sendText).toHaveBeenCalledTimes(1)
    expect(state.db.tables.automacao_envios).toHaveLength(1)
  })

  it('chamadas simultâneas com a mesma chave: só uma envia', async () => {
    const rs = await Promise.all([enviarAutomacao(clinic, input(), NOW), enviarAutomacao(clinic, input(), NOW), enviarAutomacao(clinic, input(), NOW)])
    expect(rs.filter(r => r.body.enviado === true)).toHaveLength(1)
    expect(evo.sendText).toHaveBeenCalledTimes(1)
  })

  it('chave já usada por OUTRA clínica: 409 sem revelar nada', async () => {
    load({ automacao_envios: [{ chave_idempotencia: input().chave, clinic_id: C2, funcao: 'confirmacao_dia', status: 'enviado', atualizado_em: NOW.toISOString() }] })
    const r = await enviarAutomacao(clinic, input(), NOW)
    expect(r.status).toBe(409)
    expect(JSON.stringify(r.body)).not.toContain(C2)
    expect(evo.sendText).not.toHaveBeenCalled()
  })

  it('confirmação já enviada pela rotina antiga para a mesma consulta e horário: não duplica', async () => {
    load({ appointment_confirmations: [{ clinic_id: C1, appointment_id: A1, kind: 'confirmacao', appointment_at: APPT_AT, status: 'enviado' }] })
    const r = await enviarAutomacao(clinic, input(), NOW)
    expect(r.body).toMatchObject({ enviado: false, motivo: 'confirmacao_ja_enviada' })
    expect(evo.sendText).not.toHaveBeenCalled()
    // não é falha de envio: fica como ignorado e não conta para a pausa do número
    expect(state.db.tables.automacao_envios[0]).toMatchObject({ status: 'ignorado', erro: 'confirmacao_ja_enviada' })
    expect((await enviarAutomacao(clinic, input(), NOW)).body).toMatchObject({ enviado: false, motivo: 'confirmacao_ja_enviada' })
  })

  it('sem_whatsapp: 422, fica registrado e a mesma chave não tenta de novo', async () => {
    evo.checkNumbers.mockResolvedValue([{ number: '5585999998888', exists: false, jid: null }])
    const a = await enviarAutomacao(clinic, input(), NOW)
    expect(a.status).toBe(422)
    expect(state.db.tables.appointment_confirmations).toHaveLength(0)
    expect(state.db.tables.automacao_envios[0]).toMatchObject({ status: 'falhou', erro: 'sem_whatsapp' })
    const b = await enviarAutomacao(clinic, input(), NOW)
    expect(b.body).toMatchObject({ enviado: false, motivo: 'falha_anterior' })
    expect(evo.sendText).not.toHaveBeenCalled()
  })

  it('telefone inválido no cadastro: 422', async () => {
    load({ appointments: [{ id: A1, clinic_id: C1, status: 'agendado', scheduled_at: APPT_AT, patients: { name: 'M', phone: '123' }, professionals: null }] })
    const r = await enviarAutomacao(clinic, input(), NOW)
    expect(r.status).toBe(422)
    expect(r.body.codigo).toBe('telefone_invalido')
    expect(evo.checkNumbers).not.toHaveBeenCalled()
  })

  it('falha passageira da Evolution: 502, libera a confirmação e a mesma chave reenvia depois', async () => {
    evo.sendText.mockRejectedValueOnce(new EvolutionError('x', 503))
    const a = await enviarAutomacao(clinic, input(), NOW)
    expect(a).toMatchObject({ status: 502, body: { tentarNovamente: true } })
    expect(state.db.tables.appointment_confirmations).toHaveLength(0)
    expect(state.db.tables.automacao_envios[0]).toMatchObject({ status: 'falhou', erro: 'tentar_novamente' })

    const b = await enviarAutomacao(clinic, input(), NOW)
    expect(b.body.enviado).toBe(true)
    expect(state.db.tables.automacao_envios).toHaveLength(1)
    expect(state.db.tables.automacao_envios[0].status).toBe('enviado')
    expect(state.db.tables.appointment_confirmations).toHaveLength(1)
  })

  it('erro definitivo da Evolution: registra só o código, nunca o texto', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    evo.sendText.mockRejectedValueOnce(new EvolutionError('Maria da Silva 85999998888', 400))
    const r = await enviarAutomacao(clinic, input(), NOW)
    expect(r.status).toBe(502)
    expect(state.db.tables.automacao_envios[0].erro).toBe('evolution_400')
    expect(JSON.stringify(r.body)).not.toContain('Maria')
  })

  it('Evolution não conhece a instância (404): marca a clínica desconectada e libera tudo', async () => {
    evo.checkNumbers.mockRejectedValueOnce(new EvolutionError('nao existe', 404))
    const r = await enviarAutomacao(clinic, input(), NOW)
    expect(r.status).toBe(409)
    expect(state.db.tables.clinic_whatsapp[0].status).toBe('desconectado')
    expect(state.db.tables.automacao_envios).toHaveLength(0)
    expect(state.db.tables.appointment_confirmations).toHaveLength(0)
  })

  it("'enviando' parado há mais de 10 minutos: fecha como interrompido e não reenvia", async () => {
    load({ automacao_envios: [{ chave_idempotencia: input().chave, clinic_id: C1, funcao: 'confirmacao_dia', status: 'enviando', atualizado_em: '2026-11-17T11:00:00Z' }] })
    const r = await enviarAutomacao(clinic, input(), NOW)
    expect(r.body).toMatchObject({ enviado: false, motivo: 'falha_anterior', erro: 'interrompido' })
    expect(evo.sendText).not.toHaveBeenCalled()
  })

  it("'enviando' recente: está em andamento, não reenvia", async () => {
    load({ automacao_envios: [{ chave_idempotencia: input().chave, clinic_id: C1, funcao: 'confirmacao_dia', status: 'enviando', atualizado_em: '2026-11-17T11:59:00Z' }] })
    expect((await enviarAutomacao(clinic, input(), NOW)).body.motivo).toBe('em_andamento')
  })
})

describe('enviarAutomacao: modo teste', () => {
  const teste = (over: Partial<EnvioInput> = {}) => input({ modoTeste: true, numeroTeste: '(85) 98888-7777', ...over })

  it('envia só para o número de teste, nunca para o paciente', async () => {
    const r = await enviarAutomacao(clinic, teste(), NOW)
    expect(r.body).toMatchObject({ enviado: true, modoTeste: true })
    expect(evo.checkNumbers.mock.calls[0][1]).toEqual(['5585988887777', '558588887777'])
    expect(evo.sendText.mock.calls[0][1]).toBe('5585988887777')
    expect(JSON.stringify(evo.sendText.mock.calls)).not.toContain('99999')
    // o texto ainda é montado com os dados do paciente da consulta
    expect(evo.sendText.mock.calls[0][2]).toContain('Maria')
  })

  it('não grava confirmação, não cria conversa na caixa de entrada', async () => {
    await enviarAutomacao(clinic, teste(), NOW)
    expect(state.db.tables.appointment_confirmations).toHaveLength(0)
    expect(recordOutgoing).not.toHaveBeenCalled()
    expect(state.db.tables.automacao_envios[0].status).toBe('enviado')
  })

  it('funciona em clínica ainda sem automacao_gerenciada (fase de testes)', async () => {
    load({ clinic_whatsapp: [{ clinic_id: C1, instance_name: 'mc_1', status: 'conectado', timezone: 'America/Fortaleza', automacao_gerenciada: false }] })
    expect((await enviarAutomacao(clinic, teste(), NOW)).body.enviado).toBe(true)
  })

  it('opt-out do paciente não impede o teste (o destino é o número de teste); opt-out do número de teste impede', async () => {
    load({ whatsapp_optout: [{ clinic_id: C1, phone_key: '8599998888' }] })
    expect((await enviarAutomacao(clinic, teste(), NOW)).body.enviado).toBe(true)
    load({ whatsapp_optout: [{ clinic_id: C1, phone_key: '8588887777' }] })
    expect((await enviarAutomacao(clinic, teste(), NOW)).body.motivo).toBe('opt_out')
  })
})


const P1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const sentRows = (n: number, over: Record<string, unknown> = {}) =>
  Array.from({ length: n }, (_, i) => ({ chave_idempotencia: `ok-${i}-xxxxxxx`, clinic_id: C1, funcao: 'lembrete_vespera', status: 'enviado', enviado_em: '2026-11-17T11:00:00Z', atualizado_em: '2026-11-17T11:00:00Z', ...over }))
const newNumber = [{ clinic_id: C1, direction: 'out', created_at: '2026-11-17T11:00:00Z' }]

describe('enviarAutomacao: portão depois da fila do ritmo', () => {
  it('reavalia a pausa DEPOIS de esperar na fila: falhas que aconteceram na espera seguram o envio', async () => {
    pace.mockImplementation(async () => {
      for (let i = 0; i < 3; i++) {
        state.db.tables.automacao_envios.push({ id: `f${i}`, chave_idempotencia: `f-${i}-xxxxxxx`, clinic_id: C1, funcao: 'lembrete_vespera', status: 'falhou', erro: 'evolution_400', atualizado_em: '2026-11-17T11:59:00Z' })
      }
    })
    const r = await enviarAutomacao(clinic, input(), NOW)
    expect(r.body).toMatchObject({ enviado: false, motivo: 'pausada', tentarNovamente: true })
    expect(evo.sendText).not.toHaveBeenCalled()
    expect(state.db.tables.automacao_envios.every(e => e.status === 'falhou')).toBe(true) // a reserva desta chamada foi liberada
  })

  it('reavalia o aquecimento depois da espera', async () => {
    load({ whatsapp_messages: newNumber, automacao_envios: sentRows(19) })
    pace.mockImplementation(async () => { state.db.tables.automacao_envios.push(...sentRows(1, { chave_idempotencia: 'depois-1-xxxxx' })) })
    const r = await enviarAutomacao(clinic, input({ modelo: 'lembrete_vespera', chave: 'nova-chave-1234' }), NOW)
    expect(r.body).toMatchObject({ enviado: false, motivo: 'aquecimento', tentarNovamente: true })
    expect(evo.sendText).not.toHaveBeenCalled()
  })

  it('fila do ritmo cheia: não envia, libera a reserva e pede para tentar depois', async () => {
    pace.mockResolvedValue(false)
    const r = await enviarAutomacao(clinic, input(), NOW)
    expect(r.body).toMatchObject({ enviado: false, motivo: 'ritmo', tentarNovamente: true })
    expect(evo.sendText).not.toHaveBeenCalled()
    expect(state.db.tables.automacao_envios).toHaveLength(0)
    expect(state.db.tables.appointment_confirmations).toHaveLength(0)
    // e a mesma chave funciona quando a fila esvaziar
    pace.mockResolvedValue(undefined)
    expect((await enviarAutomacao(clinic, input(), NOW)).body.enviado).toBe(true)
  })

  it('exceção no ritmo/portão: 502 com tentarNovamente e nada fica reservado', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    pace.mockRejectedValue(new Error('boom'))
    const r = await enviarAutomacao(clinic, input(), NOW)
    expect(r).toMatchObject({ status: 502, body: { tentarNovamente: true } })
    expect(state.db.tables.automacao_envios).toHaveLength(0)
  })

  it('erro ao reservar a confirmação: 502 com tentarNovamente, libera a chave e não envia', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    state.db = createFakeDb(seed(), { unique: UNIQUE, errors: { appointment_confirmations: { code: '57014', message: 'timeout' } } })
    const r = await enviarAutomacao(clinic, input(), NOW)
    expect(r).toMatchObject({ status: 502, body: { tentarNovamente: true } })
    expect(evo.sendText).not.toHaveBeenCalled()
    expect(state.db.tables.automacao_envios).toHaveLength(0)
  })
})

describe('enviarAutomacao: envios simultâneos e aquecimento', () => {
  it('envios em andamento (enviando) de outras chamadas ocupam a cota do dia', async () => {
    load({ whatsapp_messages: newNumber, automacao_envios: [...sentRows(19), { chave_idempotencia: 'voando-1-xxxxx', clinic_id: C1, funcao: 'lembrete_vespera', status: 'enviando', atualizado_em: '2026-11-17T11:59:00Z' }] })
    const r = await enviarAutomacao(clinic, input({ modelo: 'lembrete_vespera', chave: 'nova-chave-1234' }), NOW)
    expect(r.body).toMatchObject({ enviado: false, motivo: 'aquecimento' })
  })

  it('a própria reserva não conta contra a chamada: com 19 enviados o 20o passa', async () => {
    load({ whatsapp_messages: newNumber, automacao_envios: sentRows(19) })
    const r = await enviarAutomacao(clinic, input({ modelo: 'lembrete_vespera', chave: 'nova-chave-1234' }), NOW)
    expect(r.body.enviado).toBe(true)
  })

  it("'enviando' preso há mais de 10 minutos não conta", async () => {
    load({ whatsapp_messages: newNumber, automacao_envios: [...sentRows(19), { chave_idempotencia: 'preso-1-xxxxxx', clinic_id: C1, funcao: 'lembrete_vespera', status: 'enviando', atualizado_em: '2026-11-17T11:00:00Z' }] })
    expect((await enviarAutomacao(clinic, input({ modelo: 'lembrete_vespera', chave: 'nova-chave-1234' }), NOW)).body.enviado).toBe(true)
  })
})

describe('enviarAutomacao: modo teste não conta para a proteção do número', () => {
  const teste = (over: Partial<EnvioInput> = {}) => input({ modoTeste: true, numeroTeste: '(85) 98888-7777', ...over })

  it('grava a chave com prefixo teste: e a mesma chave em produção continua livre', async () => {
    await enviarAutomacao(clinic, teste(), NOW)
    expect(state.db.tables.automacao_envios[0].chave_idempotencia).toBe(`teste:${input().chave}`)
    const prod = await enviarAutomacao(clinic, input(), NOW)
    expect(prod.body.enviado).toBe(true)
  })

  it('envios de teste não entram no aquecimento', async () => {
    load({ whatsapp_messages: newNumber, automacao_envios: sentRows(20).map((r, i) => ({ ...r, chave_idempotencia: `teste:ok-${i}-xxxxxx` })) })
    expect((await enviarAutomacao(clinic, input({ modelo: 'lembrete_vespera', chave: 'nova-chave-1234' }), NOW)).body.enviado).toBe(true)
  })

  it('falhas de teste não pausam o número', async () => {
    load({ automacao_envios: [1, 2, 3].map(i => ({ chave_idempotencia: `teste:f-${i}-xxxxxx`, clinic_id: C1, funcao: 'lembrete_vespera', status: 'falhou', erro: 'evolution_400', atualizado_em: '2026-11-17T11:55:00Z' })) })
    expect((await enviarAutomacao(clinic, input(), NOW)).body.enviado).toBe(true)
  })

  it('um teste falho não deixa a chave de produção marcada como falha', async () => {
    evo.sendText.mockRejectedValueOnce(new EvolutionError('x', 400))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await enviarAutomacao(clinic, teste(), NOW)
    expect((await enviarAutomacao(clinic, input(), NOW)).body.enviado).toBe(true)
  })
})

describe('enviarAutomacao: opt-out pelo lid', () => {
  const conv = { id: 'cv1', clinic_id: C1, phone_key: '8599998888', lid: '555111' }
  it('PARAR registrado só pelo lid bloqueia o envio ao telefone do cadastro', async () => {
    load({ whatsapp_conversations: [conv], whatsapp_optout: [{ clinic_id: C1, phone_key: 'lid:555111' }] })
    const r = await enviarAutomacao(clinic, input(), NOW)
    expect(r.body).toMatchObject({ enviado: false, motivo: 'opt_out' })
    expect(evo.sendText).not.toHaveBeenCalled()
  })
  it('conversa de outra clínica não bloqueia', async () => {
    load({ whatsapp_conversations: [{ ...conv, clinic_id: C2 }], whatsapp_optout: [{ clinic_id: C2, phone_key: 'lid:555111' }] })
    expect((await enviarAutomacao(clinic, input(), NOW)).body.enviado).toBe(true)
  })
})

describe('enviarAutomacao: aniversario', () => {
  const pat = (over: Record<string, unknown> = {}) => ({ id: P1, clinic_id: C1, name: 'Maria da Silva', phone: '(85) 99999-8888', birth_date: '1990-11-17', is_active: true, ...over })
  const niver = (over: Partial<EnvioInput> = {}) => input({
    modelo: 'aniversario', appointmentId: null, pacienteId: P1, chave: 'c1:aniversario:p1:2026-11-17',
    textoModelo: 'Feliz aniversário, {paciente}! Um abraço da {clinica}.', ...over,
  })

  it('envia no dia do aniversário, sem appointment_confirmations e sem pedir resposta', async () => {
    load({ patients: [pat()] })
    const r = await enviarAutomacao(clinic, niver(), NOW)
    expect(r.body).toMatchObject({ enviado: true, modelo: 'aniversario' })
    expect(evo.sendText.mock.calls[0][2]).toBe('Feliz aniversário, Maria! Um abraço da Clínica Sol.')
    expect(state.db.tables.appointment_confirmations).toHaveLength(0)
    expect(state.db.tables.automacao_envios[0]).toMatchObject({ funcao: 'aniversario', paciente_id: P1, appointment_id: null, status: 'enviado' })
  })
  it('idempotente: a mesma chave envia uma vez só', async () => {
    load({ patients: [pat()] })
    await enviarAutomacao(clinic, niver(), NOW)
    expect((await enviarAutomacao(clinic, niver(), NOW)).body).toMatchObject({ enviado: false, motivo: 'ja_enviado' })
    expect(evo.sendText).toHaveBeenCalledTimes(1)
  })
  it('fora do dia do aniversário: não envia', async () => {
    load({ patients: [pat({ birth_date: '1990-11-18' })] })
    expect((await enviarAutomacao(clinic, niver(), NOW)).body).toMatchObject({ enviado: false, motivo: 'nao_e_aniversario' })
    expect(state.db.tables.automacao_envios).toHaveLength(0)
  })
  it('usa o dia no fuso da clínica (23:30 em Fortaleza ainda é o mesmo dia)', async () => {
    load({ patients: [pat()] })
    // 2026-11-18T02:30Z = 17/11 23:30 em Fortaleza
    expect((await enviarAutomacao(clinic, niver(), new Date('2026-11-18T02:30:00Z'))).body.enviado).toBe(true)
  })
  it('paciente inativo: não envia', async () => {
    load({ patients: [pat({ is_active: false })] })
    expect((await enviarAutomacao(clinic, niver(), NOW)).body).toMatchObject({ enviado: false, motivo: 'paciente_inativo' })
  })
  it('paciente de OUTRA clínica: 404', async () => {
    load({ patients: [pat({ clinic_id: C2 })] })
    expect((await enviarAutomacao(clinic, niver(), NOW)).status).toBe(404)
    expect(evo.sendText).not.toHaveBeenCalled()
  })
  it('opt-out, demo e portão valem também para aniversário', async () => {
    load({ patients: [pat()], whatsapp_optout: [{ clinic_id: C1, phone_key: '8599998888' }] })
    expect((await enviarAutomacao(clinic, niver(), NOW)).body.motivo).toBe('opt_out')
    load({ patients: [pat()], clinics: [{ id: C1, name: 'Demo', demo_mode: true, is_active: true }] })
    expect((await enviarAutomacao(clinic, niver(), NOW)).status).toBe(403)
    load({ patients: [pat()], whatsapp_messages: newNumber, automacao_envios: sentRows(20) })
    expect((await enviarAutomacao(clinic, niver(), NOW)).body.motivo).toBe('aquecimento')
    expect(evo.sendText).not.toHaveBeenCalled()
  })
  it('validateEnvioBody: aniversario exige pacienteId e ignora appointmentId', () => {
    const b = { clinicId: C1, modelo: 'aniversario', textoModelo: 'Oi', chave: 'chave-12345' }
    expect(validateEnvioBody(b).ok).toBe(false)
    expect(validateEnvioBody({ ...b, pacienteId: P1 })).toMatchObject({ ok: true, value: { pacienteId: P1, appointmentId: null } })
  })
})
