// whatsapp_optout: o mesmo contato pode aparecer pelo telefone (DDD+8) e pelo identificador interno (lid:<id>).
// A conversa (whatsapp_conversations) guarda os dois; o opt-out vale para ambos.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeDb } from './fakeDb'

const state = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof import('./fakeDb').createFakeDb> }))
vi.mock('@/lib/supabaseAdmin', () => ({ getAdminClient: () => state.db.client }))

import { isOptedOut, optedOutKeySet, registerOptOut, OptoutReadError, isMissingRelation } from './optout'

const C1 = '11111111-1111-4111-8111-111111111111'
const C2 = '22222222-2222-4222-8222-222222222222'
const UNIQUE = { whatsapp_optout: ['clinic_id', 'phone_key'] }
const conv = (over: Record<string, unknown> = {}) => ({ id: 'cv1', clinic_id: C1, phone_key: '8599998888', lid: '555111', ...over })
const load = (t: Record<string, Record<string, unknown>[]> = {}) => { state.db = createFakeDb({ whatsapp_optout: [], whatsapp_conversations: [], ...t }, { unique: UNIQUE }) }
const keys = () => state.db.tables.whatsapp_optout.map(r => `${r.clinic_id}:${r.phone_key}`).sort()

beforeEach(() => { vi.restoreAllMocks(); load() })

describe('registerOptOut', () => {
  it('PARAR vindo pelo lid: grava também o telefone da conversa', async () => {
    load({ whatsapp_conversations: [conv()] })
    expect(await registerOptOut(C1, 'lid:555111')).toBe(true)
    expect(keys()).toEqual([`${C1}:8599998888`, `${C1}:lid:555111`])
  })
  it('PARAR vindo pelo telefone: grava também o lid da conversa', async () => {
    load({ whatsapp_conversations: [conv()] })
    expect(await registerOptOut(C1, '8599998888')).toBe(true)
    expect(keys()).toEqual([`${C1}:8599998888`, `${C1}:lid:555111`])
  })
  it('sem conversa conhecida: grava só a chave recebida', async () => {
    expect(await registerOptOut(C1, '8599998888')).toBe(true)
    expect(keys()).toEqual([`${C1}:8599998888`])
  })
  it('de novo: false (já estava marcado), nada duplicado', async () => {
    load({ whatsapp_conversations: [conv()] })
    await registerOptOut(C1, 'lid:555111')
    expect(await registerOptOut(C1, '8599998888')).toBe(false)
    expect(keys()).toHaveLength(2)
  })
  it('conversa de outra clínica não vaza para esta', async () => {
    load({ whatsapp_conversations: [conv({ clinic_id: C2 })] })
    await registerOptOut(C1, 'lid:555111')
    expect(keys()).toEqual([`${C1}:lid:555111`])
  })
})

describe('isOptedOut / optedOutKeySet', () => {
  it('opt-out gravado só pelo lid vale para o telefone do cadastro do paciente', async () => {
    load({ whatsapp_conversations: [conv()], whatsapp_optout: [{ clinic_id: C1, phone_key: 'lid:555111' }] })
    expect(await isOptedOut(C1, ['8599998888'])).toBe(true)
    expect([...(await optedOutKeySet(C1, ['8599998888', '8511112222']))]).toEqual(['8599998888'])
  })
  it('opt-out gravado só pelo telefone vale para o lid', async () => {
    load({ whatsapp_conversations: [conv()], whatsapp_optout: [{ clinic_id: C1, phone_key: '8599998888' }] })
    expect(await isOptedOut(C1, ['lid:555111'])).toBe(true)
  })
  it('é por clínica', async () => {
    load({ whatsapp_conversations: [conv({ clinic_id: C2 })], whatsapp_optout: [{ clinic_id: C2, phone_key: '8599998888' }] })
    expect(await isOptedOut(C1, ['8599998888'])).toBe(false)
  })
  it('sem chaves: false sem consultar', async () => {
    expect(await isOptedOut(C1, ['', ''])).toBe(false)
    expect(state.db.log).toHaveLength(0)
  })
  it('erro de leitura: falha fechada com o código do erro', async () => {
    state.db = createFakeDb({}, { errors: { whatsapp_optout: { code: '42P01', message: 'x' } } })
    await expect(isOptedOut(C1, ['8599998888'])).rejects.toBeInstanceOf(OptoutReadError)
    await expect(isOptedOut(C1, ['8599998888'])).rejects.toMatchObject({ code: '42P01' })
  })
  it('isMissingRelation reconhece tabela ausente', () => {
    expect(isMissingRelation('42P01')).toBe(true)
    expect(isMissingRelation('PGRST205')).toBe(true)
    expect(isMissingRelation('XX000')).toBe(false)
  })
})
