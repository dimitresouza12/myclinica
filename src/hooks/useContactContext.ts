import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface NextAppointment { scheduled_at: string; procedure_name: string | null; status: string; professional_name: string | null }

/** Próxima consulta do paciente (agendada ou confirmada), com o profissional. Compartilhada pelo painel e pelo cabeçalho da conversa. */
export function useNextAppointment(patientId: string | null) {
  return useQuery({
    queryKey: ['wa-next-appt', patientId],
    queryFn: async () => {
      if (!patientId) return null
      const { data } = await supabase
        .from('appointments')
        .select('scheduled_at, procedure_name, status, professionals(name)')
        .eq('patient_id', patientId)
        .in('status', ['agendado', 'confirmado'])
        .gt('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(1)
      const row = data?.[0] as { scheduled_at: string; procedure_name: string | null; status: string; professionals: { name: string } | { name: string }[] | null } | undefined
      if (!row) return null
      const pro = Array.isArray(row.professionals) ? row.professionals[0] : row.professionals
      return { scheduled_at: row.scheduled_at, procedure_name: row.procedure_name, status: row.status, professional_name: pro?.name ?? null } satisfies NextAppointment
    },
    enabled: !!patientId,
    staleTime: 60_000,
  })
}

export interface LeadContext { stage: string; stage_note: string | null; interest: string | null; estimated_value: number | null; source: string; next_contact_at: string | null; notes: string | null }

/** Lead do CRM com esse telefone (só faz sentido para contato que ainda não é paciente). */
export function useLeadFor(clinicId: string | undefined, phoneKey: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['wa-lead', clinicId, phoneKey],
    queryFn: async () => {
      if (!clinicId || !phoneKey) return null
      const { data } = await supabase.from('crm_leads')
        .select('stage, stage_note, interest, estimated_value, source, next_contact_at, notes')
        .eq('clinic_id', clinicId).eq('phone_key', phoneKey).maybeSingle()
      return (data as LeadContext | null) ?? null
    },
    enabled: !!clinicId && !!phoneKey && enabled,
    staleTime: 30_000,
  })
}
