// Textos e agrupamentos da tela Mensagens. Funções puras (sem React, sem rede).

import type { MessageKind } from './webhook-parse'

const KIND_LABEL: Record<MessageKind, string> = {
  text: '', image: 'Imagem', audio: 'Áudio', video: 'Vídeo', document: 'Documento', sticker: 'Figurinha', other: 'Mensagem',
}

/** Resumo de uma linha para a lista de conversas. */
export function previewFor(kind: MessageKind, body: string | null | undefined): string {
  const text = (body ?? '').replace(/\s+/g, ' ').trim()
  if (kind === 'text') return text.length > 90 ? `${text.slice(0, 89)}…` : text
  const label = KIND_LABEL[kind]
  return text ? `${label}: ${text.length > 70 ? `${text.slice(0, 69)}…` : text}` : label
}

/**
 * Telefone para exibir. O jid do WhatsApp sempre traz o DDI: com 55 vira (85) 99999-8888,
 * qualquer outro país aparece como +<número>. Texto sem "@" é tratado como número brasileiro.
 */
export function formatJidPhone(jid: string | null | undefined): string {
  if (!jid || jid.includes('@lid') || jid.startsWith('lid:')) return 'Número oculto pelo WhatsApp'
  let d = jid.split('@')[0].replace(/^raw:/, '').replace(/\D/g, '')
  if (!d) return 'Sem número'
  if (jid.includes('@')) {
    if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2)
    else return `+${d}`
  }
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return d
}

/** Nome de exibição: paciente cadastrado, depois o nome no WhatsApp, depois o telefone. */
export function contactDisplayName(c: { patientName?: string | null; contactName?: string | null; jid: string }): string {
  return c.patientName?.trim() || c.contactName?.trim() || formatJidPhone(c.jid)
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(w => /[A-Za-zÀ-ú]/.test(w[0] ?? ''))
  if (parts.length === 0) return '#'
  return parts.slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

// ── datas, no fuso da clínica ───────────────────────────────────────────────

const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const WEEKDAY_LONG = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

function parts(date: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  const p: Record<string, number> = {}
  for (const x of f.formatToParts(date)) if (x.type !== 'literal') p[x.type] = Number(x.value)
  return { y: p.year, m: p.month, d: p.day, h: p.hour, min: p.minute }
}

const dayNumber = (y: number, m: number, d: number) => Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
const weekday = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay()
const two = (n: number) => String(n).padStart(2, '0')

export function clockLabel(date: Date, timeZone: string): string {
  const p = parts(date, timeZone)
  return `${two(p.h)}:${two(p.min)}`
}

/** Hora de hoje, "Ontem", dia da semana nos últimos 6 dias, senão dd/mm. */
export function listTimeLabel(date: Date, now: Date, timeZone: string): string {
  const a = parts(date, timeZone), n = parts(now, timeZone)
  const diff = dayNumber(n.y, n.m, n.d) - dayNumber(a.y, a.m, a.d)
  if (diff <= 0) return `${two(a.h)}:${two(a.min)}`
  if (diff === 1) return 'Ontem'
  if (diff < 7) return WEEKDAY_SHORT[weekday(a.y, a.m, a.d)]
  return `${two(a.d)}/${two(a.m)}`
}

/** Separador do dia dentro da conversa: Hoje, Ontem, dia da semana ou dd/mm/aaaa. */
export function dayLabel(date: Date, now: Date, timeZone: string): string {
  const a = parts(date, timeZone), n = parts(now, timeZone)
  const diff = dayNumber(n.y, n.m, n.d) - dayNumber(a.y, a.m, a.d)
  if (diff <= 0) return 'Hoje'
  if (diff === 1) return 'Ontem'
  if (diff < 7) return WEEKDAY_LONG[weekday(a.y, a.m, a.d)]
  return `${two(a.d)}/${two(a.m)}/${a.y}`
}

/** Chave do dia (aaaa-mm-dd) no fuso, para agrupar. */
export function dayKey(date: Date, timeZone: string): string {
  const p = parts(date, timeZone)
  return `${p.y}-${two(p.m)}-${two(p.d)}`
}

export type ChatItem<T> = { type: 'day'; key: string; label: string } | { type: 'msg'; msg: T }

/** Intercala separadores de dia entre as mensagens (já em ordem cronológica). */
export function withDaySeparators<T extends { created_at: string }>(msgs: T[], now: Date, timeZone: string): ChatItem<T>[] {
  const out: ChatItem<T>[] = []
  let last = ''
  for (const m of msgs) {
    const d = new Date(m.created_at)
    const k = dayKey(d, timeZone)
    if (k !== last) { out.push({ type: 'day', key: k, label: dayLabel(d, now, timeZone) }); last = k }
    out.push({ type: 'msg', msg: m })
  }
  return out
}
