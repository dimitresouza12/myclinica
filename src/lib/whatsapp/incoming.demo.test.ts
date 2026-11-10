// Webhook de resposta do paciente: em demo a confirmação é gravada, mas nenhuma resposta automática sai.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ demo: false, updates: [] as { table: string; patch: unknown }[] }))
const sendText = vi.hoisted(() => vi.fn())
const recordOutgoing = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabaseAdmin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      let patch: unknown = null
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'gt', 'order', 'limit', 'in']) chain[m] = () => chain
      chain.update = (p: unknown) => { patch = p; state.updates.push({ table, patch: p }); return chain }
      const single = () => {
        if (table === 'clinic_whatsapp') return { clinic_id: 'c1', reply_yes_text: 'Obrigado, confirmado!', reply_no_text: 'Vamos remarcar.' }
        if (table === 'appointments') return { id: 'a1', status: 'agendado' }
        if (table === 'clinics') return { demo_mode: state.demo }
        return null
      }
      chain.maybeSingle = async () => ({ data: single(), error: null })
      chain.then = (res: (r: unknown) => unknown, rej?: (e: unknown) => unknown) => {
        let data: unknown = []
        if (table === 'appointment_confirmations') {
          // lista de pendentes (select) ou "reivindicação" (update ... select)
          data = patch ? [{ id: 'conf1' }] : [{ id: 'conf1', appointment_id: 'a1', to_jid: '5585999990000@s.whatsapp.net' }]
        }
        return Promise.resolve({ data, error: null }).then(res, rej)
      }
      return chain
    },
  }),
}))
vi.mock('./evolution', () => ({ sendText }))
vi.mock('./conversations', () => ({ recordOutgoing }))
vi.mock('./webhook-parse', () => ({ extractIncomingText: () => ({ text: 'sim', phoneKey: '85999990000' }) }))
vi.mock('./reply', () => ({ parseReply: () => 'sim' }))

import { handleIncoming } from './incoming'

beforeEach(() => { sendText.mockReset(); recordOutgoing.mockReset(); state.updates.length = 0; state.demo = false })

describe('handleIncoming e conta de demonstração', () => {
  it('demo: grava a confirmação, mas não envia nem registra resposta automática', async () => {
    state.demo = true
    expect(await handleIncoming('inst', {})).toBe('confirmada')
    expect(state.updates.some(u => u.table === 'appointments' && (u.patch as { status?: string }).status === 'confirmado')).toBe(true)
    expect(sendText).not.toHaveBeenCalled()
    expect(recordOutgoing).not.toHaveBeenCalled()
  })

  it('clínica normal: envia a resposta automática', async () => {
    sendText.mockResolvedValue({ messageId: 'm1' })
    expect(await handleIncoming('inst', {})).toBe('confirmada')
    expect(sendText).toHaveBeenCalledTimes(1)
    expect(recordOutgoing).toHaveBeenCalledTimes(1)
  })
})
