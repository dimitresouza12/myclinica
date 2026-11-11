import { describe, expect, it } from 'vitest'
import { applyAction, availableActions, canDo, expectedStatuses, isSameBrasilDay, stageOf, statusChangePatch } from './status'
import { attendanceMetrics, consultMs, elapsedMs, formatBrasilTime, formatClock, formatMinutes, waitMs, waitTone } from './time'
import { buildQueue, type QueueAppt } from './queue'

const NOW = new Date('2026-11-19T15:00:00.000Z') // 12:00 em Brasília

describe('stageOf', () => {
  it('mapeia os status', () => {
    expect(stageOf({ status: 'agendado' })).toBe('scheduled')
    expect(stageOf({ status: null })).toBe('scheduled')
    expect(stageOf({ status: 'confirmado' })).toBe('scheduled')
    expect(stageOf({ status: 'arrived' })).toBe('waiting')
    expect(stageOf({ status: 'in_progress' })).toBe('in_progress')
    expect(stageOf({ status: 'concluido' })).toBe('done')
    expect(stageOf({ status: 'cancelado' })).toBe('closed')
    expect(stageOf({ status: 'faltou' })).toBe('closed')
    expect(stageOf({ status: 'bloqueado' })).toBe('closed')
  })
  it('chegada legada (só arrived_at) conta como aguardando', () => {
    expect(stageOf({ status: 'confirmado', arrived_at: NOW.toISOString() })).toBe('waiting')
    expect(stageOf({ status: 'concluido', arrived_at: NOW.toISOString() })).toBe('done')
  })
})

describe('transições', () => {
  it('agendado -> chegou -> em atendimento -> atendido', () => {
    expect(availableActions({ status: 'agendado' })).toEqual(['arrive', 'start'])
    const arrive = applyAction({ status: 'agendado' }, 'arrive', NOW, 'u1')
    expect(arrive).toMatchObject({ status: 'arrived', arrived_at: NOW.toISOString() })
    const start = applyAction({ status: 'arrived', arrived_at: NOW.toISOString() }, 'start', NOW, 'u1')
    expect(start).toMatchObject({ status: 'in_progress', started_at: NOW.toISOString(), started_by: 'u1' })
    const finish = applyAction({ status: 'in_progress', started_at: NOW.toISOString() }, 'finish', NOW, 'u1')
    expect(finish).toMatchObject({ status: 'concluido', finished_at: NOW.toISOString(), finished_by: 'u1' })
  })
  it('nega ações inválidas', () => {
    expect(applyAction({ status: 'agendado' }, 'finish', NOW, null)).toBeNull()
    expect(applyAction({ status: 'concluido' }, 'start', NOW, null)).toBeNull()
    expect(applyAction({ status: 'cancelado' }, 'arrive', NOW, null)).toBeNull()
    expect(applyAction({ status: 'in_progress' }, 'arrive', NOW, null)).toBeNull()
    expect(canDo({ status: 'faltou' }, 'start')).toBe(false)
  })
  it('desfazer chegada volta para confirmado; o legado mantém o status', () => {
    expect(applyAction({ status: 'arrived', arrived_at: 'x' }, 'unarrive', NOW, null)).toMatchObject({ status: 'confirmado', arrived_at: null })
    expect(applyAction({ status: 'agendado', arrived_at: 'x' }, 'unarrive', NOW, null)).toMatchObject({ status: 'agendado', arrived_at: null })
  })
  it('voltar para a fila zera o início e mantém a chegada', () => {
    const p = applyAction({ status: 'in_progress', arrived_at: 'a', started_at: 's' }, 'back_to_queue', NOW, null)
    expect(p).toMatchObject({ status: 'arrived', started_at: null, started_by: null, arrived_at: 'a' })
  })
  it('chamar não muda o status', () => {
    const p = applyAction({ status: 'arrived', arrived_at: 'a' }, 'call', NOW, null)
    expect(p).toEqual({ called_at: NOW.toISOString() })
    expect(applyAction({ status: 'agendado' }, 'call', NOW, null)).toBeNull()
  })
  it('status esperados no banco para a gravação condicional', () => {
    expect(expectedStatuses('finish')).toEqual(['in_progress'])
    expect(expectedStatuses('arrive')).not.toContain('concluido')
  })
})

describe('statusChangePatch (seletor genérico da agenda)', () => {
  it('concluir carimba o fim só se havia início', () => {
    expect(statusChangePatch({ status: 'in_progress', started_at: 's' }, 'concluido', NOW, 'u')).toEqual({ finished_at: NOW.toISOString(), finished_by: 'u' })
    expect(statusChangePatch({ status: 'confirmado' }, 'concluido', NOW, 'u')).toEqual({})
    expect(statusChangePatch({ status: 'in_progress', started_at: 's', finished_at: 'f' }, 'concluido', NOW, 'u')).toEqual({})
  })
  it('voltar para agendado limpa chegada e início', () => {
    expect(statusChangePatch({ status: 'in_progress', started_at: 's', arrived_at: 'a' }, 'agendado', NOW, 'u')).toMatchObject({ arrived_at: null, started_at: null })
    expect(statusChangePatch({ status: 'confirmado' }, 'agendado', NOW, 'u')).toEqual({})
    expect(statusChangePatch({ status: 'arrived', arrived_at: 'a' }, 'cancelado', NOW, 'u')).toEqual({})
  })
})

describe('tempos', () => {
  it('duração, espera e decorrido', () => {
    const a = '2026-11-19T14:40:00.000Z'; const s = '2026-11-19T14:55:00.000Z'; const f = '2026-11-19T15:25:00.000Z'
    expect(waitMs(a, s)).toBe(15 * 60000)
    expect(waitMs(a, null, NOW)).toBe(20 * 60000)
    expect(waitMs(null, s, NOW)).toBeNull()
    expect(consultMs(s, f)).toBe(30 * 60000)
    expect(consultMs(s, null, NOW)).toBe(5 * 60000)
    expect(consultMs(null, f)).toBeNull()
    expect(elapsedMs(s, NOW)).toBe(5 * 60000)
    expect(elapsedMs('2026-11-19T16:00:00.000Z', NOW)).toBe(0)
  })
  it('formata relógio e minutos', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(65_000)).toBe('01:05')
    expect(formatClock(3_729_000)).toBe('1:02:09')
    expect(formatMinutes(20_000)).toBe('menos de 1 min')
    expect(formatMinutes(12 * 60000)).toBe('12 min')
    expect(formatMinutes(65 * 60000)).toBe('1 h 05')
  })
  it('hora no fuso de Brasília', () => {
    expect(formatBrasilTime('2026-11-19T15:00:00.000Z')).toBe('12:00')
    expect(formatBrasilTime('2026-11-20T02:30:00.000Z')).toBe('23:30')
    expect(formatBrasilTime(null)).toBe('-')
  })
  it('mesmo dia em Brasília (23h local não vira dia seguinte)', () => {
    expect(isSameBrasilDay('2026-11-20T01:30:00.000Z', new Date('2026-11-19T20:00:00.000Z'))).toBe(true)
    expect(isSameBrasilDay('2026-11-20T04:00:00.000Z', new Date('2026-11-19T20:00:00.000Z'))).toBe(false)
  })
  it('tom da espera', () => {
    expect(waitTone(5 * 60000)).toBe('ok')
    expect(waitTone(20 * 60000)).toBe('wait')
    expect(waitTone(45 * 60000)).toBe('warn')
  })
  it('médias ignoram dados absurdos', () => {
    const m = attendanceMetrics([
      { arrived_at: '2026-11-19T10:00:00Z', started_at: '2026-11-19T10:10:00Z', finished_at: '2026-11-19T10:40:00Z' },
      { arrived_at: '2026-11-19T11:00:00Z', started_at: '2026-11-19T11:20:00Z', finished_at: '2026-11-19T12:10:00Z' },
      { arrived_at: '2026-11-19T11:00:00Z', started_at: '2026-11-19T10:00:00Z', finished_at: '2026-11-19T09:00:00Z' }, // negativo
      { started_at: '2026-11-19T01:00:00Z', finished_at: '2026-11-19T20:00:00Z' }, // 19 h: esquecido aberto
      { arrived_at: '2026-11-19T12:00:00Z' },
    ])
    expect(m.consultCount).toBe(2)
    expect(m.consultAvgMin).toBe(40)
    expect(m.waitCount).toBe(2)
    expect(m.waitAvgMin).toBe(15)
    expect(attendanceMetrics([])).toEqual({ consultAvgMin: null, consultCount: 0, waitAvgMin: null, waitCount: 0 })
  })
})

describe('buildQueue', () => {
  const day = '2026-11-19'
  const mk = (id: string, over: Partial<QueueAppt>): QueueAppt => ({
    id, status: 'agendado', scheduled_at: '2026-11-19T13:00:00.000Z', professional_id: 'p1',
    patients: { name: `Paciente ${id}` }, professionals: { name: 'Dra. Ana' }, ...over,
  })
  it('separa por etapa, ordena e calcula espera por profissional', () => {
    const q = buildQueue([
      mk('a', { status: 'arrived', arrived_at: '2026-11-19T14:50:00.000Z' }),
      mk('b', { status: 'arrived', arrived_at: '2026-11-19T14:30:00.000Z' }),
      mk('c', { status: 'arrived', arrived_at: '2026-11-19T14:55:00.000Z', professional_id: 'p2', professionals: { name: 'Dr. Bruno' } }),
      mk('d', { status: 'in_progress', arrived_at: '2026-11-19T14:00:00.000Z', started_at: '2026-11-19T14:10:00.000Z' }),
      mk('e', { status: 'concluido', started_at: '2026-11-19T12:00:00.000Z', finished_at: '2026-11-19T12:30:00.000Z' }),
      mk('f', { status: 'concluido', started_at: '2026-11-19T13:00:00.000Z', finished_at: '2026-11-19T13:40:00.000Z' }),
      mk('g', { status: 'cancelado' }),
      mk('h', { status: 'confirmado' }),
      mk('i', { status: 'arrived', arrived_at: '2026-11-18T14:00:00.000Z', scheduled_at: '2026-11-18T14:00:00.000Z' }), // outro dia
    ], day, NOW)
    expect(q.waiting.map(x => x.id)).toEqual(['b', 'a', 'c'])
    expect(q.inProgress.map(x => x.id)).toEqual(['d'])
    expect(q.done.map(x => x.id)).toEqual(['f', 'e'])
    expect(q.waiting[0].waitedMs).toBe(30 * 60000)
    expect(q.inProgress[0].waitedMs).toBe(10 * 60000)
    expect(q.byProfessional[0]).toMatchObject({ professionalId: 'p1', count: 2, longestMs: 30 * 60000 })
    expect(q.byProfessional[1]).toMatchObject({ professionalId: 'p2', count: 1 })
  })
  it('dia vazio', () => {
    expect(buildQueue([], day, NOW)).toEqual({ waiting: [], inProgress: [], done: [], byProfessional: [] })
  })
})
