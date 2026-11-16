// Validação do que o paciente envia no agendamento online. Pura: sem rede, sem banco.
// O banco confere tudo de novo (online_booking_create); aqui o objetivo é recusar cedo, com mensagem clara,
// e descartar robô (campo isca e tempo de preenchimento).

import { formatNational } from '@/lib/phoneFormat'
import { isValidBrPhone, normalizeBrPhone, phoneKey } from '@/lib/whatsapp/phone'
import { isValidDateKey, isValidTime } from './tz'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Menos que isto entre abrir a tela e enviar não é uma pessoa preenchendo. */
export const MIN_FILL_MS = 3_000
/** A tela aberta há mais que isto está com horários velhos: recarregar. */
export const MAX_FILL_MS = 12 * 3_600_000

/** Texto que o paciente aceita. Fica gravado junto da reserva (online_booking_requests.consent_text). */
export function consentText(clinicName: string): string {
  const name = clinicName.trim().slice(0, 80) || 'a clínica'
  return `Autorizo ${name} a usar meu nome, WhatsApp e e-mail para confirmar e gerenciar este agendamento e entrar em contato comigo, conforme a LGPD.`
}

export interface BookingInput {
  professionalId: string
  procedureId: string | null
  date: string
  time: string
  name: string
  /** dígitos nacionais (DDD + número), 11 dígitos de celular */
  phoneDigits: string
  /** "(85) 99999-8888" */
  phoneDisplay: string
  /** chave de limite: DDD + 8 últimos dígitos */
  phoneKey: string
  email: string | null
}

export type BookingValidation =
  | { ok: true; value: BookingInput }
  | { ok: false; error: string; /** campo isca preenchido: responda como se tivesse dado certo, sem gravar nada */ honeypot?: boolean }

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** Nome de pessoa: 2 a 80 caracteres, ao menos duas letras, sem link nem símbolos de marcação. */
export function cleanName(raw: unknown): string | null {
  const name = str(raw).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (name.length < 2 || name.length > 80) return null
  if ((name.match(/\p{L}/gu) ?? []).length < 2) return null
  if (/[<>{}[\]\\|@]/.test(name) || /https?:|www\.|\.com|\.br\b/i.test(name)) return null
  return name
}

/** Mesma regra do banco (online_booking_create): letras minúsculas sem acento, números e . _ % + - antes do @; domínio com pontos. */
const EMAIL_RE = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/

/** E-mail opcional. Charset restrito como o nome: sem aspas, espaços, acentos nem símbolos de marcação. */
export function cleanEmail(raw: unknown): { ok: true; value: string | null } | { ok: false } {
  const email = str(raw).trim().toLowerCase()
  if (!email) return { ok: true, value: null }
  if (email.length > 120 || !EMAIL_RE.test(email)) return { ok: false }
  return { ok: true, value: email }
}

/** Celular brasileiro (11 dígitos): o contato da clínica é por WhatsApp. */
export function cleanMobile(raw: unknown): { digits: string; display: string; key: string } | null {
  const digits = normalizeBrPhone(str(raw))
  if (!isValidBrPhone(digits) || digits.length !== 11) return null
  return { digits, display: formatNational(digits), key: phoneKey(digits) }
}

export function validateBooking(raw: Record<string, unknown>, nowMs: number): BookingValidation {
  // campo isca: escondido na tela; só robô preenche
  if (str(raw.website).trim() !== '') return { ok: false, error: 'Envio inválido.', honeypot: true }

  const opened = Number(raw.openedAt)
  if (!Number.isFinite(opened) || opened <= 0) return { ok: false, error: 'Envio inválido. Recarregue a página.' }
  const elapsed = nowMs - opened
  if (elapsed < MIN_FILL_MS) return { ok: false, error: 'Confira os dados e envie de novo em alguns segundos.' }
  if (elapsed > MAX_FILL_MS) return { ok: false, error: 'A página ficou aberta por muito tempo. Recarregue para ver os horários atuais.' }

  if (!UUID_RE.test(str(raw.professionalId))) return { ok: false, error: 'Escolha o profissional.' }
  const procRaw = raw.procedureId
  if (procRaw != null && procRaw !== '' && !UUID_RE.test(str(procRaw))) return { ok: false, error: 'Escolha o serviço.' }
  if (!isValidDateKey(raw.date) || !isValidTime(raw.time)) return { ok: false, error: 'Escolha o dia e o horário.' }

  const name = cleanName(raw.name)
  if (!name) return { ok: false, error: 'Informe seu nome completo.' }
  const phone = cleanMobile(raw.phone)
  if (!phone) return { ok: false, error: 'Informe um celular com DDD, por exemplo (85) 99999-8888.' }
  const email = cleanEmail(raw.email)
  if (!email.ok) return { ok: false, error: 'Confira o e-mail digitado ou deixe o campo vazio.' }
  if (raw.consent !== true) return { ok: false, error: 'Para agendar, aceite o uso dos seus dados.' }

  return {
    ok: true,
    value: {
      professionalId: str(raw.professionalId).toLowerCase(),
      procedureId: procRaw ? str(procRaw).toLowerCase() : null,
      date: raw.date as string,
      time: raw.time as string,
      name,
      phoneDigits: phone.digits,
      phoneDisplay: phone.display,
      phoneKey: phone.key,
      email: email.value,
    },
  }
}
