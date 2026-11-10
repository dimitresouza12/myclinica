import { describe, it, expect } from 'vitest'
import { DEFAULT_SHIFTS } from './availability'
import { apptOutsideChoice, choiceFromSchedule, dayRowsFromDraft, isShiftOn, patternFromWeek, rowsToCopyPrevWeek, shiftDate, toggleOff, toggleShift, type DayChoice } from './scheduleDraft'

const [manha, tarde] = DEFAULT_SHIFTS
const unset: DayChoice = { kind: 'unset' }

describe('toggleShift', () => {
  it('liga a manhã num dia por definir', () => {
    const c = toggleShift(unset, manha)
    expect(c.kind).toBe('on')
    expect(isShiftOn(c, manha)).toBe(true)
    expect(isShiftOn(c, tarde)).toBe(false)
  })
  it('mantém os turnos em ordem de horário', () => {
    const c = toggleShift(toggleShift(unset, tarde), manha)
    expect(c.kind === 'on' && c.windows.map(w => w.shift_id)).toEqual(['manha', 'tarde'])
  })
  it('desligar o último turno volta a por definir', () => {
    expect(toggleShift(toggleShift(unset, manha), manha)).toEqual(unset)
  })
  it('sai de "não atende" ao marcar um turno', () => {
    expect(toggleShift({ kind: 'off' }, tarde).kind).toBe('on')
  })
})

describe('toggleOff', () => {
  it('alterna entre não atende e por definir', () => {
    expect(toggleOff(unset)).toEqual({ kind: 'off' })
    expect(toggleOff({ kind: 'off' })).toEqual(unset)
  })
})

describe('choiceFromSchedule', () => {
  const sched = { enabled: true, pattern: [{ weekday: 2, windows: [{ start: '08:00', end: '12:00', shift_id: 'manha' }] }], days: [{ date: '2026-11-04', works: false, windows: [] }] }
  it('lê a rotina, a escala da data e o por definir', () => {
    expect(choiceFromSchedule(sched, '2026-11-03', DEFAULT_SHIFTS).kind).toBe('on') // terça
    expect(choiceFromSchedule(sched, '2026-11-04', DEFAULT_SHIFTS)).toEqual({ kind: 'off' })
    expect(choiceFromSchedule(undefined, '2026-11-03', DEFAULT_SHIFTS)).toEqual(unset)
  })
  it('dia todo (janelas vazias) vira todos os turnos', () => {
    const s = { enabled: true, pattern: [], days: [{ date: '2026-11-03', works: true, windows: [] }] }
    const c = choiceFromSchedule(s, '2026-11-03', DEFAULT_SHIFTS)
    expect(c.kind === 'on' && c.windows).toHaveLength(2)
  })
})

describe('apptOutsideChoice', () => {
  const onManha = toggleShift(unset, manha)
  it('dentro, fora e por definir', () => {
    expect(apptOutsideChoice(onManha, '09:00', 30)).toBe(false)
    expect(apptOutsideChoice(onManha, '11:30', 60)).toBe(true) // termina 12:30
    expect(apptOutsideChoice(onManha, '14:00', 30)).toBe(true)
    expect(apptOutsideChoice({ kind: 'off' }, '09:00', 30)).toBe(true)
    expect(apptOutsideChoice(unset, '09:00', 30)).toBe(false)
  })
})

describe('gravação', () => {
  it('dayRowsFromDraft separa o que grava do que apaga', () => {
    const r = dayRowsFromDraft({ '2026-11-03': toggleShift(unset, manha), '2026-11-04': { kind: 'off' }, '2026-11-05': unset })
    expect(r.upsert.map(x => [x.date, x.works])).toEqual([['2026-11-03', true], ['2026-11-04', false]])
    expect(r.clear).toEqual(['2026-11-05'])
  })
  it('patternFromWeek usa o dia da semana e limpa os que não atendem', () => {
    const r = patternFromWeek({ '2026-11-03': toggleShift(unset, manha), '2026-11-04': { kind: 'off' } }) // terça e quarta
    expect(r.upsert.map(x => x.weekday)).toEqual([2])
    expect(r.clear).toEqual([0, 1, 3, 4, 5, 6])
  })
})

describe('rowsToCopyPrevWeek', () => {
  const win = [{ start: '08:00', end: '12:00', shift_id: 'manha' }]
  const sched = { enabled: true, pattern: [], days: [
    { date: '2026-10-27', works: true, windows: win },   // terça da semana anterior
    { date: '2026-10-28', works: false, windows: [] },   // quarta da semana anterior
    { date: '2026-11-04', works: true, windows: [] },    // quarta desta semana já definida
  ] }
  it('repete o que o dia tinha na semana anterior, sem mexer no que já está definido', () => {
    const rows = rowsToCopyPrevWeek(sched, ['2026-11-03', '2026-11-04', '2026-11-05'])
    expect(rows).toEqual([{ date: '2026-11-03', works: true, windows: win }]) // 11-04 já definido; 11-05 não tinha nada na anterior
  })
  it('sem escala ligada não copia nada', () => {
    expect(rowsToCopyPrevWeek(undefined, ['2026-11-03'])).toEqual([])
  })
  it('shiftDate atravessa mês', () => {
    expect(shiftDate('2026-11-03', -7)).toBe('2026-10-27')
  })
})
