import { describe, it, expect } from 'vitest'
import { birthMonthDay, birthdaysOfMonth, withoutReturn, lastVisitByPatient, type AudiencePatient, type AudienceAppt } from './audience'

const NOW = new Date('2026-11-10T15:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()
const pat = (id: string, over: Partial<AudiencePatient> = {}): AudiencePatient => ({ id, name: `Pac ${id}`, phone: '85999990000', created_at: daysAgo(400), birth_date: null, ...over })
const appt = (patient_id: string, scheduled_at: string, status = 'concluido'): AudienceAppt => ({ patient_id, scheduled_at, status })

describe('aniversariantes do mês', () => {
  it('só quem nasceu no mês corrente, por dia', () => {
    const ps = [
      pat('a', { birth_date: '1990-11-25' }),
      pat('b', { birth_date: '1985-11-02' }),
      pat('c', { birth_date: '1990-12-01' }),
      pat('d', { birth_date: null }),
    ]
    expect(birthdaysOfMonth(ps, NOW).map(p => p.id)).toEqual(['b', 'a'])
  })
  it('usa o mês de Brasília: 22h de 30/11 ainda é novembro, e 01h UTC de 01/12 é novembro em Brasília', () => {
    const p = [pat('a', { birth_date: '2000-11-30' }), pat('b', { birth_date: '2000-12-05' })]
    expect(birthdaysOfMonth(p, new Date('2026-12-01T01:00:00Z')).map(x => x.id)).toEqual(['a'])
  })
  it('placeholder antigo (todos os pacientes) não vale mais', () => {
    expect(birthdaysOfMonth([pat('a'), pat('b')], NOW)).toEqual([])
  })
  it('data inválida é ignorada', () => {
    expect(birthMonthDay('1990-13-40')).toBeNull()
    expect(birthMonthDay('')).toBeNull()
    expect(birthMonthDay('1990-02-29')).toEqual({ month: 2, day: 29 })
  })
})

describe('sem retorno', () => {
  it('quem veio há pouco sai; quem faz tempo entra', () => {
    const ps = [pat('recente'), pat('antigo')]
    const as = [appt('recente', daysAgo(10)), appt('antigo', daysAgo(80))]
    expect(withoutReturn(ps, as, 30, NOW).map(p => p.id)).toEqual(['antigo'])
    expect(withoutReturn(ps, as, 60, NOW).map(p => p.id)).toEqual(['antigo'])
    expect(withoutReturn(ps, as, 90, NOW).map(p => p.id)).toEqual([])
  })
  it('consulta marcada para frente conta como retorno', () => {
    expect(withoutReturn([pat('a')], [appt('a', daysAgo(-5), 'agendado')], 30, NOW)).toEqual([])
  })
  it('cancelada, falta e bloqueio não contam como visita', () => {
    const as = [appt('a', daysAgo(5), 'cancelado'), appt('a', daysAgo(6), 'faltou'), appt('a', daysAgo(7), 'bloqueado')]
    expect(withoutReturn([pat('a')], as, 30, NOW).map(p => p.id)).toEqual(['a'])
  })
  it('cadastrado há pouco e sem consulta não entra; cadastrado há tempo e sem consulta entra', () => {
    const ps = [pat('novo', { created_at: daysAgo(5) }), pat('velho', { created_at: daysAgo(200) })]
    expect(withoutReturn(ps, [], 30, NOW).map(p => p.id)).toEqual(['velho'])
  })
  it('a data de cadastro não esconde quem já tinha consulta antiga', () => {
    expect(withoutReturn([pat('a', { created_at: daysAgo(500) })], [appt('a', daysAgo(95))], 90, NOW).map(p => p.id)).toEqual(['a'])
  })
  it('mapa da última consulta ignora paciente nulo e data inválida', () => {
    const m = lastVisitByPatient([{ patient_id: null, scheduled_at: daysAgo(1), status: 'concluido' }, appt('a', 'x'), appt('a', daysAgo(3)), appt('a', daysAgo(9))])
    expect(m.size).toBe(1)
    expect(m.get('a')).toBe(Date.parse(daysAgo(3)))
  })
})
