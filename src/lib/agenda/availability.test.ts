import { describe, it, expect } from 'vitest'
import { closedRanges, undefinedDaysAhead, dayStatus, freeSlotsOfDay, fitsWindows, slotInSchedule, describeDay, weekDates, summarizeSchedule, weekdayOf, NO_SCHEDULE, type ScheduleData } from './availability'
import { nextFreeSlots } from './slots'

const manha = { start: '08:00', end: '12:00', shift_id: 'manha' }
const tarde = { start: '13:00', end: '18:00', shift_id: 'tarde' }

// 2026-11-03 é terça, 04 quarta, 05 quinta
const rotina: ScheduleData = { enabled: true, pattern: [{ weekday: 2, windows: [manha] }, { weekday: 4, windows: [manha, tarde] }], days: [] }

describe('dayStatus', () => {
  it('sem escala ligada, atende a qualquer hora', () => {
    expect(dayStatus(NO_SCHEDULE, '2026-11-03')).toEqual({ state: 'sem_escala' })
    expect(dayStatus(undefined, '2026-11-03')).toEqual({ state: 'sem_escala' })
  })
  it('lê o dia da semana da rotina', () => {
    expect(weekdayOf('2026-11-03')).toBe(2)
    expect(dayStatus(rotina, '2026-11-03')).toEqual({ state: 'atende', windows: [manha], source: 'rotina' })
    expect(dayStatus(rotina, '2026-11-04')).toEqual({ state: 'nao_atende', source: 'rotina' })
  })
  it('a escala da data vale mais que a rotina', () => {
    const s: ScheduleData = { ...rotina, days: [{ date: '2026-11-03', works: false, windows: [] }, { date: '2026-11-04', works: true, windows: [tarde] }] }
    expect(dayStatus(s, '2026-11-03')).toEqual({ state: 'nao_atende', source: 'dia' })
    expect(dayStatus(s, '2026-11-04')).toEqual({ state: 'atende', windows: [tarde], source: 'dia' })
  })
  it('sem rotina e sem linha do dia, fica por definir', () => {
    const s: ScheduleData = { enabled: true, pattern: [], days: [{ date: '2026-11-03', works: true, windows: [manha] }] }
    expect(dayStatus(s, '2026-11-03').state).toBe('atende')
    expect(dayStatus(s, '2026-11-10')).toEqual({ state: 'por_definir' })
  })
  it('rotina com o dia sem janelas conta como não atende', () => {
    const s: ScheduleData = { enabled: true, pattern: [{ weekday: 2, windows: [] }], days: [] }
    expect(dayStatus(s, '2026-11-03').state).toBe('nao_atende')
  })
})

describe('fitsWindows e slotInSchedule', () => {
  it('a consulta inteira precisa caber na janela', () => {
    expect(fitsWindows('08:00', 60, [manha])).toBe(true)
    expect(fitsWindows('11:00', 60, [manha])).toBe(true)
    expect(fitsWindows('11:30', 60, [manha])).toBe(false)
    expect(fitsWindows('12:00', 30, [manha])).toBe(false)
  })
  it('janelas vazias significam o dia todo', () => {
    expect(fitsWindows('20:00', 30, [])).toBe(true)
  })
  it('respeita o estado do dia', () => {
    expect(slotInSchedule(NO_SCHEDULE, '2026-11-03', '20:00', 30)).toBe(true)
    expect(slotInSchedule(rotina, '2026-11-03', '09:00', 30)).toBe(true)
    expect(slotInSchedule(rotina, '2026-11-03', '14:00', 30)).toBe(false) // terça só de manhã
    expect(slotInSchedule(rotina, '2026-11-04', '09:00', 30)).toBe(false) // quarta não atende
    expect(slotInSchedule({ enabled: true, pattern: [], days: [] }, '2026-11-03', '09:00', 30)).toBe(false) // por definir
  })
})

describe('describeDay e summarizeSchedule', () => {
  it('descreve turnos pelo nome e janelas livres pelo horário', () => {
    expect(describeDay({ state: 'atende', windows: [manha, tarde], source: 'rotina' })).toBe('Manhã · Tarde')
    expect(describeDay({ state: 'atende', windows: [{ start: '09:00', end: '11:00' }], source: 'dia' })).toBe('09:00–11:00')
    expect(describeDay({ state: 'nao_atende', source: 'dia' })).toBe('Não atende')
    expect(describeDay({ state: 'por_definir' })).toBe('Por definir')
  })
  it('semana começa no domingo', () => {
    const d = weekDates(new Date(2026, 10, 4)) // quarta
    expect(d[0]).toBe('2026-11-01')
    expect(d[6]).toBe('2026-11-07')
  })
  it('resume a semana em uma linha', () => {
    expect(summarizeSchedule(NO_SCHEDULE, new Date(2026, 10, 4))).toMatch(/qualquer horário/)
    expect(summarizeSchedule(rotina, new Date(2026, 10, 4))).toBe('Atende ter, qui')
    const so: ScheduleData = { enabled: true, pattern: [{ weekday: 2, windows: [manha] }, { weekday: 4, windows: [manha] }], days: [] }
    expect(summarizeSchedule(so, new Date(2026, 10, 4))).toBe('Atende ter, qui · manhã')
    expect(summarizeSchedule({ enabled: true, pattern: [], days: [] }, new Date(2026, 10, 4))).toMatch(/por definir/)
  })
})

describe('nextFreeSlots com escala', () => {
  const SLOTS = ['08:00', '08:30', '09:00', '13:00', '13:30']
  it('só devolve horários dentro da escala', () => {
    const from = new Date(2026, 10, 3, 7, 0) // terça, só manhã
    const r = nextFreeSlots([], {
      professionalId: 'p1', durationMin: 30, slots: SLOTS, from, count: 4,
      isOpen: (d, s) => slotInSchedule(rotina, d, s, 30),
    })
    expect(r.map(x => `${x.date} ${x.time}`)).toEqual(['2026-11-03 08:00', '2026-11-03 08:30', '2026-11-03 09:00', '2026-11-05 08:00'])
  })
})

describe('freeSlotsOfDay', () => {
  const SLOTS = ['08:00', '08:30', '09:00', '09:30', '13:00']
  const at = (h: number, m = 0) => new Date(2026, 10, 3, h, m).toISOString()
  it('tira o fora da escala e o ocupado', () => {
    const appts = [{ status: 'agendado', scheduled_at: at(8, 30), duration_minutes: 30, professional_id: 'p1' }]
    expect(freeSlotsOfDay(appts, { professionalId: 'p1', dateStr: '2026-11-03', durationMin: 30, slots: SLOTS, schedule: rotina }))
      .toEqual(['08:00', '09:00', '09:30']) // terça: só manhã; 08:30 ocupado; 13:00 fora da escala
  })
  it('sem escala, só o ocupado sai', () => {
    expect(freeSlotsOfDay([], { professionalId: 'p1', dateStr: '2026-11-03', durationMin: 30, slots: SLOTS })).toEqual(SLOTS)
  })
})

describe('closedRanges', () => {
  const manhaTarde = { enabled: true, pattern: [{ weekday: 2, windows: [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '18:00' }] }], days: [] }
  it('sem escala: nada fechado', () => {
    expect(closedRanges(undefined, '2026-11-03', 360, 1260)).toEqual([])
  })
  it('terça com manhã e tarde: fecha antes, no almoço e depois', () => {
    expect(closedRanges(manhaTarde, '2026-11-03', 360, 1260)).toEqual([
      { start: 360, end: 480 }, { start: 720, end: 780 }, { start: 1080, end: 1260 },
    ])
  })
  it('não atende e por definir fecham o dia todo', () => {
    expect(closedRanges(manhaTarde, '2026-11-04', 360, 1260)).toEqual([{ start: 360, end: 1260 }]) // quarta sem linha na rotina
    expect(closedRanges({ enabled: true, pattern: [], days: [] }, '2026-11-04', 360, 1260)).toEqual([{ start: 360, end: 1260 }])
  })
})

describe('undefinedDaysAhead', () => {
  it('conta só os por definir; sem escala é zero', () => {
    const only = { enabled: true, pattern: [], days: [{ date: '2026-11-04', works: true, windows: [] }] }
    expect(undefinedDaysAhead(only, new Date(2026, 10, 4), 3)).toBe(3) // 05, 06 e 07 por definir
    expect(undefinedDaysAhead(undefined, new Date(2026, 10, 4), 3)).toBe(0)
  })
})
