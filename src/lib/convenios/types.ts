// Tipos do módulo de convênios (tabela insurance_plans + colunas extras de patients, migration 20261116_convenios.sql).
import type { AppointmentStatus } from '@/types'

export interface InsurancePlan {
  id: string
  clinic_id: string
  name: string
  /** Registro ANS da operadora: 6 números. */
  ans_registry: string | null
  /** Tabela de valores do convênio: { id do procedimento: valor em reais }. */
  procedure_prices: Record<string, number>
  notes: string | null
  is_active: boolean
  created_at?: string
  updated_at?: string
}

/** O que a produção, as guias e o recibo precisam saber do paciente (colunas novas são opcionais até a migration). */
export interface ConvenioPatient {
  id: string
  name: string
  cpf: string | null
  birth_date?: string | null
  convenio: string | null
  convenio_carteirinha: string | null
  insurance_plan_id?: string | null
  convenio_validade?: string | null
  convenio_titular?: string | null
  payer_name?: string | null
  payer_cpf?: string | null
}

export interface ConvenioAppointment {
  id: string
  patient_id: string | null
  professional_id: string | null
  procedure_id: string | null
  procedure_name: string | null
  procedure_price: number | null
  status: AppointmentStatus
  scheduled_at: string
}

export interface ConvenioRecord {
  id: string
  appointment_id: string | null
  patient_id: string | null
  type: 'receita' | 'despesa'
  total_amount: number | null
  payment_method: string | null
  convenio: string | null
  created_at: string
}

export interface ConvenioProfessional {
  id: string
  name: string
  specialty: string | null
  specialty_type: import('@/types').ClinicType | null
  registration_number: string | null
  rqe?: string | null
}

export interface ConvenioProcedure { id: string; name: string; price: number | null }

export const PARTICULAR = 'Particular'
