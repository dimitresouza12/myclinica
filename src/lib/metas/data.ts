import { supabase } from '@/lib/supabase'
import type { Assessment, AssessmentKind, Goal, GoalLog, GoalResult, GoalStatus, MetasArea } from './types'

interface DbError { code?: string; message?: string }

/** Tabela ainda não existe (migração não aplicada): a aba mostra um aviso neutro em vez de quebrar. */
export function isMissingTable(err: DbError | null | undefined): boolean {
  if (!err) return false
  return err.code === '42P01' || err.code === 'PGRST205' || /could not find the table|does not exist/i.test(err.message ?? '')
}

/** A tabela existe, mas as policies de acesso ainda não foram liberadas para este usuário. */
export function isPermissionDenied(err: DbError | null | undefined): boolean {
  if (!err) return false
  return err.code === '42501' || /row-level security|permission denied/i.test(err.message ?? '')
}

export interface MetasData {
  goals: Goal[]
  logs: GoalLog[]
  assessments: Assessment[]
}

export type LoadResult =
  | { ok: true; data: MetasData }
  | { ok: false; reason: 'missing' | 'error' }

export async function loadMetas(patientId: string): Promise<LoadResult> {
  const [g, l, a] = await Promise.all([
    supabase.from('therapy_goals').select('*').eq('patient_id', patientId).order('sort_order').order('created_at'),
    supabase.from('therapy_goal_logs').select('*').eq('patient_id', patientId).order('log_date').order('created_at'),
    supabase.from('therapy_assessments').select('*').eq('patient_id', patientId).order('assessed_on').order('created_at'),
  ])
  const err = g.error ?? l.error ?? a.error
  if (err) return { ok: false, reason: isMissingTable(err) ? 'missing' : 'error' }
  return {
    ok: true,
    data: {
      goals: (g.data ?? []) as Goal[],
      logs: (l.data ?? []) as GoalLog[],
      assessments: (a.data ?? []) as Assessment[],
    },
  }
}

export interface GoalInput {
  title: string
  domain: string | null
  criterion: string | null
  target_date: string | null
}

type Result<T> = { ok: true; data: T } | { ok: false; denied: boolean; message: string }

function fail<T>(err: DbError): Result<T> {
  return { ok: false, denied: isPermissionDenied(err), message: err.message ?? 'Erro desconhecido' }
}

export async function createGoal(args: { clinicId: string; patientId: string; area: MetasArea; professionalId: string | null; sortOrder: number } & GoalInput): Promise<Result<Goal>> {
  const { data, error } = await supabase.from('therapy_goals').insert([{
    clinic_id: args.clinicId, patient_id: args.patientId, area: args.area,
    title: args.title.trim(), domain: args.domain, criterion: args.criterion, target_date: args.target_date,
    professional_id: args.professionalId, sort_order: args.sortOrder,
  }]).select('*').single()
  if (error || !data) return fail(error ?? {})
  return { ok: true, data: data as Goal }
}

export async function updateGoal(id: string, patch: Partial<GoalInput> & { status?: GoalStatus }): Promise<Result<Goal>> {
  const { data, error } = await supabase.from('therapy_goals').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select('*').single()
  if (error || !data) return fail(error ?? {})
  return { ok: true, data: data as Goal }
}

export async function addLog(args: { clinicId: string; patientId: string; goalId: string; date: string; result: GoalResult; note: string | null; professionalId: string | null }): Promise<Result<GoalLog>> {
  const { data, error } = await supabase.from('therapy_goal_logs').insert([{
    clinic_id: args.clinicId, patient_id: args.patientId, goal_id: args.goalId,
    log_date: args.date, result: args.result, note: args.note, professional_id: args.professionalId,
  }]).select('*').single()
  if (error || !data) return fail(error ?? {})
  return { ok: true, data: data as GoalLog }
}

export async function deleteLog(id: string): Promise<Result<null>> {
  const { error } = await supabase.from('therapy_goal_logs').delete().eq('id', id)
  if (error) return fail(error)
  return { ok: true, data: null }
}

export async function saveAssessment(args: { id?: string; clinicId: string; patientId: string; kind: AssessmentKind; date: string; data: unknown; professionalId: string | null }): Promise<Result<Assessment>> {
  if (args.id) {
    const { data, error } = await supabase.from('therapy_assessments')
      .update({ assessed_on: args.date, data: args.data, updated_at: new Date().toISOString() })
      .eq('id', args.id).select('*').single()
    if (error || !data) return fail(error ?? {})
    return { ok: true, data: data as Assessment }
  }
  const { data, error } = await supabase.from('therapy_assessments').insert([{
    clinic_id: args.clinicId, patient_id: args.patientId, kind: args.kind,
    assessed_on: args.date, data: args.data, professional_id: args.professionalId,
  }]).select('*').single()
  if (error || !data) return fail(error ?? {})
  return { ok: true, data: data as Assessment }
}

export async function deleteAssessment(id: string): Promise<Result<null>> {
  const { error } = await supabase.from('therapy_assessments').delete().eq('id', id)
  if (error) return fail(error)
  return { ok: true, data: null }
}

export async function updateLog(id: string, patch: { result?: GoalResult; note?: string | null }): Promise<Result<GoalLog>> {
  const { data, error } = await supabase.from('therapy_goal_logs').update(patch).eq('id', id).select('*').single()
  if (error || !data) return fail(error ?? {})
  return { ok: true, data: data as GoalLog }
}
