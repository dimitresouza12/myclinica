import { beforeEach, describe, expect, it, vi } from 'vitest'

type Reply = { data: unknown; error: unknown }

const rpc = vi.fn()
const remove = vi.fn()
const from = vi.fn(() => ({ remove }))

vi.mock('@/lib/supabaseAdmin', () => ({
  getAdminClient: () => ({ rpc, storage: { from } }),
}))

import { cleanupTeamChatAttachments } from './cleanup'

const row = (n: number) => ({ id: `id-${n}`, storage_path: `clinic/chan/file-${n}` })
const orphan = (n: number) => ({ name: `clinic/chan/orphan-${n}` })
const ok: Reply = { data: null, error: null }
const empty: Reply = { data: [], error: null }

// rpc roteado por nome; cada fila é consumida na ordem e, vazia, devolve lista vazia
const queues: Record<string, Reply[]> = {}
const calls = (name: string) => rpc.mock.calls.filter(c => c[0] === name)
const queue = (name: string, ...replies: Reply[]) => { queues[name] = replies }

beforeEach(() => {
  for (const k of Object.keys(queues)) delete queues[k]
  rpc.mockReset()
  remove.mockReset()
  from.mockClear()
  rpc.mockImplementation(async (name: string) => {
    if (name === 'team_attachments_mark_expired') return queues[name]?.shift() ?? ok
    if (name === 'team_attachments_due' || name === 'team_chat_orphan_objects') return queues[name]?.shift() ?? empty
    throw new Error('rpc inesperada ' + name)
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const zeros = { due: 0, deleted: 0, failed: 0, orphansDeleted: 0, orphansFailed: 0 }

describe('cleanupTeamChatAttachments', () => {
  it('lote vazio retorna zeros e não toca no Storage', async () => {
    expect(await cleanupTeamChatAttachments()).toEqual(zeros)
    expect(remove).not.toHaveBeenCalled()
    expect(calls('team_attachments_due')).toHaveLength(1)
    expect(calls('team_attachments_due')[0][1]).toEqual({ p_limit: 500 })
    expect(calls('team_attachments_mark_expired')).toHaveLength(0)
  })

  it('remove do bucket team-chat e marca os que removeu', async () => {
    queue('team_attachments_due', { data: [row(1), row(2)], error: null })
    remove.mockResolvedValueOnce({ data: [], error: null })

    expect(await cleanupTeamChatAttachments()).toEqual({ ...zeros, due: 2, deleted: 2 })
    expect(from).toHaveBeenCalledWith('team-chat')
    expect(remove).toHaveBeenCalledWith(['clinic/chan/file-1', 'clinic/chan/file-2'])
    expect(calls('team_attachments_mark_expired')[0][1]).toEqual({ p_ids: ['id-1', 'id-2'] })
  })

  it('falha parcial: só marca os lotes removidos com sucesso', async () => {
    const rows = Array.from({ length: 150 }, (_, i) => row(i)) // lotes de 100 e 50
    queue('team_attachments_due', { data: rows, error: null })
    remove
      .mockResolvedValueOnce({ data: null, error: { message: 'boom' } }) // lote 1 falha
      .mockResolvedValueOnce({ data: [], error: null })                  // lote 2 ok

    expect(await cleanupTeamChatAttachments()).toEqual({ ...zeros, due: 150, deleted: 50, failed: 100 })
    expect(remove).toHaveBeenCalledTimes(2)
    const ids = (calls('team_attachments_mark_expired')[0][1] as { p_ids: string[] }).p_ids
    expect(ids).toEqual(rows.slice(100).map(r => r.id))
  })

  it('tudo falhando: não marca nada e não repete o laço', async () => {
    queue('team_attachments_due', { data: [row(1)], error: null })
    remove.mockRejectedValueOnce(new Error('rede'))

    expect(await cleanupTeamChatAttachments()).toEqual({ ...zeros, due: 1, failed: 1 })
    expect(calls('team_attachments_due')).toHaveLength(1)
    expect(calls('team_attachments_mark_expired')).toHaveLength(0)
  })

  it('erro ao listar vencidos não lança', async () => {
    queue('team_attachments_due', { data: null, error: { message: 'função inexistente' } })
    expect(await cleanupTeamChatAttachments()).toEqual(zeros)
  })

  it('erro ao marcar conta como falha e para', async () => {
    queue('team_attachments_due', { data: [row(1)], error: null })
    queue('team_attachments_mark_expired', { data: null, error: { message: 'falhou' } })
    remove.mockResolvedValueOnce({ data: [], error: null })
    expect(await cleanupTeamChatAttachments()).toEqual({ ...zeros, due: 1, failed: 1 })
  })

  it('não reenvia ao Storage os que já falharam na mesma execução', async () => {
    const first = Array.from({ length: 500 }, (_, i) => row(i)) // lotes de 100: o 1º falha
    const second = [...first.slice(0, 100), row(9001)]           // os falhos voltam na consulta seguinte
    queue('team_attachments_due', { data: first, error: null }, { data: second, error: null })
    remove
      .mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
      .mockResolvedValue({ data: [], error: null })

    expect(await cleanupTeamChatAttachments()).toEqual({ ...zeros, due: 501, deleted: 401, failed: 100 })
    const sent = remove.mock.calls.flatMap(c => c[0] as string[])
    expect(sent.filter(p => p === 'clinic/chan/file-0')).toHaveLength(1)
    expect(remove.mock.calls[remove.mock.calls.length - 1][0]).toEqual(['clinic/chan/file-9001'])
  })

  it('varre vários laços de 500 até esvaziar', async () => {
    queue('team_attachments_due',
      { data: Array.from({ length: 500 }, (_, i) => row(i)), error: null },
      { data: [row(9001)], error: null })
    remove.mockResolvedValue({ data: [], error: null })

    expect(await cleanupTeamChatAttachments()).toEqual({ ...zeros, due: 501, deleted: 501 })
  })
})

describe('cleanupTeamChatAttachments: órfãos', () => {
  it('remove os órfãos em lotes de 100 sem marcar nada no banco', async () => {
    queue('team_chat_orphan_objects', { data: Array.from({ length: 150 }, (_, i) => orphan(i)), error: null })
    remove.mockResolvedValue({ data: [], error: null })

    expect(await cleanupTeamChatAttachments()).toEqual({ ...zeros, orphansDeleted: 150 })
    expect(from).toHaveBeenCalledWith('team-chat')
    expect(remove).toHaveBeenCalledTimes(2)
    expect((remove.mock.calls[0][0] as string[])).toHaveLength(100)
    expect((remove.mock.calls[1][0] as string[])).toHaveLength(50)
    expect(calls('team_attachments_mark_expired')).toHaveLength(0)
  })

  it('falha parcial conta orphansFailed e não repete o laço sem progresso', async () => {
    queue('team_chat_orphan_objects',
      { data: Array.from({ length: 150 }, (_, i) => orphan(i)), error: null })
    remove
      .mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
      .mockResolvedValueOnce({ data: [], error: null })

    expect(await cleanupTeamChatAttachments()).toEqual({ ...zeros, orphansDeleted: 50, orphansFailed: 100 })
  })

  it('tudo falhando: uma só consulta e sem exceção', async () => {
    queue('team_chat_orphan_objects', { data: [orphan(1)], error: null })
    remove.mockRejectedValueOnce(new Error('rede'))

    expect(await cleanupTeamChatAttachments()).toEqual({ ...zeros, orphansFailed: 1 })
    expect(calls('team_chat_orphan_objects')).toHaveLength(1)
  })

  it('erro ao listar órfãos não lança e não afeta os anexos vencidos', async () => {
    queue('team_attachments_due', { data: [row(1)], error: null })
    queue('team_chat_orphan_objects', { data: null, error: { message: 'sem função' } })
    remove.mockResolvedValueOnce({ data: [], error: null })

    expect(await cleanupTeamChatAttachments()).toEqual({ ...zeros, due: 1, deleted: 1 })
  })

  it('órfãos rodam mesmo quando a listagem de vencidos falha', async () => {
    queue('team_attachments_due', { data: null, error: { message: 'x' } })
    queue('team_chat_orphan_objects', { data: [orphan(1)], error: null })
    remove.mockResolvedValueOnce({ data: [], error: null })

    expect(await cleanupTeamChatAttachments()).toEqual({ ...zeros, orphansDeleted: 1 })
  })
})
