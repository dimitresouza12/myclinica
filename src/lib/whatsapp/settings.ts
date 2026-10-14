// Configuração da confirmação automática (tabela clinic_whatsapp). Funções puras:
// a mesma validação roda no servidor (rota PUT) e serve de referência para a tela.

import type { ConfirmMode, LateBookingPolicy } from './window'

export interface WhatsAppSettings {
  confirmEnabled: boolean
  confirmMode: ConfirmMode
  vesperaSendTime: string      // 'HH:MM'
  noDiaHoursBefore: number
  windowStart: string          // 'HH:MM'
  windowEnd: string            // 'HH:MM'
  lateBookingPolicy: LateBookingPolicy
  timezone: string
  messageTemplate: string
  replyYesText: string
  replyNoText: string
}

export const DEFAULT_MESSAGE_TEMPLATE =
  'Olá, {paciente}! Sua consulta na {clinica} está marcada para {data} às {hora}{com_profissional}.'

export const DEFAULT_SETTINGS: WhatsAppSettings = {
  confirmEnabled: false,
  confirmMode: 'vespera',
  vesperaSendTime: '18:00',
  noDiaHoursBefore: 2,
  windowStart: '08:00',
  windowEnd: '20:00',
  lateBookingPolicy: 'enviar_agora',
  timezone: 'America/Sao_Paulo',
  messageTemplate: DEFAULT_MESSAGE_TEMPLATE,
  replyYesText: 'Consulta confirmada! Até lá.',
  replyNoText: 'Certo, a recepção vai entrar em contato para remarcar.',
}

/** Variáveis que o texto da mensagem aceita (ver message.ts). */
export const KNOWN_VARS = ['paciente', 'clinica', 'data', 'hora', 'profissional', 'com_profissional'] as const

export const MAX_TEMPLATE = 500
export const MAX_REPLY = 300

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const MODES: ConfirmMode[] = ['vespera', 'no_dia', 'ambos']
const POLICIES: LateBookingPolicy[] = ['enviar_agora', 'nao_enviar']

export type ValidateResult = { ok: true; value: WhatsAppSettings } | { ok: false; error: string }

function validTimezone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/

function cleanText(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\r\n/g, '\n').trim()
  return t && !CONTROL_CHARS.test(t) ? t : null
}

export function unknownVariables(template: string): string[] {
  const found = new Set<string>()
  for (const m of template.matchAll(/\{(\w+)\}/g)) {
    if (!(KNOWN_VARS as readonly string[]).includes(m[1])) found.add(m[1])
  }
  return [...found]
}

export function validateSettings(raw: unknown): ValidateResult {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const fail = (error: string): ValidateResult => ({ ok: false, error })

  if (typeof r.confirmEnabled !== 'boolean') return fail('Informe se a confirmação automática fica ligada.')
  if (!MODES.includes(r.confirmMode as ConfirmMode)) return fail('Escolha quando enviar a confirmação.')
  if (!POLICIES.includes(r.lateBookingPolicy as LateBookingPolicy)) return fail('Escolha o que fazer com consulta marcada em cima da hora.')

  for (const [key, label] of [['vesperaSendTime', 'horário da véspera'], ['windowStart', 'início do horário de envio'], ['windowEnd', 'fim do horário de envio']] as const) {
    if (typeof r[key] !== 'string' || !HHMM.test(r[key] as string)) return fail(`O ${label} precisa estar no formato HH:MM.`)
  }
  const windowStart = r.windowStart as string
  const windowEnd = r.windowEnd as string
  if (windowStart >= windowEnd) return fail('O início do horário de envio precisa ser antes do fim.')

  const hours = r.noDiaHoursBefore
  if (typeof hours !== 'number' || !Number.isInteger(hours) || hours < 1 || hours > 12) {
    return fail('As horas de antecedência precisam ser um número de 1 a 12.')
  }

  const timezone = typeof r.timezone === 'string' ? r.timezone : ''
  if (!validTimezone(timezone)) return fail('Fuso horário inválido.')

  const messageTemplate = cleanText(r.messageTemplate)
  if (!messageTemplate) return fail('Escreva o texto da mensagem.')
  if (messageTemplate.length > MAX_TEMPLATE) return fail(`O texto da mensagem pode ter até ${MAX_TEMPLATE} caracteres.`)
  const unknown = unknownVariables(messageTemplate)
  if (unknown.length > 0) {
    return fail(`O texto usa uma variável que não existe: {${unknown[0]}}. Use só ${KNOWN_VARS.map(v => `{${v}}`).join(', ')}.`)
  }

  const replyYesText = cleanText(r.replyYesText)
  const replyNoText = cleanText(r.replyNoText)
  if (!replyYesText || !replyNoText) return fail('Escreva as duas respostas automáticas (sim e não).')
  if (replyYesText.length > MAX_REPLY || replyNoText.length > MAX_REPLY) {
    return fail(`As respostas automáticas podem ter até ${MAX_REPLY} caracteres.`)
  }

  return {
    ok: true,
    value: {
      confirmEnabled: r.confirmEnabled,
      confirmMode: r.confirmMode as ConfirmMode,
      vesperaSendTime: r.vesperaSendTime as string,
      noDiaHoursBefore: hours,
      windowStart,
      windowEnd,
      lateBookingPolicy: r.lateBookingPolicy as LateBookingPolicy,
      timezone,
      messageTemplate,
      replyYesText,
      replyNoText,
    },
  }
}

// ── tabela ⇄ objeto ─────────────────────────────────────────────────────────

export interface SettingsRow {
  confirm_enabled: boolean
  confirm_mode: ConfirmMode
  vespera_send_time: string
  no_dia_hours_before: number
  send_window_start: string
  send_window_end: string
  late_booking_policy: LateBookingPolicy
  timezone: string
  message_template: string
  reply_yes_text: string
  reply_no_text: string
}

const hhmm = (t: string) => t.slice(0, 5)

export function rowToSettings(r: SettingsRow): WhatsAppSettings {
  return {
    confirmEnabled: r.confirm_enabled,
    confirmMode: r.confirm_mode,
    vesperaSendTime: hhmm(r.vespera_send_time),
    noDiaHoursBefore: r.no_dia_hours_before,
    windowStart: hhmm(r.send_window_start),
    windowEnd: hhmm(r.send_window_end),
    lateBookingPolicy: r.late_booking_policy,
    timezone: r.timezone,
    messageTemplate: r.message_template,
    replyYesText: r.reply_yes_text,
    replyNoText: r.reply_no_text,
  }
}

export function settingsToRow(s: WhatsAppSettings): SettingsRow {
  return {
    confirm_enabled: s.confirmEnabled,
    confirm_mode: s.confirmMode,
    vespera_send_time: s.vesperaSendTime,
    no_dia_hours_before: s.noDiaHoursBefore,
    send_window_start: s.windowStart,
    send_window_end: s.windowEnd,
    late_booking_policy: s.lateBookingPolicy,
    timezone: s.timezone,
    message_template: s.messageTemplate,
    reply_yes_text: s.replyYesText,
    reply_no_text: s.replyNoText,
  }
}
