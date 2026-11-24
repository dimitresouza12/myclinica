// Contexto da conversa para o n8n: consultas pendentes de confirmação (mesma busca de handleIncoming),
// horário de atendimento e escopo por clínica.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeDb } from './fakeDb'

const state = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof import('./fakeDb').createFakeDb> }))
vi.mock('@/lib/supabaseAdmin', () => ({ getAdminClient: () => state.db.client }))

import { contextoDaConversa, confirmacoesPendentes, camposPendentes, dentroDoHorario } from './conversa'

const C1 = '11111111-1111-4111-8111-111111111111'
const C2 = '22222222-2222-4222-8222-222222222222'
const V1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const NOW = new Date('2026-11-17T13:00:00Z') // 10:00 em Fortaleza
const KEY = '8599998888'
const conv = (over: Record<string, unknown> = {}) => ({ id: V1, clinic_id: C1, phone_key: KEY, jid: '5585999998888@s.whatsapp.net', lid: null, patient_id: 'p1', last_message_at: '2026-11-17T12:00:00Z', last_inbound_at: '2026-11-17T12:00:00Z', ...over })
const conf = (id: string, over: Record<string, unknown> = {}) => ({ id: `c-${id}`, clinic_id: C1, appointment_id: id, kind: 'confirmacao', status: 'enviado', phone_key: KEY, appointment_at: '2026-11-18T14:00:00Z', sent_at: '2026-11-17T09:00:00Z', ...over })
const load = (t: Record<string, Record<string, unknown>[]> = {}) => {
  state.db = createFakeDb({
    whatsapp_conversations: [conv()], whatsapp_messages: [], appointment_confirmations: [],
    clinic_whatsapp: [{ clinic_id: C1, timezone: 'America/Fortaleza' }], clinic_schedule_settings: [], ...t,
  })
}
beforeEach(() => load())

describe('confirmacoesPendentes / camposPendentes', () => {
  it('uma pendente: appointmentId preenchido', async () => {
    load({ appointment_confirmations: [conf('a1')] })
    const ids = await confirmacoesPendentes(C1, KEY, NOW)
    expect(ids).toEqual(['a1'])
    expect(camposPendentes(ids)).toEqual({ appointmentId: 'a1', appointmentIds: ['a1'] })
  })
  it('mais de uma: appointmentId nulo e a lista (mais recente primeiro, sem repetir a consulta)', async () => {
    load({ appointment_confirmations: [
      conf('a1', { sent_at: '2026-11-17T08:00:00Z' }),
      conf('a2', { sent_at: '2026-11-17T09:00:00Z' }),
      conf('a2', { id: 'c-a2b', appointment_at: '2026-11-19T14:00:00Z', sent_at: '2026-11-17T07:00:00Z' }),
    ] })
    const ids = await confirmacoesPendentes(C1, KEY, NOW)
    expect(ids).toEqual(['a2', 'a1'])
    expect(camposPendentes(ids)).toEqual({ appointmentId: null, appointmentIds: ['a2', 'a1'] })
  })
  it('nenhuma: nulo e lista vazia', () => { expect(camposPendentes([])).toEqual({ appointmentId: null, appointmentIds: [] }) })
  it.each([
    ['já respondida', { status: 'respondeu' }], ['consulta passada', { appointment_at: '2026-11-10T14:00:00Z' }],
    ['outra clínica', { clinic_id: C2 }], ['outro telefone', { phone_key: '8511112222' }], ['outro tipo', { kind: 'lembrete' }],
  ])('não conta: %s', async (_n, over) => {
    load({ appointment_confirmations: [conf('a1', over)] })
    expect(await confirmacoesPendentes(C1, KEY, NOW)).toEqual([])
  })
  it('chave lid:/raw:/vazia não casa com consulta', async () => {
    load({ appointment_confirmations: [conf('a1', { phone_key: 'lid:1' })] })
    expect(await confirmacoesPendentes(C1, 'lid:1', NOW)).toEqual([])
    expect(await confirmacoesPendentes(C1, 'raw:55', NOW)).toEqual([])
    expect(await confirmacoesPendentes(C1, '', NOW)).toEqual([])
  })
})

describe('dentroDoHorario', () => {
  it('padrão 07:00-19:30 no fuso da clínica', async () => {
    expect(await dentroDoHorario(C1, new Date('2026-11-17T13:00:00Z'))).toBe(true) // 10:00
    expect(await dentroDoHorario(C1, new Date('2026-11-18T01:00:00Z'))).toBe(false) // 22:00
    expect(await dentroDoHorario(C1, new Date('2026-11-17T09:00:00Z'))).toBe(false) // 06:00
  })
  it('usa o expediente configurado', async () => {
    load({ clinic_schedule_settings: [{ clinic_id: C1, opening_hours: { start: '08:00', end: '12:00' } }] })
    expect(await dentroDoHorario(C1, new Date('2026-11-17T13:00:00Z'))).toBe(true) // 10:00
    expect(await dentroDoHorario(C1, new Date('2026-11-17T16:00:00Z'))).toBe(false) // 13:00
  })
  it('erro de leitura sobe (não decide por palpite)', async () => {
    state.db = createFakeDb({}, { errors: { clinic_schedule_settings: { code: 'XX', message: 'x' } } })
    await expect(dentroDoHorario(C1, NOW)).rejects.toMatchObject({ status: 500 })
  })
})

describe('contextoDaConversa', () => {
  it('traz consulta pendente e horário', async () => {
    load({ appointment_confirmations: [conf('a1')] })
    expect(await contextoDaConversa(C1, V1, NOW)).toEqual({
      phoneKey: KEY, ehPaciente: true, ultimaSaidaHumanaEm: null, ultimaMensagemEm: '2026-11-17T12:00:00.000Z',
      temConsultaPendenteConfirmacao: true, appointmentId: 'a1', appointmentIds: ['a1'], dentroDoHorario: true,
    })
  })
  it('duas pendentes: appointmentId nulo, lista com as duas', async () => {
    load({ appointment_confirmations: [conf('a1'), conf('a2', { sent_at: '2026-11-17T10:00:00Z' })] })
    expect(await contextoDaConversa(C1, V1, NOW)).toMatchObject({ temConsultaPendenteConfirmacao: true, appointmentId: null, appointmentIds: ['a2', 'a1'] })
  })
  it('fora do expediente: dentroDoHorario false', async () => {
    expect((await contextoDaConversa(C1, V1, new Date('2026-11-18T01:00:00Z')))!.dentroDoHorario).toBe(false)
  })
  it('conversa de outra clínica: null', async () => {
    expect(await contextoDaConversa(C2, V1, NOW)).toBeNull()
  })
})
