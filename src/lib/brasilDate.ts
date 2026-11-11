// Datas no fuso de Brasília. A clínica e o bot operam nesse fuso; derivar "hoje" ou "o mês"
// de toISOString() (UTC) vira o dia seguinte a partir das 21h e erra aniversariantes e janelas de dia.

export const BRASIL_TZ = 'America/Sao_Paulo'
// Brasília é UTC-3 o ano todo (sem horário de verão desde 2019).
const BRASIL_OFFSET = '-03:00'

/** "AAAA-MM-DD" do instante no fuso de Brasília. */
export function hojeBrasil(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: BRASIL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Início e fim (ISO UTC) do dia "AAAA-MM-DD" em Brasília — janela para consultar `scheduled_at` de um dia da clínica. */
export function brasilDayRange(dateKey: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null
  const start = new Date(`${dateKey}T00:00:00.000${BRASIL_OFFSET}`)
  const end = new Date(`${dateKey}T23:59:59.999${BRASIL_OFFSET}`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return { start: start.toISOString(), end: end.toISOString() }
}

/** Dia (AAAA-MM-DD) em Brasília de um instante ISO gravado no banco. */
export function brasilDayOf(iso: string): string | null {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : hojeBrasil(d)
}
