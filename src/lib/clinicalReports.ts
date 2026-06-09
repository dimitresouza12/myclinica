import { supabase } from '@/lib/supabase'

export interface ClinicalStats {
  returnRate: number           // % de pacientes que voltaram em 90 dias
  cancellationRate: number     // % de cancelamentos no mês
  topProcedures: { name: string; count: number }[]
  conversionRate: number       // % de agendamentos que viraram concluídos
  avgApptPerPatient: number    // média de consultas por paciente ativo
  newVsReturn: { new: number; return: number }  // novos vs retorno no mês
}

export async function loadClinicalStats(clinicId: string): Promise<ClinicalStats> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const [apptMonthRes, apptReturnRes, allApptRes] = await Promise.all([
    // Agendamentos do mês
    supabase
      .from('appointments')
      .select('status, procedure_name, patient_id, scheduled_at')
      .eq('clinic_id', clinicId)
      .gte('scheduled_at', startOfMonth),

    // Pacientes com mais de 1 consulta concluída nos últimos 90 dias (retorno)
    supabase
      .from('appointments')
      .select('patient_id')
      .eq('clinic_id', clinicId)
      .eq('status', 'concluido')
      .gte('scheduled_at', ninetyDaysAgo),

    // Total de consultas concluídas para média
    supabase
      .from('appointments')
      .select('patient_id', { count: 'exact' })
      .eq('clinic_id', clinicId)
      .eq('status', 'concluido'),
  ])

  const apptMonth = apptMonthRes.data ?? []
  const apptReturn = apptReturnRes.data ?? []
  const totalConcluded = allApptRes.count ?? 0

  // Taxa de cancelamento
  const total = apptMonth.length
  const canceled = apptMonth.filter(a => a.status === 'cancelado' || a.status === 'faltou').length
  const cancellationRate = total > 0 ? Math.round((canceled / total) * 100) : 0

  // Taxa de conversão (agendado → concluído)
  const concluded = apptMonth.filter(a => a.status === 'concluido').length
  const conversionRate = total > 0 ? Math.round((concluded / total) * 100) : 0

  // Procedimentos mais realizados no mês
  const procedureMap: Record<string, number> = {}
  for (const a of apptMonth.filter(a => a.status === 'concluido')) {
    const name = a.procedure_name ?? 'Não informado'
    procedureMap[name] = (procedureMap[name] ?? 0) + 1
  }
  const topProcedures = Object.entries(procedureMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }))

  // Taxa de retorno: pacientes com ≥2 consultas nos últimos 90 dias
  const returnPatientCount: Record<string, number> = {}
  for (const a of apptReturn) {
    returnPatientCount[a.patient_id] = (returnPatientCount[a.patient_id] ?? 0) + 1
  }
  const returning = Object.values(returnPatientCount).filter(c => c >= 2).length
  const uniquePatients = Object.keys(returnPatientCount).length
  const returnRate = uniquePatients > 0 ? Math.round((returning / uniquePatients) * 100) : 0

  // Novos vs retorno no mês (paciente com primeira consulta = novo)
  const patientIdsMonth = [...new Set(apptMonth.map(a => a.patient_id))]
  const returnInMonth = patientIdsMonth.filter(id => (returnPatientCount[id] ?? 0) >= 2).length
  const newInMonth = patientIdsMonth.length - returnInMonth

  // Média de consultas por paciente
  const avgApptPerPatient = uniquePatients > 0
    ? Math.round((totalConcluded / uniquePatients) * 10) / 10
    : 0

  return {
    returnRate,
    cancellationRate,
    conversionRate,
    topProcedures,
    avgApptPerPatient,
    newVsReturn: { new: newInMonth, return: returnInMonth },
  }
}
