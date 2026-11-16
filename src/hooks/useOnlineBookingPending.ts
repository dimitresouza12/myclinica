import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Quantos agendamentos feitos pelo link público ainda esperam confirmação (status Agendado, de hoje em diante).
 * Sem a migration 20261128 (coluna booked_online ausente) ou com qualquer erro, é 0: o sino nunca quebra por isso.
 */
export function useOnlineBookingPending(clinicId: string | undefined) {
  return useQuery({
    queryKey: ['online-booking-pending', clinicId],
    enabled: !!clinicId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId!)
        .eq('booked_online', true)
        .eq('status', 'agendado')
        .gte('scheduled_at', new Date().toISOString())
      if (error) return 0
      return count ?? 0
    },
  })
}
