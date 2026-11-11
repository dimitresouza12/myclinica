import { describe, it, expect } from 'vitest'
import { calcBmi, bmiCategory, bmiSummary, calcDpp, calcGestation, gestationSummary, parseDecimal } from './clinicalCalc'

describe('IMC', () => {
  it('calcula com uma casa e vírgula', () => {
    const b = calcBmi('70', '170')
    expect(b?.value).toBe(24.2)
    expect(b?.text).toBe('24,2')
    expect(b?.category).toBe('Peso normal')
  })
  it('aceita vírgula e ponto no peso', () => {
    expect(calcBmi('70,5', '170')?.value).toBe(calcBmi('70.5', '170')?.value)
  })
  it('classifica pelos cortes da OMS', () => {
    expect(bmiCategory(18.4)).toBe('Abaixo do peso')
    expect(bmiCategory(18.5)).toBe('Peso normal')
    expect(bmiCategory(25)).toBe('Sobrepeso')
    expect(bmiCategory(30)).toBe('Obesidade grau I')
    expect(bmiCategory(35)).toBe('Obesidade grau II')
    expect(bmiCategory(40)).toBe('Obesidade grau III')
  })
  it('recusa valor vazio, inválido ou fora de faixa', () => {
    expect(calcBmi('', '170')).toBeNull()
    expect(calcBmi('70', '')).toBeNull()
    expect(calcBmi('abc', '170')).toBeNull()
    expect(calcBmi('0', '170')).toBeNull()
    expect(calcBmi('70', '2')).toBeNull()
    expect(calcBmi('70', '1,70')).toBeNull() // altura em metros: não é cm
    expect(calcBmi('800', '170')).toBeNull()
  })
  it('monta o texto do campo da ficha', () => {
    expect(bmiSummary('70.5', '170')).toBe('Peso 70,5 kg | Altura 170 cm | IMC 24,4 kg/m² (Peso normal)')
    expect(bmiSummary('70', '')).toBe('')
  })
  it('parseDecimal só aceita número', () => {
    expect(parseDecimal('12,5')).toBe(12.5)
    expect(Number.isNaN(parseDecimal('12,5kg'))).toBe(true)
  })
})

describe('DPP e idade gestacional por DUM', () => {
  it('DPP é DUM + 280 dias (Naegele)', () => {
    expect(calcDpp('2026-01-01')).toBe('2026-10-08')
    expect(calcDpp('2025-12-31')).toBe('2026-10-07')
    expect(calcDpp('2024-03-01')).toBe('2024-12-06') // ano bissexto
  })
  it('IG em semanas e dias', () => {
    const g = calcGestation('2026-09-01', '2026-11-10')
    expect(g).toMatchObject({ weeks: 10, days: 0, totalDays: 70, label: '10s0d', dpp: '2027-06-08' })
  })
  it('hoje igual à DUM: 0s0d', () => {
    expect(calcGestation('2026-11-10', '2026-11-10')?.label).toBe('0s0d')
  })
  it('DUM no futuro ou há mais de 44 semanas: sem cálculo', () => {
    expect(calcGestation('2026-11-11', '2026-11-10')).toBeNull()
    expect(calcGestation('2025-01-01', '2026-11-10')).toBeNull()
  })
  it('data inválida: sem cálculo', () => {
    expect(calcGestation('2026-02-30', '2026-11-10')).toBeNull()
    expect(calcGestation('', '2026-11-10')).toBeNull()
    expect(calcDpp('10/05/2026')).toBeNull()
  })
  it('resumo para o campo da ficha', () => {
    expect(gestationSummary('2026-09-01', '2026-11-11')).toBe('IG 10 semanas e 1 dia (por DUM) | DPP 08/06/2027')
    expect(gestationSummary('2026-09-01', '2026-11-13')).toBe('IG 10 semanas e 3 dias (por DUM) | DPP 08/06/2027')
    expect(gestationSummary('2020-01-01', '2026-11-10')).toBe('')
  })
})
