import { describe, it, expect } from 'vitest'
import {
  addDaysKey, appointmentsInScope, describeRule, generateSeriesDates, instantOf, MAX_SERIES, normalizeWeekdays,
  planFollowingRanges, planOccurrences, shiftedInstant, toBusyRanges, weekdayOfKey, type SeriesRule,
} from './series'
import { toLocalInput } from './slots'
import { hojeBrasil } from '../brasilDate'

const rule = (over: Partial<SeriesRule>): SeriesRule => ({
  frequency: 'semanal', weekdays: [], startDate: '2026-11-04', endMode: 'contagem', occurrences: 4, untilDate: '', ...over,
})

describe('datas', () => {
  it('weekdayOfKey e addDaysKey não dependem do fuso', () => {
    expect(weekdayOfKey('2026-11-04')).toBe(3) // quarta
    expect(addDaysKey('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDaysKey('2028-02-28', 1)).toBe('2028-02-29')
  })
  it('hojeBrasil devolve uma data de calendário utilizável como início', () => {
    const hoje = hojeBrasil(new Date('2026-11-10T02:30:00Z')) // 23:30 do dia 9 em Brasília
    expect(hoje).toBe('2026-11-09')
    expect(generateSeriesDates(rule({ startDate: hoje, occurrences: 2 })).dates).toEqual(['2026-11-09', '2026-11-16'])
  })
})

describe('normalizeWeekdays', () => {
  it('sempre inclui o dia da data de início e limita a 3', () => {
    expect(normalizeWeekdays('2026-11-04', [])).toEqual([3])
    expect(normalizeWeekdays('2026-11-04', [1, 5])).toEqual([1, 3, 5])
    expect(normalizeWeekdays('2026-11-04', [1, 2, 5, 6])).toEqual([1, 2, 3]) // o início (qua) fica e só cabem mais 2
  })
  it('ignora repetidos e valores inválidos', () => {
    expect(normalizeWeekdays('2026-11-04', [3, 3, 9, -1, 1.5])).toEqual([3])
  })
})

describe('generateSeriesDates', () => {
  it('semanal: 1x por semana, N ocorrências', () => {
    expect(generateSeriesDates(rule({ occurrences: 4 })).dates).toEqual(['2026-11-04', '2026-11-11', '2026-11-18', '2026-11-25'])
  })
  it('semanal 2x por semana começa pela data escolhida e não volta no tempo', () => {
    // início quarta 4/11; seg e qua: a segunda 2/11 fica de fora
    const { dates } = generateSeriesDates(rule({ weekdays: [1], occurrences: 5 }))
    expect(dates).toEqual(['2026-11-04', '2026-11-09', '2026-11-11', '2026-11-16', '2026-11-18'])
  })
  it('semanal 3x por semana', () => {
    const { dates } = generateSeriesDates(rule({ startDate: '2026-11-02', weekdays: [3, 5], occurrences: 6 }))
    expect(dates).toEqual(['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11', '2026-11-13'])
  })
  it('quinzenal pula uma semana', () => {
    expect(generateSeriesDates(rule({ frequency: 'quinzenal', occurrences: 3 })).dates).toEqual(['2026-11-04', '2026-11-18', '2026-12-02'])
  })
  it('quinzenal com 2 dias por semana', () => {
    const { dates } = generateSeriesDates(rule({ frequency: 'quinzenal', weekdays: [5], occurrences: 4 }))
    expect(dates).toEqual(['2026-11-04', '2026-11-06', '2026-11-18', '2026-11-20'])
  })
  it('mensal mantém o dia e cai no último dia do mês curto sem acumular o recuo', () => {
    const { dates } = generateSeriesDates(rule({ frequency: 'mensal', startDate: '2026-01-31', occurrences: 4 }))
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })
  it('mensal atravessa a virada do ano e ano bissexto', () => {
    expect(generateSeriesDates(rule({ frequency: 'mensal', startDate: '2027-11-30', occurrences: 4 })).dates)
      .toEqual(['2027-11-30', '2027-12-30', '2028-01-30', '2028-02-29'])
  })
  it('até uma data: inclusive, e a data final pode cair fora dos dias da série', () => {
    const { dates } = generateSeriesDates(rule({ endMode: 'data', untilDate: '2026-11-25' }))
    expect(dates).toEqual(['2026-11-04', '2026-11-11', '2026-11-18', '2026-11-25'])
    expect(generateSeriesDates(rule({ endMode: 'data', untilDate: '2026-11-24' })).dates).toHaveLength(3)
  })
  it('data final antes do início ou inválida não gera nada', () => {
    expect(generateSeriesDates(rule({ endMode: 'data', untilDate: '2026-10-01' })).dates).toEqual([])
    expect(generateSeriesDates(rule({ endMode: 'data', untilDate: '' })).dates).toEqual([])
    expect(generateSeriesDates(rule({ startDate: '2026-02-31' })).dates).toEqual([])
  })
  it('corta no teto e avisa', () => {
    const r = generateSeriesDates(rule({ occurrences: 500 }))
    expect(r.dates).toHaveLength(MAX_SERIES)
    expect(r.truncated).toBe(true)
    expect(generateSeriesDates(rule({ occurrences: MAX_SERIES })).truncated).toBe(false)
  })
  it('contagem zero ou negativa não gera nada', () => {
    expect(generateSeriesDates(rule({ occurrences: 0 })).dates).toEqual([])
    expect(generateSeriesDates(rule({ occurrences: -3 })).dates).toEqual([])
  })
  it('virada de ano na semanal', () => {
    expect(generateSeriesDates(rule({ startDate: '2026-12-30', occurrences: 3 })).dates).toEqual(['2026-12-30', '2027-01-06', '2027-01-13'])
  })
})

describe('describeRule', () => {
  it('resume a regra', () => {
    expect(describeRule(rule({ weekdays: [1], occurrences: 8 }))).toBe('Toda semana, seg e qua, 8 vezes')
    expect(describeRule(rule({ frequency: 'mensal', endMode: 'data', untilDate: '2027-01-31' }))).toBe('Todo mês, até 31/01/2027')
  })
})

describe('planOccurrences', () => {
  const dates = ['2026-11-04', '2026-11-11', '2026-11-18']
  it('tudo livre entra', () => {
    const p = planOccurrences(dates, '09:00', 60, { busy: [], canExtra: false })
    expect(p.map(o => o.state)).toEqual(['ok', 'ok', 'ok'])
    expect(p.every(o => o.include)).toBe(true)
    expect(p.map(o => o.index)).toEqual([1, 2, 3])
  })
  it('conflito com consulta ou bloqueio sai da lista por padrão', () => {
    const busy = toBusyRanges([
      { scheduled_at: new Date(2026, 10, 11, 9, 30).toISOString(), duration_minutes: 30 },
      { scheduled_at: new Date(2026, 10, 18, 8, 0).toISOString(), duration_minutes: 120, status: 'bloqueado' },
    ])
    const p = planOccurrences(dates, '09:00', 60, { busy, canExtra: true })
    expect(p.map(o => o.state)).toEqual(['ok', 'conflito', 'conflito'])
    expect(p.map(o => o.include)).toEqual([true, false, false])
    expect(p[2].conflictWith).toBe('Bloqueio')
  })
  it('encostar não é conflito', () => {
    const busy = toBusyRanges([{ scheduled_at: new Date(2026, 10, 4, 10, 0).toISOString(), duration_minutes: 30 }])
    expect(planOccurrences(['2026-11-04'], '09:00', 60, { busy, canExtra: false })[0].state).toBe('ok')
  })
  it('fora da escala só entra para quem pode encaixar', () => {
    const inSchedule = (d: string) => d !== '2026-11-11'
    expect(planOccurrences(dates, '09:00', 60, { busy: [], inSchedule, canExtra: false }).map(o => o.include)).toEqual([true, false, true])
    expect(planOccurrences(dates, '09:00', 60, { busy: [], inSchedule, canExtra: true }).map(o => o.include)).toEqual([true, true, true])
    expect(planOccurrences(dates, '09:00', 60, { busy: [], inSchedule, canExtra: true })[1].state).toBe('fora_escala')
  })
  it('o horário gravado volta igual ao digitado (hora local, sem deslocar)', () => {
    const [o] = planOccurrences(['2026-11-04'], '14:30', 45, { busy: [], canExtra: false })
    expect(toLocalInput(new Date(o.startMs).toISOString())).toBe('2026-11-04T14:30')
    expect(o.endMs - o.startMs).toBe(45 * 60000)
    expect(o.startMs).toBe(instantOf('2026-11-04', '14:30'))
  })
})

describe('appointmentsInScope', () => {
  const mk = (id: string, day: number, status: string, series = 's1') => ({ id, series_id: series, scheduled_at: new Date(2026, 10, day, 9).toISOString(), status })
  const all = [mk('a', 4, 'concluido'), mk('b', 11, 'agendado'), mk('c', 18, 'confirmado'), mk('d', 25, 'cancelado'), mk('e', 2, 'agendado', 's2'), mk('f', 30, 'faltou')]
  it('só este', () => {
    expect(appointmentsInScope(all, all[1], 'this').map(a => a.id)).toEqual(['b'])
  })
  it('este e os próximos: só agendado/confirmado da mesma série, depois dele', () => {
    expect(appointmentsInScope(all, all[1], 'following').map(a => a.id)).toEqual(['b', 'c'])
    expect(appointmentsInScope(all, all[0], 'following').map(a => a.id)).toEqual(['a', 'b', 'c'])
  })
  it('consulta sem série só alcança ela mesma', () => {
    const solo = { id: 'z', series_id: null, scheduled_at: all[1].scheduled_at, status: 'agendado' }
    expect(appointmentsInScope([...all, solo], solo, 'following').map(a => a.id)).toEqual(['z'])
  })
})

describe('shiftedInstant', () => {
  const iso = new Date(2026, 10, 11, 9, 0).toISOString()
  it('troca só o horário', () => {
    expect(toLocalInput(shiftedInstant(iso, { time: '15:30' }).toISOString())).toBe('2026-11-11T15:30')
  })
  it('desloca dias mantendo o horário, inclusive de um mês para o outro', () => {
    expect(toLocalInput(shiftedInstant(iso, { dayDelta: 21 }).toISOString())).toBe('2026-12-02T09:00')
    expect(toLocalInput(shiftedInstant(iso, { dayDelta: -1, time: '10:00' }).toISOString())).toBe('2026-11-10T10:00')
  })
})

describe('planFollowingRanges', () => {
  const at = (day: number, h = 9) => new Date(2026, 10, day, h).toISOString()
  const targets = [
    { id: 'a', scheduled_at: at(11), duration_minutes: 60, professional_id: 'p1' },
    { id: 'b', scheduled_at: at(18), duration_minutes: null, professional_id: 'p2' }, // trocada no passado
  ]
  it('mantém o profissional de cada consulta quando a mudança não o troca', () => {
    const r = planFollowingRanges(targets, { fields: {}, time: '10:00' })
    expect(r.map(x => x.professionalId)).toEqual(['p1', 'p2'])
    expect(toLocalInput(new Date(r[0].start).toISOString())).toBe('2026-11-11T10:00')
    expect(r[1].end - r[1].start).toBe(60 * 60000) // duração nula = 60 min
  })
  it('usa o profissional novo para todas quando a mudança o define', () => {
    const r = planFollowingRanges(targets, { fields: { professional_id: 'p3' } })
    expect(r.map(x => x.professionalId)).toEqual(['p3', 'p3'])
  })
  it('aplica nova duração e deslocamento de dias', () => {
    const r = planFollowingRanges(targets, { fields: { duration_minutes: 30 }, dayDelta: 1 })
    expect(r[0].end - r[0].start).toBe(30 * 60000)
    expect(toLocalInput(new Date(r[0].start).toISOString())).toBe('2026-11-12T09:00')
  })
})
