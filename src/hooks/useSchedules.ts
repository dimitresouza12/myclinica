import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { DayRow, PatternRow, ScheduleData, Window } from '@/lib/agenda/availability'
import { DEFAULT_SETTINGS, parseSettings, type ScheduleSettings } from '@/lib/agenda/settings'
import { localDateKey } from '@/lib/agenda/slots'

export interface SchedulesResult {
  /** false quando as tabelas da escala ainda não existem no banco: a Agenda segue como antes */
  available: boolean
  settings: ScheduleSettings
  /** professional_id -> rotina e escala por data (o `enabled` vem do profissional, não daqui) */
  byProfessional: Record<string, { pattern: PatternRow[]; days: DayRow[] }>
}

const EMPTY: SchedulesResult = { available: false, settings: DEFAULT_SETTINGS, byProfessional: {} }

const asWindows = (raw: unknown): Window[] => Array.isArray(raw)
  ? raw.filter((w): w is Window => !!w && typeof (w as Window).start === 'string' && typeof (w as Window).end === 'string')
  : []

/** Rotina semanal, escala por data (de 14 dias atrás a 180 à frente) e configurações da clínica. */
export function useSchedules(clinicId: string | undefined) {
  return useQuery({
    queryKey: ['schedules', clinicId],
    queryFn: async (): Promise<SchedulesResult> => {
      if (!clinicId) return EMPTY
      const from = new Date(); from.setDate(from.getDate() - 14)
      const to = new Date(); to.setDate(to.getDate() + 180)
      const [pat, day, set] = await Promise.all([
        supabase.from('professional_week_pattern').select('professional_id, weekday, windows').eq('clinic_id', clinicId),
        supabase.from('professional_day_schedule').select('professional_id, date, works, windows')
          .eq('clinic_id', clinicId).gte('date', localDateKey(from)).lte('date', localDateKey(to)),
        supabase.from('clinic_schedule_settings').select('*').eq('clinic_id', clinicId).maybeSingle(),
      ])
      // tabela inexistente (migration ainda não aplicada) ou sem acesso: sem escala, comportamento de sempre
      if (pat.error || day.error) return EMPTY

      const byProfessional: SchedulesResult['byProfessional'] = {}
      const slot = (id: string) => (byProfessional[id] ??= { pattern: [], days: [] })
      for (const r of pat.data ?? []) slot(r.professional_id).pattern.push({ weekday: r.weekday, windows: asWindows(r.windows) })
      for (const r of day.data ?? []) slot(r.professional_id).days.push({ date: r.date, works: !!r.works, windows: asWindows(r.windows) })

      return { available: true, settings: parseSettings(set.data), byProfessional }
    },
    enabled: !!clinicId,
    staleTime: 60 * 1000,
  })
}

/** Junta o que veio do banco com o `schedule_enabled` do profissional. */
export function scheduleOf(result: SchedulesResult | undefined, professionalId: string, enabled: boolean | undefined): ScheduleData | undefined {
  if (!result?.available || !enabled) return undefined
  const row = result.byProfessional[professionalId]
  return { enabled: true, pattern: row?.pattern ?? [], days: row?.days ?? [] }
}
