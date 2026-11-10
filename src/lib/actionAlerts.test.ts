import { describe, expect, it } from 'vitest'
import { buildAlertRows, countUrgent, daysAgo, groupAlertRows, isDismissed, parseDismissed } from './actionAlerts'
import type { DashboardAlert } from '@/hooks/useClinicData'

// terça-feira, 3 de novembro de 2026, 15h
const NOW = new Date(2026, 10, 3, 15).getTime()
const iso = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).toISOString()
const al = (reason: DashboardAlert['reason'], patientId: string, date: string, name = patientId): DashboardAlert => ({ reason, patientId, name, phone: '85999990000', date })

describe('buildAlertRows', () => {
  it('junta as faltas do mesmo paciente numa linha e guarda a mais recente', () => {
    const rows = buildAlertRows([
      al('faltou', 'a', iso(2026, 10, 12), 'Daniela'),
      al('faltou', 'a', iso(2026, 10, 23), 'Daniela'),
      al('faltou', 'b', iso(2026, 10, 19), 'Helena'),
    ], NOW)
    expect(rows).toHaveLength(2)
    const d = rows.find(r => r.patientId === 'a')!
    expect(d.count).toBe(2)
    expect(d.date).toBe(iso(2026, 10, 23))
    expect(d.context).toBe('Faltou 2 vezes, a última há 11 dias')
    expect(rows.find(r => r.patientId === 'b')!.context).toBe('Faltou há 15 dias')
  })

  it('escreve o contexto de cada tipo', () => {
    const [ontem, hoje, resp, remarca, semRet, semRetLongo, niver] = buildAlertRows([
      al('faltou', 'p1', iso(2026, 11, 2)),
      al('faltou', 'p2', iso(2026, 11, 3, 8)),
      al('respondeu', 'p3', iso(2026, 11, 4)),
      al('pediu_remarcacao', 'p4', iso(2026, 11, 3, 18)),
      al('sem_retorno', 'p5', iso(2026, 9, 19)),
      al('sem_retorno', 'p6', iso(2026, 5, 3)),
      al('aniversario', 'p7', '1990-11-03'),
    ], NOW)
    expect(ontem.context).toBe('Faltou ontem')
    expect(hoje.context).toBe('Faltou hoje')
    expect(resp.context).toBe('Respondeu à confirmação, consulta amanhã')
    expect(remarca.context).toBe('Pediu para remarcar a consulta de hoje')
    expect(semRet.context).toBe('Última consulta há 45 dias')
    expect(semRetLongo.context).toBe('Última consulta há 6 meses')
    expect(buildAlertRows([al('sem_retorno', 'q', iso(2026, 8, 3))], NOW)[0].context).toBe('Última consulta há 3 meses')
    expect(niver.context).toBe('Faz aniversário hoje')
  })

  it('para resposta, vale a consulta mais próxima', () => {
    const [r] = buildAlertRows([al('respondeu', 'x', iso(2026, 11, 9)), al('respondeu', 'x', iso(2026, 11, 5))], NOW)
    expect(r.date).toBe(iso(2026, 11, 5))
    expect(r.count).toBe(2)
  })

  it('o aviso de estoque é identificado pelo texto, não pela data de agora', () => {
    const [a] = buildAlertRows([{ reason: 'estoque_baixo', patientId: 'estoque', name: '2 itens abaixo do estoque mínimo', phone: null, date: new Date(NOW).toISOString() }], NOW)
    const [b] = buildAlertRows([{ reason: 'estoque_baixo', patientId: 'estoque', name: '2 itens abaixo do estoque mínimo', phone: null, date: new Date(NOW + 5000).toISOString() }], NOW + 5000)
    expect(a.sig).toBe(b.sig)
  })
})

describe('groupAlertRows', () => {
  it('ordena os grupos por prioridade e as linhas pelo mais urgente', () => {
    const groups = groupAlertRows(buildAlertRows([
      al('sem_retorno', 's1', iso(2026, 8, 1), 'Sumida antiga'),
      al('sem_retorno', 's2', iso(2026, 9, 1), 'Sumida recente'),
      al('faltou', 'f1', iso(2026, 10, 20), 'Faltou antes'),
      al('faltou', 'f2', iso(2026, 10, 30), 'Faltou depois'),
      al('respondeu', 'r1', iso(2026, 11, 5), 'Respondeu'),
      { reason: 'whatsapp_pausado', patientId: 'whatsapp-1', name: 'Pausado', phone: null, date: iso(2026, 11, 3) },
    ], NOW))
    expect(groups.map(g => g.reason)).toEqual(['whatsapp_pausado', 'respondeu', 'faltou', 'sem_retorno'])
    expect(groups[2].rows.map(r => r.name)).toEqual(['Faltou depois', 'Faltou antes'])
    expect(groups[3].rows.map(r => r.name)).toEqual(['Sumida antiga', 'Sumida recente'])
  })
})

describe('dismissals', () => {
  const row = { sig: iso(2026, 10, 23) }

  it('"já resolvi" vale para a mesma ocorrência e a pendência volta se houver outra', () => {
    const d = { kind: 'resolved' as const, at: NOW, sig: row.sig }
    expect(isDismissed(d, row)).toBe(true)
    expect(isDismissed(d, { sig: iso(2026, 11, 2) })).toBe(false)
  })

  it('"adiar" esconde qualquer ocorrência até vencer', () => {
    const d = { kind: 'snoozed' as const, at: NOW, sig: row.sig }
    expect(isDismissed(d, { sig: 'outra' })).toBe(true)
    expect(isDismissed(undefined, row)).toBe(false)
  })

  it('descarta o vencido e aceita o formato antigo como adiado', () => {
    const day = 86_400_000
    const parsed = parseDismissed(JSON.stringify({
      velho: NOW - 8 * day,            // formato antigo, passou de 7 dias
      recente: NOW - 2 * day,          // formato antigo, vale
      resolvido: { kind: 'resolved', at: NOW - 60 * day, sig: 'x' },
      resolvidoVelho: { kind: 'resolved', at: NOW - 100 * day, sig: 'x' },
      lixo: { kind: 'outro' },
    }), NOW)
    expect(Object.keys(parsed).sort()).toEqual(['recente', 'resolvido'])
    expect(parsed.recente.kind).toBe('snoozed')
    expect(parseDismissed('não é json', NOW)).toEqual({})
    expect(parseDismissed(null, NOW)).toEqual({})
  })
})

describe('daysAgo', () => {
  it('conta por dia do calendário, não por 24 horas', () => {
    expect(daysAgo(iso(2026, 11, 2, 23), NOW)).toBe(1)
    expect(daysAgo(iso(2026, 11, 3, 1), NOW)).toBe(0)
    expect(daysAgo(iso(2026, 11, 5), NOW)).toBe(-2)
  })
})

describe('countUrgent', () => {
  it('só conta o que está esperando resposta ou o envio parado', () => {
    const rows = buildAlertRows([
      al('faltou', 'a', iso(2026, 10, 30)),
      al('sem_retorno', 'b', iso(2026, 8, 1)),
      al('respondeu', 'c', iso(2026, 11, 5)),
      al('pediu_remarcacao', 'd', iso(2026, 11, 6)),
      { reason: 'whatsapp_pausado', patientId: 'whatsapp-1', name: 'Pausado', phone: null, date: iso(2026, 11, 3) },
    ], NOW)
    expect(countUrgent(rows)).toBe(3)
    expect(countUrgent(rows.filter(r => r.reason === 'faltou'))).toBe(0)
  })
})
