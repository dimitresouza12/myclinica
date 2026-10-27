// Contas da barra lateral da Agenda (mini calendário, contagens por profissional, resumo de hoje).
// Funções puras, no fuso local do navegador, para testar sem tela.
import { addDays, localDayKey, startOfDay } from '@/lib/dashboard/metrics'

interface Appt { status: string | null; scheduled_at: string; professional_id?: string | null }

export type AgendaView = 'dia' | 'semana' | 'mes'

/** Consulta de verdade: bloqueios de horário e cancelamentos não entram nas contagens. */
const counts = (a: Appt) => a.status !== 'bloqueado' && a.status !== 'cancelado'

/** Período mostrado: [início, fim) — o fim é exclusivo. Dia e Semana saem do dia em foco; o Mês, do mês dele. */
export function rangeFor(view: AgendaView, focus: Date): { start: Date; end: Date } {
  const day = startOfDay(focus)
  if (view === 'dia') return { start: day, end: addDays(day, 1) }
  if (view === 'semana') {
    const sunday = addDays(day, -day.getDay())
    return { start: sunday, end: addDays(sunday, 7) }
  }
  return { start: new Date(day.getFullYear(), day.getMonth(), 1), end: new Date(day.getFullYear(), day.getMonth() + 1, 1) }
}

/** Seis semanas (42 dias) a partir do domingo da primeira semana do mês, como o calendário de parede. */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const start = addDays(first, -first.getDay())
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

/** Dias (chave local AAAA-MM-DD) que têm pelo menos uma consulta. */
export function daysWithAppointments(appts: Appt[]): Set<string> {
  const out = new Set<string>()
  for (const a of appts) if (counts(a)) out.add(localDayKey(new Date(a.scheduled_at)))
  return out
}

export function inRange<T extends Appt>(appts: T[], start: Date, end: Date): T[] {
  const s = start.getTime()
  const e = end.getTime()
  return appts.filter(a => {
    const t = new Date(a.scheduled_at).getTime()
    return t >= s && t < e
  })
}

/** Consultas por profissional no período; a chave '' é "sem profissional". */
export function countByProfessional(appts: Appt[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const a of appts) {
    if (!counts(a)) continue
    const k = a.professional_id ?? ''
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}

export interface DaySummary { total: number; agendado: number; confirmado: number; concluido: number; faltou: number }

/** Resumo de um dia: total (sem cancelamentos) e quantas em cada situação. */
export function daySummary(appts: Appt[], day: Date): DaySummary {
  const { start, end } = rangeFor('dia', day)
  const out: DaySummary = { total: 0, agendado: 0, confirmado: 0, concluido: 0, faltou: 0 }
  for (const a of inRange(appts, start, end)) {
    if (!counts(a)) continue
    out.total++
    if (a.status === 'agendado') out.agendado++
    else if (a.status === 'confirmado') out.confirmado++
    else if (a.status === 'concluido') out.concluido++
    else if (a.status === 'faltou') out.faltou++
  }
  return out
}
