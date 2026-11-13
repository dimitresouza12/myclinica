import { describe, expect, it } from 'vitest'
import { arrangeChannelViews, matchesChannelFilter, normalizeSearch, unreadByFilter, type ChannelView } from './format'
import type { TeamChannelKind } from './types'

function view(id: string, kind: TeamChannelKind, title: string, opts: { at?: string; unread?: number; muted?: boolean } = {}): ChannelView {
  return {
    channel: { id, clinic_id: 'c', kind, specialty_type: null, name: title, direct_key: null, created_by: null, archived_at: null, created_at: '2026-01-01T00:00:00Z' },
    title,
    subtitle: '',
    avatarName: title,
    otherUserId: null,
    members: [],
    isMember: true,
    readOnly: null,
    muted: !!opts.muted,
    unread: opts.unread ?? 0,
    last: opts.at
      ? { id: `m-${id}`, channel_id: id, sender_clinic_user_id: null, body: 'oi', created_at: opts.at, deleted_at: null, has_attachment: false }
      : null,
  }
}

const ids = (list: ChannelView[]) => list.map(v => v.channel.id)

describe('arrangeChannelViews', () => {
  it('mistura todos os tipos pela mensagem mais recente', () => {
    const list = [
      view('g', 'group', 'Plantão', { at: '2026-05-01T10:00:00Z' }),
      view('d', 'direct', 'Ana', { at: '2026-05-03T10:00:00Z' }),
      view('a', 'area', 'Dentística', { at: '2026-05-02T10:00:00Z' }),
      view('ge', 'general', 'Geral', { at: '2026-05-04T10:00:00Z' }),
    ]
    expect(ids(arrangeChannelViews(list, 'all'))).toEqual(['ge', 'd', 'a', 'g'])
  })

  it('manda canais sem mensagem para o fim, por tipo e depois por nome', () => {
    const list = [
      view('g2', 'group', 'Zeladoria'),
      view('d1', 'direct', 'Bruno'),
      view('a1', 'area', 'Clínica geral'),
      view('g1', 'group', 'Almoço'),
      view('ge', 'general', 'Geral'),
      view('d2', 'direct', 'Ana'),
      view('rec', 'direct', 'Zé', { at: '2026-05-01T10:00:00Z' }),
    ]
    expect(ids(arrangeChannelViews(list, 'all'))).toEqual(['rec', 'ge', 'a1', 'd2', 'd1', 'g1', 'g2'])
  })

  it('empate de horário cai para o nome', () => {
    const at = '2026-05-01T10:00:00Z'
    const list = [view('b', 'direct', 'Bia', { at }), view('a', 'direct', 'Ana', { at })]
    expect(ids(arrangeChannelViews(list, 'all'))).toEqual(['a', 'b'])
  })

  it('não altera a lista recebida', () => {
    const list = [view('x', 'group', 'B'), view('y', 'group', 'A')]
    arrangeChannelViews(list, 'all')
    expect(ids(list)).toEqual(['x', 'y'])
  })

  it('filtra por tipo; Geral entra em Áreas', () => {
    const list = [
      view('d', 'direct', 'Ana', { at: '2026-05-01T10:00:00Z' }),
      view('g', 'group', 'Plantão', { at: '2026-05-02T10:00:00Z' }),
      view('a', 'area', 'Dentística', { at: '2026-05-03T10:00:00Z' }),
      view('ge', 'general', 'Geral', { at: '2026-05-04T10:00:00Z' }),
    ]
    expect(ids(arrangeChannelViews(list, 'direct'))).toEqual(['d'])
    expect(ids(arrangeChannelViews(list, 'group'))).toEqual(['g'])
    expect(ids(arrangeChannelViews(list, 'area'))).toEqual(['ge', 'a'])
  })

  it('busca por nome (sem acento, sem caixa) em conjunto com o filtro', () => {
    const list = [
      view('d', 'direct', 'Ação Rápida'),
      view('g', 'group', 'Acao do plantão'),
      view('x', 'group', 'Outro'),
    ]
    const q = normalizeSearch('ACAO')
    expect(ids(arrangeChannelViews(list, 'all', q))).toEqual(['d', 'g'])
    expect(ids(arrangeChannelViews(list, 'group', q))).toEqual(['g'])
    expect(arrangeChannelViews(list, 'direct', normalizeSearch('plantao'))).toEqual([])
  })
})

describe('matchesChannelFilter', () => {
  it('todas aceita qualquer tipo', () => {
    for (const k of ['general', 'area', 'direct', 'group'] as const) expect(matchesChannelFilter(k, 'all')).toBe(true)
  })
  it('direta e grupo só casam com o próprio tipo', () => {
    expect(matchesChannelFilter('direct', 'group')).toBe(false)
    expect(matchesChannelFilter('group', 'direct')).toBe(false)
    expect(matchesChannelFilter('general', 'direct')).toBe(false)
  })
})

describe('unreadByFilter', () => {
  it('soma não lidas por chip e ignora conversas silenciadas', () => {
    const list = [
      view('d1', 'direct', 'Ana', { unread: 2 }),
      view('d2', 'direct', 'Bia', { unread: 5, muted: true }),
      view('g', 'group', 'Plantão', { unread: 3 }),
      view('a', 'area', 'Dentística', { unread: 1 }),
      view('ge', 'general', 'Geral', { unread: 4 }),
      view('z', 'group', 'Sem novidade'),
    ]
    expect(unreadByFilter(list)).toEqual({ all: 10, direct: 2, group: 3, area: 5 })
  })
})
