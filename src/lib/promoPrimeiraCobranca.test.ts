import { describe, expect, it } from 'vitest'
import {
  PROMO_CADASTRO_FIM, PROMO_CADASTRO_INICIO, elegivelPromoPrimeiraCobranca, valorPrimeiraCobranca,
} from './promoPrimeiraCobranca'

describe('elegivelPromoPrimeiraCobranca', () => {
  it('constantes da janela', () => {
    expect(PROMO_CADASTRO_INICIO).toBe('2026-11-23')
    expect(PROMO_CADASTRO_FIM).toBe('2026-11-30')
  })

  it('primeiro e último dia entram (inclusive), no fuso de Brasília', () => {
    expect(elegivelPromoPrimeiraCobranca('2026-11-23T00:00:00-03:00')).toBe(true)
    expect(elegivelPromoPrimeiraCobranca('2026-11-30T23:59:59-03:00')).toBe(true)
    expect(elegivelPromoPrimeiraCobranca('2026-11-25T12:00:00Z')).toBe(true)
  })

  it('um instante antes do início e um depois do fim ficam de fora', () => {
    expect(elegivelPromoPrimeiraCobranca('2026-11-22T23:59:59-03:00')).toBe(false)
    expect(elegivelPromoPrimeiraCobranca('2026-12-01T00:00:00-03:00')).toBe(false)
  })

  it('usa o dia de Brasília, não o de UTC (cadastro às 22h de 22/11 em Brasília já é 23/11 em UTC)', () => {
    expect(elegivelPromoPrimeiraCobranca('2026-11-23T01:00:00Z')).toBe(false) // 22/11 22h em Brasília
    expect(elegivelPromoPrimeiraCobranca('2026-12-01T02:00:00Z')).toBe(true)  // 30/11 23h em Brasília
  })

  it('aceita Date; sem data ou data inválida não é elegível', () => {
    expect(elegivelPromoPrimeiraCobranca(new Date('2026-11-24T15:00:00Z'))).toBe(true)
    expect(elegivelPromoPrimeiraCobranca(null)).toBe(false)
    expect(elegivelPromoPrimeiraCobranca(undefined)).toBe(false)
    expect(elegivelPromoPrimeiraCobranca('lixo')).toBe(false)
  })

  it('o parâmetro "hoje" não muda o resultado (conta o cadastro, não a data da assinatura)', () => {
    expect(elegivelPromoPrimeiraCobranca('2026-11-10T12:00:00Z', new Date('2026-11-25T12:00:00Z'))).toBe(false)
    expect(elegivelPromoPrimeiraCobranca('2026-11-25T12:00:00Z', new Date('2027-03-01T12:00:00Z'))).toBe(true)
  })
})

describe('valorPrimeiraCobranca', () => {
  it('não elegível: valor cheio', () => {
    expect(valorPrimeiraCobranca(129.9, false)).toBe(129.9)
  })

  it('elegível: metade em 2 casas, sem erro de ponto flutuante', () => {
    expect(valorPrimeiraCobranca(129.9, true)).toBe(64.95)
    expect(valorPrimeiraCobranca(99.9, true)).toBe(49.95)
    expect(valorPrimeiraCobranca(169.9, true)).toBe(84.95)
    expect(valorPrimeiraCobranca(199.9, true)).toBe(99.95)
  })

  it('centavo ímpar arredonda para cima', () => {
    expect(valorPrimeiraCobranca(0.99, true)).toBe(0.5)
    expect(valorPrimeiraCobranca(100.01, true)).toBe(50.01)
  })
})
