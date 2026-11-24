import { describe, expect, it } from 'vitest'
import {
  maskCardNumber, cardNumberError, maskExpiry, parseExpiry, expiryError, maskCcv, ccvError,
  holderNameError, maskCpfCnpj, cpfCnpjError, maskCep, cepError, emailError, formatDiaBr, formatBrl,
  luhnValido, isValidCpf, isValidCnpj, deveLimparCartao, errosDeCampoVisiveis,
  detectCardBrand, normalizeCardBrand, maskCardPreview,
} from './cartaoCheckout'

describe('número do cartão', () => {
  it('agrupa de 4 em 4 e limita a 19 dígitos', () => {
    expect(maskCardNumber('4111111111111111')).toBe('4111 1111 1111 1111')
    expect(maskCardNumber('4111-1111 1111.1111 99999')).toBe('4111 1111 1111 1111 999')
    expect(maskCardNumber('41')).toBe('41')
    expect(maskCardNumber(null)).toBe('')
  })
  it('valida pelo algoritmo de Luhn', () => {
    expect(cardNumberError('4111 1111 1111 1111')).toBeNull()
    expect(cardNumberError('5555 5555 5555 4444')).toBeNull()
    expect(cardNumberError('4111 1111 1111 1112')).toBe('Número do cartão inválido.')
    expect(cardNumberError('4111')).toBe('Número do cartão inválido.')
    expect(cardNumberError('')).toBe('Informe o número do cartão.')
  })
})

describe('validade MM/AA', () => {
  it('máscara limita o mês a 01-12', () => {
    expect(maskExpiry('1228')).toBe('12/28')
    expect(maskExpiry('3')).toBe('03')
    expect(maskExpiry('1')).toBe('1')
    expect(maskExpiry('13')).toBe('12')
    expect(maskExpiry('0')).toBe('0')
    expect(maskExpiry('00')).toBe('0')
    expect(maskExpiry('12/2899')).toBe('12/2899')
    expect(maskExpiry('12/289912')).toBe('12/2899')
  })
  it('aceita MM/AAAA ao digitar ou colar, sem truncar para 20', () => {
    expect(maskExpiry('12/2030')).toBe('12/2030')
    expect(maskExpiry('122030')).toBe('12/2030')
    expect(maskExpiry('12/20')).toBe('12/20')
    expect(maskExpiry('4/2030')).toBe('04/2030')
  })
  it('MM/AAAA vale como 2030, nunca como 2020', () => {
    const now = new Date(2026, 10, 23)
    expect(parseExpiry('12/2030')).toEqual({ month: '12', year: '2030' })
    expect(parseExpiry('122030')).toEqual({ month: '12', year: '2030' })
    expect(expiryError('12/2030', now)).toBeNull()
    expect(expiryError('12/30', now)).toBeNull()
    expect(expiryError('12/2020', now)).toBe('Cartão vencido.')
    expect(expiryError('11/2026', now)).toBeNull()
    expect(expiryError('10/2026', now)).toBe('Cartão vencido.')
    expect(expiryError('12/203', now)).toBe('Validade inválida. Use MM/AA ou MM/AAAA.')
  })
  it('parseExpiry devolve ano de 4 dígitos', () => {
    expect(parseExpiry('12/28')).toEqual({ month: '12', year: '2028' })
    expect(parseExpiry('1/28')).toBeNull()
    expect(parseExpiry('13/28')).toBeNull()
    expect(parseExpiry('00/28')).toBeNull()
  })
  it('rejeita cartão vencido e aceita o mês corrente', () => {
    const now = new Date(2026, 10, 23)
    expect(expiryError('', now)).toBe('Informe a validade do cartão.')
    expect(expiryError('1/2', now)).toBe('Validade inválida. Use MM/AA ou MM/AAAA.')
    expect(expiryError('10/26', now)).toBe('Cartão vencido.')
    expect(expiryError('12/25', now)).toBe('Cartão vencido.')
    expect(expiryError('11/26', now)).toBeNull()
    expect(expiryError('01/27', now)).toBeNull()
  })
})

describe('CVV', () => {
  it('aceita 3 ou 4 dígitos', () => {
    expect(maskCcv('12a34567')).toBe('1234')
    expect(ccvError('123')).toBeNull()
    expect(ccvError('1234')).toBeNull()
    expect(ccvError('12')).toBe('Código de segurança inválido.')
    expect(ccvError('')).toBe('Informe o código de segurança.')
  })
})

describe('nome impresso', () => {
  it('pede nome completo', () => {
    expect(holderNameError('')).toBe('Informe o nome impresso no cartão.')
    expect(holderNameError('Maria')).not.toBeNull()
    expect(holderNameError('MARIA S SILVA')).toBeNull()
  })
})

describe('CPF e CNPJ', () => {
  it('máscara troca de CPF para CNPJ depois do 11º dígito', () => {
    expect(maskCpfCnpj('52998224725')).toBe('529.982.247-25')
    expect(maskCpfCnpj('11222333000181')).toBe('11.222.333/0001-81')
    expect(maskCpfCnpj('1122233300018199')).toBe('11.222.333/0001-81')
  })
  it('valida dígitos verificadores', () => {
    expect(cpfCnpjError('529.982.247-25')).toBeNull()
    expect(cpfCnpjError('529.982.247-26')).toBe('CPF inválido.')
    expect(cpfCnpjError('111.111.111-11')).toBe('CPF inválido.')
    expect(cpfCnpjError('11.222.333/0001-81')).toBeNull()
    expect(cpfCnpjError('11.222.333/0001-82')).toBe('CNPJ inválido.')
    expect(cpfCnpjError('00.000.000/0000-00')).toBe('CNPJ inválido.')
    expect(cpfCnpjError('1234567')).toBe('CPF ou CNPJ incompleto.')
    expect(cpfCnpjError('')).toBe('Informe o CPF ou CNPJ do titular.')
  })
})

describe('CEP e e-mail', () => {
  it('CEP', () => {
    expect(maskCep('60115000')).toBe('60115-000')
    expect(maskCep('601')).toBe('601')
    expect(cepError('60115-000')).toBeNull()
    expect(cepError('60115')).toBe('CEP incompleto.')
    expect(cepError('')).toBe('Informe o CEP.')
  })
  it('e-mail', () => {
    expect(emailError('a@b.com')).toBeNull()
    expect(emailError(' a@b.com ')).toBeNull()
    expect(emailError('a@b')).toBe('E-mail inválido.')
    expect(emailError('')).toBe('Informe o e-mail do titular.')
  })
})

describe('formatação', () => {
  it('data e valor', () => {
    expect(formatDiaBr('2027-01-15')).toBe('15/01/2027')
    expect(formatDiaBr('2027-01-15T00:00:00Z')).toBe('15/01/2027')
    expect(formatDiaBr('lixo')).toBe('lixo')
    expect(formatBrl(99.9)).toBe('R$ 99,90')
    expect(formatBrl(64.95)).toBe('R$ 64,95')
  })
})

describe('validadores exportados (fonte única cliente e servidor)', () => {
  it('luhnValido só aceita dígitos', () => {
    expect(luhnValido('4111111111111111')).toBe(true)
    expect(luhnValido('4111111111111112')).toBe(false)
    expect(luhnValido('')).toBe(false)
    expect(luhnValido('4111 1111 1111 1111')).toBe(false)
  })
  it('isValidCpf aceita máscara e rejeita repetidos', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true)
    expect(isValidCpf('52998224725')).toBe(true)
    expect(isValidCpf('52998224726')).toBe(false)
    expect(isValidCpf('00000000000')).toBe(false)
    expect(isValidCpf(null)).toBe(false)
  })
  it('isValidCnpj exige 14 dígitos sem máscara', () => {
    expect(isValidCnpj('11222333000181')).toBe(true)
    expect(isValidCnpj('11222333000182')).toBe(false)
    expect(isValidCnpj('11111111111111')).toBe(false)
    expect(isValidCnpj('11.222.333/0001-81')).toBe(false)
  })
})

describe('deveLimparCartao', () => {
  it('limpa em sucesso, 5xx e recusa do cartão', () => {
    expect(deveLimparCartao(200)).toBe(true)
    expect(deveLimparCartao(500)).toBe(true)
    expect(deveLimparCartao(502)).toBe(true)
    expect(deveLimparCartao(422, 'cartao_recusado')).toBe(true)
    expect(deveLimparCartao(422, undefined, 'Cartão recusado. Confira os dados ou use outro cartão.')).toBe(true)
  })
  it('mantém em 422 de outros dados, 409 e 400', () => {
    expect(deveLimparCartao(422, undefined, 'Dados inválidos. Confira os dados do cartão e do titular.')).toBe(false)
    expect(deveLimparCartao(422, 'dados_invalidos', 'Cartão recusado')).toBe(false)
    expect(deveLimparCartao(422)).toBe(false)
    expect(deveLimparCartao(409, 'valor_diferente')).toBe(false)
    expect(deveLimparCartao(409)).toBe(false)
    expect(deveLimparCartao(400)).toBe(false)
  })
})

describe('errosDeCampoVisiveis', () => {
  it('só mostra depois de tentar enviar e esconde após limpeza por erro do servidor', () => {
    expect(errosDeCampoVisiveis(false, false)).toBe(false)
    expect(errosDeCampoVisiveis(true, false)).toBe(true)
    expect(errosDeCampoVisiveis(true, true)).toBe(false)
    expect(errosDeCampoVisiveis(false, true)).toBe(false)
  })
})

describe('detectCardBrand', () => {
  it('reconhece as bandeiras pelo início do número', () => {
    expect(detectCardBrand('4111 1111 1111 1111')).toBe('visa')
    expect(detectCardBrand('4')).toBe('visa')
    expect(detectCardBrand('5555 5555 5555 4444')).toBe('mastercard')
    expect(detectCardBrand('2221 0000 0000 0009')).toBe('mastercard')
    expect(detectCardBrand('2720 9900 0000 0000')).toBe('mastercard')
    expect(detectCardBrand('3714 496353 98431')).toBe('amex')
    expect(detectCardBrand('3411')).toBe('amex')
    expect(detectCardBrand('6062 8288 8866 6688')).toBe('hipercard')
    expect(detectCardBrand('3841 0000 0000 0000')).toBe('hipercard')
  })
  it('Elo vence Visa e Mastercard nas faixas sobrepostas', () => {
    expect(detectCardBrand('4011 7800 0000 0000')).toBe('elo')
    expect(detectCardBrand('5067 0000 0000 0000')).toBe('elo')
    expect(detectCardBrand('6362 9700 0000 0000')).toBe('elo')
    expect(detectCardBrand('6500 3100 0000 0000')).toBe('elo')
    // 5 dígitos ainda não bastam para dizer Elo: segue como Visa
    expect(detectCardBrand('40117')).toBe('visa')
  })
  it('desconhecida ou vazia devolve null', () => {
    expect(detectCardBrand('')).toBeNull()
    expect(detectCardBrand(null)).toBeNull()
    expect(detectCardBrand('9999 9999')).toBeNull()
    expect(detectCardBrand('2220 0000')).toBeNull()
    expect(detectCardBrand('2721 0000')).toBeNull()
  })
  it('normalizeCardBrand lê o texto do servidor', () => {
    expect(normalizeCardBrand('VISA')).toBe('visa')
    expect(normalizeCardBrand('MASTERCARD')).toBe('mastercard')
    expect(normalizeCardBrand('American Express')).toBe('amex')
    expect(normalizeCardBrand('ELO')).toBe('elo')
    expect(normalizeCardBrand('HIPERCARD')).toBe('hipercard')
    expect(normalizeCardBrand('DINERS')).toBeNull()
    expect(normalizeCardBrand(null)).toBeNull()
  })
})

describe('maskCardPreview', () => {
  it('só mostra os 4 últimos dígitos digitados', () => {
    expect(maskCardPreview('4111111111111111')).toBe('•••• •••• •••• 1111')
    expect(maskCardPreview('4111 1111 1111 9876')).toBe('•••• •••• •••• 9876')
  })
  it('sem dígitos ou com poucos, nada vaza', () => {
    expect(maskCardPreview('')).toBe('•••• •••• •••• ••••')
    expect(maskCardPreview('4111')).toBe('•••• •••• •••• ••••')
    expect(maskCardPreview('411111111111')).toBe('•••• •••• •••• ••••')
    // a partir do 13º dígito, só a última posição já digitada aparece
    expect(maskCardPreview('4111111111111')).toBe('•••• •••• •••• 1•••')
  })
  it('Amex agrupa 4-6-5', () => {
    expect(maskCardPreview('371449635398431')).toBe('•••• •••••• •8431')
    expect(maskCardPreview('3714')).toBe('•••• •••••• •••••')
  })
  it('19 dígitos mantêm só os 4 últimos', () => {
    const out = maskCardPreview('6362970000000000123')
    expect(out.replace(/\D/g, '')).toBe('0123')
    expect(out.replace(/[^\d•]/g, '')).toHaveLength(19)
  })
  it('nunca devolve o número inteiro nem o CVV', () => {
    const out = maskCardPreview('4111111111111111')
    expect(out).not.toContain('4111 1111')
    expect(out.replace(/\D/g, '')).toBe('1111')
  })
})
