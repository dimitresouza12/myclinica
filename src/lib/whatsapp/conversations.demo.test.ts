// Defesa em profundidade: as funções de envio recusam clínica demo mesmo sem passar pela rota.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const demoRead = vi.hoisted(() => ({ value: true }))
const evo = vi.hoisted(() => ({ sendText: vi.fn(), sendMedia: vi.fn(), sendVoice: vi.fn(), deleteForEveryone: vi.fn(), editText: vi.fn() }))
const putMedia = vi.hoisted(() => vi.fn())
const dbTables = vi.hoisted(() => [] as string[])

vi.mock('@/lib/supabaseAdmin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      dbTables.push(table)
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq']) chain[m] = () => chain
      chain.maybeSingle = async () => ({ data: table === 'clinics' ? { demo_mode: demoRead.value } : null, error: null })
      return chain
    },
  }),
}))
vi.mock('next/server', async importOriginal => ({ ...(await importOriginal<typeof import('next/server')>()), after: vi.fn() }))
vi.mock('./evolution', () => evo)
vi.mock('./connection', () => ({ connectedInstanceFor: vi.fn(async () => 'inst') }))
vi.mock('./media-store', () => ({ putMedia, newMediaPath: vi.fn(() => 'p'), removeMedia: vi.fn(), downloadMessageMedia: vi.fn() }))

import { sendFromInbox, sendMediaFromInbox, deleteOwnMessage, editOwnMessage } from './conversations'
import { sendConfirmationNow } from './run'

const MSG = 'Envio de mensagens desativado na conta de demonstração.'
beforeEach(() => { demoRead.value = true; dbTables.length = 0; Object.values(evo).forEach(f => f.mockReset()); putMedia.mockReset() })

describe('funções de envio em clínica demo', () => {
  it('sendFromInbox → 403 sem tocar conversas nem enviar', async () => {
    expect(await sendFromInbox({ clinicId: 'c1', conversationId: 'x', text: 't', userId: 'u', userName: 'n' })).toEqual({ ok: false, status: 403, error: MSG })
    expect(evo.sendText).not.toHaveBeenCalled()
    expect(dbTables).toEqual(['clinics'])
  })

  it('sendMediaFromInbox → 403, sem gravar no Storage', async () => {
    const r = await sendMediaFromInbox({ clinicId: 'c1', conversationId: 'x', userId: 'u', userName: 'n', bytes: Buffer.from('a'), name: 'a.png', mime: 'image/png', kind: 'image', caption: '' })
    expect(r).toEqual({ ok: false, status: 403, error: MSG })
    expect(putMedia).not.toHaveBeenCalled()
    expect(evo.sendMedia).not.toHaveBeenCalled()
  })

  it('deleteOwnMessage e editOwnMessage → 403', async () => {
    expect(await deleteOwnMessage({ clinicId: 'c1', messageId: 'm' })).toEqual({ ok: false, status: 403, error: MSG })
    expect(await editOwnMessage({ clinicId: 'c1', messageId: 'm', text: 't' })).toEqual({ ok: false, status: 403, error: MSG })
    expect(evo.deleteForEveryone).not.toHaveBeenCalled()
    expect(evo.editText).not.toHaveBeenCalled()
  })

  it('sendConfirmationNow → 403 sem consultar WhatsApp nem consulta', async () => {
    expect(await sendConfirmationNow('c1', 'a1')).toEqual({ ok: false, status: 403, error: MSG })
    expect(dbTables).toEqual(['clinics'])
  })

  it('clínica normal segue o fluxo (aqui para em "conversa não encontrada")', async () => {
    demoRead.value = false
    const r = await sendFromInbox({ clinicId: 'c1', conversationId: 'x', text: 't', userId: 'u', userName: 'n' })
    expect(r).toMatchObject({ ok: false, status: 404 })
  })
})
