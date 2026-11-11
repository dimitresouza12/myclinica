import { describe, expect, it } from 'vitest'
import { arredondar, formatarNumero, idadeEm, lerNumero, validar } from './validacao'

describe('validação numérica', () => {
  it('lê vírgula e ponto e rejeita texto', () => {
    expect(lerNumero('72,5')).toBe(72.5)
    expect(lerNumero('72.5')).toBe(72.5)
    expect(lerNumero('')).toBeNull()
    expect(lerNumero('abc')).toBeNull()
    expect(lerNumero(null)).toBeNull()
  })
  it('campo vazio não é erro; fora da faixa é erro e não vira valor', () => {
    expect(validar('', 'peso')).toEqual({ valor: null, erro: null })
    expect(validar('72', 'peso')).toEqual({ valor: 72 })
    const alto = validar('720', 'peso')
    expect(alto.valor).toBeNull()
    expect(alto.erro).toMatch(/Peso fora do esperado/)
    expect(validar('0.5', 'dobra').valor).toBeNull()
    expect(validar('abc', 'peso').erro).toBe('Digite um número.')
    expect(validar('-500', 'ajusteKcal').valor).toBe(-500)
  })
  it('arredonda e formata em pt-BR', () => {
    expect(arredondar(0.1 + 0.2, 1)).toBe(0.3)
    expect(formatarNumero(72.456, 1)).toBe('72,5')
    expect(formatarNumero(null)).toBe('—')
  })
  it('calcula a idade na data da avaliação', () => {
    expect(idadeEm('1990-06-15', '2026-06-14')).toBe(35)
    expect(idadeEm('1990-06-15', '2026-06-15')).toBe(36)
    expect(idadeEm(null, '2026-06-15')).toBeNull()
    expect(idadeEm('2030-01-01', '2026-06-15')).toBeNull()
  })
})
