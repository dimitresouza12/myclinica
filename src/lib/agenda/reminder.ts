// Lembrete no sino: profissionais com a escala ligada que têm dia por definir nos próximos dias.
import { undefinedDaysAhead, type ScheduleData } from './availability'

export interface ScheduleReminder {
  /** quantos profissionais têm dia por definir */
  professionals: number
  /** soma dos dias por definir (de todos) */
  days: number
}

/** Nulo quando está tudo definido (ou o lembrete está desligado). */
export function scheduleReminder(
  professionalIds: string[],
  scheduleOf: (professionalId: string) => ScheduleData | undefined,
  now: Date,
  daysBefore: number,
  enabled = true,
): ScheduleReminder | null {
  if (!enabled) return null
  let professionals = 0
  let days = 0
  for (const id of professionalIds) {
    const n = undefinedDaysAhead(scheduleOf(id), now, daysBefore)
    if (n > 0) { professionals++; days += n }
  }
  return professionals > 0 ? { professionals, days } : null
}
