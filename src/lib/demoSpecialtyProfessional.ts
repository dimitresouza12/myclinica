import { supabase } from '@/lib/supabase'
import type { ClinicType } from '@/types'

/**
 * Primeiro profissional da área na clínica (por data de criação), ou null se não houver
 * ou se a busca falhar/demorar. Só lê; a conta de demonstração não é alterada.
 */
export async function fetchFirstProfessionalId(clinicId: string, area: ClinicType): Promise<string | null> {
  try {
    const query = supabase
      .from('professionals')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('specialty_type', area)
      .order('created_at', { ascending: true })
      .limit(1)
    const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 4000))
    const result = await Promise.race([query.then(r => r), timeout])
    if (!result || result.error) return null
    return result.data?.[0]?.id ?? null
  } catch {
    return null
  }
}
