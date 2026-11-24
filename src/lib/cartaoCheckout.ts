// Funções puras do formulário de cartão do modal de fim de teste: máscaras, validação e formatação.
// Sem React e sem rede. Nada aqui guarda nem registra dados de cartão.

import { maskCpf, onlyDigits } from './numericFormat'

// ── Número do cartão ────────────────────────────────────────────────────────

/** "4111111111111111" → "4111 1111 1111 1111" (grupos de 4, até 19 dígitos). */
export function maskCardNumber(input: string | null | undefined): string {
  const d = onlyDigits(input).slice(0, 19)
  return d.replace(/(\d{4})(?=\d)/g, '$1 ')
}

/** Algoritmo de Luhn sobre uma string só de dígitos. Fonte única: o servidor (validarCartao.ts) importa daqui. */
export function luhnValido(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48
    if (double) { n *= 2; if (n > 9) n -= 9 }
    sum += n
    double = !double
  }
  return sum % 10 === 0
}

export function cardNumberError(value: string): string | null {
  const d = onlyDigits(value)
  if (!d) return 'Informe o número do cartão.'
  if (d.length < 13 || d.length > 19 || !luhnValido(d)) return 'Número do cartão inválido.'
  return null
}

// ── Validade MM/AA ──────────────────────────────────────────────────────────

/**
 * Para DIGITAR ou colar: "1228" → "12/28", "122030" → "12/2030". Aceita MM/AA e MM/AAAA (até 6 dígitos).
 * O mês é limitado a 01–12 (um primeiro dígito 2 a 9 vira 02 a 09).
 */
export function maskExpiry(input: string | null | undefined): string {
  let d = onlyDigits(input).slice(0, 6)
  if (d.length >= 1 && d[0] > '1') d = `0${d}`.slice(0, 6)
  if (d.length >= 2 && Number(d.slice(0, 2)) > 12) d = `12${d.slice(2)}`
  if (d.length === 2 && Number(d) === 0) d = '0'
  if (d.length <= 2) return d
  return `${d.slice(0, 2)}/${d.slice(2)}`
}

/**
 * "12/28" → { month: '12', year: '2028' }; "12/2030" → { month: '12', year: '2030' }.
 * null se incompleto (nem 4 nem 6 dígitos) ou mês fora de 01–12. O ano sai sempre com 4 dígitos (contrato do servidor).
 */
export function parseExpiry(value: string): { month: string; year: string } | null {
  const d = onlyDigits(value)
  if (d.length !== 4 && d.length !== 6) return null
  const month = Number(d.slice(0, 2))
  if (month < 1 || month > 12) return null
  const yy = d.slice(2)
  return { month: d.slice(0, 2), year: yy.length === 2 ? `20${yy}` : yy }
}

export function expiryError(value: string, now: Date = new Date()): string | null {
  if (!onlyDigits(value)) return 'Informe a validade do cartão.'
  const exp = parseExpiry(value)
  if (!exp) return 'Validade inválida. Use MM/AA ou MM/AAAA.'
  const y = Number(exp.year)
  const m = Number(exp.month)
  const cy = now.getFullYear()
  const cm = now.getMonth() + 1
  if (y < cy || (y === cy && m < cm)) return 'Cartão vencido.'
  return null
}

// ── CVV ─────────────────────────────────────────────────────────────────────

export const maskCcv = (input: string | null | undefined): string => onlyDigits(input).slice(0, 4)

export function ccvError(value: string): string | null {
  const d = onlyDigits(value)
  if (!d) return 'Informe o código de segurança.'
  return d.length === 3 || d.length === 4 ? null : 'Código de segurança inválido.'
}

// ── Nome impresso ───────────────────────────────────────────────────────────

export function holderNameError(value: string): string | null {
  const t = value.trim()
  if (!t) return 'Informe o nome impresso no cartão.'
  return t.length >= 3 && /\s/.test(t) ? null : 'Informe o nome completo, como está no cartão.'
}

// ── CPF / CNPJ ──────────────────────────────────────────────────────────────

/** CPF enquanto digita (até 11 dígitos), CNPJ a partir do 12º dígito (até 14). */
export function maskCpfCnpj(input: string | null | undefined): string {
  const d = onlyDigits(input).slice(0, 14)
  if (d.length <= 11) return maskCpf(d)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

/** CPF válido (aceita máscara): 11 números, não todos iguais, dígitos verificadores corretos. */
export function isValidCpf(value: string | null | undefined): boolean {
  const d = onlyDigits(value)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  for (const len of [9, 10]) {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i)
    const dv = ((sum * 10) % 11) % 10
    if (dv !== Number(d[len])) return false
  }
  return true
}

/** CNPJ válido: 14 dígitos (só números), não todos iguais, dígitos verificadores corretos. */
export function isValidCnpj(d: string): boolean {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false
  for (const len of [12, 13]) {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(d[i]) * weights[i]
    const r = sum % 11
    const dv = r < 2 ? 0 : 11 - r
    if (dv !== Number(d[len])) return false
  }
  return true
}

export function cpfCnpjError(value: string): string | null {
  const d = onlyDigits(value)
  if (!d) return 'Informe o CPF ou CNPJ do titular.'
  if (d.length === 11) return isValidCpf(d) ? null : 'CPF inválido.'
  if (d.length === 14) return isValidCnpj(d) ? null : 'CNPJ inválido.'
  return 'CPF ou CNPJ incompleto.'
}

// ── CEP ─────────────────────────────────────────────────────────────────────

export function maskCep(input: string | null | undefined): string {
  const d = onlyDigits(input).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

export function cepError(value: string): string | null {
  const d = onlyDigits(value)
  if (!d) return 'Informe o CEP.'
  return d.length === 8 ? null : 'CEP incompleto.'
}

// ── E-mail ──────────────────────────────────────────────────────────────────

export function emailError(value: string): string | null {
  const t = value.trim()
  if (!t) return 'Informe o e-mail do titular.'
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t) ? null : 'E-mail inválido.'
}

// ── Datas e valores para o resumo e o consentimento ─────────────────────────

/** "2027-01-15" → "15/01/2027". Qualquer outra coisa volta como está. */
export function formatDiaBr(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : day
}

/** 99.9 → "R$ 99,90". */
export function formatBrl(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`
}

// ── Resposta do servidor ────────────────────────────────────────────────────

/**
 * Se os dados sensíveis do cartão (número, validade, CVV) devem ser apagados depois da resposta do POST de
 * assinatura. Apaga em sucesso, em 5xx e em recusa do cartão (422 de cartão). Mantém em 409, 400 e em 422 de
 * CEP, CPF, endereço ou outros dados, para a pessoa corrigir sem redigitar.
 * `code` é o campo opcional `code` do JSON de erro; sem ele, a recusa é reconhecida pela mensagem do servidor.
 */
export function deveLimparCartao(status: number, code?: string | null, message?: string | null): boolean {
  if (status >= 200 && status < 300) return true
  if (status >= 500) return true
  if (status === 422) return code === 'cartao_recusado' || (!code && /^cart[aã]o recusado/i.test(message ?? ''))
  return false
}

/**
 * Erros de campo (inclusive "obrigatório") só aparecem depois de uma tentativa de envio e somem quando
 * os campos do cartão foram limpos por causa do erro da resposta: ficam só a mensagem do servidor e os campos
 * vazios sem vermelho, até a próxima tentativa de envio.
 */
export function errosDeCampoVisiveis(tentouEnviar: boolean, limpoPorErro: boolean): boolean {
  return tentouEnviar && !limpoPorErro
}

// ── Bandeira e cartão visual ────────────────────────────────────────────────

export type CardBrand = 'visa' | 'mastercard' | 'elo' | 'amex' | 'hipercard'

export const CARD_BRAND_LABELS: Record<CardBrand, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  elo: 'Elo',
  amex: 'American Express',
  hipercard: 'Hipercard',
}

const ELO_PREFIXES = [
  '401178', '401179', '438935', '457631', '457632', '431274', '451416', '457393', '504175', '627780', '636297', '636368',
]
// faixas de 6 dígitos (inclusive) usadas pela Elo
const ELO_RANGES: Array<[number, number]> = [
  [506699, 506778], [509000, 509999], [650031, 650033], [650035, 650051], [650405, 650439], [650485, 650538],
  [650541, 650598], [650700, 650718], [650720, 650727], [650901, 650978], [651652, 651679], [655000, 655019], [655021, 655058],
]
const HIPERCARD_PREFIXES = ['606282', '3841', '637095', '637568', '637599', '637609', '637612']

/**
 * Bandeira pelo início do número (só dígitos são considerados). Elo e Hipercard vêm antes de Visa e Mastercard
 * porque suas faixas se sobrepõem. Com poucos dígitos devolve só o que já dá para afirmar; null se desconhecida.
 */
export function detectCardBrand(input: string | null | undefined): CardBrand | null {
  const d = onlyDigits(input)
  if (!d) return null
  if (d.length >= 6) {
    const six = d.slice(0, 6)
    if (ELO_PREFIXES.includes(six)) return 'elo'
    const n = Number(six)
    if (ELO_RANGES.some(([a, b]) => n >= a && n <= b)) return 'elo'
  }
  if (HIPERCARD_PREFIXES.some(p => d.startsWith(p))) return 'hipercard'
  if (/^3[47]/.test(d)) return 'amex'
  if (/^5[1-5]/.test(d)) return 'mastercard'
  if (d.length >= 4 && Number(d.slice(0, 4)) >= 2221 && Number(d.slice(0, 4)) <= 2720) return 'mastercard'
  if (d[0] === '4') return 'visa'
  return null
}

/** Bandeira devolvida pelo servidor ("VISA", "MASTERCARD", "American Express"...) → CardBrand; null se não reconhece. */
export function normalizeCardBrand(raw: string | null | undefined): CardBrand | null {
  const t = (raw ?? '').toLowerCase().replace(/[^a-z]/g, '')
  if (!t) return null
  if (t.includes('visa')) return 'visa'
  if (t.includes('master')) return 'mastercard'
  if (t.includes('elo')) return 'elo'
  if (t.includes('amex') || t.includes('american')) return 'amex'
  if (t.includes('hiper')) return 'hipercard'
  return null
}

/**
 * Número para o cartão desenhado na tela: nunca mostra o número inteiro. Só os 4 últimos dígitos digitados
 * aparecem; o resto (e as posições ainda vazias) vira "•". Amex agrupa 4-6-5, as demais de 4 em 4.
 * "4111111111111111" → "•••• •••• •••• 1111". Puramente visual: não é o valor enviado ao servidor.
 */
export function maskCardPreview(input: string | null | undefined, brand: CardBrand | null = detectCardBrand(input)): string {
  const d = onlyDigits(input).slice(0, 19)
  const total = brand === 'amex' ? 15 : Math.max(16, d.length)
  let out = ''
  for (let i = 0; i < total; i++) {
    out += i < d.length && i >= total - 4 ? d[i] : '•'
  }
  const groups = brand === 'amex' ? [4, 6, 5] : null
  if (groups) return `${out.slice(0, 4)} ${out.slice(4, 10)} ${out.slice(10)}`
  return out.replace(/(.{4})(?=.)/g, '$1 ')
}
