// Detecta se o banco já tem as tabelas e colunas de séries e pacotes (migration 20261113_agenda_series_pacotes.sql).
// Sem a migration, a Agenda segue exatamente como antes: sem "Repetir", sem pacote e sem as colunas novas no payload.
import { supabase } from '@/lib/supabase'

export interface AgendaExtras {
  /** appointment_series + appointments.series_id/series_index */
  series: boolean
  /** patient_packages + appointments.package_id */
  packages: boolean
  /** appointments.meeting_url (migration 20261120_appointments_meeting_url.sql) */
  meeting: boolean
}

/** O erro é "tabela ou coluna não existe" (e não rede ou permissão)? */
export function isMissingSchemaError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false
  // 42P01 tabela inexistente, 42703 coluna inexistente; PostgREST: PGRST205 (tabela), PGRST204 (coluna)
  return /42P01|42703|PGRST204|PGRST205|schema cache|does not exist/i.test(`${error.code ?? ''} ${error.message ?? ''}`)
}

let cached: AgendaExtras | null = null
let inflight: Promise<AgendaExtras> | null = null

const NONE: AgendaExtras = { series: false, packages: false, meeting: false }

async function probeOne(query: PromiseLike<{ error: { code?: string | null; message?: string | null } | null }>): Promise<boolean | null> {
  const { error } = await query
  if (!error) return true
  // erro de outro tipo (rede, RLS): não conclui nada
  return isMissingSchemaError(error) ? false : null
}

export function probeAgendaExtras(): Promise<AgendaExtras> {
  if (cached) return Promise.resolve(cached)
  if (!inflight) {
    inflight = Promise.all([
      probeOne(supabase.from('appointment_series').select('id').limit(1)),
      probeOne(supabase.from('patient_packages').select('id').limit(1)),
      probeOne(supabase.from('appointments').select('series_id, series_index, package_id').limit(1)),
      probeOne(supabase.from('appointments').select('meeting_url').limit(1)),
    ])
      .then(([seriesTable, packagesTable, apptCols, meetingCol]) => {
        // se algum teste foi inconclusivo, não guarda: tenta de novo na próxima abertura
        if (seriesTable === null || packagesTable === null || apptCols === null || meetingCol === null) return NONE
        const result = { series: seriesTable && apptCols, packages: packagesTable && apptCols, meeting: meetingCol }
        cached = result
        return result
      })
      .catch(() => NONE)
      .finally(() => { inflight = null })
  }
  return inflight
}

/** Esquece o resultado (depois de aplicar a migration sem recarregar a página, ou em testes). */
export function resetAgendaExtrasCache() { cached = null }
