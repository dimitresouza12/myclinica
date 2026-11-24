// Portão do número (extraído de run.ts) e ritmo entre envios.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeDb } from '@/lib/automacao/fakeDb'

const state = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof import('@/lib/automacao/fakeDb').createFakeDb> }))
vi.mock('@/lib/supabaseAdmin', () => ({ getAdminClient: () => state.db.client }))

import { sendingGate, paceClinic, resetPaceForTests, TEST_KEY_PREFIX } from './sendGate'

const C1 = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-11-17T12:00:00Z')
const wa = { clinic_id: C1 }
const s = { timezone: 'America/Fortaleza' }
const failed = (i: number, error = 'timeout') => ({ clinic_id: C1, appointment_id: `x${i}`, kind: 'confirmacao', appointment_at: `2026-11-2${i}T10:00:00Z`, status: 'falhou', error, updated_at: '2026-11-17T11:50:00Z' })

beforeEach(() => { resetPaceForTests(); state.db = createFakeDb({ appointment_confirmations: [], whatsapp_messages: [], automacao_envios: [] }) })

describe('sendingGate (comportamento da rotina antiga)', () => {
  it('número antigo e sem falhas: livre', async () => {
    state.db = createFakeDb({
      whatsapp_messages: Array.from({ length: 3 }, (_, i) => ({ clinic_id: C1, direction: 'out', created_at: new Date(NOW.getTime() - (i + 1) * 86_400_000 * 2).toISOString() })),
      appointment_confirmations: [],
    })
    // 6 dias de atividade contínua > 4 dias de aquecimento
    state.db.tables.whatsapp_messages.push({ clinic_id: C1, direction: 'out', created_at: new Date(NOW.getTime() - 7 * 86_400_000).toISOString() })
    const g = await sendingGate(wa, s, NOW)
    expect(g).toMatchObject({ paused: false, allowance: Infinity })
  })

  it('3 falhas que contam em 30 min: pausada', async () => {
    state.db.tables.appointment_confirmations.push(failed(1), failed(2), failed(3))
    expect((await sendingGate(wa, s, NOW)).paused).toBe(true)
  })

  it('falhas do paciente (telefone inválido) não pausam', async () => {
    state.db.tables.appointment_confirmations.push(failed(1, 'telefone_invalido'), failed(2, 'sem_whatsapp'), failed(3, 'telefone_invalido'))
    expect((await sendingGate(wa, s, NOW)).paused).toBe(false)
  })

  it('número novo: aquecimento limita o dia (20) e desconta o que já saiu hoje', async () => {
    state.db.tables.whatsapp_messages.push({ clinic_id: C1, direction: 'out', created_at: '2026-11-17T11:00:00Z' })
    for (let i = 0; i < 5; i++) state.db.tables.appointment_confirmations.push({ clinic_id: C1, appointment_id: `y${i}`, kind: 'confirmacao', appointment_at: `2026-11-2${i}T10:00:00Z`, status: 'enviado', sent_at: '2026-11-17T11:30:00Z', updated_at: '2026-11-17T11:30:00Z' })
    expect(await sendingGate(wa, s, NOW)).toMatchObject({ paused: false, limit: 20, sentToday: 5, allowance: 15 })
  })

  it('sem a opção includeAutomacao, automacao_envios nem é consultada (rotina antiga idêntica)', async () => {
    await sendingGate(wa, s, NOW)
    expect(state.db.log.some(l => l.table === 'automacao_envios')).toBe(false)
  })
})

describe('sendingGate com includeAutomacao', () => {
  it('falhas e envios da automação entram na pausa e no aquecimento', async () => {
    state.db.tables.whatsapp_messages.push({ clinic_id: C1, direction: 'out', created_at: '2026-11-17T11:00:00Z' })
    state.db.tables.automacao_envios.push(
      ...Array.from({ length: 4 }, (_, i) => ({ chave_idempotencia: `ok-${i}`, clinic_id: C1, funcao: 'lembrete_vespera', status: 'enviado', enviado_em: '2026-11-17T11:30:00Z' })),
      // confirmação do dia já é contada por appointment_confirmations: não conta duas vezes
      { chave_idempotencia: 'ok-c', clinic_id: C1, funcao: 'confirmacao_dia', status: 'enviado', enviado_em: '2026-11-17T11:30:00Z' },
    )
    expect(await sendingGate(wa, s, NOW, { includeAutomacao: true })).toMatchObject({ sentToday: 4, allowance: 16 })
    state.db.tables.automacao_envios.push(...[1, 2, 3].map(i => ({ chave_idempotencia: `f-${i}`, clinic_id: C1, funcao: 'confirmacao_dia', status: 'falhou', erro: 'evolution_400', atualizado_em: '2026-11-17T11:55:00Z' })))
    expect((await sendingGate(wa, s, NOW, { includeAutomacao: true })).paused).toBe(true)
  })

  it('só olha a própria clínica', async () => {
    state.db.tables.automacao_envios.push(...[1, 2, 3].map(i => ({ chave_idempotencia: `f-${i}`, clinic_id: 'outra', funcao: 'lembrete_vespera', status: 'falhou', erro: 'x', atualizado_em: '2026-11-17T11:55:00Z' })))
    expect((await sendingGate(wa, s, NOW, { includeAutomacao: true })).paused).toBe(false)
  })
})

describe('sendingGate: envios em andamento e modo teste', () => {
  const novo = () => state.db.tables.whatsapp_messages.push({ clinic_id: C1, direction: 'out', created_at: '2026-11-17T11:00:00Z' })
  const envio = (over: Record<string, unknown>) => ({ id: 'e0', chave_idempotencia: 'k-0', clinic_id: C1, funcao: 'lembrete_vespera', status: 'enviando', atualizado_em: '2026-11-17T11:59:00Z', ...over })

  it("conta 'enviando' recente (inclusive confirmação do dia), mas não o preso há mais de 10 min", async () => {
    novo()
    state.db.tables.automacao_envios.push(
      envio({ id: 'a', chave_idempotencia: 'k-a' }),
      envio({ id: 'b', chave_idempotencia: 'k-b', funcao: 'confirmacao_dia' }),
      envio({ id: 'c', chave_idempotencia: 'k-c', atualizado_em: '2026-11-17T11:00:00Z' }),
    )
    expect(await sendingGate(wa, s, NOW, { includeAutomacao: true })).toMatchObject({ sentToday: 2, allowance: 18 })
  })

  it('excludeEnvioId tira a reserva da própria chamada da conta', async () => {
    novo()
    state.db.tables.automacao_envios.push(envio({ id: 'a', chave_idempotencia: 'k-a' }), envio({ id: 'b', chave_idempotencia: 'k-b' }))
    expect(await sendingGate(wa, s, NOW, { includeAutomacao: true, excludeEnvioId: 'a' })).toMatchObject({ sentToday: 1 })
  })

  it('chaves teste: não contam no aquecimento (enviados, em andamento) nem na pausa', async () => {
    novo()
    state.db.tables.automacao_envios.push(
      envio({ id: 'a', chave_idempotencia: `${TEST_KEY_PREFIX}k-a` }),
      envio({ id: 'b', chave_idempotencia: `${TEST_KEY_PREFIX}k-b`, status: 'enviado', enviado_em: '2026-11-17T11:30:00Z' }),
      ...[1, 2, 3].map(i => envio({ id: `f${i}`, chave_idempotencia: `${TEST_KEY_PREFIX}f-${i}`, status: 'falhou', erro: 'evolution_400' })),
    )
    expect(await sendingGate(wa, s, NOW, { includeAutomacao: true })).toMatchObject({ paused: false, sentToday: 0, allowance: 20 })
  })

  it('sem includeAutomacao o em andamento não é consultado', async () => {
    novo()
    state.db.tables.automacao_envios.push(envio({ id: 'a' }))
    expect(await sendingGate(wa, s, NOW)).toMatchObject({ sentToday: 0 })
  })
})

describe('paceClinic: fila máxima', () => {
  it('acima de maxQueue devolve false sem esperar nem entrar na fila', async () => {
    let t = 1_000_000
    const slept: number[] = []
    const deps = { gapMs: 1000, maxQueue: 2, now: () => t, sleep: async (ms: number) => { slept.push(ms); t += ms } }
    const rs = await Promise.all([1, 2, 3, 4].map(() => paceClinic(C1, deps)))
    expect(rs).toEqual([true, true, false, false])
    expect(slept).toEqual([1000])
  })

  it('a fila esvazia e volta a aceitar', async () => {
    const deps = { gapMs: 0, maxQueue: 1, now: () => 1_000_000, sleep: async () => {} }
    expect(await paceClinic(C1, deps)).toBe(true)
    expect(await paceClinic(C1, deps)).toBe(true)
  })

  it('sem maxQueue nunca recusa (rotina antiga)', async () => {
    const deps = { gapMs: 0, now: () => 1_000_000, sleep: async () => {} }
    const rs = await Promise.all(Array.from({ length: 10 }, () => paceClinic(C1, deps)))
    expect(rs.every(r => r === true)).toBe(true)
  })
})

describe('paceClinic', () => {
  it('primeiro envio não espera; o seguinte espera o intervalo', async () => {
    let t = 1_000_000
    const slept: number[] = []
    const deps = { gapMs: 8000, now: () => t, sleep: async (ms: number) => { slept.push(ms); t += ms } }
    await paceClinic(C1, deps)
    t += 3000
    await paceClinic(C1, deps)
    expect(slept).toEqual([5000])
    t += 20_000
    await paceClinic(C1, deps)
    expect(slept).toEqual([5000]) // já passou o intervalo
  })

  it('chamadas simultâneas da mesma clínica entram em fila, uma por vez, cada uma com seu intervalo', async () => {
    let t = 1_000_000
    const order: string[] = []
    const deps = { gapMs: 1000, now: () => t, sleep: async (ms: number) => { order.push(`sleep${ms}`); t += ms } }
    await Promise.all([1, 2, 3].map(async i => { await paceClinic(C1, deps); order.push(`go${i}`) }))
    expect(order).toEqual(['go1', 'sleep1000', 'go2', 'sleep1000', 'go3'])
  })

  it('clínicas diferentes não esperam umas pelas outras', async () => {
    const t = 1_000_000
    const slept: number[] = []
    const deps = { gapMs: 1000, now: () => t, sleep: async (ms: number) => { slept.push(ms) } }
    await paceClinic('a', deps)
    await paceClinic('b', deps)
    expect(slept).toEqual([])
  })
})
