// Rotas /api/automacao/*: autenticação, validação de clínica, escopo por clínica e conteúdo das respostas.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakeDb } from '@/lib/automacao/fakeDb'

const state = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof import('@/lib/automacao/fakeDb').createFakeDb> }))
const evo = vi.hoisted(() => ({ sendText: vi.fn(), checkNumbers: vi.fn(), fetchMediaBase64: vi.fn() }))
vi.mock('@/lib/supabaseAdmin', () => ({ getAdminClient: () => state.db.client }))
vi.mock('@/lib/whatsapp/evolution', async (orig) => ({ ...(await orig<typeof import('@/lib/whatsapp/evolution')>()), sendText: evo.sendText, checkNumbers: evo.checkNumbers, fetchMediaBase64: evo.fetchMediaBase64 }))
vi.mock('@/lib/whatsapp/conversations', () => ({ recordOutgoing: vi.fn() }))
vi.mock('@/lib/whatsapp/sendGate', async (orig) => ({ ...(await orig<typeof import('@/lib/whatsapp/sendGate')>()), paceClinic: vi.fn(async () => {}) }))

import { GET as consultas } from './consultas/route'
import { POST as enviar } from './enviar/route'
import { POST as marcar } from './marcar-confirmada/route'
import { POST as avisar } from './avisar-recepcao/route'
import { GET as aniversariantes } from './aniversariantes/route'
import { GET as conversaContexto } from './conversa-contexto/route'
import { POST as responder } from './responder/route'
import { GET as midia } from './midia/route'

const KEY = 'chave-de-teste-automacao'
const C1 = '11111111-1111-4111-8111-111111111111'
const C2 = '22222222-2222-4222-8222-222222222222'
const C3 = '33333333-3333-4333-8333-333333333333'
const A1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const A_OUTRA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CONV1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const CONV_OUTRA = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const A_FALTOU = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const FUTURE = new Date(Date.now() + 36 * 3_600_000).toISOString()

const UNIQUE = { automacao_envios: ['chave_idempotencia'], appointment_confirmations: ['appointment_id', 'kind', 'appointment_at'], whatsapp_optout: ['clinic_id', 'phone_key'], automacao_notificacoes: ['clinic_id', 'chave_dedupe'] }

function seed() {
  return {
    clinics: [
      { id: C1, name: 'Clínica Sol', demo_mode: false, is_active: true },
      { id: C2, name: 'Outra', demo_mode: false, is_active: true },
      { id: C3, name: 'Inativa', demo_mode: false, is_active: false },
    ],
    clinic_whatsapp: [{ clinic_id: C1, instance_name: 'mc_1', status: 'conectado', timezone: 'America/Fortaleza', automacao_gerenciada: true }],
    appointments: [
      { id: A1, clinic_id: C1, patient_id: 'p1', professional_id: 'pr1', status: 'agendado', scheduled_at: FUTURE, procedure_name: 'Limpeza', professionals: { name: 'Dra. Ana' }, patients: { name: 'Maria da Silva', phone: '(85) 99999-8888' } },
      { id: A_OUTRA, clinic_id: C2, patient_id: 'p9', professional_id: null, status: 'agendado', scheduled_at: FUTURE, procedure_name: 'Segredo', professionals: null, patients: { name: 'Joao Outro', phone: '85988880000' } },
      { id: A_FALTOU, clinic_id: C1, patient_id: 'p2', professional_id: null, status: 'faltou', scheduled_at: FUTURE, procedure_name: null, professionals: null, patients: { name: 'Pedro', phone: '85977776666' } },
      { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', clinic_id: C1, patient_id: null, professional_id: null, status: 'agendado', scheduled_at: FUTURE, procedure_name: 'Bloqueio', professionals: null, patients: null },
    ],
    appointment_confirmations: [{ id: 'cf1', clinic_id: C1, appointment_id: A1, kind: 'confirmacao', phone_key: '8599998888', appointment_at: FUTURE, status: 'enviado', sent_at: '2026-11-17T10:00:00Z', answered_at: null }],
    automacao_envios: [], automacao_notificacoes: [], whatsapp_optout: [], whatsapp_messages: [],
    whatsapp_conversations: [
      { id: CONV1, clinic_id: C1, phone_key: '8599998888', jid: '5585999998888@s.whatsapp.net', lid: null, patient_id: 'p1', last_message_at: '2026-11-17T12:00:00Z', last_inbound_at: '2026-11-17T12:00:00Z' },
      { id: CONV_OUTRA, clinic_id: C2, phone_key: '8588880000', jid: '5585988880000@s.whatsapp.net', lid: null, patient_id: null, last_message_at: '2026-11-17T12:00:00Z', last_inbound_at: null },
    ],
    patients: [
      { id: 'pa1', clinic_id: C1, name: 'Ana Nasceu', birth_date: '1990-11-18', is_active: true },
      { id: 'pa2', clinic_id: C1, name: 'Inativa', birth_date: '1985-11-18', is_active: false },
      { id: 'pa3', clinic_id: C1, name: 'Outro dia', birth_date: '1990-11-19', is_active: true },
      { id: 'pa4', clinic_id: C2, name: 'Outra clinica', birth_date: '1990-11-18', is_active: true },
      { id: 'pa5', clinic_id: C1, name: 'Sem data', birth_date: null, is_active: true },
      { id: 'pa6', clinic_id: C1, name: 'Bissexta', birth_date: '2000-02-29', is_active: true },
    ],
  }
}

const auth = { authorization: `Bearer ${KEY}` }
const get = (path: string, headers: Record<string, string> = auth) => new Request(`http://localhost/api/automacao/${path}`, { headers })
const post = (path: string, body: unknown, headers: Record<string, string> = auth) =>
  new Request(`http://localhost/api/automacao/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })

beforeEach(() => {
  vi.stubEnv('AUTOMACAO_N8N_KEY', KEY)
  state.db = createFakeDb(seed(), { unique: UNIQUE })
  evo.sendText.mockReset().mockResolvedValue({ messageId: 'wamid.1' })
  evo.checkNumbers.mockReset().mockImplementation(async (_i: string, nums: string[]) => [{ number: nums[0], exists: true, jid: `${nums[0]}@s.whatsapp.net` }])
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('autenticação (todas as rotas)', () => {
  const cases: [string, () => Promise<Response>][] = [
    ['consultas', (h?: never) => consultas(get(`consultas?clinicId=${C1}`, h ?? {}))],
    ['aniversariantes', () => aniversariantes(get(`aniversariantes?clinicId=${C1}&data=2026-11-18`, {}))],
    ['enviar', () => enviar(post('enviar', {}, {}))],
    ['marcar-confirmada', () => marcar(post('marcar-confirmada', {}, {}))],
    ['avisar-recepcao', () => avisar(post('avisar-recepcao', {}, {}))],
    ['conversa-contexto', () => conversaContexto(get(`conversa-contexto?clinicId=${C1}&conversationId=${CONV1}`, {}))],
    ['responder', () => responder(post('responder', {}, {}))],
    ['midia', () => midia(get(`midia?clinicId=${C1}&mensagemId=3EB0AUDIO1`, {}))],
  ]
  it.each(cases)('%s sem chave: 401', async (_n, call) => { expect((await call()).status).toBe(401) })

  it('sem AUTOMACAO_N8N_KEY: 503 em todas', async () => {
    vi.stubEnv('AUTOMACAO_N8N_KEY', '')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const [, call] of cases) expect((await call()).status).toBe(503)
  })
})

describe('validação de clínica (todas as rotas)', () => {
  const ruim = (id: string) => [
    consultas(get(`consultas?clinicId=${id}&de=2026-11-17T00:00:00-03:00&ate=2026-11-19T00:00:00-03:00`)),
    aniversariantes(get(`aniversariantes?clinicId=${id}&data=2026-11-18`)),
    enviar(post('enviar', { clinicId: id, appointmentId: A1, modelo: 'lembrete_vespera', textoModelo: 'x', chave: 'chave-12345' })),
    marcar(post('marcar-confirmada', { clinicId: id, appointmentId: A1 })),
    avisar(post('avisar-recepcao', { clinicId: id, appointmentId: A1, tipo: 'confirmou' })),
    conversaContexto(get(`conversa-contexto?clinicId=${id}&conversationId=${CONV1}`)),
    responder(post('responder', { clinicId: id, conversationId: CONV1, texto: 'Oi', chave: 'chave-12345' })),
    midia(get(`midia?clinicId=${id}&mensagemId=3EB0AUDIO1`)),
  ]
  it('clinicId que não é uuid: 404 (400 no enviar, que valida o corpo inteiro antes)', async () => {
    const rs = await Promise.all(ruim('nao-uuid'))
    expect(rs.map(r => r.status)).toEqual([404, 404, 400, 404, 404, 404, 400, 404])
  })
  it('clínica inexistente: 404', async () => {
    expect((await Promise.all(ruim('99999999-9999-4999-8999-999999999999'))).map(r => r.status)).toEqual([404, 404, 404, 404, 404, 404, 404, 404])
  })
  it('clínica inativa: 403', async () => {
    expect((await Promise.all(ruim(C3))).map(r => r.status)).toEqual([403, 403, 403, 403, 403, 403, 403, 403])
  })
})

describe('GET /consultas', () => {
  const url = (extra = '') => `consultas?clinicId=${C1}&de=${encodeURIComponent(new Date(Date.now() - 3_600_000).toISOString())}&ate=${encodeURIComponent(new Date(Date.now() + 72 * 3_600_000).toISOString())}${extra}`

  it('devolve só ids, horário, status, procedimento e profissional: sem nome nem telefone, sem outra clínica, sem bloqueio', async () => {
    const res = await consultas(get(url()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.consultas.map((c: { id: string }) => c.id)).toEqual([A1])
    expect(body.consultas[0]).toEqual({
      id: A1, horario: FUTURE, status: 'agendado', procedimento: 'Limpeza', profissionalId: 'pr1', profissional: 'Dra. Ana',
      confirmacao: { status: 'enviado', enviadaEm: '2026-11-17T10:00:00Z', respondidaEm: null },
    })
    const txt = JSON.stringify(body)
    for (const proibido of ['Maria', 'Silva', '99999', 'Joao', 'Segredo', 'Bloqueio', 'p1']) expect(txt).not.toContain(proibido)
  })

  it('filtro de status', async () => {
    const body = await (await consultas(get(url('&status=faltou')))).json()
    expect(body.consultas.map((c: { id: string }) => c.id)).toEqual([A_FALTOU])
  })

  it('janela e status inválidos: 400', async () => {
    expect((await consultas(get(`consultas?clinicId=${C1}`))).status).toBe(400)
    expect((await consultas(get(url('&status=inventado')))).status).toBe(400)
    expect((await consultas(get(`consultas?clinicId=${C1}&de=2026-01-01T00:00:00Z&ate=2026-06-01T00:00:00Z`))).status).toBe(400)
    expect((await consultas(get(`consultas?clinicId=${C1}&de=2026-02-01T00:00:00Z&ate=2026-01-01T00:00:00Z`))).status).toBe(400)
  })

  it('a consulta é buscada com o filtro de clínica', async () => {
    await consultas(get(url()))
    const q = state.db.log.find(l => l.table === 'appointments')!
    expect(q.filters).toContain('eq clinic_id')
  })
})

describe('GET /aniversariantes', () => {
  it('ids de pacientes ATIVOS da clínica que fazem aniversário na data, sem nome', async () => {
    const res = await aniversariantes(get(`aniversariantes?clinicId=${C1}&data=2026-11-18`))
    const body = await res.json()
    expect(body).toEqual({ data: '2026-11-18', total: 1, pacientes: [{ id: 'pa1' }] })
    expect(JSON.stringify(body)).not.toContain('Ana')
  })

  it('29/02 comemora em 28/02 nos anos não bissextos e em 29/02 nos bissextos', async () => {
    expect((await (await aniversariantes(get(`aniversariantes?clinicId=${C1}&data=2027-02-28`))).json()).pacientes).toEqual([{ id: 'pa6' }])
    expect((await (await aniversariantes(get(`aniversariantes?clinicId=${C1}&data=2028-02-28`))).json()).pacientes).toEqual([])
    expect((await (await aniversariantes(get(`aniversariantes?clinicId=${C1}&data=2028-02-29`))).json()).pacientes).toEqual([{ id: 'pa6' }])
  })

  it('data inválida: 400', async () => {
    for (const d of ['', '18/11/2026', '2026-13-01', '2026-02-30']) {
      expect((await aniversariantes(get(`aniversariantes?clinicId=${C1}&data=${d}`))).status).toBe(400)
    }
  })
})

describe('POST /marcar-confirmada', () => {
  it("'agendado' vira 'confirmado' e a confirmação pendente vira 'confirmado'", async () => {
    const res = await marcar(post('marcar-confirmada', { clinicId: C1, appointmentId: A1 }))
    expect(await res.json()).toMatchObject({ ok: true, alterada: true, status: 'confirmado' })
    expect(state.db.tables.appointments.find(a => a.id === A1)!.status).toBe('confirmado')
    expect(state.db.tables.appointment_confirmations[0]).toMatchObject({ status: 'confirmado' })
    expect(state.db.tables.appointment_confirmations[0].answered_at).toBeTruthy()
  })

  it('segunda chamada: nada muda (idempotente)', async () => {
    await marcar(post('marcar-confirmada', { clinicId: C1, appointmentId: A1 }))
    const res = await marcar(post('marcar-confirmada', { clinicId: C1, appointmentId: A1 }))
    expect(await res.json()).toMatchObject({ ok: true, alterada: false, status: 'confirmado' })
  })

  it.each(['cancelado', 'concluido', 'faltou', 'arrived'])('consulta %s nunca é alterada', async status => {
    state.db.tables.appointments.find(a => a.id === A1)!.status = status
    const res = await marcar(post('marcar-confirmada', { clinicId: C1, appointmentId: A1 }))
    expect(await res.json()).toMatchObject({ ok: true, alterada: false, motivo: 'status_nao_permite' })
    expect(state.db.tables.appointments.find(a => a.id === A1)!.status).toBe(status)
    expect(state.db.tables.appointment_confirmations[0].status).toBe('enviado')
  })

  it('consulta de outra clínica: 404 e nada muda', async () => {
    const res = await marcar(post('marcar-confirmada', { clinicId: C1, appointmentId: A_OUTRA }))
    expect(res.status).toBe(404)
    expect(state.db.tables.appointments.find(a => a.id === A_OUTRA)!.status).toBe('agendado')
  })

  it('appointmentId inválido e corpo inválido: 400', async () => {
    expect((await marcar(post('marcar-confirmada', { clinicId: C1, appointmentId: 'x' }))).status).toBe(400)
    expect((await marcar(post('marcar-confirmada', '{nope'))).status).toBe(400)
  })
})

describe('POST /avisar-recepcao', () => {
  it('grava o aviso na clínica, com texto montado aqui e link para a consulta', async () => {
    const res = await avisar(post('avisar-recepcao', { clinicId: C1, appointmentId: A1, tipo: 'pediu_remarcar' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, duplicada: false })
    const row = state.db.tables.automacao_notificacoes[0]
    expect(row).toMatchObject({ clinic_id: C1, tipo: 'pediu_remarcar', appointment_id: A1, link: `/agenda?consulta=${A1}` })
    expect(row.titulo).toBe('Paciente pediu para remarcar')
    expect(String(row.corpo)).toContain('Maria pediu para remarcar a consulta de')
    expect(String(row.corpo)).not.toContain('99999') // sem telefone
    expect(/\p{Extended_Pictographic}/u.test(String(row.titulo) + String(row.corpo))).toBe(false)
    expect(row.lida_em ?? null).toBeNull()
  })

  it.each(['confirmou', 'pediu_remarcar', 'nao_entendi', 'sem_resposta'])('aceita o tipo %s', async tipo => {
    expect((await avisar(post('avisar-recepcao', { clinicId: C1, appointmentId: A1, tipo }))).status).toBe(200)
  })

  it('tipo fora da lista: 400', async () => {
    expect((await avisar(post('avisar-recepcao', { clinicId: C1, appointmentId: A1, tipo: 'cancelou' }))).status).toBe(400)
    expect((await avisar(post('avisar-recepcao', { clinicId: C1, appointmentId: A1 }))).status).toBe(400)
    expect(state.db.tables.automacao_notificacoes).toHaveLength(0)
  })

  it('o mesmo aviso repetido pelo n8n não vira dois', async () => {
    await avisar(post('avisar-recepcao', { clinicId: C1, appointmentId: A1, tipo: 'sem_resposta' }))
    const again = await (await avisar(post('avisar-recepcao', { clinicId: C1, appointmentId: A1, tipo: 'sem_resposta' }))).json()
    expect(again).toMatchObject({ ok: true, duplicada: true })
    expect(state.db.tables.automacao_notificacoes).toHaveLength(1)
    // tipo diferente para a mesma consulta é outro aviso
    await avisar(post('avisar-recepcao', { clinicId: C1, appointmentId: A1, tipo: 'nao_entendi' }))
    expect(state.db.tables.automacao_notificacoes).toHaveLength(2)
  })

  it('chamadas SIMULTÂNEAS do mesmo aviso gravam uma linha só (dedupe atômico pela chave única)', async () => {
    const rs = await Promise.all([1, 2, 3].map(() => avisar(post('avisar-recepcao', { clinicId: C1, appointmentId: A1, tipo: 'confirmou' }))))
    const bodies = await Promise.all(rs.map(r => r.json()))
    expect(bodies.filter(b => b.duplicada === false)).toHaveLength(1)
    expect(state.db.tables.automacao_notificacoes).toHaveLength(1)
    expect(state.db.tables.automacao_notificacoes[0].chave_dedupe).toMatch(new RegExp(`^confirmou:${A1}:\\d+$`))
  })

  it('consulta de outra clínica: 404 e nenhum aviso gravado', async () => {
    const res = await avisar(post('avisar-recepcao', { clinicId: C1, appointmentId: A_OUTRA, tipo: 'confirmou' }))
    expect(res.status).toBe(404)
    expect(state.db.tables.automacao_notificacoes).toHaveLength(0)
  })
})

describe('POST /enviar', () => {
  beforeEach(() => { state.db.tables.appointment_confirmations.length = 0 }) // sem confirmação anterior da rotina antiga
  const corpo = (over: Record<string, unknown> = {}) => ({
    clinicId: C1, appointmentId: A1, modelo: 'confirmacao_dia', textoModelo: 'Olá, {paciente}! {clinica}, {data} às {hora}.', chave: 'c1:confirmacao_dia:a1:2026-11-18', ...over,
  })

  it('envia e responde sem nenhum dado do paciente', async () => {
    const res = await enviar(post('enviar', corpo()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, enviado: true, modelo: 'confirmacao_dia', modoTeste: false })
    expect(evo.sendText).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(body)).not.toContain('Maria')
  })

  it('idempotente pela chave', async () => {
    await enviar(post('enviar', corpo()))
    const again = await (await enviar(post('enviar', corpo()))).json()
    expect(again).toMatchObject({ enviado: false, motivo: 'ja_enviado' })
    expect(evo.sendText).toHaveBeenCalledTimes(1)
  })

  it('modo teste só para o número de teste', async () => {
    const res = await enviar(post('enviar', corpo({ modoTeste: true, numeroTeste: '85988887777' })))
    expect((await res.json()).modoTeste).toBe(true)
    expect(evo.sendText.mock.calls[0][1]).toBe('5585988887777')
  })

  it('consulta de outra clínica: 404 e nada sai', async () => {
    const res = await enviar(post('enviar', corpo({ appointmentId: A_OUTRA })))
    expect(res.status).toBe(404)
    expect(evo.sendText).not.toHaveBeenCalled()
  })

  it('corpo inválido: 400 e nada sai', async () => {
    expect((await enviar(post('enviar', corpo({ modelo: 'aniversario' })))).status).toBe(400)
    expect((await enviar(post('enviar', corpo({ modoTeste: true })))).status).toBe(400)
    expect(evo.sendText).not.toHaveBeenCalled()
  })

  it('exceção inesperada no envio vira 502 genérico, sem vazar detalhe', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    evo.checkNumbers.mockRejectedValueOnce(new TypeError('Maria da Silva 85999998888'))
    const res = await enviar(post('enviar', corpo()))
    expect(res.status).toBe(502)
    expect(JSON.stringify(await res.json())).not.toContain('Maria')
    expect(state.db.tables.automacao_envios[0]).toMatchObject({ status: 'falhou', erro: 'erro_envio' })
  })
})


describe('GET /conversa-contexto', () => {
  const ctx = (id = CONV1, cid = C1) => conversaContexto(get(`conversa-contexto?clinicId=${cid}&conversationId=${id}`))

  it('devolve só os campos combinados (ids, sem nome nem telefone)', async () => {
    state.db.tables.whatsapp_messages.push(
      { id: 'm1', clinic_id: C1, conversation_id: CONV1, direction: 'out', origin: 'sistema', created_at: '2026-11-17T11:00:00Z' },
      { id: 'm2', clinic_id: C1, conversation_id: CONV1, direction: 'out', origin: 'automatico', created_at: '2026-11-17T11:30:00Z' },
      { id: 'm3', clinic_id: C1, conversation_id: CONV1, direction: 'in', origin: 'contato', created_at: '2026-11-17T12:00:00Z' },
    )
    const res = await ctx()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(typeof body.dentroDoHorario).toBe('boolean') // o valor depende do relógio: coberto em conversa.test.ts
    expect(body).toEqual({
      phoneKey: '8599998888', ehPaciente: true, ultimaSaidaHumanaEm: '2026-11-17T11:00:00.000Z',
      ultimaMensagemEm: '2026-11-17T12:00:00.000Z', temConsultaPendenteConfirmacao: true, // A1 tem confirmação 'enviado' futura no seed
      appointmentId: A1, appointmentIds: [A1], dentroDoHorario: body.dentroDoHorario,
    })
    expect(JSON.stringify(body)).not.toContain('Maria')
  })

  it('sem saída humana: null; sem confirmação pendente: false; não paciente: ehPaciente false', async () => {
    state.db.tables.appointment_confirmations.length = 0
    state.db.tables.whatsapp_conversations[0].patient_id = null
    expect(await (await ctx()).json()).toMatchObject({ ehPaciente: false, ultimaSaidaHumanaEm: null, temConsultaPendenteConfirmacao: false, appointmentId: null, appointmentIds: [] })
  })

  it('confirmação de outra clínica no mesmo telefone não conta', async () => {
    state.db.tables.appointment_confirmations.length = 0
    state.db.tables.appointment_confirmations.push({ id: 'x', clinic_id: C2, appointment_id: A_OUTRA, kind: 'confirmacao', phone_key: '8599998888', status: 'enviado', appointment_at: FUTURE })
    expect((await (await ctx()).json()).temConsultaPendenteConfirmacao).toBe(false)
  })

  it('conversa de OUTRA clínica: 404', async () => {
    expect((await ctx(CONV_OUTRA, C1)).status).toBe(404)
    expect((await ctx(CONV1, C2)).status).toBe(404)
  })

  it('conversationId inválido: 400', async () => {
    expect((await ctx('abc')).status).toBe(400)
  })
})

describe('POST /responder', () => {
  const corpo = (over: Record<string, unknown> = {}) => ({ clinicId: C1, conversationId: CONV1, texto: 'Claro, às 14h.', chave: 'resp:c1:msg-0001', ...over })

  it('envia numa conversa da clínica', async () => {
    const res = await responder(post('responder', corpo()))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, enviado: true })
    expect(evo.sendText).toHaveBeenCalledWith('mc_1', '5585999998888', 'Claro, às 14h.')
  })
  it('texto com mais de 1000 caracteres: 400', async () => {
    expect((await responder(post('responder', corpo({ texto: 'a'.repeat(1001) })))).status).toBe(400)
    expect(evo.sendText).not.toHaveBeenCalled()
  })
  it('conversa de outra clínica: 404 e nada sai', async () => {
    expect((await responder(post('responder', corpo({ conversationId: CONV_OUTRA })))).status).toBe(404)
    expect(evo.sendText).not.toHaveBeenCalled()
  })
})


describe('GET /midia', () => {
  const PID = '3EB0AUDIO1'
  const call = (q = `clinicId=${C1}&mensagemId=${PID}`) => midia(get(`midia?${q}`))
  beforeEach(() => {
    state.db.tables.whatsapp_messages.push({ id: 'mm1', clinic_id: C1, conversation_id: CONV1, provider_message_id: PID, direction: 'in', kind: 'audio', deleted_at: null, media_size: 4000, media_mime: 'audio/ogg' })
    state.db.tables.whatsapp_media_source = [{ message_id: 'mm1', raw: { key: { id: PID }, message: {} } }]
    evo.fetchMediaBase64.mockReset().mockResolvedValue({ base64: Buffer.from('audio-falso').toString('base64'), mimetype: 'audio/ogg; codecs=opus', fileName: null })
  })

  it('devolve o áudio em base64 com o mimetype, sem cache', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ mensagemId: PID, mimetype: 'audio/ogg', tamanhoBytes: 11, base64: Buffer.from('audio-falso').toString('base64') })
  })
  it('mensagemId ausente ou inválido: 400', async () => {
    expect((await call(`clinicId=${C1}`)).status).toBe(400)
    expect((await call(`clinicId=${C1}&mensagemId=a%20b`)).status).toBe(400)
  })
  it('mensagem de outra clínica: 404 com código, sem baixar', async () => {
    const res = await call(`clinicId=${C2}&mensagemId=${PID}`)
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ codigo: 'nao_encontrada' })
    expect(evo.fetchMediaBase64).not.toHaveBeenCalled()
  })
  it('mensagem que não é áudio: 422', async () => {
    state.db.tables.whatsapp_messages.find(m => m.id === 'mm1')!.kind = 'image'
    expect((await call()).status).toBe(422)
  })
})
