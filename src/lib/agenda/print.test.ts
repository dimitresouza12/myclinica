import { describe, expect, it } from 'vitest'
import type { Appointment } from '@/types'
import { localDayKey } from '@/lib/dashboard/metrics'
import {
  DEFAULT_SHOW, MAX_CUSTOM_DAYS, areasOf, buildSheets, needsFetch, parseDayKey, periodTitle, pickProfessionals, resolvePeriod, summarize,
  type BuildInput, type PrintProf,
} from './print'

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min)
const PROFS: PrintProf[] = [
  { id: 'p1', name: 'Dr. Eduardo', specialty_type: 'medico' },
  { id: 'p2', name: 'Dra. Ana', specialty_type: 'odonto' },
]
let n = 0
function appt(p: Partial<Appointment> & { when: Date }): Appointment {
  const { when, ...rest } = p
  n++
  return {
    id: `a${n}`, clinic_id: 'c', patient_id: `pt${n}`, professional_id: 'p1', procedure_name: null, procedure_id: null, procedure_price: null,
    status: 'agendado', scheduled_at: when.toISOString(), duration_minutes: 30, notes: null, created_at: '', gcal_event_id: null,
    patients: { id: `pt${n}`, name: `Paciente ${n}`, phone: '85988123401' },
    ...rest,
  } as Appointment
}
const base = (over: Partial<BuildInput>): BuildInput => ({
  appointments: [], professionals: PROFS, includeUnassigned: false,
  start: at(2026, 11, 18), end: at(2026, 11, 19), group: 'folha', show: { ...DEFAULT_SHOW, free: false },
  convenios: {}, listLabel: 'Todos os profissionais', slots: [],
  ...over,
})

describe('resolvePeriod', () => {
  it('dia, semana e mês seguem o rangeFor', () => {
    const f = at(2026, 11, 18, 15)
    const dia = resolvePeriod('dia', f, '', '')
    expect(dia.ok && dia.days).toBe(1)
    const sem = resolvePeriod('semana', f, '', '')
    expect(sem.ok && [localDayKey(sem.start), sem.days]).toEqual(['2026-11-15', 7])
    const mes = resolvePeriod('mes', f, '', '')
    expect(mes.ok && mes.days).toBe(30)
  })
  it('personalizado inclui o dia final', () => {
    const r = resolvePeriod('custom', at(2026, 11, 18), '2026-11-10', '2026-11-12')
    expect(r.ok && [localDayKey(r.start), localDayKey(r.end), r.days]).toEqual(['2026-11-10', '2026-11-13', 3])
  })
  it('recusa datas vazias, invertidas e acima do limite', () => {
    expect(resolvePeriod('custom', new Date(), '', '2026-11-12').ok).toBe(false)
    expect(resolvePeriod('custom', new Date(), '2026-11-12', '2026-11-10').ok).toBe(false)
    expect(resolvePeriod('custom', new Date(), '2026-01-01', '2026-12-31').ok).toBe(false)
    expect(resolvePeriod('custom', new Date(), '2026-01-01', '2026-01-' + String(MAX_CUSTOM_DAYS > 31 ? 31 : MAX_CUSTOM_DAYS)).ok).toBe(true)
  })
})

describe('parseDayKey e títulos', () => {
  it('rejeita data inexistente', () => {
    expect(parseDayKey('2026-02-30')).toBeNull()
    expect(parseDayKey('abc')).toBeNull()
    expect(parseDayKey('2026-11-18')).not.toBeNull()
  })
  it('título de um dia e de um período', () => {
    expect(periodTitle(at(2026, 11, 18), at(2026, 11, 19))).toBe('Agenda de quarta-feira, 18/11/2026')
    expect(periodTitle(at(2026, 11, 15), at(2026, 11, 22))).toBe('Agenda de 15/11/2026 a 21/11/2026')
  })
})

describe('áreas e profissionais', () => {
  it('só as áreas que existem na clínica', () => {
    expect(areasOf(PROFS).map(a => a.label)).toEqual(['Medicina', 'Odontologia'])
  })
  it('filtra por área, por profissional e respeita o restrito', () => {
    expect(pickProfessionals(PROFS, { areas: ['odonto'], professionalIds: [], scopeId: null }).map(p => p.id)).toEqual(['p2'])
    expect(pickProfessionals(PROFS, { areas: [], professionalIds: ['p1'], scopeId: null }).map(p => p.id)).toEqual(['p1'])
    expect(pickProfessionals(PROFS, { areas: [], professionalIds: ['p1', 'p2'], scopeId: null }).map(p => p.id)).toEqual(['p1', 'p2'])
    expect(pickProfessionals(PROFS, { areas: ['odonto'], professionalIds: ['p2'], scopeId: 'p1' }).map(p => p.id)).toEqual(['p1'])
  })
})

describe('buildSheets', () => {
  const list = [
    appt({ when: at(2026, 11, 18, 8), status: 'confirmado' }),
    appt({ when: at(2026, 11, 18, 9), status: 'cancelado' }),
    appt({ when: at(2026, 11, 18, 10), professional_id: 'p2' }),
    appt({ when: at(2026, 11, 19, 8) }),
  ]
  it('uma folha por profissional, só dentro do período', () => {
    const r = buildSheets(base({ appointments: list }))
    expect(r.sheets.map(s => [s.professional, s.count])).toEqual([['Dr. Eduardo', 1], ['Dra. Ana', 1]])
    expect(r.count).toBe(2)
  })
  it('cancelados entram só quando pedidos', () => {
    const r = buildSheets(base({ appointments: list, show: { ...DEFAULT_SHOW, free: false, canceled: true } }))
    expect(r.sheets[0].days[0].rows.map(x => x.status)).toEqual(['confirmado', 'cancelado'])
    expect(r.sheets[0].count).toBe(1)
  })
  it('lista única junta os profissionais e liga a coluna Profissional', () => {
    const r = buildSheets(base({ appointments: list, group: 'lista' }))
    expect(r.sheets).toHaveLength(1)
    expect(r.sheets[0].showProfessional).toBe(true)
    expect(r.sheets[0].days[0].rows.map(x => x.time)).toEqual(['08:00', '10:00'])
  })
  it('convênio vazio vira Particular e o resumo conta', () => {
    const a = appt({ when: at(2026, 11, 18, 8), status: 'confirmado' })
    const r = buildSheets(base({ appointments: [a], convenios: { [a.patient_id as string]: 'Unimed' } }))
    expect(r.sheets[0].days[0].rows[0].convenio).toBe('Unimed')
    expect(r.sheets[0].summary).toBe('Resumo: 1 confirmado · Unimed 1')
    const b = buildSheets(base({ appointments: [a] }))
    expect(b.sheets[0].days[0].rows[0].convenio).toBe('Particular')
  })
  it('horários livres se juntam e bloqueio aparece em cinza', () => {
    const slots = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00']
    const a = appt({ when: at(2026, 11, 18, 8) })
    const z = appt({ when: at(2026, 11, 18, 11) })
    const blk = appt({ when: at(2026, 11, 18, 9), status: 'bloqueado', professional_id: 'p1', duration_minutes: 30, notes: 'Reunião', patient_id: null, patients: undefined })
    const r = buildSheets(base({ appointments: [a, z, blk], professionals: [PROFS[0]], slots, show: { ...DEFAULT_SHOW } }))
    const rows = r.sheets[0].days[0].rows
    expect(rows.map(x => [x.kind, x.time])).toEqual([['appt', '08:00'], ['free', '08:30'], ['block', '09:00'], ['free', '09:30'], ['appt', '11:00']])
    expect(rows[2].text).toBe('Bloqueado até 09:30 · Reunião')
    expect(rows[3].text).toBe('Horário livre até 11:00')
    expect(r.count).toBe(2)
  })
  it('dia sem consulta não gera folha', () => {
    expect(buildSheets(base({ appointments: [] })).sheets).toHaveLength(0)
  })
})

describe('summarize e needsFetch', () => {
  it('resumo vazio sem atendimentos', () => {
    expect(summarize([], true)).toBe('')
  })
  it('busca no banco só quando o início está além do que a agenda carrega', () => {
    const now = at(2026, 11, 18)
    expect(needsFetch(at(2026, 10, 1), now)).toBe(false)
    expect(needsFetch(at(2026, 8, 1), now)).toBe(true)
  })
})
