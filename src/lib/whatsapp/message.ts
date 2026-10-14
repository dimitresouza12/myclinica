// Monta o texto da confirmação a partir do modelo editável da clínica.
// A linha "Responda SIM ou NÃO" NÃO faz parte do modelo: é fixa aqui, porque se
// a clínica apagasse essa linha o sistema deixaria de entender as respostas.

export const REPLY_INSTRUCTION = 'Responda *SIM* para confirmar ou *NÃO* se precisar remarcar.'

export interface MessageVars {
  paciente: string
  clinica: string
  profissional?: string | null
  appointmentAt: Date
  now: Date
  timezone: string
}

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

function localParts(date: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'long',
  })
  const p: Record<string, string> = {}
  for (const part of f.formatToParts(date)) if (part.type !== 'literal') p[part.type] = part.value
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute }
}

function dayNumber(y: number, m: number, d: number): number {
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** "hoje", "amanhã (14/10)" ou "quinta-feira (15/10)". */
export function formatDateLabel(appointmentAt: Date, now: Date, timeZone: string): string {
  const a = localParts(appointmentAt, timeZone)
  const n = localParts(now, timeZone)
  const diff = dayNumber(a.y, a.m, a.d) - dayNumber(n.y, n.m, n.d)
  const dd = String(a.d).padStart(2, '0')
  const mm = String(a.m).padStart(2, '0')
  if (diff === 0) return 'hoje'
  if (diff === 1) return `amanhã (${dd}/${mm})`
  const weekday = WEEKDAYS[new Date(Date.UTC(a.y, a.m - 1, a.d)).getUTCDay()]
  return `${weekday} (${dd}/${mm})`
}

/** "14h" ou "14h30". */
export function formatTimeLabel(appointmentAt: Date, timeZone: string): string {
  const a = localParts(appointmentAt, timeZone)
  return a.min === 0 ? `${a.h}h` : `${a.h}h${String(a.min).padStart(2, '0')}`
}

function firstName(full: string): string {
  return (full || '').trim().split(/\s+/)[0] || ''
}

/**
 * Variáveis: {paciente} (primeiro nome), {clinica}, {data}, {hora},
 * {profissional}, {com_profissional} (" com Dra. Ana" ou vazio).
 * Variável desconhecida fica como está, para a clínica perceber o erro de digitação.
 */
export function renderMessage(template: string, v: MessageVars, opts: { askReply: boolean }): string {
  const prof = (v.profissional ?? '').trim()
  const map: Record<string, string> = {
    paciente: firstName(v.paciente),
    clinica: v.clinica,
    data: formatDateLabel(v.appointmentAt, v.now, v.timezone),
    hora: formatTimeLabel(v.appointmentAt, v.timezone),
    profissional: prof,
    com_profissional: prof ? ` com ${prof}` : '',
  }
  const body = template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in map ? map[key] : whole))
  return opts.askReply ? `${body}\n\n${REPLY_INSTRUCTION}` : body
}
