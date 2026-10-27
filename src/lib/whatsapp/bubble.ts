// Funções puras de apresentação da tela Mensagens: selo do arquivo, nome truncado,
// quando uma bolha abre uma nova sequência do mesmo autor e cor do avatar.
// Sem React, sem relógio, sem banco: testáveis isoladamente.

import { dayKey } from './inbox'

// ── selo do arquivo ─────────────────────────────────────────────────────────

export type FileTone = 'pdf' | 'doc' | 'xls' | 'ppt' | 'other'
export interface FileBadge { label: string; tone: FileTone }

const BADGES: Record<string, FileBadge> = {
  pdf: { label: 'PDF', tone: 'pdf' },
  doc: { label: 'DOC', tone: 'doc' },
  docx: { label: 'DOC', tone: 'doc' },
  xls: { label: 'XLS', tone: 'xls' },
  xlsx: { label: 'XLS', tone: 'xls' },
  csv: { label: 'XLS', tone: 'xls' },
  ppt: { label: 'PPT', tone: 'ppt' },
  pptx: { label: 'PPT', tone: 'ppt' },
  txt: { label: 'TXT', tone: 'other' },
}

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.')
  if (i <= 0 || i === name.length - 1) return ''
  return name.slice(i + 1).toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Selo (texto curto e tom de cor) do tipo do arquivo, pela extensão; sem extensão, pelo tipo do arquivo. */
export function fileBadge(name: string, mime: string | null | undefined): FileBadge {
  const ext = extensionOf(name ?? '')
  if (!ext) return mime === 'application/pdf' ? BADGES.pdf : { label: 'ARQ', tone: 'other' }
  return BADGES[ext] ?? { label: ext.toUpperCase().slice(0, 4), tone: 'other' }
}

// ── nome do arquivo ─────────────────────────────────────────────────────────

/** Corta o meio do nome para caber em `max` caracteres, mantendo o começo, o fim e a extensão. */
export function truncateMiddle(name: string, max: number): string {
  if (name.length <= max) return name
  if (max <= 1) return '…'

  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot) : ''
  const hasExt = ext.length > 0 && ext.length <= 8 && ext.length <= max - 3
  const stem = hasExt ? name.slice(0, dot) : name
  const tailExt = hasExt ? ext : ''

  const avail = max - 1 - tailExt.length // espaço para começo e fim do nome, fora a reticência e a extensão
  const tailLen = hasExt ? Math.min(stem.length, Math.max(4, Math.floor(avail / 3))) : Math.floor(avail / 2)
  const headLen = avail - tailLen
  const tail = tailLen > 0 ? stem.slice(-tailLen) : ''
  return `${stem.slice(0, headLen)}…${tail}${tailExt}`
}

// ── sequências do mesmo autor ───────────────────────────────────────────────

/** Depois deste tempo sem mensagem, a próxima abre uma nova sequência (e mostra o autor de novo). */
export const RUN_GAP_MS = 10 * 60_000

export interface RunInfo {
  direction: 'in' | 'out'
  /** quem enviou, para as mensagens da clínica (equipe, celular, automática); null para o contato */
  author: string | null
  created_at: string
}

/** A bolha `curr` abre uma nova sequência em relação à anterior `prev`? */
export function startsAuthorRun(prev: RunInfo | null, curr: RunInfo, timeZone: string): boolean {
  if (!prev) return true
  if (prev.direction !== curr.direction) return true
  if (prev.author !== curr.author) return true
  const a = new Date(prev.created_at)
  const b = new Date(curr.created_at)
  if (dayKey(a, timeZone) !== dayKey(b, timeZone)) return true
  return b.getTime() - a.getTime() >= RUN_GAP_MS
}

// ── avatar ──────────────────────────────────────────────────────────────────

// vive em lib/ui porque Pacientes usa o mesmo tom; reexportado para não mexer em quem já importa daqui
export { AVATAR_TONES, avatarTone } from '@/lib/ui/avatarTone'

// ── consulta no cabeçalho da conversa ───────────────────────────────────────

/** "qui, 29/10, 14h" ou "qui, 29/10, 14h30", no fuso da clínica. */
export function shortAppointmentLabel(date: Date, timeZone: string): string {
  const f = new Intl.DateTimeFormat('pt-BR', { timeZone, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const p: Record<string, string> = {}
  for (const x of f.formatToParts(date)) if (x.type !== 'literal') p[x.type] = x.value
  const weekday = p.weekday.replace('.', '')
  const hour = String(Number(p.hour))
  const time = p.minute === '00' ? `${hour}h` : `${hour}h${p.minute}`
  return `${weekday}, ${p.day}/${p.month}, ${time}`
}
