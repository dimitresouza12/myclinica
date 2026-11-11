import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { probeAgendaExtras } from '@/lib/agenda/extrasSchema'
import type { LinkedAppt, PackageLike } from '@/lib/agenda/packages'

export interface PatientPackage extends PackageLike {
  clinic_id: string
  patient_id: string
  name: string
  total_price: number
  financial_record_id: string | null
  notes: string | null
  created_at: string
}

export interface PackagesData {
  /** false quando as tabelas ainda não existem: a Agenda segue como antes */
  available: boolean
  packages: PatientPackage[]
  /** toda consulta ligada a algum pacote (para saldo e numeração "Sessão 3/10") */
  linked: LinkedAppt[]
}

const EMPTY: PackagesData = { available: false, packages: [], linked: [] }
const PAGE = 1000

/** Pacotes da clínica e as consultas ligadas a eles. Chave 'packages': invalide depois de criar, concluir ou desfazer. */
export function usePatientPackages(clinicId: string | undefined) {
  return useQuery({
    queryKey: ['packages', clinicId],
    queryFn: async (): Promise<PackagesData> => {
      if (!clinicId) return EMPTY
      const extras = await probeAgendaExtras()
      if (!extras.packages) return EMPTY

      const packages: PatientPackage[] = []
      for (let from = 0; from < PAGE * 10; from += PAGE) {
        const { data, error } = await supabase
          .from('patient_packages')
          .select('id, clinic_id, patient_id, procedure_id, name, total_sessions, total_price, financial_record_id, status, expires_at, notes, created_at')
          .eq('clinic_id', clinicId)
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1)
        if (error) return EMPTY
        packages.push(...((data ?? []) as PatientPackage[]))
        if (!data || data.length < PAGE) break
      }

      const linked: LinkedAppt[] = []
      for (let from = 0; from < PAGE * 20; from += PAGE) {
        const { data, error } = await supabase
          .from('appointments')
          .select('id, package_id, status, scheduled_at')
          .eq('clinic_id', clinicId)
          .not('package_id', 'is', null)
          .order('scheduled_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1)
        if (error) return EMPTY
        linked.push(...((data ?? []) as LinkedAppt[]))
        if (!data || data.length < PAGE) break
      }
      return { available: true, packages, linked }
    },
    enabled: !!clinicId,
    staleTime: 30 * 1000,
  })
}
