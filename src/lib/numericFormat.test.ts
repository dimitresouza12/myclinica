import { describe, it, expect } from 'vitest'
import {
  maskCpf, isCompleteCpf, cpfInputError, formatCpf, cpfToInputValue, previousCpfNote, CPF_INCOMPLETE,
  maskInteger, clampInteger, maskMoney, moneyToDecimal, decimalToMoney, maskPercent, percentToDecimal, decimalToPercent,
  maskDecimal, maskDateBR, dateBRToISO, dateInputError, isoToDateBR, DATE_INCOMPLETE, DATE_INVALID,
} from './numericFormat'

/** Simula digitar tecla por tecla: cada tecla entra no que já está no campo e a máscara é aplicada. */
function typeKeys(mask: (s: string) => string, keys: string): string {
  let v = ''
  for (const ch of keys) v = mask(v + ch)
  return v
}

describe('CPF', () => {
  it('máscara aos poucos, tecla por tecla', () => {
    const steps = ['1', '12', '123', '123.4', '123.45', '123.456', '123.456.7', '123.456.78', '123.456.789', '123.456.789-0', '123.456.789-09']
    let v = ''
    '12345678909'.split('').forEach((ch, i) => { v = maskCpf(v + ch); expect(v).toBe(steps[i]) })
  })
  it('só dígitos e no máximo 11', () => {
    expect(typeKeys(maskCpf, '12a3.45b6-78 909999')).toBe('123.456.789-09')
    expect(maskCpf('abc')).toBe('')
    expect(maskCpf(null)).toBe('')
  })
  it('colar com ou sem pontuação dá o mesmo', () => {
    expect(maskCpf('123.456.789-09')).toBe('123.456.789-09')
    expect(maskCpf('12345678909')).toBe('123.456.789-09')
    expect(maskCpf('  123 456 789 09 ')).toBe('123.456.789-09')
  })
  it('é idempotente', () => {
    for (const s of ['', '1', '123456', '12345678909', '123.456.789-09', 'x1y2', '99999999999999']) expect(maskCpf(maskCpf(s))).toBe(maskCpf(s))
  })
  it('exatamente 11 números', () => {
    expect(isCompleteCpf('123.456.789-09')).toBe(true)
    expect(isCompleteCpf('123.456.789-0')).toBe(false)
    expect(isCompleteCpf('')).toBe(false)
  })
  it('erro do campo', () => {
    expect(cpfInputError('')).toBeNull()
    expect(cpfInputError('', { required: true })).toBe('Informe o CPF.')
    expect(cpfInputError('123.456')).toBe(CPF_INCOMPLETE)
    expect(cpfInputError('123.456.789-09')).toBeNull()
  })
  it('exibição: 11 dígitos formatados, o resto como está', () => {
    expect(formatCpf('12345678909')).toBe('123.456.789-09')
    expect(formatCpf('123.456.789-09')).toBe('123.456.789-09')
    expect(formatCpf('123456')).toBe('123456')
    expect(formatCpf('')).toBe('')
    expect(formatCpf(null)).toBe('')
  })
  it('cadastro antigo: campo começa vazio se não tem 11 dígitos, e a tela avisa', () => {
    expect(cpfToInputValue('12345678909')).toBe('123.456.789-09')
    expect(cpfToInputValue('123456')).toBe('')
    expect(previousCpfNote('123456')).toBe('123456')
    expect(previousCpfNote('12345678909')).toBeNull()
    expect(previousCpfNote('')).toBeNull()
  })
})

describe('inteiro', () => {
  it('só dígitos, sem zero à esquerda', () => {
    expect(maskInteger('12a3')).toBe('123')
    expect(maskInteger('007')).toBe('7')
    expect(maskInteger('0')).toBe('0')
    expect(maskInteger('')).toBe('')
    expect(maskInteger(null)).toBe('')
    expect(maskInteger(45)).toBe('45')
    expect(maskInteger('-5')).toBe('5')
    expect(maskInteger('1,5')).toBe('15')
  })
  it('com máximo, o dígito que estoura é descartado', () => {
    expect(typeKeys(s => maskInteger(s, { max: 28 }), '29')).toBe('2')
    expect(typeKeys(s => maskInteger(s, { max: 28 }), '28')).toBe('28')
    expect(typeKeys(s => maskInteger(s, { max: 28 }), '30')).toBe('3')
    expect(maskInteger('999', { max: 100 })).toBe('99')
  })
  it('ao sair: abaixo do mínimo sobe, acima do máximo desce, vazio continua vazio', () => {
    expect(clampInteger('3', { min: 5 })).toBe('5')
    expect(clampInteger('15', { min: 5 })).toBe('15')
    expect(clampInteger('40', { max: 28 })).toBe('28')
    expect(clampInteger('', { min: 5 })).toBe('')
  })
})

describe('valor em reais (só dígitos, centavos pela direita)', () => {
  it('digitando 1, 8, 0, 0, 0, 0', () => {
    const steps = ['0,01', '0,18', '1,80', '18,00', '180,00', '1.800,00']
    let v = ''
    '180000'.split('').forEach((ch, i) => { v = maskMoney(v + ch); expect(v).toBe(steps[i]) })
  })
  it('apagar tira o último dígito', () => {
    expect(maskMoney('1.800,0')).toBe('180,00')
    expect(maskMoney('0,0')).toBe('0,00')
    expect(maskMoney('0,')).toBe('0,00')
    expect(maskMoney('')).toBe('')
  })
  it('descarta letras e limita o tamanho', () => {
    expect(maskMoney('R$ 1a2')).toBe('0,12')
    expect(maskMoney('99999999999999')).toBe('999.999.999,99')
  })
  it('converte para o texto com ponto decimal que o sistema espera', () => {
    expect(moneyToDecimal('1.800,00')).toBe('1800.00')
    expect(moneyToDecimal('0,05')).toBe('0.05')
    expect(moneyToDecimal('12,50')).toBe('12.50')
    expect(moneyToDecimal('')).toBe('')
  })
  it('valor já guardado volta ao campo', () => {
    expect(decimalToMoney(1800)).toBe('1.800,00')
    expect(decimalToMoney('1800.5')).toBe('1.800,50')
    expect(decimalToMoney('150')).toBe('150,00')
    expect(decimalToMoney(0)).toBe('0,00')
    expect(decimalToMoney(0.1 + 0.2)).toBe('0,30')       // sem erro de ponto flutuante
    expect(decimalToMoney('')).toBe('')
    expect(decimalToMoney(null)).toBe('')
    expect(decimalToMoney(-5)).toBe('')
    expect(decimalToMoney('abc')).toBe('')
  })
  it('ida e volta não perde centavo', () => {
    for (const v of ['0.01', '1.50', '1800.00', '99999.99', '123456.78']) expect(moneyToDecimal(decimalToMoney(v))).toBe(v)
  })
})

describe('percentual', () => {
  it('dígitos e uma vírgula, uma casa', () => {
    expect(typeKeys(s => maskPercent(s), '37,5')).toBe('37,5')
    expect(maskPercent('37.5')).toBe('37,5')
    expect(maskPercent('37,55')).toBe('37,5')
    expect(maskPercent('3,7,5')).toBe('3,75'.slice(0, 3))
    expect(maskPercent('abc')).toBe('')
  })
  it('não passa de 100', () => {
    expect(maskPercent('150')).toBe('15')
    expect(maskPercent('100')).toBe('100')
    expect(maskPercent('100,5')).toBe('100')
    expect(maskPercent('101')).toBe('10')
  })
  it('vírgula sozinha vira 0,', () => {
    expect(maskPercent(',5')).toBe('0,5')
    expect(maskPercent('5,')).toBe('5,')
  })
  it('conversões', () => {
    expect(percentToDecimal('37,5')).toBe('37.5')
    expect(percentToDecimal('40')).toBe('40')
    expect(percentToDecimal('5,')).toBe('5')
    expect(percentToDecimal('')).toBe('')
    expect(decimalToPercent(37.5)).toBe('37,5')
    expect(decimalToPercent('40')).toBe('40')
    expect(decimalToPercent('')).toBe('')
    expect(decimalToPercent(null)).toBe('')
  })
})

describe('decimal genérico (peso)', () => {
  it('até 2 casas e valor máximo à escolha', () => {
    expect(maskDecimal('4,255', { max: 200, decimals: 2 })).toBe('4,25')
    expect(maskDecimal('250', { max: 200, decimals: 2 })).toBe('25')
    expect(maskDecimal('12.5', { max: 200, decimals: 2 })).toBe('12,5')
  })
})

describe('data DD/MM/AAAA', () => {
  it('digitando tecla por tecla', () => {
    const steps = ['3', '31', '31/1', '31/12', '31/12/1', '31/12/19', '31/12/199', '31/12/1990']
    let v = ''
    '31121990'.split('').forEach((ch, i) => { v = maskDateBR(v + ch); expect(v).toBe(steps[i]) })
  })
  it('só números e só o que pode ser uma data', () => {
    expect(typeKeys(maskDateBR, '4')).toBe('')            // dia não começa com 4
    expect(typeKeys(maskDateBR, '32')).toBe('3')          // dia 32 não existe
    expect(typeKeys(maskDateBR, '00')).toBe('0')          // dia 00 não existe
    expect(typeKeys(maskDateBR, '0113')).toBe('01/1')     // mês 13 não existe
    expect(typeKeys(maskDateBR, '01013')).toBe('01/01')   // ano não começa com 3
    expect(typeKeys(maskDateBR, '010118')).toBe('01/01/1')// ano 18xx não existe
    expect(typeKeys(maskDateBR, '31/12/1990 99')).toBe('31/12/1990')
    expect(maskDateBR('ab')).toBe('')
    expect(maskDateBR(null)).toBe('')
  })
  it('colar com barras ou só números', () => {
    expect(maskDateBR('31/12/1990')).toBe('31/12/1990')
    expect(maskDateBR('31121990')).toBe('31/12/1990')
  })
  it('é idempotente', () => {
    for (const s of ['', '3', '31/1', '31/12/1990', '99', 'x']) expect(maskDateBR(maskDateBR(s))).toBe(maskDateBR(s))
  })
  it('só vale data real do calendário', () => {
    const now = new Date('2026-10-15T12:00:00Z')
    expect(dateBRToISO('31/12/1990', { now })).toBe('1990-12-31')
    expect(dateBRToISO('29/02/2024', { now })).toBe('2024-02-29')
    expect(dateBRToISO('29/02/2023', { now })).toBeNull()   // 2023 não é bissexto
    expect(dateBRToISO('31/04/2000', { now })).toBeNull()   // abril tem 30 dias
    expect(dateBRToISO('31/12/199', { now })).toBeNull()    // incompleta
  })
  it('nascimento não pode ser no futuro, a menos que se permita', () => {
    const now = new Date('2026-10-15T12:00:00Z')
    expect(dateBRToISO('16/10/2026', { now })).toBeNull()
    expect(dateBRToISO('16/10/2026', { now, allowFuture: true })).toBe('2026-10-16')
    expect(dateBRToISO('15/10/2026', { now })).toBe('2026-10-15')
  })
  it('mensagens de erro', () => {
    const now = new Date('2026-10-15T12:00:00Z')
    expect(dateInputError('', { now })).toBeNull()
    expect(dateInputError('31/12/19', { now })).toBe(DATE_INCOMPLETE)
    expect(dateInputError('31/04/2000', { now })).toBe(DATE_INVALID)
    expect(dateInputError('31/12/1990', { now })).toBeNull()
  })
  it('ISO do banco volta para dd/mm/aaaa', () => {
    expect(isoToDateBR('1990-12-31')).toBe('31/12/1990')
    expect(isoToDateBR('1990-12-31T00:00:00+00:00')).toBe('31/12/1990')
    expect(isoToDateBR(null)).toBe('')
    expect(isoToDateBR('lixo')).toBe('')
  })
})
