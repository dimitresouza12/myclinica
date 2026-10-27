import { describe, expect, it } from 'vitest'
import {
  appointmentsByDay, attendance, lastDays, localDayKey, monthToDate, nextAppointment,
  patientsSeries, revenueByDay, weekConfirmation, weekDays,
} from './metrics'

// datas locais: o teste roda no fuso da máquina, igual ao navegador
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min)
const iso = (y: number, m: number, d: number, h = 12, min = 0) => at(y, m, d, h, min).toISOString()

describe('datas', () => {
  it('localDayKey usa o dia local', () => {
    expect(localDayKey(at(2026, 10, 27, 23, 30))).toBe('2026-10-27')
  })

  it('weekDays vai de domingo a sábado', () => {
    const w = weekDays(at(2026, 10, 27)) // terça
    expect(w.map(localDayKey)).toEqual(['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'])
  })

  it('lastDays termina hoje', () => {
    expect(lastDays(at(2026, 11, 2), 3).map(localDayKey)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02'])
  })
})

describe('revenueByDay', () => {
  it('soma só receitas, por dia local', () => {
    const days = lastDays(at(2026, 10, 27), 2)
    const rows = [
      { created_at: iso(2026, 10, 26, 9), total_amount: 100, type: 'receita' },
      { created_at: iso(2026, 10, 26, 22), total_amount: 50, type: 'receita' },
      { created_at: iso(2026, 10, 26, 10), total_amount: 999, type: 'despesa' },
      { created_at: iso(2026, 10, 27, 8), total_amount: null, type: 'receita' },
      { created_at: iso(2026, 10, 20), total_amount: 70, type: 'receita' },
    ]
    expect(revenueByDay(rows, days)).toEqual([150, 0])
  })
})

describe('monthToDate', () => {
  it('compara com o mesmo trecho do mês anterior', () => {
    const rows = [
      { created_at: iso(2026, 10, 3), total_amount: 300, type: 'receita' },
      { created_at: iso(2026, 9, 2), total_amount: 200, type: 'receita' },
      { created_at: iso(2026, 9, 20), total_amount: 900, type: 'receita' }, // depois do dia 10: fora
    ]
    expect(monthToDate(rows, at(2026, 10, 10))).toEqual({ current: 300, previous: 200, pct: 50 })
  })

  it('sem mês anterior não há variação', () => {
    expect(monthToDate([{ created_at: iso(2026, 10, 1), total_amount: 10, type: 'receita' }], at(2026, 10, 5)).pct).toBeNull()
  })

  it('dia 31 compara com o último dia de um mês mais curto', () => {
    const rows = [{ created_at: iso(2026, 2, 28), total_amount: 40, type: 'receita' }]
    expect(monthToDate(rows, at(2026, 3, 31)).previous).toBe(40)
  })
})

describe('attendance', () => {
  const now = at(2026, 10, 27, 15)
  const days = lastDays(now, 7)

  it('conta comparecimento, faltas e cancelamentos já passados', () => {
    const a = attendance([
      { status: 'concluido', scheduled_at: iso(2026, 10, 27, 9) },
      { status: 'concluido', scheduled_at: iso(2026, 10, 25, 9) },
      { status: 'concluido', scheduled_at: iso(2026, 10, 25, 10) },
      { status: 'faltou', scheduled_at: iso(2026, 10, 22, 9) },
      { status: 'cancelado', scheduled_at: iso(2026, 10, 23, 9) },
      { status: 'concluido', scheduled_at: iso(2026, 10, 27, 17) }, // ainda não chegou
      { status: 'concluido', scheduled_at: iso(2026, 10, 15, 9) }, // fora da janela
    ], days, now)
    expect([a.done, a.noShow, a.cancelled]).toEqual([3, 1, 1])
    expect(a.rate).toBe(0.75)
    expect(a.perDay.done).toEqual([0, 0, 0, 0, 2, 0, 1])
  })

  it('sem atendimentos a taxa é nula', () => {
    expect(attendance([], days, now).rate).toBeNull()
  })
})

describe('weekConfirmation', () => {
  it('ignora canceladas e faltas', () => {
    const week = weekDays(at(2026, 10, 27))
    const r = weekConfirmation([
      { status: 'agendado', scheduled_at: iso(2026, 10, 28) },
      { status: 'confirmado', scheduled_at: iso(2026, 10, 29) },
      { status: 'concluido', scheduled_at: iso(2026, 10, 26) },
      { status: 'cancelado', scheduled_at: iso(2026, 10, 30) },
      { status: 'faltou', scheduled_at: iso(2026, 10, 25) },
      { status: 'confirmado', scheduled_at: iso(2026, 11, 2) }, // próxima semana
    ], week)
    expect(r).toEqual({ confirmed: 2, total: 3, rate: 2 / 3 })
  })
})

describe('appointmentsByDay', () => {
  it('não conta canceladas', () => {
    const days = lastDays(at(2026, 10, 27), 2)
    expect(appointmentsByDay([
      { status: 'agendado', scheduled_at: iso(2026, 10, 26) },
      { status: 'cancelado', scheduled_at: iso(2026, 10, 26) },
      { status: 'faltou', scheduled_at: iso(2026, 10, 27) },
    ], days)).toEqual([1, 1])
  })
})

describe('nextAppointment', () => {
  it('pega o primeiro agendado ou confirmado ainda por vir, com tolerância de 15 min', () => {
    const now = at(2026, 10, 27, 10, 0)
    const list = [
      { id: 'c', status: 'confirmado', scheduled_at: iso(2026, 10, 27, 14) },
      { id: 'late', status: 'agendado', scheduled_at: iso(2026, 10, 27, 9, 50) },
      { id: 'old', status: 'confirmado', scheduled_at: iso(2026, 10, 27, 8) },
      { id: 'done', status: 'concluido', scheduled_at: iso(2026, 10, 27, 11) },
    ]
    expect(nextAppointment(list, now)?.id).toBe('late')
  })

  it('nulo quando não há mais nada hoje', () => {
    expect(nextAppointment([{ status: 'concluido', scheduled_at: iso(2026, 10, 27, 9) }], at(2026, 10, 27, 10))).toBeNull()
  })
})

describe('patientsSeries', () => {
  it('volta o total no tempo tirando os cadastros posteriores a cada dia', () => {
    const days = lastDays(at(2026, 10, 27), 3)
    const created = [iso(2026, 10, 26, 9), iso(2026, 10, 27, 9), iso(2026, 10, 27, 10)]
    expect(patientsSeries(45, created, days)).toEqual([42, 43, 45])
  })
})
