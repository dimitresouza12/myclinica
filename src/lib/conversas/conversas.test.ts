import { describe, it, expect } from 'vitest'
import { patientPhoneKeys, selectPatientConversations, primaryConversation } from './match'
import { clampLimit, parseCursor, sortAscending, mergePages, mediaLabel, messageText, groupByDay, relativeTime, isMissingTable, PAGE_SIZE, MAX_PAGE_SIZE } from './messages'

const TZ = 'America/Sao_Paulo'

describe('patientPhoneKeys', () => {
  it('ignora DDI, máscara e nono dígito: todas as formas dão a mesma chave', () => {
    const forms = ['(85) 99999-8888', '85999998888', '5585999998888', '+55 85 99999-8888', '(85) 9999-8888', '085 99999-8888']
    for (const f of forms) expect(patientPhoneKeys(f)).toEqual(['8599998888'])
  })
  it('campo com vários números devolve uma chave por número', () => {
    expect(patientPhoneKeys('(85) 99999-8888 / (11) 98888-7777')).toEqual(['8599998888', '1188887777'])
  })
  it('sem telefone ou telefone inválido/estrangeiro: sem chaves', () => {
    expect(patientPhoneKeys(null)).toEqual([])
    expect(patientPhoneKeys('')).toEqual([])
    expect(patientPhoneKeys('123')).toEqual([])
  })
})

describe('selectPatientConversations', () => {
  const conv = (id: string, phone_key: string, patient_id: string | null, last: string) => ({ id, phone_key, patient_id, last_message_at: last })
  const P = 'p1'
  const keys = ['8599998888']

  it('inclui a vinculada ao paciente e a sem vínculo com o mesmo telefone, mais recente primeiro', () => {
    const rows = [
      conv('a', '8599998888', null, '2026-11-01T10:00:00Z'),
      conv('b', 'lid:123', P, '2026-11-05T10:00:00Z'),
      conv('c', '1100000000', null, '2026-11-06T10:00:00Z'),
    ]
    expect(selectPatientConversations(P, keys, rows).map(c => c.id)).toEqual(['b', 'a'])
  })
  it('nunca inclui conversa vinculada a outro paciente, mesmo com o mesmo telefone', () => {
    const rows = [conv('x', '8599998888', 'p2', '2026-11-05T10:00:00Z')]
    expect(selectPatientConversations(P, keys, rows)).toEqual([])
  })
  it('sem chaves, só vale o vínculo explícito', () => {
    const rows = [conv('a', '8599998888', null, '2026-11-01T10:00:00Z'), conv('b', 'lid:1', P, '2026-11-02T10:00:00Z')]
    expect(selectPatientConversations(P, [], rows).map(c => c.id)).toEqual(['b'])
  })
})

describe('primaryConversation', () => {
  it('escolhe a de atividade mais recente; vazio dá null', () => {
    const rows = [
      { id: 'a', phone_key: 'k', patient_id: null, last_message_at: '2026-11-01T10:00:00Z' },
      { id: 'b', phone_key: 'k2', patient_id: null, last_message_at: '2026-11-03T10:00:00Z' },
    ]
    expect(primaryConversation(rows)?.id).toBe('b')
    expect(primaryConversation([])).toBeNull()
  })
})

describe('paginação', () => {
  it('clampLimit', () => {
    expect(clampLimit(null)).toBe(PAGE_SIZE)
    expect(clampLimit('abc')).toBe(PAGE_SIZE)
    expect(clampLimit('0')).toBe(PAGE_SIZE)
    expect(clampLimit('2.5')).toBe(PAGE_SIZE)
    expect(clampLimit('10')).toBe(10)
    expect(clampLimit('100000')).toBe(MAX_PAGE_SIZE)
  })
  it('parseCursor aceita ISO e rejeita lixo', () => {
    expect(parseCursor('2026-11-05T10:00:00Z')).toBe('2026-11-05T10:00:00.000Z')
    expect(parseCursor('nada')).toBeNull()
    expect(parseCursor(null)).toBeNull()
  })
})

describe('ordenação e junção de páginas', () => {
  const m = (id: string, at: string) => ({ id, created_at: at })
  it('sortAscending: cronológica, empate pelo id, sem mexer na entrada', () => {
    const input = [m('b', '2026-11-05T10:00:00Z'), m('a', '2026-11-05T10:00:00Z'), m('z', '2026-11-04T10:00:00Z')]
    expect(sortAscending(input).map(x => x.id)).toEqual(['z', 'a', 'b'])
    expect(input[0].id).toBe('b')
  })
  it('mergePages remove repetidas entre páginas sobrepostas', () => {
    const newest = [m('3', '2026-11-05T12:00:00Z'), m('2', '2026-11-05T11:00:00Z')]
    const older = [m('2', '2026-11-05T11:00:00Z'), m('1', '2026-11-05T10:00:00Z')]
    expect(mergePages([newest, older]).map(x => x.id)).toEqual(['1', '2', '3'])
  })
})

describe('rótulos de mídia', () => {
  it('mediaLabel', () => {
    expect(mediaLabel('text')).toBe('')
    expect(mediaLabel('image')).toBe('Imagem')
    expect(mediaLabel('audio')).toBe('Áudio')
    expect(mediaLabel('document')).toBe('Documento')
    expect(mediaLabel('video')).toBe('Vídeo')
    expect(mediaLabel('sticker')).toBe('Figurinha')
    expect(mediaLabel('qualquer' as never)).toBe('Mensagem')
  })
  it('messageText: legenda junto do rótulo; apagada some com o conteúdo', () => {
    expect(messageText({ kind: 'image', body: ' foto do exame ', deleted_at: null })).toEqual({ label: 'Imagem', text: 'foto do exame' })
    expect(messageText({ kind: 'text', body: 'oi', deleted_at: null })).toEqual({ label: '', text: 'oi' })
    expect(messageText({ kind: 'audio', body: null, deleted_at: null })).toEqual({ label: 'Áudio', text: '' })
    expect(messageText({ kind: 'text', body: 'segredo', deleted_at: '2026-11-05T10:00:00Z' })).toEqual({ label: '', text: 'Mensagem apagada' })
  })
})

describe('groupByDay', () => {
  const now = new Date('2026-11-11T15:00:00Z')
  it('agrupa por dia no fuso da clínica (23h de SP já é o dia seguinte em UTC)', () => {
    const msgs = [
      { id: '1', created_at: '2026-11-09T14:00:00Z' },
      { id: '2', created_at: '2026-11-10T02:30:00Z' }, // 09/11 23:30 em São Paulo
      { id: '3', created_at: '2026-11-10T13:00:00Z' },
      { id: '4', created_at: '2026-11-11T13:00:00Z' },
    ]
    const g = groupByDay(msgs, now, TZ)
    expect(g.map(x => x.key)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11'])
    expect(g[0].messages.map(x => x.id)).toEqual(['1', '2'])
    expect(g[1].label).toBe('Ontem')
    expect(g[2].label).toBe('Hoje')
  })
  it('lista vazia', () => { expect(groupByDay([], now, TZ)).toEqual([]) })
})

describe('relativeTime', () => {
  const now = new Date('2026-11-11T15:00:00Z')
  const at = (iso: string) => relativeTime(new Date(iso), now, TZ)
  it('minutos, horas, ontem, dias e data', () => {
    expect(at('2026-11-11T14:59:40Z')).toBe('agora')
    expect(at('2026-11-11T14:55:00Z')).toBe('há 5 min')
    expect(at('2026-11-11T12:00:00Z')).toBe('há 3 h')
    expect(at('2026-11-10T12:00:00Z')).toBe('ontem')
    expect(at('2026-11-07T12:00:00Z')).toBe('há 4 dias')
    expect(at('2026-09-01T12:00:00Z')).toBe('01/09/2026')
  })
})

describe('isMissingTable', () => {
  it('reconhece tabela inexistente', () => {
    expect(isMissingTable({ code: '42P01' })).toBe(true)
    expect(isMissingTable({ code: 'PGRST205' })).toBe(true)
    expect(isMissingTable({ code: '23505' })).toBe(false)
    expect(isMissingTable(null)).toBe(false)
  })
})
