// Link da teleconsulta no agendamento: validação, sala nova (Jitsi) e mensagem de WhatsApp.

const MAX_URL = 500

export type MeetingUrlResult = { ok: true; url: string | null } | { ok: false; error: string }

export const MEETING_URL_INVALID = 'Link da teleconsulta inválido. Cole um endereço que comece com http:// ou https://.'

/**
 * Valida o link digitado. Vazio vale como "sem link" (null). Aceita só http(s); sem prefixo ("meet.google.com/abc")
 * completa com https://. Rejeita javascript:, data:, espaços e hosts sem ponto.
 */
export function normalizeMeetingUrl(raw: string | null | undefined): MeetingUrlResult {
  const text = (raw ?? '').trim()
  if (!text) return { ok: true, url: null }
  if (text.length > MAX_URL || /\s/.test(text)) return { ok: false, error: MEETING_URL_INVALID }
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) && !/^[^/]*:\d+(\/|$)/.test(text)
  const candidate = hasScheme ? text : `https://${text}`
  let parsed: URL
  try { parsed = new URL(candidate) } catch { return { ok: false, error: MEETING_URL_INVALID } }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return { ok: false, error: MEETING_URL_INVALID }
  if (!parsed.hostname.includes('.') || parsed.username || parsed.password) return { ok: false, error: MEETING_URL_INVALID }
  return { ok: true, url: parsed.toString() }
}

/** Só devolve o link se for http(s) (defesa antes de usar em href, mesmo vindo do banco). */
export function safeMeetingHref(url: string | null | undefined): string | null {
  const r = normalizeMeetingUrl(url)
  return r.ok ? r.url : null
}

const ROOM_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

/** Sufixo aleatório curto para o nome da sala (sem caracteres ambíguos). `random` é injetável para teste. */
export function randomRoomId(length = 10, random: () => number = defaultRandom): string {
  let id = ''
  for (let i = 0; i < length; i++) id += ROOM_ALPHABET[Math.floor(random() * ROOM_ALPHABET.length) % ROOM_ALPHABET.length]
  return id
}

function defaultRandom(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000
  }
  return Math.random()
}

/** https://meet.jit.si/myclinica-<id curto aleatório> */
export function generateMeetingRoomUrl(random?: () => number): string {
  return `https://meet.jit.si/myclinica-${randomRoomId(10, random)}`
}

/** "terça-feira, 17/11, às 14:30" (com o ano só quando não é o corrente). `timeZone` só para teste. */
export function formatMeetingWhen(iso: string, now: Date = new Date(), timeZone?: string): string {
  const d = new Date(iso)
  const sameYear = new Intl.DateTimeFormat('pt-BR', { year: 'numeric', timeZone }).format(d) === new Intl.DateTimeFormat('pt-BR', { year: 'numeric', timeZone }).format(now)
  const day = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', ...(sameYear ? {} : { year: 'numeric' }), timeZone }).format(d)
  const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone }).format(d)
  return `${day}, às ${time}`
}

/** Mensagem pronta para o paciente com o link da sala. */
export function buildMeetingMessage(input: { patientName: string | null | undefined; scheduledAt: string; url: string; now?: Date; timeZone?: string }): string {
  const first = (input.patientName ?? '').trim().split(/\s+/)[0]
  const greeting = first ? `Olá, ${first}!` : 'Olá!'
  return `${greeting} Sua teleconsulta está marcada para ${formatMeetingWhen(input.scheduledAt, input.now, input.timeZone)}. Para entrar, acesse o link: ${input.url}`
}

/** Link wa.me com a mensagem. `number` já vem normalizado (waMeNumber); vazio = sem telefone. */
export function buildMeetingWhatsAppLink(number: string, message: string): string | null {
  if (!number) return null
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}
