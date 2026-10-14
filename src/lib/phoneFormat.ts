// Telefone brasileiro: UM formato para digitar e para mostrar, em todo o sistema.
//
//   celular  (85) 99999-8888     DDD + 9 + 8 dígitos
//   fixo     (85) 3222-1111      DDD + 8 dígitos começando em 2 a 5
//
// Só existe um jeito de escrever, então não há dúvida sobre 55, zero na frente ou nono dígito.
// Funções puras, sem React e sem rede.

import { brPhonesIn, isValidBrPhone } from './whatsapp/phone'

export const PHONE_PLACEHOLDER = '(85) 99999-8888'
export const PHONE_HINT = 'Celular: (DDD) 9XXXX-XXXX. Fixo: (DDD) XXXX-XXXX.'
export const PHONE_INCOMPLETE = 'Telefone incompleto. Use (DDD) 9XXXX-XXXX para celular ou (DDD) XXXX-XXXX para fixo.'

const digitsOf = (s: string) => s.replace(/\D/g, '')

/** "85999998888" → "(85) 99999-8888"; "8532221111" → "(85) 3222-1111". Espera 10 ou 11 dígitos válidos. */
export function formatNational(d: string): string {
  return d.length === 11
    ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
    : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
}

/**
 * Para MOSTRAR. Reconhece qualquer forma em que o telefone foi guardado (só dígitos, com 55, com zero na
 * frente, pontuação, "5585…@s.whatsapp.net") e devolve "(85) 99999-8888". Campo com mais de um número
 * mostra todos separados por " / ". Se não for um telefone brasileiro reconhecível, devolve o texto como está.
 * Vazio → ''.
 */
export function formatBrPhone(raw: string | null | undefined): string {
  const text = (raw ?? '').toString().trim()
  if (!text) return ''
  const nums = brPhonesIn(text)
  return nums.length > 0 ? nums.map(formatNational).join(' / ') : text
}

// ── digitação ───────────────────────────────────────────────────────────────

/** O prefixo de dígitos ainda pode virar um telefone brasileiro válido? */
function prefixOk(p: string): boolean {
  if (p.length === 1) return /[1-9]/.test(p)
  if (p.length === 2) { const n = Number(p); return n >= 11 && n <= 99 }
  if (p.length === 3) return /[2-59]/.test(p[2]) // 9 = celular; 2 a 5 = fixo
  return p.length <= (p[2] === '9' ? 11 : 10)
}

function render(d: string): string {
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  const ddd = d.slice(0, 2)
  const rest = d.slice(2)
  const mobile = rest[0] === '9'
  const cut = mobile ? 5 : 4
  return `(${ddd}) ${rest.length <= cut ? rest : `${rest.slice(0, cut)}-${rest.slice(cut)}`}`
}

/**
 * Para DIGITAR. Recebe o que veio do campo (digitado, apagado ou colado) e devolve o texto já no
 * formato. Dígitos que não cabem num telefone brasileiro são descartados: DDD fora de 11–99, terceiro
 * dígito que não seja 9 (celular) ou 2 a 5 (fixo), e dígitos além do tamanho. Colado com o código do
 * país ("+55 85 99999-8888") ou com zero na frente ("085 …"), o excesso é removido.
 */
export function maskBrPhone(input: string | null | undefined): string {
  let d = digitsOf(input ?? '')
  // colado com o DDI: só dá para ter 12+ dígitos começando em 55 por colagem (digitando, o limite é 11)
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2)
  d = d.replace(/^0+/, '')

  let out = ''
  for (const ch of d) {
    const next = out + ch
    if (!prefixOk(next)) break
    out = next
  }
  return render(out)
}

/** Número completo no formato: celular de 11 dígitos ou fixo de 10. */
export function isCompleteBrPhone(value: string | null | undefined): boolean {
  const d = digitsOf(maskBrPhone(value))
  return isValidBrPhone(d)
}

/** Mensagem de erro para o campo, ou null se está certo. Vazio só é erro se o campo for obrigatório. */
export function phoneInputError(value: string | null | undefined, opts: { required?: boolean } = {}): string | null {
  if (!(value ?? '').trim()) return opts.required ? 'Informe o telefone.' : null
  return isCompleteBrPhone(value) ? null : PHONE_INCOMPLETE
}

/** Posição do cursor logo depois do n-ésimo dígito de um texto já formatado (para não pular ao editar no meio). */
export function caretAfterDigits(masked: string, n: number): number {
  if (n <= 0) return 0
  let seen = 0
  for (let i = 0; i < masked.length; i++) {
    if (/\d/.test(masked[i])) seen++
    if (seen === n) return i + 1
  }
  return masked.length
}

// ── cadastros antigos ───────────────────────────────────────────────────────

/** Valor inicial de um campo de telefone a partir do que está guardado: o primeiro número válido, formatado, ou ''. */
export function toInputValue(stored: string | null | undefined): string {
  const first = brPhonesIn(stored)[0]
  return first ? formatNational(first) : ''
}

/**
 * Se o que está guardado tem algo que o campo não consegue mostrar (outro número, ou um telefone sem DDD),
 * devolve o texto original para a tela avisar; senão null. Evita sumir com informação em silêncio.
 */
export function previousPhoneNote(stored: string | null | undefined): string | null {
  const text = (stored ?? '').toString().trim()
  if (!text) return null
  const shown = digitsOf(toInputValue(text))
  const kept = digitsOf(text).replace(/^0+/, '').replace(/^55(?=\d{10,11}$)/, '')
  return shown !== kept ? text : null
}

/** Número para o link wa.me ("5585999998888"), ou '' se não for um telefone brasileiro válido. */
export function waMeNumber(raw: string | null | undefined): string {
  const first = brPhonesIn(raw).find(n => n.length === 11) ?? brPhonesIn(raw)[0]
  return first ? `55${first}` : ''
}
