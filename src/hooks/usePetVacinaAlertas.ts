import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { hojeBrasil } from '@/lib/brasilDate'
import { situacaoDaCarteira, seloDaCarteira, type RegistroCarteira } from '@/lib/vet/vacinas'

export interface AlertaCarteira {
  vencidas: number
  aVencer: number
  /** "2 vencidas" ou "1 a vencer" */
  selo: string
  /** a pior situação, para escolher a cor do selo */
  tom: 'vencida' | 'a_vencer'
}

const PAGE = 1000

/**
 * Alertas da carteira de vacinas por pet (patient_id), só para clínica veterinária. Mapa vazio quando a tabela
 * ainda não existe ou não há permissão: a lista de pacientes segue sem o selo. Chave 'pet-vacina-alertas'.
 */
export function usePetVacinaAlertas(clinicId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['pet-vacina-alertas', clinicId],
    queryFn: async (): Promise<Map<string, AlertaCarteira>> => {
      const out = new Map<string, AlertaCarteira>()
      if (!clinicId) return out
      const rows: Array<RegistroCarteira & { patient_id: string }> = []
      for (let from = 0; from < PAGE * 20; from += PAGE) {
        const { data, error } = await supabase
          .from('pet_vaccinations')
          .select('id, patient_id, kind, name, applied_on, next_due_on, created_at')
          .eq('clinic_id', clinicId)
          .order('applied_on', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1)
        if (error) return new Map()
        rows.push(...((data ?? []) as unknown as Array<RegistroCarteira & { patient_id: string }>))
        if (!data || data.length < PAGE) break
      }
      const porPet = new Map<string, RegistroCarteira[]>()
      for (const r of rows) {
        const lista = porPet.get(r.patient_id)
        if (lista) lista.push(r)
        else porPet.set(r.patient_id, [r])
      }
      const hoje = hojeBrasil()
      for (const [patientId, lista] of porPet) {
        const s = situacaoDaCarteira(lista, hoje)
        const selo = seloDaCarteira(s)
        if (selo) out.set(patientId, { vencidas: s.vencidas.length, aVencer: s.aVencer.length, selo, tom: s.vencidas.length ? 'vencida' : 'a_vencer' })
      }
      return out
    },
    enabled: !!clinicId && enabled,
    staleTime: 60 * 1000,
  })
}
