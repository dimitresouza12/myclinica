import { describe, it, expect } from 'vitest'
import { buildBusyMap, conflictInSpan, toLocalInput, isClinicBlock, overlaps, nextFreeSlots, type SlotAppt } from './slots'

const SLOTS = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30']
const at = (h: number, m = 0) => new Date(2026, 10, 3, h, m).toISOString()
const appt = (over: Partial<SlotAppt>): SlotAppt => ({ status: 'agendado', scheduled_at: at(9), duration_minutes: 30, professional_id: 'p1', ...over })

describe('toLocalInput', () => {
  it('devolve a hora local, não a do ISO em UTC', () => {
    expect(toLocalInput(at(8))).toBe('2026-11-03T08:00')
    expect(toLocalInput(at(23, 30))).toBe('2026-11-03T23:30')
    expect(toLocalInput(at(0, 5))).toBe('2026-11-03T00:05')
  })
  it('vai e volta sem deslocar o horário', () => {
    const iso = at(14, 30)
    expect(new Date(toLocalInput(iso)).toISOString()).toBe(iso)
  })
})

describe('buildBusyMap', () => {
  const base = { dateStr: '2026-11-03', professionalId: 'p1', slots: SLOTS }

  it('marca as casas ocupadas pela duração da consulta', () => {
    const map = buildBusyMap([appt({ scheduled_at: at(9), duration_minutes: 60, patients: { name: 'Maria Souza' } })], base)
    expect([...map.keys()]).toEqual(['09:00', '09:30'])
    expect(map.get('09:00')).toBe('Maria')
  })

  it('ignora cancelados e a consulta em edição', () => {
    const list = [appt({ status: 'cancelado' }), appt({ id: 'x', scheduled_at: at(10) })]
    expect(buildBusyMap(list, { ...base, ignoreId: 'x' }).size).toBe(0)
  })

  it('não conta o que é de outro profissional', () => {
    expect(buildBusyMap([appt({ professional_id: 'p2' })], base).size).toBe(0)
  })

  it('bloqueio da clínica toda ocupa a agenda de qualquer profissional', () => {
    const block = appt({ status: 'bloqueado', professional_id: null, scheduled_at: at(8), duration_minutes: 60 })
    expect(isClinicBlock(block)).toBe(true)
    const map = buildBusyMap([block], base)
    expect([...map.keys()]).toEqual(['08:00', '08:30'])
    expect(map.get('08:00')).toBe('Bloqueado')
  })

  it('sem profissional escolhido, qualquer consulta ocupa', () => {
    expect(buildBusyMap([appt({ professional_id: 'p2' })], { ...base, professionalId: '' }).size).toBe(1)
  })

  it('sem data, nada ocupado', () => {
    expect(buildBusyMap([appt({})], { ...base, dateStr: '' }).size).toBe(0)
  })
})

describe('conflictInSpan', () => {
  const busy = new Map([['09:30', 'Ana']])

  it('barra o início livre cuja duração invade uma casa ocupada', () => {
    expect(conflictInSpan('09:00', 60, busy, SLOTS)).toBe('Ana')
    expect(conflictInSpan('08:30', 90, busy, SLOTS)).toBe('Ana')
  })
  it('libera quando a consulta termina antes da casa ocupada', () => {
    expect(conflictInSpan('09:00', 30, busy, SLOTS)).toBeUndefined()
    expect(conflictInSpan('08:00', 60, busy, SLOTS)).toBeUndefined()
  })
  it('a própria casa ocupada continua barrada', () => {
    expect(conflictInSpan('09:30', 30, busy, SLOTS)).toBe('Ana')
  })
  it('duração zerada vale uma casa', () => {
    expect(conflictInSpan('09:00', 0, busy, SLOTS)).toBeUndefined()
    expect(conflictInSpan('09:30', 0, busy, SLOTS)).toBe('Ana')
  })
  it('no fim da grade só olha as casas que existem', () => {
    expect(conflictInSpan('10:30', 120, busy, SLOTS)).toBeUndefined()
  })
})

describe('overlaps', () => {
  it('encostar no fim não é conflito', () => {
    expect(overlaps(0, 30, 30, 60)).toBe(false)
    expect(overlaps(0, 31, 30, 60)).toBe(true)
  })
})

describe('nextFreeSlots', () => {
  const opts = { professionalId: 'p1', durationMin: 30, slots: SLOTS, count: 3 }
  const from = new Date(2026, 10, 3, 8, 15) // 03/11 às 08:15

  it('só devolve horários depois do momento atual', () => {
    expect(nextFreeSlots([], { ...opts, from })).toEqual([
      { date: '2026-11-03', time: '08:30' }, { date: '2026-11-03', time: '09:00' }, { date: '2026-11-03', time: '09:30' },
    ])
  })

  it('pula o que está ocupado e o que não comporta a duração', () => {
    const list = [appt({ scheduled_at: at(9), duration_minutes: 60 })] // 09:00 e 09:30 ocupados
    // 08:30 por 60 min invadiria o 09:00
    expect(nextFreeSlots(list, { ...opts, durationMin: 60, from })).toEqual([
      { date: '2026-11-03', time: '10:00' }, { date: '2026-11-03', time: '10:30' }, { date: '2026-11-04', time: '08:00' },
    ])
  })

  it('segue para o dia seguinte quando o dia acaba', () => {
    const r = nextFreeSlots([], { ...opts, from: new Date(2026, 10, 3, 10, 45), count: 2 })
    expect(r).toEqual([{ date: '2026-11-04', time: '08:00' }, { date: '2026-11-04', time: '08:30' }])
  })

  it('ignora cancelados e consultas de outro profissional, e respeita bloqueio da clínica', () => {
    const list = [
      appt({ status: 'cancelado', scheduled_at: at(8, 30) }),
      appt({ professional_id: 'p2', scheduled_at: at(9) }),
      appt({ status: 'bloqueado', professional_id: null, scheduled_at: at(9, 30) }),
    ]
    expect(nextFreeSlots(list, { ...opts, from }).map(s => s.time)).toEqual(['08:30', '09:00', '10:00'])
  })
})
