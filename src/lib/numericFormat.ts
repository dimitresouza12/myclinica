// Campos que só aceitam número: CPF, inteiros (minutos, quantidade, dia), valores em reais e percentuais.
// Em todos, só dígitos são aceitos na digitação (o resto é descartado na hora) e o teclado do celular é
// o numérico. Funções puras, sem React e sem rede. O telefone tem o próprio módulo (phoneFormat.ts).

export const onlyDigits = (s: string | null | undefined): string => (s ?? '').replace(/\D/g, '')

// ── CPF ─────────────────────────────────────────────────────────────────────

export const CPF_PLACEHOLDER = '000.000.000-00'
export const CPF_INCOMPLETE = 'CPF incompleto. Digite os 11 números.'
const CPF_DIGITS = 11

/** Para DIGITAR: "12345678909" → "123.456.789-09", aos poucos. Passa de 11 dígitos? O resto é descartado. */
export function maskCpf(input: string | null | undefined): string {
  const d = onlyDigits(input).slice(0, CPF_DIGITS)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

/** CPF com exatamente 11 números. (Não confere os dígitos verificadores: só a quantidade.) */
export function isCompleteCpf(value: string | null | undefined): boolean {
  return onlyDigits(maskCpf(value)).length === CPF_DIGITS
}

export function cpfInputError(value: string | null | undefined, opts: { required?: boolean } = {}): string | null {
  if (!(value ?? '').trim()) return opts.required ? 'Informe o CPF.' : null
  return isCompleteCpf(value) ? null : CPF_INCOMPLETE
}

/** Para MOSTRAR: 11 dígitos viram "123.456.789-09"; qualquer outra coisa aparece como está. Vazio → ''. */
export function formatCpf(raw: string | null | undefined): string {
  const text = (raw ?? '').toString().trim()
  if (!text) return ''
  return onlyDigits(text).length === CPF_DIGITS ? maskCpf(text) : text
}

/** Valor inicial de um campo de CPF a partir do que está guardado: formatado se tiver 11 dígitos, senão vazio. */
export function cpfToInputValue(stored: string | null | undefined): string {
  return onlyDigits(stored).length === CPF_DIGITS ? maskCpf(stored) : ''
}

/** O que está guardado e o campo não consegue mostrar (CPF incompleto ou com dígitos a mais), para a tela avisar. */
export function previousCpfNote(stored: string | null | undefined): string | null {
  const text = (stored ?? '').toString().trim()
  if (!text) return null
  return onlyDigits(text).length === CPF_DIGITS ? null : text
}

// ── inteiro ─────────────────────────────────────────────────────────────────

/**
 * Só dígitos, sem zero à esquerda. Com `max`, o dígito que faria passar do máximo é descartado
 * (com max 28, digitar 2 e depois 9 deixa "2"; com max 100, digitar 1, 0, 0 e depois 0 deixa "100").
 */
export function maskInteger(input: string | number | null | undefined, opts: { max?: number } = {}): string {
  let out = ''
  for (const ch of onlyDigits(String(input ?? ''))) {
    const next = (out + ch).replace(/^0+(?=\d)/, '')
    if (opts.max !== undefined && Number(next) > opts.max) break
    out = next
  }
  return out
}

/** Ao sair do campo: abaixo do mínimo sobe para o mínimo (durante a digitação "1" a caminho de "15" precisa passar). */
export function clampInteger(value: string, opts: { min?: number; max?: number }): string {
  if (value === '') return ''
  const n = Number(value)
  if (opts.min !== undefined && n < opts.min) return String(opts.min)
  if (opts.max !== undefined && n > opts.max) return String(opts.max)
  return value
}

// ── valor em reais ──────────────────────────────────────────────────────────

const MONEY_MAX_DIGITS = 11 // até R$ 999.999.999,99

/**
 * Para DIGITAR dinheiro só com números: cada dígito entra pela direita, como no caixa eletrônico.
 * Digitar 1,8,0,0,0,0 mostra "1.800,00". Vazio fica vazio.
 */
export function maskMoney(input: string | null | undefined): string {
  const digits = onlyDigits(input).replace(/^0+/, '').slice(0, MONEY_MAX_DIGITS)
  if (digits === '') return onlyDigits(input) === '' ? '' : '0,00'
  const padded = digits.padStart(3, '0')
  const int = padded.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${int},${padded.slice(-2)}`
}

/** "1.234,56" → "1234.56" (texto com ponto decimal, o que o resto do sistema espera). Vazio → ''. */
export function moneyToDecimal(masked: string): string {
  const digits = onlyDigits(masked)
  if (digits === '') return ''
  const padded = digits.padStart(3, '0')
  return `${padded.slice(0, -2).replace(/^0+(?=\d)/, '')}.${padded.slice(-2)}`
}

/** 1800 / "1800.5" → "1.800,00" / "1.800,50". Vazio, inválido ou negativo → ''. */
export function decimalToMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return ''
  return maskMoney(String(Math.round(n * 100)))
}

// ── percentual ──────────────────────────────────────────────────────────────

/**
 * Dígitos e UMA vírgula (aceita o ponto e troca por vírgula), com até `decimals` casas e valor máximo `max`.
 * "37,5" fica; "37,55" perde o último 5; "150" perde o último 0 (max 100).
 */
export function maskPercent(input: string | null | undefined, opts: { max?: number; decimals?: number } = {}): string {
  const { max = 100, decimals = 1 } = opts
  const text = (input ?? '').replace(/[^\d.,]/g, '').replace(/\./g, ',')
  const [intRaw, ...rest] = text.split(',')
  const hasSep = rest.length > 0 && decimals > 0
  let out = ''
  for (const ch of intRaw) {
    const next = (out + ch).replace(/^0+(?=\d)/, '')
    if (Number(next) > max) break
    out = next
  }
  if (!hasSep) return out
  const dec = rest.join('').slice(0, decimals)
  const candidate = `${out || '0'},${dec}`
  return Number(candidate.replace(',', '.')) > max ? out : candidate
}

/** "37,5" → "37.5" (ponto decimal para o resto do sistema). Vazio → ''. */
export function percentToDecimal(masked: string): string {
  if (masked === '') return ''
  return masked.endsWith(',') ? masked.slice(0, -1) : masked.replace(',', '.')
}

/** 37.5 / "40" → "37,5" / "40". */
export function decimalToPercent(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? String(n).replace('.', ',') : ''
}

/** Mesma máscara do percentual, para qualquer número decimal (peso em kg, por exemplo): `max` e `decimals` à escolha. */
export const maskDecimal = maskPercent

// ── data DD/MM/AAAA ─────────────────────────────────────────────────────────

export const DATE_PLACEHOLDER = 'DD/MM/AAAA'
export const DATE_INCOMPLETE = 'Data incompleta. Digite dia, mês e ano com 8 números.'
export const DATE_INVALID = 'Data inválida. Confira o dia, o mês e o ano.'

/** O prefixo de dígitos ainda pode virar uma data válida? (dia 01–31, mês 01–12, ano 1900–2099.) */
function datePrefixOk(p: string): boolean {
  if (p.length === 1) return /[0-3]/.test(p)
  if (p.length === 2) { const n = Number(p); return n >= 1 && n <= 31 }
  if (p.length === 3) return /[0-1]/.test(p[2])
  if (p.length === 4) { const n = Number(p.slice(2, 4)); return n >= 1 && n <= 12 }
  if (p.length === 5) return /[12]/.test(p[4])
  if (p.length === 6) return /^(19|20)$/.test(p.slice(4, 6))
  return p.length <= 8
}

/** Para DIGITAR uma data: só números, e dígitos que não formam uma data possível são descartados. */
export function maskDateBR(input: string | null | undefined): string {
  let d = ''
  for (const ch of onlyDigits(input)) {
    if (!datePrefixOk(d + ch)) break
    d += ch
  }
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

/** "31/12/1990" → "1990-12-31" se for uma data real do calendário (e, por padrão, não futura); senão null. */
export function dateBRToISO(value: string | null | undefined, opts: { allowFuture?: boolean; now?: Date } = {}): string | null {
  const d = onlyDigits(maskDateBR(value))
  if (d.length !== 8) return null
  const day = Number(d.slice(0, 2)), month = Number(d.slice(2, 4)), year = Number(d.slice(4))
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null
  if (!opts.allowFuture && probe.getTime() > (opts.now ?? new Date()).getTime()) return null
  return `${d.slice(4)}-${d.slice(2, 4)}-${d.slice(0, 2)}`
}

export function dateInputError(value: string | null | undefined, opts: { allowFuture?: boolean; now?: Date } = {}): string | null {
  if (!(value ?? '').trim()) return null
  if (onlyDigits(maskDateBR(value)).length !== 8) return DATE_INCOMPLETE
  return dateBRToISO(value, opts) ? null : DATE_INVALID
}

/** "1990-12-31" (ou "1990-12-31T00:00:00Z") → "31/12/1990"; vazio ou fora do padrão → ''. */
export function isoToDateBR(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}
