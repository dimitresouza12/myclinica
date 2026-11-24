// run-confirmations (rotina antiga, clínica NÃO gerenciada): contato em whatsapp_optout não recebe confirmação.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeDb } from '@/lib/automacao/fakeDb'

const state = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof import('@/lib/automacao/fakeDb').createFakeDb> }))
const evo = vi.hoisted(() => ({ sendText: vi.fn(), checkNumbers: vi.fn() }))
vi.mock('@/lib/supabaseAdmin', () => ({ getAdminClient: () => state.db.client }))
vi.mock('./evolution', async (orig) => ({ ...(await orig<typeof import('./evolution')>()), sendText: evo.sendText, checkNumbers: evo.checkNumbers }))
vi.mock('./conversations', () => ({ recordOutgoing: vi.fn() }))
vi.mock('./safety', async (orig) => ({ ...(await orig<typeof import('./safety')>()), sendGapMs: () => 0 }))

import { runConfirmations } from './run'

const C1 = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-11-17T13:00:00Z') // 10:00 em Fortaleza
const APPT_AT = '2026-11-17T15:00:00Z'
const UNIQUE = { appointment_confirmations: ['appointment_id', 'kind', 'appointment_at'], whatsapp_optout: ['clinic_id', 'phone_key'] }

const appt = (id: string, phone: string) => ({
  id, clinic_id: C1, patient_id: `p-${id}`, status: 'agendado', scheduled_at: APPT_AT, created_at: '2026-11-10T10:00:00Z',
  patients: { name: 'Paciente', phone }, professionals: { name: 'Dra. Ana' },
})

function load(over: Record<string, Record<string, unknown>[]> = {}, wa: Record<string, unknown> = {}) {
  state.db = createFakeDb({
    clinics: [{ id: C1, name: 'Clínica', demo_mode: false }],
    clinic_whatsapp: [{
      clinic_id: C1, instance_name: 'mc_1', status: 'conectado', confirm_enabled: true, confirm_mode: 'no_dia', vespera_send_time: '18:00:00',
      no_dia_hours_before: 3, send_window_start: '08:00:00', send_window_end: '20:00:00', late_booking_policy: 'enviar_agora',
      timezone: 'America/Fortaleza', message_template: 'Olá, {paciente}!', ...wa,
    }],
    appointments: [appt('a1', '(85) 99999-8888'), appt('a2', '(85) 98888-7777')],
    appointment_confirmations: [], whatsapp_optout: [], whatsapp_conversations: [], whatsapp_messages: [],
    ...over,
  }, { unique: UNIQUE })
}

beforeEach(() => {
  vi.restoreAllMocks()
  evo.sendText.mockReset().mockResolvedValue({ messageId: 'wamid.1' })
  evo.checkNumbers.mockReset().mockImplementation(async (_i: string, nums: string[]) => [{ number: nums[0], exists: true, jid: `${nums[0]}@s.whatsapp.net` }])
})

describe('runConfirmations e whatsapp_optout (clínica antiga, sem automacao_gerenciada)', () => {
  it('sem opt-out: confirma os dois pacientes (controle)', async () => {
    load()
    const r = await runConfirmations({ now: NOW })
    expect(r.clinics[0].sent).toBe(2)
    expect(evo.sendText).toHaveBeenCalledTimes(2)
  })

  it('paciente em opt-out não recebe e não ganha linha de confirmação; o outro recebe', async () => {
    load({ whatsapp_optout: [{ clinic_id: C1, phone_key: '8599998888' }] })
    const r = await runConfirmations({ now: NOW })
    expect(r.clinics[0].sent).toBe(1)
    expect(r.clinics[0].skipped.opt_out).toBe(1)
    expect(evo.sendText).toHaveBeenCalledTimes(1)
    expect(evo.checkNumbers.mock.calls[0][1]).toContain('5585988887777')
    expect(state.db.tables.appointment_confirmations.map(c => c.appointment_id)).toEqual(['a2'])
  })

  it('opt-out gravado só pelo lid vale pelo telefone (conversa liga os dois)', async () => {
    load({ whatsapp_optout: [{ clinic_id: C1, phone_key: 'lid:555' }], whatsapp_conversations: [{ clinic_id: C1, phone_key: '8599998888', lid: '555' }] })
    const r = await runConfirmations({ now: NOW })
    expect(r.clinics[0].skipped.opt_out).toBe(1)
    expect(evo.sendText).toHaveBeenCalledTimes(1)
  })

  it('opt-out de outra clínica não bloqueia esta', async () => {
    load({ whatsapp_optout: [{ clinic_id: '99999999-9999-4999-8999-999999999999', phone_key: '8599998888' }] })
    expect((await runConfirmations({ now: NOW })).clinics[0].sent).toBe(2)
  })

  it('dryRun também respeita (não conta como planejada)', async () => {
    load({ whatsapp_optout: [{ clinic_id: C1, phone_key: '8599998888' }] })
    const r = await runConfirmations({ now: NOW, dryRun: true })
    expect(r.clinics[0].planned).toBe(1)
  })

  it('erro ao ler o opt-out: falha fechada, a clínica não envia nada nesta rodada', async () => {
    load()
    state.db = createFakeDb(state.db.tables, { unique: UNIQUE, errors: { whatsapp_optout: { code: 'XX000', message: 'boom' } } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await runConfirmations({ now: NOW })
    expect(r.clinics[0].sent).toBe(0)
    expect(r.clinics[0].skipped.optout_indisponivel).toBeGreaterThan(0)
    expect(evo.sendText).not.toHaveBeenCalled()
  })

  it('tabela ainda não existe (migração não aplicada): rotina antiga segue como antes', async () => {
    load()
    state.db = createFakeDb(state.db.tables, { unique: UNIQUE, errors: { whatsapp_optout: { code: '42P01', message: 'relation does not exist' } } })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((await runConfirmations({ now: NOW })).clinics[0].sent).toBe(2)
  })
})
