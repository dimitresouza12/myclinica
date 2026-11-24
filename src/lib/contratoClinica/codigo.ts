// Código de confirmação (OTP) da assinatura do contrato, enviado por WhatsApp. SÓ NO SERVIDOR (node:crypto).
//
// - 6 dígitos, gerado com randomInt (CSPRNG).
// - O banco guarda só o HMAC-SHA256 (segredo do servidor + id do contrato + código). Um hash simples não serve:
//   são só 1 milhão de combinações e a tabela é legível por membros da clínica, então o hash seria revertido
//   offline em segundos. Com o segredo (que fica só no servidor) isso deixa de ser possível.
// - Expira em 10 minutos, aceita no máximo 5 tentativas por código e a comparação é em tempo constante.
// - Funções puras (relógio e segredo entram por parâmetro): o estado vive em clinic_agreements.

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { sha256Hex } from '@/lib/portal/token'

export const CODE_LENGTH = 6
export const CODE_TTL_MS = 10 * 60_000
export const MAX_CODE_ATTEMPTS = 5

/** Limites de envio (persistidos em clinic_agreement_code_log): sobrevivem a reinício do servidor. */
export const SEND_LIMITS = {
  /** Intervalo mínimo entre dois envios do mesmo contrato. */
  cooldownMs: 60_000,
  /** Máximo de envios por contrato na janela perHourWindowMs. */
  perAgreementPerHour: 4,
  /** Máximo de envios por clínica em 24 horas. */
  perClinicPerDay: 10,
} as const
const HOUR_MS = 60 * 60_000
const DAY_MS = 24 * HOUR_MS

export function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0')
}

export function isWellFormedCode(code: unknown): code is string {
  return typeof code === 'string' && /^\d{6}$/.test(code)
}

/** Segredo do HMAC do código: CONTRACT_CODE_SECRET (16+ caracteres) ou derivado da chave de serviço; null se nenhum existir. */
export function codeSecret(env: Record<string, string | undefined> = process.env): string | null {
  const explicit = env.CONTRACT_CODE_SECRET?.trim()
  if (explicit && explicit.length >= 16) return explicit
  const base = env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) return null
  return sha256Hex(`myclinica-contract-code:${base}`)
}

export function hashCode(secret: string, agreementId: string, code: string): string {
  return createHmac('sha256', secret).update(`code:${agreementId}:${code}`, 'utf8').digest('hex')
}

/** HMAC do destino (telefone) para o log de envios: não guarda o número em claro. */
export function hashDestination(secret: string, phone: string): string {
  return createHmac('sha256', secret).update(`dest:${phone}`, 'utf8').digest('hex')
}

/** Telefone mascarado para mostrar na tela e guardar em code_sent_to: "(85) *****-1234". */
export function maskPhone(national: string): string {
  const d = national.replace(/\D/g, '')
  if (d.length < 10) return '*****'
  return `(${d.slice(0, 2)}) *****-${d.slice(-4)}`
}

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex')
  const bb = Buffer.from(b, 'hex')
  if (ba.length === 0 || ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export type CodeCheck =
  | { ok: true }
  | { ok: false; reason: 'sem_codigo' | 'expirado' | 'tentativas' | 'formato' | 'incorreto' }

export interface CodeState {
  codeHash: string | null
  expiresAt: string | null
  attempts: number
}

/**
 * Confere o código digitado. Pura: não altera nada. Quem chama grava a tentativa ANTES de chamar isto
 * (reserva a tentativa) para que tentativas paralelas não passem do limite.
 * `attempts` aqui é o valor JÁ com a tentativa atual contada, então a quinta ainda vale e a sexta não.
 */
export function checkCode(opts: {
  state: CodeState
  input: unknown
  secret: string
  agreementId: string
  now?: Date
}): CodeCheck {
  const { state, secret, agreementId } = opts
  const now = (opts.now ?? new Date()).getTime()
  if (!state.codeHash || !state.expiresAt) return { ok: false, reason: 'sem_codigo' }
  if (state.attempts > MAX_CODE_ATTEMPTS) return { ok: false, reason: 'tentativas' }
  const exp = new Date(state.expiresAt).getTime()
  if (Number.isNaN(exp) || exp <= now) return { ok: false, reason: 'expirado' }
  if (!isWellFormedCode(opts.input)) return { ok: false, reason: 'formato' }
  const given = hashCode(secret, agreementId, opts.input)
  return safeEqualHex(given, state.codeHash) ? { ok: true } : { ok: false, reason: 'incorreto' }
}

export type SendDecision =
  | { ok: true }
  | { ok: false; reason: 'aguarde' | 'limite_contrato' | 'limite_clinica'; retryAfterSeconds: number }

/**
 * Decide se um novo código pode ser enviado. `agreementSentAt` são os envios (ISO) deste contrato nas últimas
 * 24h e `clinicSentAt` os da clínica inteira nas últimas 24h, vindos de clinic_agreement_code_log.
 */
export function canSendCode(opts: { agreementSentAt: string[]; clinicSentAt: string[]; now?: Date }): SendDecision {
  const now = (opts.now ?? new Date()).getTime()
  const ms = (iso: string) => new Date(iso).getTime()
  const secs = (ms_: number) => Math.max(Math.ceil(ms_ / 1000), 1)

  const mine = opts.agreementSentAt.map(ms).filter(t => !Number.isNaN(t))
  const clinic = opts.clinicSentAt.map(ms).filter(t => !Number.isNaN(t) && now - t < DAY_MS)

  const last = mine.length > 0 ? Math.max(...mine) : null
  if (last !== null && now - last < SEND_LIMITS.cooldownMs) {
    return { ok: false, reason: 'aguarde', retryAfterSeconds: secs(SEND_LIMITS.cooldownMs - (now - last)) }
  }

  const lastHour = mine.filter(t => now - t < HOUR_MS).sort((a, b) => a - b)
  if (lastHour.length >= SEND_LIMITS.perAgreementPerHour) {
    const oldest = lastHour[lastHour.length - SEND_LIMITS.perAgreementPerHour]
    return { ok: false, reason: 'limite_contrato', retryAfterSeconds: secs(HOUR_MS - (now - oldest)) }
  }

  if (clinic.length >= SEND_LIMITS.perClinicPerDay) {
    const sorted = [...clinic].sort((a, b) => a - b)
    const oldest = sorted[sorted.length - SEND_LIMITS.perClinicPerDay]
    return { ok: false, reason: 'limite_clinica', retryAfterSeconds: secs(DAY_MS - (now - oldest)) }
  }
  return { ok: true }
}

export const MENSAGEM_CODIGO: Record<Exclude<CodeCheck, { ok: true }>['reason'], string> = {
  sem_codigo: 'Peça um novo código para assinar.',
  expirado: 'O código expirou. Peça um novo código.',
  tentativas: 'Muitas tentativas com este código. Peça um novo código.',
  formato: 'Digite o código de 6 números.',
  incorreto: 'Código incorreto.',
}

/** Texto do WhatsApp com o código. Sem emoji, e avisa para não repassar. */
export function codeMessage(code: string, minutes: number = CODE_TTL_MS / 60_000): string {
  return `MyClinica: seu código para assinar o contrato é ${code}. Vale por ${minutes} minutos. Não compartilhe este código com ninguém.`
}
