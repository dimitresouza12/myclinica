import { describe, it, expect } from 'vitest'
import { axisMoney, moneyShort, statMoney } from './money'

describe('moneyShort', () => {
  it('arredonda e agrupa o milhar', () => {
    expect(moneyShort(0)).toBe('R$ 0')
    expect(moneyShort(1234.6)).toMatch(/^R\$ 1\.235$/)
  })
})

describe('axisMoney', () => {
  it('mostra inteiro abaixo de mil e "mil" a partir daí', () => {
    expect(axisMoney(950)).toBe('950')
    expect(axisMoney(1500)).toBe('1,5 mil')
    expect(axisMoney(12000)).toBe('12 mil')
  })
  it('trata valores negativos do mesmo jeito', () => {
    expect(axisMoney(-1500)).toBe('-1,5 mil')
    expect(axisMoney(-200)).toBe('-200')
  })
})

describe('statMoney', () => {
  it('usa o valor inteiro abaixo de mil', () => {
    expect(statMoney(850)).toBe('R$ 850')
  })
  it('usa a forma compacta a partir de mil', () => {
    expect(statMoney(34200)).toMatch(/mil/)
  })
})
