// Agendador de confirmações: clínica de demonstração é pulada mesmo com WhatsApp conectado.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ demoIds: new Set<string>(), calls: [] as string[], clinicEqs: [] as unknown[], updates: [] as string[], only: null as string[] | null }))

vi.mock('@/lib/supabaseAdmin', () => {
  const base = {
    instance_name: 'i', confirm_mode: 'ambos', vespera_send_time: '18:00:00', no_dia_hours_before: 3,
    send_window_start: '08:00:00', send_window_end: '20:00:00', late_booking_policy: 'imediato', timezone: 'America/Fortaleza', message_template: 'x',
  }
  const rows = [{ clinic_id: 'demo', ...base }, { clinic_id: 'real', ...base }]
  return {
    getAdminClient: () => ({
      from: (table: string) => {
        state.calls.push(table)
        let usedIn = false
        const chain: Record<string, unknown> = {}
        chain.eq = (col: string, v: unknown) => { if (col === 'clinic_id') state.clinicEqs.push(v); return chain }
        chain.update = () => { state.updates.push(table); return chain }
        for (const m of ['select', 'lt', 'gt', 'gte', 'lte', 'order', 'limit', 'neq', 'is', 'not']) chain[m] = () => chain
        chain.in = () => { usedIn = true; return chain }
        chain.maybeSingle = async () => ({ data: null, error: null })
        chain.then = (res: (r: unknown) => unknown, rej?: (e: unknown) => unknown) => {
          const result =
            table === 'clinic_whatsapp' ? { data: state.only ? rows.filter(r => state.only!.includes(r.clinic_id)) : rows, error: null }
            : table === 'clinics' && usedIn ? { data: rows.map(r => ({ id: r.clinic_id, demo_mode: state.demoIds.has(r.clinic_id) })), error: null }
            : { data: [], error: null }
          return Promise.resolve(result).then(res, rej)
        }
        return chain
      },
    }),
  }
})
vi.mock('./evolution', () => ({ checkNumbers: vi.fn(), sendText: vi.fn(), EvolutionError: class extends Error {} }))
vi.mock('./conversations', () => ({ recordOutgoing: vi.fn() }))

import { runConfirmations } from './run'

describe('runConfirmations e conta de demonstração', () => {
  beforeEach(() => { state.calls.length = 0; state.clinicEqs.length = 0; state.updates.length = 0; state.only = null; state.demoIds = new Set() })

  it('não processa a clínica demo, só a normal', async () => {
    state.demoIds = new Set(['demo'])
    const r = await runConfirmations({ dryRun: true })
    expect(r.clinics.map(c => c.clinicId)).toEqual(['real'])
  })

  it('dryRun:false também pula a demo: nenhuma consulta ou envio é montado para ela', async () => {
    state.demoIds = new Set(['demo'])
    const r = await runConfirmations({ dryRun: false })
    expect(r.clinics.map(c => c.clinicId)).toEqual(['real'])
    expect(state.clinicEqs).toContain('real')
    expect(state.clinicEqs).not.toContain('demo')
    expect(state.updates).toContain('appointment_confirmations') // a limpeza de linhas presas roda, como nas outras execuções
  })

  it('dryRun:false com só a demo conectada: nenhuma clínica é processada', async () => {
    state.demoIds = new Set(['demo'])
    state.only = ['demo']
    const r = await runConfirmations({ dryRun: false })
    expect(r.clinics).toEqual([])
    expect(state.clinicEqs).not.toContain('demo')
    expect(state.calls).not.toContain('appointments')
  })

  it('sem leitura possível de demo_mode (coluna ausente), ninguém é pulado', async () => {
    state.demoIds = new Set()
    const r = await runConfirmations({ dryRun: true })
    expect(r.clinics.map(c => c.clinicId).sort()).toEqual(['demo', 'real'])
  })
})
