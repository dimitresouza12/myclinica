// run-confirmations pula a clínica com automacao_gerenciada = true (a automação do n8n cuida das confirmações).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ managed: new Set<string>(), managedError: null as { code: string; message: string } | null, clinicEqs: [] as unknown[] }))

vi.mock('@/lib/supabaseAdmin', () => {
  const base = {
    instance_name: 'i', confirm_mode: 'ambos', vespera_send_time: '18:00:00', no_dia_hours_before: 3,
    send_window_start: '08:00:00', send_window_end: '20:00:00', late_booking_policy: 'imediato', timezone: 'America/Fortaleza', message_template: 'x',
  }
  const rows = [{ clinic_id: 'gerenciada', ...base }, { clinic_id: 'antiga', ...base }]
  return {
    getAdminClient: () => ({
      from: (table: string) => {
        let asksManaged = false
        const chain: Record<string, unknown> = {}
        chain.eq = (col: string, v: unknown) => {
          if (col === 'clinic_id') state.clinicEqs.push(v)
          if (col === 'automacao_gerenciada') asksManaged = true
          return chain
        }
        for (const m of ['select', 'update', 'lt', 'gt', 'gte', 'lte', 'order', 'limit', 'neq', 'is', 'not', 'in']) chain[m] = () => chain
        chain.maybeSingle = async () => ({ data: null, error: null })
        chain.then = (res: (r: unknown) => unknown, rej?: (e: unknown) => unknown) => {
          let result: unknown = { data: [], error: null }
          if (table === 'clinic_whatsapp' && asksManaged) {
            result = state.managedError
              ? { data: null, error: state.managedError }
              : { data: [...state.managed].map(id => ({ clinic_id: id, automacao_gerenciada: true })), error: null }
          } else if (table === 'clinic_whatsapp') result = { data: rows, error: null }
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

beforeEach(() => { state.managed = new Set(); state.managedError = null; state.clinicEqs.length = 0 })

describe('runConfirmations e automacao_gerenciada', () => {
  it('pula a clínica gerenciada e processa a antiga', async () => {
    state.managed = new Set(['gerenciada'])
    const r = await runConfirmations({ dryRun: true })
    expect(r.clinics.map(c => c.clinicId)).toEqual(['antiga'])
    expect(r.skippedManaged).toBe(1)
    expect(state.clinicEqs).not.toContain('gerenciada')
  })

  it('dryRun:false também pula a gerenciada', async () => {
    state.managed = new Set(['gerenciada'])
    const r = await runConfirmations({ dryRun: false })
    expect(r.clinics.map(c => c.clinicId)).toEqual(['antiga'])
    expect(state.clinicEqs).not.toContain('gerenciada')
  })

  it('nenhuma gerenciada: tudo como antes', async () => {
    const r = await runConfirmations({ dryRun: true })
    expect(r.clinics.map(c => c.clinicId).sort()).toEqual(['antiga', 'gerenciada'])
    expect(r.skippedManaged).toBe(0)
  })

  it.each(['42703', 'PGRST204'])('coluna ausente (%s, migração não aplicada): falha aberta, ninguém é pulado', async code => {
    state.managedError = { code, message: 'column does not exist' }
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await runConfirmations({ dryRun: true })
    expect(r.clinics.map(c => c.clinicId).sort()).toEqual(['antiga', 'gerenciada'])
  })

  it.each(['57014', '08006', 'PGRST301', undefined])('erro transitório (%s): a rodada NÃO segue (senão a clínica gerenciada receberia mensagem em dobro)', async code => {
    state.managed = new Set(['gerenciada'])
    state.managedError = { code: code as string, message: 'timeout' }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(runConfirmations({ dryRun: false })).rejects.toThrow()
    expect(state.clinicEqs).not.toContain('gerenciada')
    expect(state.clinicEqs).not.toContain('antiga')
  })
})
