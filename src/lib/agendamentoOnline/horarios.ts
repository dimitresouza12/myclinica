// Horários livres do agendamento online. Função pura: recebe o que o banco devolveu (escala, intervalos
// ocupados, regras da clínica) e devolve os horários que o paciente pode escolher.
//
// As MESMAS regras são conferidas de novo no banco ao reservar (online_booking_create, migration
// 20261128_agendamento_online.sql): grade a partir da abertura, consulta inteira dentro do horário de
// funcionamento e da escala, antecedência mínima, janela máxima e nada sobreposto a consulta ou bloqueio.
// Mudou uma regra aqui? Mude lá também.

import { slotInSchedule, type ScheduleData } from '@/lib/agenda/availability'
import { buildSlots } from '@/lib/agenda/settings'
import { addDaysToKey, dateKeyInZone, toMinutes, zonedWallToUtcMs } from './tz'

/** Intervalo ocupado em ms UTC: [startMs, endMs). Vem de consultas e bloqueios, sem nome nem motivo. */
export interface BusyRange { startMs: number; endMs: number }

export interface OnlineRules {
  timezone: string
  /** antecedência mínima, em horas */
  minNoticeHours: number
  /** até quantos dias à frente se pode marcar (hoje + N) */
  maxDaysAhead: number
  stepMinutes: number
  opening: { start: string; end: string }
}

export interface DayArgs {
  dateKey: string
  nowMs: number
  rules: OnlineRules
  durationMin: number
  schedule?: ScheduleData
  busy: BusyRange[]
}

/** Primeiro e último dia ("AAAA-MM-DD", no fuso da clínica) em que ainda se pode marcar. */
export function bookingHorizon(nowMs: number, rules: Pick<OnlineRules, 'timezone' | 'maxDaysAhead'>): { first: string; last: string } {
  const today = dateKeyInZone(nowMs, rules.timezone)
  return { first: today, last: addDaysToKey(today, rules.maxDaysAhead) }
}

/** Horários de início livres de um dia ("HH:mm"), em ordem. */
export function freeSlotsOfDay(a: DayArgs): string[] {
  const { rules } = a
  const horizon = bookingHorizon(a.nowMs, rules)
  if (a.dateKey < horizon.first || a.dateKey > horizon.last) return []

  const dur = Math.max(1, Math.round(a.durationMin))
  const closeMin = toMinutes(rules.opening.end)
  const earliestMs = a.nowMs + rules.minNoticeHours * 3_600_000

  const out: string[] = []
  for (const slot of buildSlots(rules.opening, rules.stepMinutes)) {
    // a consulta inteira tem de terminar até o fim do horário de funcionamento
    if (toMinutes(slot) + dur > closeMin) continue
    if (!slotInSchedule(a.schedule, a.dateKey, slot, dur)) continue
    const startMs = zonedWallToUtcMs(a.dateKey, slot, rules.timezone)
    if (startMs < earliestMs) continue
    const endMs = startMs + dur * 60_000
    if (a.busy.some(b => startMs < b.endMs && endMs > b.startMs)) continue
    out.push(slot)
  }
  return out
}

/** Dias com pelo menos um horário livre, de `fromKey` por `days` dias. */
export function freeSlotsByDay(a: Omit<DayArgs, 'dateKey'> & { fromKey: string; days: number }): { date: string; times: string[] }[] {
  const out: { date: string; times: string[] }[] = []
  for (let i = 0; i < a.days; i++) {
    const dateKey = addDaysToKey(a.fromKey, i)
    const times = freeSlotsOfDay({ ...a, dateKey })
    if (times.length > 0) out.push({ date: dateKey, times })
  }
  return out
}
