import type { ClinicType } from '@/types'

/** Áreas que usam o plano terapêutico por metas. */
export type MetasArea = 'fono' | 'to' | 'fisio' | 'psico'

export const METAS_AREAS: MetasArea[] = ['fono', 'to', 'fisio', 'psico']

export function isMetasArea(v: ClinicType | string | null | undefined): v is MetasArea {
  return v === 'fono' || v === 'to' || v === 'fisio' || v === 'psico'
}

export type GoalStatus = 'em_andamento' | 'atingida' | 'suspensa' | 'cancelada'
export type GoalResult = 'adquirido' | 'com_pista' | 'nao_adquirido'

export interface Goal {
  id: string
  clinic_id: string
  patient_id: string
  area: MetasArea
  title: string
  domain: string | null
  criterion: string | null
  target_date: string | null
  status: GoalStatus
  sort_order: number
  professional_id: string | null
  created_at: string
  updated_at: string
}

export interface GoalLog {
  id: string
  clinic_id: string
  patient_id: string
  goal_id: string
  log_date: string
  result: GoalResult
  note: string | null
  professional_id: string | null
  created_at: string
}

export type AssessmentKind = 'quadro_fonemico' | 'checklist_avd'

export interface Assessment<T = unknown> {
  id: string
  clinic_id: string
  patient_id: string
  kind: AssessmentKind
  assessed_on: string
  data: T
  professional_id: string | null
  created_at: string
  updated_at: string
}
