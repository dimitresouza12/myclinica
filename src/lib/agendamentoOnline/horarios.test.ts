import { describe, expect, it } from 'vitest'
import type { ScheduleData } from '@/lib/agenda/availability'
import { bookingHorizon, freeSlotsByDay, freeSlotsOfDay, type BusyRange, type OnlineRules } from './horarios'
import { zonedWallToUtcMs } from './tz'

const TZ = 'America/Sao_Paulo' // UTC-3
const at = (date: string, hhmm: string) => zonedWallToUtcMs(date, hhmm, TZ)
const busy = (date: string, from: string, toDate: string, to: string): BusyRange => ({ startMs: at(date, from), endMs: at(toDate, to) })

// terça-feira 01/12/2026, 10:00 em Brasília
const NOW = at('2026-12-01', '10:00')
const RULES: OnlineRules = { timezone: TZ, minNoticeHours: 4, maxDaysAhead: 30, stepMinutes: 30, opening: { start: '08:00', end: '12:00' } }
const day = (over: Partial<Parameters<typeof freeSlotsOfDay>[0]> = {}) =>
  freeSlotsOfDay({ dateKey: '2026-12-02', nowMs: NOW, rules: RULES, durationMin: 30, busy: [], ...over })

describe('grade e duração', () => {
  it('oferece toda a grade do horário de funcionamento num dia livre', () => {
    expect(day()).toEqual(['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30'])
  })
  it('a consulta inteira tem de terminar até o fim do horário de funcionamento', () => {
    expect(day({ durationMin: 60 }).at(-1)).toBe('11:00')
    expect(day({ durationMin: 45 }).at(-1)).toBe('11:00') // 11:00 termina 11:45; 11:30 terminaria 12:15
    expect(day({ durationMin: 90 }).at(-1)).toBe('10:30')
  })
  it('respeita o passo da clínica', () => {
    expect(day({ rules: { ...RULES, stepMinutes: 60 } })).toEqual(['08:00', '09:00', '10:00', '11:00'])
    expect(day({ rules: { ...RULES, stepMinutes: 20 } }).slice(0, 4)).toEqual(['08:00', '08:20', '08:40', '09:00'])
  })
})

describe('antecedência mínima e janela máxima', () => {
  it('hoje, às 10:00, com 4 h de antecedência, nada cabe antes de 14:00 (e a clínica fecha às 12:00)', () => {
    expect(day({ dateKey: '2026-12-01' })).toEqual([])
  })
  it('com antecedência menor, hoje oferece só o que ainda vem pela frente', () => {
    const r = { ...RULES, minNoticeHours: 1 }
    expect(day({ dateKey: '2026-12-01', rules: r })).toEqual(['11:00', '11:30'])
  })
  it('antecedência zero aceita o horário que começa agora, não o que já começou', () => {
    const r = { ...RULES, minNoticeHours: 0 }
    expect(day({ dateKey: '2026-12-01', rules: r })).toEqual(['10:00', '10:30', '11:00', '11:30'])
  })
  it('o último dia da janela entra; o seguinte não; dia passado nunca', () => {
    const h = bookingHorizon(NOW, RULES)
    expect(h).toEqual({ first: '2026-12-01', last: '2026-12-31' })
    expect(day({ dateKey: '2026-12-31' })).toHaveLength(8)
    expect(day({ dateKey: '2027-01-01' })).toEqual([])
    expect(day({ dateKey: '2026-11-30' })).toEqual([])
  })
  it('"hoje" é o dia do fuso da clínica, não o do servidor', () => {
    // 02:30 UTC de 02/12 ainda é 01/12 23:30 em Brasília
    const h = bookingHorizon(Date.UTC(2026, 11, 2, 2, 30), RULES)
    expect(h.first).toBe('2026-12-01')
  })
})

describe('consultas e bloqueios', () => {
  it('uma consulta tira o horário dela; quem começa quando ela termina continua livre', () => {
    const r = day({ busy: [busy('2026-12-02', '09:00', '2026-12-02', '09:30')] })
    expect(r).not.toContain('09:00')
    expect(r).toContain('08:30')
    expect(r).toContain('09:30')
  })
  it('consulta longa tira também o horário anterior que invadiria o dela', () => {
    const r = day({ durationMin: 60, busy: [busy('2026-12-02', '09:00', '2026-12-02', '10:00')] })
    expect(r).toEqual(['08:00', '10:00', '10:30', '11:00'])
  })
  it('consulta que atravessa a meia-noite vinda do dia anterior bloqueia o começo da manhã', () => {
    const r = day({ busy: [busy('2026-12-01', '23:30', '2026-12-02', '08:30')] })
    expect(r[0]).toBe('08:30')
    expect(r).not.toContain('08:00')
  })
  it('bloqueio do dia inteiro (da clínica ou do profissional) zera o dia', () => {
    expect(day({ busy: [busy('2026-12-02', '00:00', '2026-12-03', '00:00')] })).toEqual([])
  })
  it('vários intervalos somam', () => {
    const r = day({ busy: [busy('2026-12-02', '08:00', '2026-12-02', '09:00'), busy('2026-12-02', '10:00', '2026-12-02', '11:00')] })
    expect(r).toEqual(['09:00', '09:30', '11:00', '11:30'])
  })
  it('ocupado em outro dia não interfere', () => {
    expect(day({ busy: [busy('2026-12-03', '08:00', '2026-12-03', '12:00')] })).toHaveLength(8)
  })
})

describe('escala do profissional', () => {
  const wedOnly: ScheduleData = { enabled: true, pattern: [{ weekday: 3, windows: [{ start: '09:00', end: '11:00' }] }], days: [] } // 02/12 é quarta
  it('sem escala ligada, vale a grade toda', () => {
    expect(day({ schedule: undefined })).toHaveLength(8)
    expect(day({ schedule: { enabled: false, pattern: [], days: [] } })).toHaveLength(8)
  })
  it('a rotina semanal limita os horários às janelas', () => {
    expect(day({ schedule: wedOnly })).toEqual(['09:00', '09:30', '10:00', '10:30'])
  })
  it('a consulta inteira tem de caber na janela', () => {
    expect(day({ schedule: wedOnly, durationMin: 60 })).toEqual(['09:00', '09:30', '10:00'])
  })
  it('dia da semana sem linha na rotina não atende', () => {
    expect(day({ dateKey: '2026-12-03', schedule: wedOnly })).toEqual([]) // quinta
  })
  it('escala ligada sem nenhuma rotina nem dia marcado é "por definir": não oferece', () => {
    expect(day({ schedule: { enabled: true, pattern: [], days: [] } })).toEqual([])
  })
  it('a escala da data vence a rotina: não atende', () => {
    const s: ScheduleData = { ...wedOnly, days: [{ date: '2026-12-02', works: false, windows: [] }] }
    expect(day({ schedule: s })).toEqual([])
  })
  it('a escala da data vence a rotina: janela própria', () => {
    const s: ScheduleData = { ...wedOnly, days: [{ date: '2026-12-02', works: true, windows: [{ start: '08:00', end: '09:00' }] }] }
    expect(day({ schedule: s })).toEqual(['08:00', '08:30'])
  })
  it('data que atende sem janelas atende o dia todo (dentro do horário da clínica)', () => {
    const s: ScheduleData = { ...wedOnly, days: [{ date: '2026-12-02', works: true, windows: [] }] }
    expect(day({ schedule: s })).toHaveLength(8)
  })
  it('escala e consultas se combinam', () => {
    const r = day({ schedule: wedOnly, busy: [busy('2026-12-02', '09:30', '2026-12-02', '10:00')] })
    expect(r).toEqual(['09:00', '10:00', '10:30'])
  })
})

describe('freeSlotsByDay', () => {
  it('lista só os dias com horário, em ordem', () => {
    const r = freeSlotsByDay({
      fromKey: '2026-12-02', days: 3, nowMs: NOW, rules: RULES, durationMin: 30,
      busy: [busy('2026-12-03', '00:00', '2026-12-04', '00:00')],
    })
    expect(r.map(d => d.date)).toEqual(['2026-12-02', '2026-12-04'])
    expect(r[0].times).toHaveLength(8)
  })
  it('dias além da janela ficam de fora', () => {
    const r = freeSlotsByDay({ fromKey: '2026-12-30', days: 5, nowMs: NOW, rules: RULES, durationMin: 30, busy: [] })
    expect(r.map(d => d.date)).toEqual(['2026-12-30', '2026-12-31'])
  })
})
