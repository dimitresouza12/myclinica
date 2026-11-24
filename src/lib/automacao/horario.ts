// Horário de atendimento da clínica (clinic_schedule_settings.opening_hours) no fuso da clínica
// (clinic_whatsapp.timezone). Funções puras.
//
// opening_hours é um intervalo único {start,end} para todos os dias da semana (a Agenda ainda não
// tem horário por dia): "fora do horário" é antes de `start` ou a partir de `end`, qualquer dia.

import { parseSettings } from '@/lib/agenda/settings'
import { zonedParts } from '@/lib/whatsapp/window'

export interface OpeningHours { start: string; end: string }

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/** Mesmo parser da Agenda: linha ausente ou valor inválido vira o padrão (07:00 a 19:30). */
export function openingFromRow(row: { opening_hours?: unknown } | null | undefined): OpeningHours {
  return parseSettings(row ?? null).opening
}

/**
 * O momento cai fora do expediente? Fuso inválido devolve false: na dúvida não responde
 * "estamos fechados" a ninguém.
 */
export function isOutsideOpeningHours(now: Date, timezone: string, opening: OpeningHours): boolean {
  try {
    const p = zonedParts(now, timezone)
    const minutes = p.h * 60 + p.min
    return minutes < toMin(opening.start) || minutes >= toMin(opening.end)
  } catch {
    return false
  }
}
