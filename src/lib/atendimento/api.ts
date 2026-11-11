// Gravação das ações do fluxo de atendimento (chegou, chamar, iniciar, voltar à fila, finalizar).
// Sempre filtra por clinic_id e só grava se o status ainda for o esperado (outra tela pode ter mudado a consulta).
import { supabase } from '@/lib/supabase'
import { audit, type AuditAction } from '@/lib/audit'
import { isMissingSchemaError } from '@/lib/agenda/extrasSchema'
import { applyAction, expectedStatuses, type FlowAction, type FlowAppt, type FlowPatch } from './status'
import { consultMs, waitMs } from './time'

export type FlowResult = { ok: true; patch: FlowPatch } | { ok: false; error: string }

const AUDIT_ACTION: Record<FlowAction, AuditAction | null> = {
  arrive: 'attendance.arrive',
  unarrive: null,
  call: 'attendance.call',
  start: 'attendance.start',
  back_to_queue: 'attendance.back_to_queue',
  finish: 'attendance.finish',
}

export interface FlowContext { clinicId: string; userId: string | null }

/**
 * Executa uma ação do fluxo. Devolve o patch gravado (para atualizar a tela sem recarregar) ou a mensagem de erro.
 * Auditoria só com metadados (nenhum nome, telefone ou texto clínico).
 */
export async function runFlowAction(
  ctx: FlowContext,
  appt: FlowAppt & { id: string },
  action: FlowAction,
  now: Date = new Date(),
): Promise<FlowResult> {
  const patch = applyAction(appt, action, now, ctx.userId)
  if (!patch) return { ok: false, error: 'Essa ação não vale para o estado atual da consulta. Atualize a tela.' }

  const { data, error } = await supabase
    .from('appointments')
    .update(patch)
    .eq('id', appt.id)
    .eq('clinic_id', ctx.clinicId)
    .in('status', expectedStatuses(action))
    .select('id')
  if (error) {
    return { ok: false, error: isMissingSchemaError(error) ? 'O banco ainda não foi atualizado para o fluxo de atendimento.' : 'Não foi possível salvar. Tente novamente.' }
  }
  if (!data?.length) return { ok: false, error: 'A consulta mudou em outra tela. Atualize a tela e tente de novo.' }

  const act = AUDIT_ACTION[action]
  if (act && ctx.userId) {
    const details: Record<string, string | number | boolean> = {}
    if (action === 'start') { const w = waitMs(appt.arrived_at, patch.started_at ?? null); if (w !== null) details.wait_seconds = Math.round(w / 1000) }
    if (action === 'finish') {
      const d = consultMs(appt.started_at, patch.finished_at ?? null)
      if (d !== null) details.duration_seconds = Math.round(d / 1000)
    }
    void audit({ action: act, user_id: ctx.userId, clinic_id: ctx.clinicId, module: 'agenda', resource_id: appt.id, details })
  }
  return { ok: true, patch }
}

/** Colunas do fluxo mescladas numa consulta já carregada (para atualizar a lista local depois de gravar). */
export function mergePatch<T extends object>(appt: T, patch: FlowPatch): T {
  return { ...appt, ...patch } as T
}
