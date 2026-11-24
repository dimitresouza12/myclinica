import { describe, expect, it } from 'vitest'
import {
  aplicarEvento, carregarNaoLidas, createToastGate, isTabelaAusente, linkDoAviso, parseNotificacao,
  podeVerAvisosAutomacao, tempoRelativo, textoDoAviso, type AutomacaoNotificacao,
} from './automacaoNotificacoes'

const CLINICA = 'c1'
const row = (id: string, over: Record<string, unknown> = {}) => ({
  id, clinic_id: CLINICA, tipo: 'confirmou', titulo: 'Consulta confirmada', corpo: 'Ana confirmou a consulta de 18/11 às 11h.',
  link: `/agenda?consulta=${id}`, appointment_id: id, criada_em: '2026-11-17T12:00:00.000Z', lida_em: null, ...over,
})
const noteOf = (id: string, over: Record<string, unknown> = {}) => parseNotificacao(row(id, over)) as AutomacaoNotificacao

describe('isTabelaAusente', () => {
  it('reconhece tabela inexistente pelo código do Postgres e do PostgREST', () => {
    expect(isTabelaAusente({ code: '42P01', message: 'relation "public.automacao_notificacoes" does not exist' })).toBe(true)
    expect(isTabelaAusente({ code: 'PGRST205', message: "Could not find the table 'public.automacao_notificacoes' in the schema cache" })).toBe(true)
  })
  it('reconhece pela mensagem quando não há código', () => {
    expect(isTabelaAusente({ message: 'relation "automacao_notificacoes" does not exist' })).toBe(true)
  })
  it('outros erros não contam como migration pendente', () => {
    expect(isTabelaAusente({ code: '42501', message: 'permission denied for table automacao_notificacoes' })).toBe(false)
    expect(isTabelaAusente({ message: 'Failed to fetch' })).toBe(false)
    expect(isTabelaAusente(null)).toBe(false)
  })
})

describe('carregarNaoLidas', () => {
  it('tabela ausente vira lista vazia e indisponível, sem lançar', async () => {
    for (const code of ['42P01', 'PGRST205']) {
      const r = await carregarNaoLidas(async () => ({ data: null, error: { code, message: 'x' } }))
      expect(r).toEqual({ available: false, items: [] })
    }
  })
  it('erro de verdade é lançado (o sino ignora em silêncio, mas não confunde com tabela ausente)', async () => {
    await expect(carregarNaoLidas(async () => ({ data: null, error: { code: '57014', message: 'timeout' } }))).rejects.toThrow('timeout')
  })
  it('lê as não lidas, descarta linha malformada e ordena da mais recente', async () => {
    const r = await carregarNaoLidas(async () => ({
      data: [
        row('a', { criada_em: '2026-11-17T10:00:00.000Z' }),
        row('b', { criada_em: '2026-11-17T11:00:00.000Z' }),
        { id: 'x', clinic_id: CLINICA, tipo: 'invalido', titulo: 't', criada_em: 'd' },
        row('c', { lida_em: '2026-11-17T11:30:00.000Z' }),
      ],
      error: null,
    }))
    expect(r.available).toBe(true)
    expect(r.items.map(n => n.id)).toEqual(['b', 'a'])
  })
})

describe('aplicarEvento', () => {
  it('INSERT novo entra na frente e devolve o aviso para a tela', () => {
    const vistas = new Set(['a'])
    const r = aplicarEvento([noteOf('a')], vistas, { tipo: 'INSERT', novo: row('b', { criada_em: '2026-11-17T13:00:00.000Z' }) }, CLINICA)
    expect(r.items.map(n => n.id)).toEqual(['b', 'a'])
    expect(r.nova?.id).toBe('b')
    expect(vistas.has('b')).toBe(true)
  })
  it('não repete o aviso de quem já estava no carregamento nem de evento duplicado', () => {
    const vistas = new Set(['a'])
    expect(aplicarEvento([noteOf('a')], vistas, { tipo: 'INSERT', novo: row('a') }, CLINICA).nova).toBeNull()
    expect(aplicarEvento([], vistas, { tipo: 'INSERT', novo: row('z') }, CLINICA).nova?.id).toBe('z')
    expect(aplicarEvento([], vistas, { tipo: 'INSERT', novo: row('z') }, CLINICA).nova).toBeNull()
  })
  it('UPDATE com lida_em tira da lista; UPDATE não lido nunca gera aviso na tela', () => {
    const vistas = new Set<string>()
    const lida = aplicarEvento([noteOf('a'), noteOf('b')], vistas, { tipo: 'UPDATE', novo: row('a', { lida_em: '2026-11-17T12:05:00.000Z' }) }, CLINICA)
    expect(lida.items.map(n => n.id)).toEqual(['b'])
    expect(lida.nova).toBeNull()
    expect(aplicarEvento([], vistas, { tipo: 'UPDATE', novo: row('q') }, CLINICA).nova).toBeNull()
  })
  it('ignora evento de outra clínica ou malformado', () => {
    const before = [noteOf('a')]
    expect(aplicarEvento(before, new Set(), { tipo: 'INSERT', novo: row('x', { clinic_id: 'outra' }) }, CLINICA)).toEqual({ items: before, nova: null })
    expect(aplicarEvento(before, new Set(), { tipo: 'INSERT', novo: { id: 1 } }, CLINICA)).toEqual({ items: before, nova: null })
  })
})

describe('createToastGate', () => {
  it('deixa no máximo 3 ao mesmo tempo e libera quando passam 6 s', () => {
    const gate = createToastGate(3, 6000)
    expect([0, 100, 200, 300].map(t => gate.tryShow(t))).toEqual([true, true, true, false])
    expect(gate.tryShow(5999)).toBe(false)
    expect(gate.tryShow(6000)).toBe(true) // o primeiro já saiu
    expect(gate.tryShow(6050)).toBe(false) // 100 e 200 ainda estão na tela
  })
})

describe('tempoRelativo', () => {
  const now = new Date('2026-11-17T12:00:00.000Z').getTime()
  const ago = (ms: number) => new Date(now - ms).toISOString()
  it('escreve em português', () => {
    expect(tempoRelativo(ago(20_000), now)).toBe('agora')
    expect(tempoRelativo(ago(5 * 60_000), now)).toBe('há 5 min')
    expect(tempoRelativo(ago(3 * 3_600_000), now)).toBe('há 3 h')
    expect(tempoRelativo(ago(30 * 3_600_000), now)).toBe('ontem')
    expect(tempoRelativo(ago(4 * 86_400_000), now)).toBe('há 4 dias')
    expect(tempoRelativo('lixo', now)).toBe('')
  })
  it('data no futuro (relógio adiantado) não fica negativa', () => {
    expect(tempoRelativo(new Date(now + 60_000).toISOString(), now)).toBe('agora')
  })
})

describe('linkDoAviso e textoDoAviso', () => {
  it('usa o link interno do aviso', () => {
    expect(linkDoAviso({ link: '/agenda?consulta=abc', appointment_id: 'abc' })).toBe('/agenda?consulta=abc')
  })
  it('recusa link externo e cai na consulta ou na Agenda', () => {
    expect(linkDoAviso({ link: 'https://evil.example/x', appointment_id: 'abc' })).toBe('/agenda?consulta=abc')
    expect(linkDoAviso({ link: '//evil.example', appointment_id: null })).toBe('/agenda')
    expect(linkDoAviso({ link: null, appointment_id: null })).toBe('/agenda')
  })
  it('o texto do aviso é a frase pronta, ou o título sem ela', () => {
    expect(textoDoAviso({ titulo: 'T', corpo: 'Frase.' })).toBe('Frase.')
    expect(textoDoAviso({ titulo: 'T', corpo: null })).toBe('T')
  })
})

describe('podeVerAvisosAutomacao', () => {
  const perms = (agenda?: boolean) => (agenda === undefined ? {} : { agenda: { can_view: agenda } })
  it('exige o módulo Agenda; admin vê; superadmin e sem login não', () => {
    expect(podeVerAvisosAutomacao({ role: 'admin' }, {}, true)).toBe(true)
    expect(podeVerAvisosAutomacao({ role: 'recepcao' }, perms(true), true)).toBe(true)
    expect(podeVerAvisosAutomacao({ role: 'recepcao' }, perms(false), true)).toBe(false)
    expect(podeVerAvisosAutomacao({ role: 'recepcao' }, perms(), true)).toBe(false)
    expect(podeVerAvisosAutomacao({ role: 'recepcao' }, perms(true), false)).toBe(false) // permissões ainda carregando
    expect(podeVerAvisosAutomacao({ role: 'admin', isSuperAdmin: true }, {}, true)).toBe(false)
    expect(podeVerAvisosAutomacao(null, perms(true), true)).toBe(false)
  })
})
