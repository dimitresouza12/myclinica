import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { withClinicArea, clinicAreaList } from '@/lib/clinicAreas'
import type { ClinicType } from '@/types'

/**
 * Registra uma área nova na clínica: espelha na sessão (addClinicSpecialty) e grava
 * clinics.specialties + is_multi_specialty no banco (admin pode atualizar a própria clínica por RLS).
 * Os RPCs create/update_clinic_member já acrescentam a área em specialties, mas só quando há login;
 * profissional "só agenda" é um insert direto em professionals e não passava por lugar nenhum — e
 * nenhum caminho atualizava is_multi_specialty. Conta de demonstração: só a sessão, nunca o banco.
 */
export async function registerClinicArea(area: ClinicType): Promise<void> {
  const { clinic, addClinicSpecialty } = useAuthStore.getState()
  if (!clinic) return
  const demo = clinic.demoMode === true
  const current = clinicAreaList(clinic)
  const { areas, changed } = withClinicArea(current, area)
  // Área já listada e flag em dia: nada a fazer. Área já listada com flag defasada (o RPC só
  // acrescentou a área): só corrige o banco.
  if (!changed && !!clinic.isMultiSpecialty === areas.length > 1) return
  if (changed) addClinicSpecialty(area)
  if (demo) return
  const { error } = await supabase
    .from('clinics')
    .update({ specialties: areas, is_multi_specialty: areas.length > 1 })
    .eq('id', clinic.id)
  if (error) console.warn('registerClinicArea:', error.message)
}
