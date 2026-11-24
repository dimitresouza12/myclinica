import { describe, expect, it } from 'vitest'
import { isValidCnpj, luhnValido, validarAssinaturaCartao } from './validarCartao'

const NOW = new Date('2026-11-25T15:00:00Z')
const base = () => ({
  clinicId: 'c1', plan: 'completo', aceite: true, expectedFullValue: 129.9,
  card: { holderName: 'Fulano de Tal', number: '4111111111111111', expiryMonth: '11', expiryYear: '2026', ccv: '123' },
  holder: { name: 'Fulano de Tal', email: 'f@x.com', cpfCnpj: '529.982.247-25', postalCode: '60000-000', addressNumber: '100', phone: '(85) 99999-8888' },
})
const withCard = (o: Record<string, unknown>) => ({ ...base(), card: { ...base().card, ...o } })
const withHolder = (o: Record<string, unknown>) => ({ ...base(), holder: { ...base().holder, ...o } })

describe('luhn e cnpj', () => {
  it('luhn', () => {
    expect(luhnValido('4111111111111111')).toBe(true)
    expect(luhnValido('4111111111111112')).toBe(false)
    expect(luhnValido('')).toBe(false)
  })
  it('cnpj', () => {
    expect(isValidCnpj('11222333000181')).toBe(true)
    expect(isValidCnpj('11222333000182')).toBe(false)
    expect(isValidCnpj('11111111111111')).toBe(false)
  })
})

describe('validarAssinaturaCartao', () => {
  it('corpo válido: normaliza titular e mantém o cartão como veio', () => {
    const r = validarAssinaturaCartao(base(), NOW)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.holder).toMatchObject({ cpfCnpj: '52998224725', postalCode: '60000000', phone: '85999998888' })
      expect(r.value.card.number).toBe('4111111111111111')
      expect(r.value.expectedFullValue).toBe(129.9)
    }
  })

  it('cartão que vence neste mês ainda vale; mês anterior não', () => {
    expect(validarAssinaturaCartao(withCard({ expiryMonth: '11', expiryYear: '2026' }), NOW).ok).toBe(true)
    expect(validarAssinaturaCartao(withCard({ expiryMonth: '10', expiryYear: '2026' }), NOW)).toEqual({ ok: false, error: 'Cartão vencido.' })
  })

  const rejeita: [string, unknown][] = [
    ['aceite ausente', { ...base(), aceite: undefined }],
    ['aceite "true" string', { ...base(), aceite: 'true' }],
    ['plano fora do catálogo', { ...base(), plan: 'gratis' }],
    ['valor esperado ausente', { ...base(), expectedFullValue: undefined }],
    ['valor esperado string', { ...base(), expectedFullValue: '129.9' }],
    ['valor esperado zero', { ...base(), expectedFullValue: 0 }],
    ['valor esperado NaN', { ...base(), expectedFullValue: Number.NaN }],
    ['número com espaços', withCard({ number: '4111 1111 1111 1111' })],
    ['número sem Luhn', withCard({ number: '4111111111111112' })],
    ['número curto', withCard({ number: '411111111111' })],
    ['mês 13', withCard({ expiryMonth: '13' })],
    ['mês de 1 dígito', withCard({ expiryMonth: '1' })],
    ['ano de 2 dígitos', withCard({ expiryYear: '30' })],
    ['ccv de 2 dígitos', withCard({ ccv: '12' })],
    ['ccv com letra', withCard({ ccv: '12a' })],
    ['cpf inválido', withHolder({ cpfCnpj: '11111111111' })],
    ['cpf com 12 dígitos', withHolder({ cpfCnpj: '529982247251' })],
    ['cep curto', withHolder({ postalCode: '6000000' })],
    ['e-mail ruim', withHolder({ email: 'sem-arroba' })],
    ['telefone ruim', withHolder({ phone: '123' })],
    ['sem número do endereço', withHolder({ addressNumber: ' ' })],
    ['corpo não objeto', 'x'],
  ]
  it.each(rejeita)('rejeita: %s', (_n, body) => {
    expect(validarAssinaturaCartao(body, NOW).ok).toBe(false)
  })

  it('a mensagem de erro nunca devolve o valor digitado', () => {
    const r = validarAssinaturaCartao(withCard({ number: '4111111111111112', ccv: '999' }), NOW)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).not.toMatch(/4111|999/)
  })

  it('aceita CNPJ válido', () => {
    expect(validarAssinaturaCartao(withHolder({ cpfCnpj: '11.222.333/0001-81' }), NOW).ok).toBe(true)
  })
})
