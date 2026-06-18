import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Professional, Procedure } from '@/types'

// Busca TODOS (ativos + inativos) para que dados históricos sejam resolvidos.
// Filtrar ativos deve ser feito no ponto de uso (dropdown, listas de equipe).
export function useProfessionals(clinicId: string | undefined) {
  return useQuery({
    queryKey: ['professionals', clinicId],
    queryFn: async () => {
      if (!clinicId) return []
      const { data } = await supabase
        .from('professionals')
        .select('*')
        .eq('clinic_id', clinicId)
        .order('name')
      return (data ?? []) as Professional[]
    },
    enabled: !!clinicId,
    staleTime: 10 * 60 * 1000,
  })
}

export function useProcedures(clinicId: string | undefined) {
  return useQuery({
    queryKey: ['procedures', clinicId],
    queryFn: async () => {
      if (!clinicId) return []
      const { data } = await supabase
        .from('procedures')
        .select('id, name, price, category, is_active')
        .eq('clinic_id', clinicId)
        .order('name')
      return (data ?? []) as Procedure[]
    },
    enabled: !!clinicId,
    staleTime: 10 * 60 * 1000,
  })
}
