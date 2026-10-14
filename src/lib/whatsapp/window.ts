// Quando enviar a confirmação/lembrete de uma consulta, no fuso da clínica.
// Funções puras: recebem "agora" como parâmetro, nada lê relógio nem banco,
// para o comportamento de véspera/janela/virada de dia ser testável.

export type ConfirmMode = 'vespera' | 'no_dia' | 'ambos'
export type ConfirmKind = 'confirmacao' | 'lembrete'
export type LateBookingPolicy = 'enviar_agora' | 'nao_enviar'

export interface SendSettings {
  mode: ConfirmMode
  vesperaSendTime: string      // 'HH:MM'
  noDiaHoursBefore: number
  windowStart: string          // 'HH:MM'
  windowEnd: string            // 'HH:MM'
  lateBookingPolicy: LateBookingPolicy
  timezone: string
}

/** Menos que isso antes da consulta, não adianta mais confirmar. */
export const MIN_LEAD_MINUTES = 30

const MIN = 60_000
const HOUR = 60 * MIN

// ─── fuso horário (Intl, sem dependência) ───────────────────────────────────

interface Parts { y: number; m: number; d: number; h: number; min: number }

function zonedParts(date: Date, timeZone: string): Parts {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
  const p: Record<string, number> = {}
  for (const part of f.formatToParts(date)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value)
  }
  return { y: p.year, m: p.month, d: p.day, h: p.hour, min: p.minute }
}

function tzOffsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone)
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min)
  const real = Math.floor(date.getTime() / MIN) * MIN
  return asUtc - real
}

/** Data/hora de parede no fuso → instante UTC. */
export function zonedTimeToUtc(y: number, m: number, d: number, h: number, min: number, timeZone: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, min)
  let ts = guess - tzOffsetMs(new Date(guess), timeZone)
  ts = guess - tzOffsetMs(new Date(ts), timeZone) // 2ª passada, vale na virada de horário de verão
  return new Date(ts)
}

export function parseHHMM(s: string): { h: number; min: number } {
  const [h, m] = s.split(':')
  return { h: Number(h), min: Number(m ?? 0) }
}

/** Instante UTC do "HH:MM" no dia local de `ref`, deslocado `dayOffset` dias. */
function atLocalTime(ref: Date, hhmm: string, dayOffset: number, tz: string): Date {
  const p = zonedParts(ref, tz)
  const { h, min } = parseHHMM(hhmm)
  // Date.UTC normaliza dia fora do mês (dia 0, 32…)
  const day = new Date(Date.UTC(p.y, p.m - 1, p.d + dayOffset))
  return zonedTimeToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), h, min, tz)
}

// ─── janela permitida ───────────────────────────────────────────────────────

export function isInsideWindow(at: Date, s: Pick<SendSettings, 'windowStart' | 'windowEnd' | 'timezone'>): boolean {
  const start = atLocalTime(at, s.windowStart, 0, s.timezone)
  const end = atLocalTime(at, s.windowEnd, 0, s.timezone)
  return at >= start && at <= end
}

/**
 * Se o horário ideal cai fora da janela, leva para dentro dela sem passar da
 * consulta: antes da abertura → abertura do mesmo dia (se ainda for antes da
 * consulta com folga), senão fechamento do dia anterior; depois do fechamento →
 * fechamento do mesmo dia.
 */
export function adjustToWindow(ideal: Date, appointmentAt: Date, s: SendSettings): Date {
  const tz = s.timezone
  const open = atLocalTime(ideal, s.windowStart, 0, tz)
  const close = atLocalTime(ideal, s.windowEnd, 0, tz)
  if (ideal >= open && ideal <= close) return ideal
  if (ideal > close) return close
  // antes da abertura
  if (open.getTime() <= appointmentAt.getTime() - MIN_LEAD_MINUTES * MIN) return open
  return atLocalTime(ideal, s.windowEnd, -1, tz)
}

// ─── o que enviar e quando ──────────────────────────────────────────────────

export interface PlannedSend { kind: ConfirmKind; at: Date }

/** Horários planejados de envio para uma consulta (já ajustados à janela). */
export function plannedSends(appointmentAt: Date, s: SendSettings): PlannedSend[] {
  const tz = s.timezone
  const out: PlannedSend[] = []

  const vespera = () => adjustToWindow(atLocalTime(appointmentAt, s.vesperaSendTime, -1, tz), appointmentAt, s)
  const noDia = () => adjustToWindow(new Date(appointmentAt.getTime() - s.noDiaHoursBefore * HOUR), appointmentAt, s)

  if (s.mode === 'vespera') out.push({ kind: 'confirmacao', at: vespera() })
  else if (s.mode === 'no_dia') out.push({ kind: 'confirmacao', at: noDia() })
  else {
    out.push({ kind: 'confirmacao', at: vespera() })
    out.push({ kind: 'lembrete', at: noDia() })
  }
  return out
}

export type SkipReason =
  | 'aguardando' | 'fora_da_janela' | 'muito_perto' | 'agendada_em_cima_da_hora'

export interface SendDecision { send: boolean; reason?: SkipReason }

/**
 * A rotina (a cada poucos minutos) pergunta, para cada envio planejado, se é
 * hora. `createdAt` é quando a consulta foi marcada: se foi DEPOIS do horário
 * ideal do envio, é "agendada em cima da hora" e a clínica escolhe enviar
 * agora ou não enviar.
 */
export function decideSend(
  input: { appointmentAt: Date; createdAt: Date; now: Date; planned: PlannedSend },
  s: SendSettings,
): SendDecision {
  const { appointmentAt, createdAt, now, planned } = input

  if (now.getTime() >= appointmentAt.getTime() - MIN_LEAD_MINUTES * MIN) {
    return { send: false, reason: 'muito_perto' }
  }
  if (now < planned.at) return { send: false, reason: 'aguardando' }
  if (!isInsideWindow(now, s)) return { send: false, reason: 'fora_da_janela' }
  if (createdAt > planned.at && s.lateBookingPolicy === 'nao_enviar') {
    return { send: false, reason: 'agendada_em_cima_da_hora' }
  }
  return { send: true }
}

/** Limite superior de busca: consultas além disso ainda não têm nada a enviar. */
export function lookaheadLimit(now: Date): Date {
  return new Date(now.getTime() + 49 * HOUR)
}
