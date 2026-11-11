// Escrita de séries de agendamento e das ações "este e os próximos". Toda query é escopada à clínica.
import { supabase } from '@/lib/supabase'
import { MAX_APPT_MS, overlaps } from './slots'
import { normalizeWeekdays, planFollowingRanges, toBusyRanges, shiftedInstant, type BusyRange, type PlannedOccurrence, type SeriesRule } from './series'

const PAGE = 1000

/**
 * Faixas ocupadas do profissional (consultas dele e bloqueios da clínica toda) entre dois instantes, direto do banco.
 * Lê em páginas: uma série de um ano num profissional movimentado passa fácil de 1000 linhas.
 * `ignoreIds` deixa de fora consultas que estão sendo movidas (o horário antigo delas não conflita com o novo).
 */
export async function fetchBusyRanges(
  clinicId: string, professionalId: string, fromMs: number, toMs: number, ignoreIds: string[] = [],
): Promise<{ ok: true; busy: BusyRange[] } | { ok: false }> {
  const rows: { id: string; scheduled_at: string; duration_minutes: number | null; status: string | null }[] = []
  for (let from = 0; from < PAGE * 10; from += PAGE) {
    const { data, error } = await supabase
      .from('appointments')
      .select('id, scheduled_at, duration_minutes, status')
      .eq('clinic_id', clinicId)
      .or(`professional_id.eq.${professionalId},and(professional_id.is.null,status.eq.bloqueado)`)
      .neq('status', 'cancelado')
      .gte('scheduled_at', new Date(fromMs - MAX_APPT_MS).toISOString())
      .lt('scheduled_at', new Date(toMs).toISOString())
      .order('scheduled_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) return { ok: false }
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  const ignore = new Set(ignoreIds)
  return { ok: true, busy: toBusyRanges(rows.filter(r => !ignore.has(r.id))) }
}

export interface CreateSeriesInput {
  clinicId: string
  userId?: string | null
  patientId: string
  professionalId: string | null
  procedureId: string | null
  packageId: string | null
  rule: SeriesRule
  time: string
  durationMin: number
  /** só as ocorrências que entram */
  occurrences: PlannedOccurrence[]
  /** campos iguais para todas as consultas (procedimento, preço, status, observações, `package_id`...) */
  base: Record<string, unknown>
  /** motivo gravado nas ocorrências fora da escala (encaixe) */
  extraReason: string
}

export type CreateSeriesResult = { ok: true; seriesId: string; ids: string[] } | { ok: false; error: string }

/** Cria a regra da série e todas as consultas de uma vez (um insert só: ou entram todas ou nenhuma). */
export async function createAppointmentSeries(input: CreateSeriesInput): Promise<CreateSeriesResult> {
  if (input.occurrences.length === 0) return { ok: false, error: 'Nenhum horário selecionado para a série.' }
  const { rule } = input
  const { data: series, error: serErr } = await supabase.from('appointment_series').insert([{
    clinic_id: input.clinicId,
    patient_id: input.patientId,
    professional_id: input.professionalId,
    procedure_id: input.procedureId,
    package_id: input.packageId,
    frequency: rule.frequency,
    // grava os dias efetivos (com o da data de início), não só os extras que o formulário guarda
    weekdays: rule.frequency === 'mensal' ? [] : normalizeWeekdays(rule.startDate, rule.weekdays),
    start_date: rule.startDate,
    time_of_day: input.time,
    duration_minutes: input.durationMin,
    end_mode: rule.endMode,
    occurrences: rule.endMode === 'contagem' ? Math.min(200, Math.max(1, Math.floor(rule.occurrences))) : null,
    until_date: rule.endMode === 'data' ? rule.untilDate : null,
    created_by: input.userId ?? null,
  }]).select('id').single()
  if (serErr || !series) return { ok: false, error: `Erro ao criar a série: ${serErr?.message ?? 'sem resposta'}` }

  const rows = input.occurrences.map(o => ({
    ...input.base,
    clinic_id: input.clinicId,
    patient_id: input.patientId,
    professional_id: input.professionalId,
    scheduled_at: new Date(o.startMs).toISOString(),
    duration_minutes: input.durationMin,
    series_id: series.id,
    series_index: o.index,
    ...(o.state === 'fora_escala' ? { extra_slot_reason: input.extraReason } : {}),
  }))
  const { data: inserted, error: insErr } = await supabase.from('appointments').insert(rows).select('id')
  if (insErr) {
    // nada entrou (insert único): remove a regra órfã para não sobrar série sem consultas
    await supabase.from('appointment_series').delete().eq('id', series.id).eq('clinic_id', input.clinicId)
    return { ok: false, error: insErr.code === '23P01' ? 'Conflito de horário com outro agendamento.' : `Erro ao criar as consultas da série: ${insErr.message}` }
  }
  return { ok: true, seriesId: series.id, ids: (inserted ?? []).map(r => r.id) }
}

/** Marca como cancelado, de uma vez, um grupo de consultas (as da série que o escopo alcançou). */
export async function cancelAppointments(clinicId: string, ids: string[]): Promise<string | null> {
  if (ids.length === 0) return null
  const { error } = await supabase.from('appointments').update({ status: 'cancelado' }).in('id', ids).eq('clinic_id', clinicId)
  return error ? error.message : null
}

export async function deleteAppointments(clinicId: string, ids: string[]): Promise<string | null> {
  if (ids.length === 0) return null
  const { error } = await supabase.from('appointments').delete().in('id', ids).eq('clinic_id', clinicId)
  return error ? error.message : null
}

/** O que muda nas próximas consultas da série. Só entra o que o usuário de fato alterou. */
export interface FollowingPatch {
  fields: Record<string, unknown>
  /** novo horário local "HH:mm" */
  time?: string
  /** dias a somar à data de cada consulta */
  dayDelta?: number
}

export const patchIsEmpty = (p: FollowingPatch) => Object.keys(p.fields).length === 0 && !p.time && !p.dayDelta

export interface FollowingTarget { id: string; scheduled_at: string; duration_minutes: number | null; professional_id: string | null }

/**
 * Confere conflito de cada consulta que vai mudar, antes de gravar qualquer uma.
 * Devolve a mensagem de erro ou null se tudo cabe. `alsoIgnore`: a consulta que está sendo editada (o horário antigo dela não conta).
 */
export async function checkFollowingConflicts(
  clinicId: string, targets: FollowingTarget[], patch: FollowingPatch, alsoIgnore: string[] = [],
): Promise<string | null> {
  const moves = !!patch.time || !!patch.dayDelta
  const profChanged = 'professional_id' in patch.fields
  const durChanged = 'duration_minutes' in patch.fields
  if (!moves && !profChanged && !durChanged) return null
  if (targets.length === 0) return null

  // cada consulta é conferida na agenda do profissional dela (ou do novo, se a mudança troca o profissional)
  const planned = planFollowingRanges(targets, patch)
  const byProf = new Map<string, typeof planned>()
  for (const p of planned) {
    if (!p.professionalId) continue // sem profissional não há agenda para conferir (igual ao agendamento avulso)
    const list = byProf.get(p.professionalId)
    if (list) list.push(p)
    else byProf.set(p.professionalId, [p])
  }
  const ignoreIds = [...targets.map(t => t.id), ...alsoIgnore]
  const bad: typeof planned = []
  for (const [professionalId, list] of byProf) {
    const res = await fetchBusyRanges(clinicId, professionalId, Math.min(...list.map(p => p.start)), Math.max(...list.map(p => p.end)), ignoreIds)
    if (!res.ok) return 'Não foi possível conferir a agenda. Tente de novo.'
    bad.push(...list.filter(p => res.busy.some(b => overlaps(p.start, p.end, b.start, b.end))))
  }
  if (bad.length === 0) return null
  bad.sort((a, b) => a.start - b.start)
  const sample = bad.slice(0, 3).map(p => new Date(p.start).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })).join(', ')
  return `${bad.length === 1 ? 'Uma consulta da série ficaria' : `${bad.length} consultas da série ficariam`} em conflito (${sample}${bad.length > 3 ? '...' : ''}). Ajuste só esta consulta ou resolva os conflitos antes.`
}

/** Grava a mudança nas próximas consultas. Devolve a mensagem de erro, ou null. */
export async function applyFollowingPatch(clinicId: string, targets: FollowingTarget[], patch: FollowingPatch): Promise<string | null> {
  if (targets.length === 0 || patchIsEmpty(patch)) return null
  const moves = !!patch.time || !!patch.dayDelta
  if (!moves) {
    const { error } = await supabase.from('appointments').update(patch.fields).in('id', targets.map(t => t.id)).eq('clinic_id', clinicId)
    return error ? `Erro ao atualizar as próximas consultas: ${error.message}` : null
  }
  const results = await Promise.all(targets.map(t =>
    supabase.from('appointments')
      .update({ ...patch.fields, scheduled_at: shiftedInstant(t.scheduled_at, { time: patch.time, dayDelta: patch.dayDelta }).toISOString() })
      .eq('id', t.id).eq('clinic_id', clinicId),
  ))
  const failed = results.filter(r => r.error).length
  return failed > 0 ? `${failed} das próximas consultas não puderam ser atualizadas. Confira a agenda.` : null
}
