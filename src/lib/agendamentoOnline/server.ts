// Acesso ao banco do agendamento online público. SÓ NO SERVIDOR.
//
// A página pública não tem sessão. O cliente de serviço é usado SOMENTE para chamar as três funções
// online_booking_* (SECURITY DEFINER, EXECUTE só para service_role): nenhuma tabela é lida ou gravada daqui,
// e nenhuma função devolve dado de paciente. Toda regra de escopo (clínica, profissional, serviço) mora nas funções.

import { getAdminClient } from '@/lib/supabaseAdmin'
import {
  isBookingErrorCode, parseAvailability, parsePublicContext,
  type Availability, type BookingDone, type BookingErrorCode, type PublicContext,
} from './config'
import { bookingHorizon, freeSlotsByDay } from './horarios'
import { addDaysToKey } from './tz'
import type { BookingInput } from './validar'

export const MAX_RANGE_DAYS = 31

function logRpc(rota: string, e: { code?: string; message?: string }): void {
  console.error(`[agendar:${rota}]`, e.code ?? '', e.message ?? '')
}

/** Dados públicos da clínica pelo slug. null = link indisponível (inexistente, desligado ou clínica inativa). */
export async function loadPublicContext(slug: string): Promise<{ ok: true; context: PublicContext | null } | { ok: false }> {
  const { data, error } = await getAdminClient().rpc('online_booking_context', { p_slug: slug })
  if (error) { logRpc('contexto', error); return { ok: false } }
  return { ok: true, context: parsePublicContext(data) }
}

export type SlotsResult =
  | { ok: true; days: { date: string; times: string[] }[]; nextFrom: string | null; durationMin: number }
  | { ok: false; notFound: boolean }

/** Horários livres de um profissional: `days` dias a partir de `fromKey`, limitados à janela da clínica. */
export async function loadFreeSlots(
  slug: string, professionalId: string, fromKey: string, days: number, nowMs = Date.now(),
): Promise<SlotsResult> {
  const span = Math.min(Math.max(1, Math.floor(days)), MAX_RANGE_DAYS)
  const { data, error } = await getAdminClient().rpc('online_booking_availability', {
    p_slug: slug, p_professional_id: professionalId, p_from: fromKey, p_days: span,
  })
  if (error) { logRpc('horarios', error); return { ok: false, notFound: false } }
  const av: Availability | null = parseAvailability(data)
  if (!av) return { ok: false, notFound: true }

  const horizon = bookingHorizon(nowMs, av.rules)
  // nunca olha antes de hoje: dias passados e o recuo de segurança do banco não viram horário
  const start = fromKey < horizon.first ? horizon.first : fromKey
  const lost = start === fromKey ? 0 : Math.round((Date.parse(start) - Date.parse(fromKey)) / 86_400_000)
  const remaining = span - lost
  const result = remaining > 0
    ? freeSlotsByDay({ fromKey: start, days: remaining, nowMs, rules: av.rules, durationMin: av.durationMin, schedule: av.schedule, busy: av.busy })
    : []
  const end = addDaysToKey(fromKey, span) // primeiro dia depois do trecho consultado
  return { ok: true, days: result, nextFrom: end <= horizon.last ? end : null, durationMin: av.durationMin }
}

export type CreateResult =
  | { ok: true; done: BookingDone }
  | { ok: false; code: BookingErrorCode | 'erro' }

/** Cria o agendamento. O banco confere tudo de novo e devolve um código de recusa conhecido. */
export async function createOnlineBooking(
  slug: string, input: BookingInput, extra: { consentText: string; ipHash: string },
): Promise<CreateResult> {
  const { data, error } = await getAdminClient().rpc('online_booking_create', {
    p_slug: slug,
    p_professional_id: input.professionalId,
    p_procedure_id: input.procedureId,
    p_date: input.date,
    p_time: input.time,
    p_name: input.name,
    p_phone_digits: input.phoneDigits,
    p_phone_display: input.phoneDisplay,
    p_email: input.email,
    p_consent: true,
    p_consent_text: extra.consentText,
    p_ip_hash: extra.ipHash,
  })
  if (error) { logRpc('criar', error); return { ok: false, code: 'erro' } }
  const r = data as Record<string, unknown> | null
  if (!r || r.ok !== true) {
    const code = r?.code
    return { ok: false, code: isBookingErrorCode(code) ? code : 'erro' }
  }
  return {
    ok: true,
    done: {
      status: r.status === 'confirmado' ? 'confirmado' : 'agendado',
      startsAt: String(r.starts_at ?? ''),
      durationMinutes: Number(r.duration_minutes) || 0,
      clinicName: String(r.clinic_name ?? ''),
      professionalName: String(r.professional_name ?? ''),
      procedureName: String(r.procedure_name ?? 'Consulta'),
    },
  }
}
