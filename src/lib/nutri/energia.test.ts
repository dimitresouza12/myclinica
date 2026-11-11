import { describe, expect, it } from 'vitest'
import { calcularGet, calcularTmb, dividirMacros } from './energia'

const base = { sexo: 'M' as const, pesoKg: 80, alturaCm: 180, idade: 30 }

describe('TMB', () => {
  it('Mifflin-St Jeor', () => {
    expect(calcularTmb({ ...base, equacao: 'mifflin' })).toBeCloseTo(1780, 5)
    expect(calcularTmb({ equacao: 'mifflin', sexo: 'F', pesoKg: 60, alturaCm: 165, idade: 25 })).toBeCloseTo(1345.25, 5)
  })
  it('Harris-Benedict original e revisada', () => {
    expect(calcularTmb({ ...base, equacao: 'harris_benedict' })).toBeCloseTo(66.473 + 13.7516 * 80 + 5.0033 * 180 - 6.755 * 30, 5)
    expect(calcularTmb({ ...base, equacao: 'harris_benedict_1984' })).toBeCloseTo(88.362 + 13.397 * 80 + 4.799 * 180 - 5.677 * 30, 5)
    expect(calcularTmb({ equacao: 'harris_benedict', sexo: 'F', pesoKg: 60, alturaCm: 165, idade: 25 }))
      .toBeCloseTo(655.0955 + 9.5634 * 60 + 1.8496 * 165 - 4.6756 * 25, 5)
  })
  it('FAO/OMS escolhe a faixa de idade e usa só o peso', () => {
    expect(calcularTmb({ equacao: 'fao_oms', sexo: 'M', pesoKg: 70, alturaCm: null, idade: 25 })).toBeCloseTo(1750, 5)
    expect(calcularTmb({ equacao: 'fao_oms', sexo: 'F', pesoKg: 60, alturaCm: null, idade: 40 })).toBeCloseTo(1351, 5)
    expect(calcularTmb({ equacao: 'fao_oms', sexo: 'M', pesoKg: 70, alturaCm: null, idade: 30 })).toBeCloseTo(11.6 * 70 + 879, 5) // 30 já é da faixa 30-60
    expect(calcularTmb({ equacao: 'fao_oms', sexo: 'F', pesoKg: 60, alturaCm: null, idade: 70 })).toBeCloseTo(10.5 * 60 + 596, 5)
  })
  it('Cunningham usa a massa livre de gordura', () => {
    expect(calcularTmb({ equacao: 'cunningham', sexo: null, pesoKg: 80, alturaCm: 180, idade: 30, massaMagraKg: 60 })).toBe(1820)
    expect(calcularTmb({ equacao: 'cunningham', sexo: null, pesoKg: 80, alturaCm: 180, idade: 30 })).toBeNull()
  })
  it('devolve null quando falta dado em vez de calcular com zero', () => {
    expect(calcularTmb({ equacao: 'mifflin', sexo: null, pesoKg: 80, alturaCm: 180, idade: 30 })).toBeNull()
    expect(calcularTmb({ equacao: 'mifflin', sexo: 'M', pesoKg: null, alturaCm: 180, idade: 30 })).toBeNull()
    expect(calcularTmb({ equacao: 'mifflin', sexo: 'M', pesoKg: 80, alturaCm: 180, idade: null })).toBeNull()
  })
})

describe('GET e macros', () => {
  it('GET = TMB x fator de atividade', () => {
    expect(calcularGet(1780, 1.55)).toBeCloseTo(2759, 5)
    expect(calcularGet(null, 1.55)).toBeNull()
    expect(calcularGet(1780, 0)).toBeNull()
  })
  it('divide em g/kg e deixa o carboidrato com o resto', () => {
    const m = dividirMacros({ kcal: 2000, pesoKg: 70, proteinaGkg: 2, lipidioGkg: 1 })!
    expect(m.proteinaG).toBe(140)
    expect(m.lipidioG).toBe(70)
    expect(m.carboidratoG).toBe(202.5)
    expect(m.proteinaPct).toBe(28)
    expect(m.lipidioPct).toBe(31.5)
    expect(m.carboidratoPct).toBe(40.5)
    expect(m.estouro).toBe(false)
  })
  it('avisa quando proteína e lipídio já passam da meta', () => {
    const m = dividirMacros({ kcal: 1000, pesoKg: 100, proteinaGkg: 3, lipidioGkg: 2 })!
    expect(m.estouro).toBe(true)
    expect(m.carboidratoG).toBe(0)
  })
  it('sem meta, peso ou g/kg não calcula', () => {
    expect(dividirMacros({ kcal: null, pesoKg: 70, proteinaGkg: 2, lipidioGkg: 1 })).toBeNull()
    expect(dividirMacros({ kcal: 2000, pesoKg: null, proteinaGkg: 2, lipidioGkg: 1 })).toBeNull()
    expect(dividirMacros({ kcal: 2000, pesoKg: 70, proteinaGkg: null, lipidioGkg: 1 })).toBeNull()
  })
})

describe('TMB com entrada inválida', () => {
  it('peso e idade negativos devolvem null; altura negativa também nas equações que a usam', () => {
    for (const equacao of ['mifflin', 'harris_benedict', 'harris_benedict_1984', 'fao_oms'] as const) {
      expect(calcularTmb({ ...base, equacao, pesoKg: -70, massaMagraKg: null })).toBeNull()
      expect(calcularTmb({ ...base, equacao, idade: -1, massaMagraKg: null })).toBeNull()
    }
    for (const equacao of ['mifflin', 'harris_benedict', 'harris_benedict_1984'] as const) {
      expect(calcularTmb({ ...base, equacao, alturaCm: -180, massaMagraKg: null })).toBeNull()
    }
  })
})
