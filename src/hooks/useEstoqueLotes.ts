import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { probeEstoqueLotes } from '@/lib/estoque/lotesSchema'
import type { StockLot } from '@/lib/estoque/lotes'

export interface EstoqueLotesData {
  /** false enquanto a migration 20261114_estoque_lotes.sql não foi aplicada: o Estoque segue como antes */
  available: boolean
  lots: StockLot[]
}

const EMPTY: EstoqueLotesData = { available: false, lots: [] }
const PAGE = 1000

/** Lotes da clínica. Chave 'estoque-lotes': invalide junto com 'estoque' depois de qualquer entrada ou saída. */
export function useEstoqueLotes(clinicId: string | undefined) {
  return useQuery({
    queryKey: ['estoque-lotes', clinicId],
    queryFn: async (): Promise<EstoqueLotesData> => {
      if (!clinicId) return EMPTY
      if (!(await probeEstoqueLotes())) return EMPTY
      const lots: StockLot[] = []
      for (let from = 0; from < PAGE * 10; from += PAGE) {
        const { data, error } = await supabase
          .from('stock_lots')
          .select('*')
          .eq('clinic_id', clinicId)
          .order('validade', { ascending: true, nullsFirst: false })
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1)
        if (error) return EMPTY
        lots.push(...((data ?? []) as StockLot[]))
        if (!data || data.length < PAGE) break
      }
      return { available: true, lots }
    },
    enabled: !!clinicId,
    staleTime: 5 * 60 * 1000,
  })
}

/** Nomes dos pacientes que aparecem nas movimentações (coluna "Paciente" do histórico). */
export function usePacientesDasMovimentacoes(clinicId: string | undefined, ids: string[]) {
  const chave = [...new Set(ids)].sort().join(',')
  return useQuery({
    queryKey: ['estoque-mov-pacientes', clinicId, chave],
    queryFn: async (): Promise<Record<string, string>> => {
      const out: Record<string, string> = {}
      const lista = chave ? chave.split(',') : []
      for (let n = 0; n < lista.length; n += 150) {
        const { data } = await supabase.from('patients').select('id, name').in('id', lista.slice(n, n + 150))
        for (const p of (data ?? []) as { id: string; name: string }[]) out[p.id] = p.name
      }
      return out
    },
    enabled: !!clinicId && chave.length > 0,
    staleTime: 5 * 60 * 1000,
  })
}
