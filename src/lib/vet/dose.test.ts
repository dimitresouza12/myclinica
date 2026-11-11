import { describe, expect, it } from 'vitest'
import { calcularDose, fracaoDeComprimido, type ResultadoDose } from './dose'

const ok = (r: ReturnType<typeof calcularDose>): ResultadoDose => {
  if (!r.ok) throw new Error(r.erros.join('; '))
  return r
}

describe('dose em mL', () => {
  it('10 kg x 5 mg/kg com 50 mg/mL = 1 mL', () => {
    const r = ok(calcularDose({ doseMgKg: '5', pesoKg: '10', tipo: 'mg_ml', concentracao: '50' }))
    expect(r.doseMg).toBe(50)
    expect(r.volumeMl).toBe(1)
    expect(r.volumeArredondadoMl).toBe(1)
    expect(r.doseEntregueMgKg).toBeCloseTo(5, 6)
    expect(r.avisos).toEqual([])
  })
  it('aceita vírgula e informa o arredondamento a 0,01 mL', () => {
    const r = ok(calcularDose({ doseMgKg: '2,5', pesoKg: '4,3', tipo: 'mg_ml', concentracao: '10' }))
    expect(r.volumeMl).toBeCloseTo(1.075, 6)
    expect(r.volumeArredondadoMl).toBe(1.08)
    expect(r.avisos.join(' ')).toMatch(/0,01 mL/)
  })
  it('percentual vale 10 mg/mL por 1%', () => {
    const r = ok(calcularDose({ doseMgKg: '10', pesoKg: '5', tipo: 'percentual', concentracao: '1' }))
    expect(r.mgPorUnidade).toBe(10)
    expect(r.volumeMl).toBe(5)
  })
  it('volume muito pequeno gera aviso', () => {
    const r = ok(calcularDose({ doseMgKg: '0.1', pesoKg: '0.5', tipo: 'mg_ml', concentracao: '10' }))
    expect(r.volumeMl).toBeCloseTo(0.005, 6)
    expect(r.avisos.join(' ')).toMatch(/muito pequeno/)
  })
})

describe('dose em comprimidos', () => {
  it('arredonda ao quarto mais próximo e mostra a dose entregue', () => {
    const r = ok(calcularDose({ doseMgKg: '2', pesoKg: '10', tipo: 'mg_comprimido', concentracao: '30' }))
    expect(r.comprimidos).toBeCloseTo(0.6667, 3)
    expect(r.comprimidosArredondados).toBe(0.75)
    expect(r.doseEntregueMg).toBeCloseTo(22.5, 6)
    expect(r.diferencaPct).toBeCloseTo(12.5, 6)
    expect(r.avisos.join(' ')).toMatch(/arredondamento muda a dose em \+12,5%/)
    expect(r.avisos.join(' ')).toMatch(/quarto/)
  })
  it('dose exata não gera aviso', () => {
    const r = ok(calcularDose({ doseMgKg: '5', pesoKg: '10', tipo: 'mg_comprimido', concentracao: '25' }))
    expect(r.comprimidosArredondados).toBe(2)
    expect(r.avisos).toEqual([])
  })
  it('menos de 1/4 de comprimido avisa que não dá para fracionar', () => {
    const r = ok(calcularDose({ doseMgKg: '1', pesoKg: '1', tipo: 'mg_comprimido', concentracao: '100' }))
    expect(r.comprimidosArredondados).toBe(0)
    expect(r.avisos.join(' ')).toMatch(/menor que 1\/4/)
  })
})

describe('entrada inválida', () => {
  it('campo vazio, zero ou fora da faixa não calcula', () => {
    const vazio = calcularDose({ doseMgKg: '', pesoKg: '10', tipo: 'mg_ml', concentracao: '50' })
    expect(vazio.ok).toBe(false)
    const zero = calcularDose({ doseMgKg: '5', pesoKg: '0', tipo: 'mg_ml', concentracao: '50' })
    expect(zero.ok).toBe(false)
    const enorme = calcularDose({ doseMgKg: '5', pesoKg: '10', tipo: 'mg_ml', concentracao: '999999' })
    expect(enorme.ok).toBe(false)
    const texto = calcularDose({ doseMgKg: 'abc', pesoKg: '10', tipo: 'mg_ml', concentracao: '50' })
    expect(texto.ok).toBe(false)
    if (!texto.ok) expect(texto.erros[0]).toMatch(/dose/)
  })
  it('percentual acima de 100 é recusado', () => {
    expect(calcularDose({ doseMgKg: '5', pesoKg: '10', tipo: 'percentual', concentracao: '150' }).ok).toBe(false)
  })
})

describe('fração de comprimido', () => {
  it('escreve em português', () => {
    expect(fracaoDeComprimido(0.25)).toBe('1/4')
    expect(fracaoDeComprimido(0.5)).toBe('1/2')
    expect(fracaoDeComprimido(1.5)).toBe('1 e 1/2')
    expect(fracaoDeComprimido(2)).toBe('2')
    expect(fracaoDeComprimido(2.75)).toBe('2 e 3/4')
    expect(fracaoDeComprimido(0)).toBe('0')
  })
})
