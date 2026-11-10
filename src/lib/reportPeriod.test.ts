import { describe, expect, it } from 'vitest'
import { buildBuckets, bucketKey, defaultCustomRange, resolvePeriod, type PeriodInput } from './reportPeriod'

// terça-feira, 3 de novembro de 2026, 15h
const NOW = new Date(2026, 10, 3, 15, 0, 0)
const base: PeriodInput = { kind: 'diario', month: '2026-11', customFrom: '', customTo: '' }

describe('resolvePeriod', () => {
  it('diário vai de hoje 00h até amanhã 00h', () => {
    const p = resolvePeriod(base, NOW)
    expect(p.from).toEqual(new Date(2026, 10, 3))
    expect(p.to).toEqual(new Date(2026, 10, 4))
    expect(p.label).toBe('hoje')
    expect(p.granularity).toBe('day')
  })

  it('semanal começa no domingo e tem 7 dias', () => {
    const p = resolvePeriod({ ...base, kind: 'semanal' }, NOW)
    expect(p.from).toEqual(new Date(2026, 10, 1))
    expect(p.to).toEqual(new Date(2026, 10, 8))
    expect(buildBuckets(p).map(b => b.label)).toEqual(['01/11', '02/11', '03/11', '04/11', '05/11', '06/11', '07/11'])
  })

  it('mensal cobre o mês inteiro, por dia', () => {
    const p = resolvePeriod({ ...base, kind: 'mensal', month: '2026-02' }, NOW)
    expect(p.from).toEqual(new Date(2026, 1, 1))
    expect(p.to).toEqual(new Date(2026, 2, 1))
    expect(buildBuckets(p)).toHaveLength(28)
    expect(p.granularity).toBe('day')
  })

  it('personalizado inclui o último dia escolhido', () => {
    const p = resolvePeriod({ ...base, kind: 'personalizado', customFrom: '2026-10-30', customTo: '2026-11-02' }, NOW)
    expect(buildBuckets(p).map(b => b.key)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
    expect(p.label).toBe('30/10/2026 a 02/11/2026')
  })

  it('personalizado com datas invertidas troca de lugar', () => {
    const p = resolvePeriod({ ...base, kind: 'personalizado', customFrom: '2026-11-02', customTo: '2026-10-30' }, NOW)
    expect(p.from).toEqual(new Date(2026, 9, 30))
    expect(p.to).toEqual(new Date(2026, 10, 3))
  })

  it('personalizado vazio cai nos últimos 30 dias', () => {
    const p = resolvePeriod({ ...base, kind: 'personalizado' }, NOW)
    const def = defaultCustomRange(NOW)
    expect(def).toEqual({ from: '2026-10-05', to: '2026-11-03' })
    expect(buildBuckets(p)).toHaveLength(30)
  })

  it('acima de 92 dias agrupa por mês, com meses vazios incluídos', () => {
    const p = resolvePeriod({ ...base, kind: 'personalizado', customFrom: '2026-01-15', customTo: '2026-06-10' }, NOW)
    expect(p.granularity).toBe('month')
    expect(buildBuckets(p).map(b => b.key)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'])
  })

  it('bucketKey usa a data local', () => {
    expect(bucketKey(new Date(2026, 10, 3, 23, 59), 'day')).toBe('2026-11-03')
    expect(bucketKey(new Date(2026, 10, 3), 'month')).toBe('2026-11')
  })
})
