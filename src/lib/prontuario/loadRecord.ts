import { supabase } from '@/lib/supabase'
import type { MedicalRecord, RecordEntry } from '@/types'

/** Chave do cache da ficha do paciente: a página dispara a busca em paralelo com o cadastro e o prontuário reaproveita. */
export const medicalRecordKey = (clinicId: string, patientId: string) => ['prontuario-record', clinicId, patientId] as const

export async function fetchMedicalRecord(clinicId: string, patientId: string): Promise<MedicalRecord | null> {
  const { data } = await supabase
    .from('medical_records')
    .select('*')
    .eq('patient_id', patientId)
    .eq('clinic_id', clinicId)
    .maybeSingle<MedicalRecord>()
  return data ?? null
}

/** Quantas evoluções vêm na primeira leva; o resto chega em seguida, sem travar a Ficha. */
export const ENTRIES_FIRST_PAGE = 50

export async function fetchEntriesPage(clinicId: string, patientId: string, from: number, to: number): Promise<RecordEntry[]> {
  const { data } = await supabase
    .from('record_entries')
    .select('*')
    .eq('patient_id', patientId)
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to)
  return (data ?? []) as RecordEntry[]
}
