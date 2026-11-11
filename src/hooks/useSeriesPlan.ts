import { useMemo, useState } from 'react'
import type { ScheduleData } from '@/lib/agenda/availability'
import { slotInSchedule } from '@/lib/agenda/availability'
import {
  generateSeriesDates, normalizeWeekdays, planOccurrences, ruleOf, toBusyRanges, type PlannedOccurrence, type SeriesForm,
} from '@/lib/agenda/series'
import { blocksProfessional, type SlotAppt } from '@/lib/agenda/slots'

interface Args {
  active: boolean
  series: SeriesForm
  /** "AAAA-MM-DD" da primeira consulta */
  startDate: string
  /** "HH:mm" */
  time: string
  durationMin: number
  professionalId: string
  /** consultas já carregadas na agenda (a conferência final no banco acontece ao salvar) */
  appointments: SlotAppt[]
  schedule?: ScheduleData
  canExtra: boolean
}

/**
 * Lista de revisão da série: datas geradas, estado de cada uma (livre, conflito, fora da escala) e a escolha
 * do que entra. A escolha manual vale enquanto a regra não muda; mudou a regra, a lista é refeita.
 */
export function useSeriesPlan(a: Args) {
  const { active, series, startDate, time, durationMin, professionalId, appointments, schedule, canExtra } = a
  const ready = active && series.on && !!startDate && /^\d{2}:\d{2}$/.test(time) && durationMin >= 5

  const rule = useMemo(() => ruleOf(series, startDate), [series, startDate])
  const generated = useMemo(() => (ready ? generateSeriesDates(rule) : { dates: [], truncated: false }), [ready, rule])

  const planned = useMemo<PlannedOccurrence[]>(() => {
    if (!ready || generated.dates.length === 0) return []
    // sem profissional não há agenda para conferir (igual ao agendamento avulso)
    const busy = professionalId
      ? toBusyRanges(appointments.filter(x => x.status !== 'cancelado' && blocksProfessional(x, professionalId)))
      : []
    return planOccurrences(generated.dates, time, durationMin, {
      busy,
      inSchedule: schedule ? d => slotInSchedule(schedule, d, time, durationMin) : undefined,
      canExtra,
    })
  }, [ready, generated, time, durationMin, professionalId, appointments, schedule, canExtra])

  // escolhas manuais ("remover desta lista"), atreladas à regra para não vazarem para outra série
  const key = `${series.frequency}|${normalizeWeekdays(startDate, series.weekdays).join(',')}|${series.endMode}|${series.occurrences}|${series.untilDate}|${startDate}|${time}|${durationMin}|${professionalId}`
  const [manual, setManual] = useState<{ key: string; map: Record<string, boolean> }>({ key, map: {} })
  const overrides = manual.key === key ? manual.map : null

  const occurrences = useMemo(() => planned.map(o => ({ ...o, include: overrides?.[o.date] ?? o.include })), [planned, overrides])
  const included = useMemo(() => occurrences.filter(o => o.include), [occurrences])

  function setInclude(date: string, include: boolean) {
    setManual(prev => ({ key, map: { ...(prev.key === key ? prev.map : {}), [date]: include } }))
  }

  return { ready, truncated: generated.truncated, occurrences, included, setInclude }
}
