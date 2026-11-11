// Fluxo de atendimento sobre appointments.status (texto livre no banco, sem CHECK):
//   agendado/confirmado -> arrived (paciente chegou, aguardando) -> in_progress (em atendimento) -> concluido (atendido)
// Funções puras: decidem quais ações valem e qual é o patch de colunas. Quem grava é api.ts.
import { brasilDayOf } from '@/lib/brasilDate'

export const ARRIVED = 'arrived'
export const IN_PROGRESS = 'in_progress'

/** Colunas que a migration 20261119_atendimento_fluxo.sql acrescenta (arrived_at já existia). */
export interface FlowFields {
  arrived_at?: string | null
  called_at?: string | null
  started_at?: string | null
  finished_at?: string | null
}

export interface FlowAppt extends FlowFields {
  status: string | null
  scheduled_at?: string
}

/** Onde a consulta está no fluxo. 'closed' = cancelada, falta ou bloqueio: fora do fluxo. */
export type FlowStage = 'scheduled' | 'waiting' | 'in_progress' | 'done' | 'closed'

export function stageOf(a: FlowAppt): FlowStage {
  const s = a.status ?? 'agendado'
  if (s === IN_PROGRESS) return 'in_progress'
  if (s === ARRIVED) return 'waiting'
  if (s === 'concluido') return 'done'
  if (s === 'cancelado' || s === 'faltou' || s === 'bloqueado') return 'closed'
  // chegada registrada antes do fluxo (só arrived_at, status inalterado) continua valendo como "aguardando"
  if ((s === 'agendado' || s === 'confirmado') && a.arrived_at) return 'waiting'
  return 'scheduled'
}

export type FlowAction = 'arrive' | 'unarrive' | 'call' | 'start' | 'back_to_queue' | 'finish'

/** Ações que a consulta aceita agora. */
export function availableActions(a: FlowAppt): FlowAction[] {
  switch (stageOf(a)) {
    case 'scheduled': return ['arrive', 'start']
    case 'waiting': return ['call', 'start', 'unarrive']
    case 'in_progress': return ['finish', 'back_to_queue']
    default: return []
  }
}

export const canDo = (a: FlowAppt, action: FlowAction) => availableActions(a).includes(action)

/** Status em que o banco ainda deve estar para a gravação valer (evita sobrescrever o que outra tela mudou). */
export function expectedStatuses(action: FlowAction): string[] {
  switch (action) {
    case 'arrive': return ['agendado', 'confirmado']
    case 'unarrive': return [ARRIVED, 'agendado', 'confirmado']
    case 'call': return [ARRIVED, 'agendado', 'confirmado']
    case 'start': return ['agendado', 'confirmado', ARRIVED]
    case 'back_to_queue': return [IN_PROGRESS]
    case 'finish': return [IN_PROGRESS]
  }
}

export interface FlowPatch {
  status?: string
  arrived_at?: string | null
  called_at?: string | null
  started_at?: string | null
  finished_at?: string | null
  started_by?: string | null
  finished_by?: string | null
}

/** Patch de colunas para a ação, ou null se ela não vale para a consulta. `userId` = auth.users.id de quem agiu. */
export function applyAction(a: FlowAppt, action: FlowAction, now: Date, userId: string | null): FlowPatch | null {
  if (!canDo(a, action)) return null
  const iso = now.toISOString()
  switch (action) {
    case 'arrive':
      return { status: ARRIVED, arrived_at: iso, called_at: null }
    case 'unarrive':
      // chegou por engano: volta para "confirmado" (quem chegou estava, no mínimo, presente); o legado mantém o status dele
      return { status: a.status === ARRIVED ? 'confirmado' : (a.status ?? 'agendado'), arrived_at: null, called_at: null }
    case 'call':
      return { called_at: iso }
    case 'start':
      return { status: IN_PROGRESS, started_at: iso, started_by: userId, called_at: null, finished_at: null, finished_by: null }
    case 'back_to_queue':
      return { status: ARRIVED, started_at: null, started_by: null, called_at: null, arrived_at: a.arrived_at ?? iso }
    case 'finish':
      return { status: 'concluido', finished_at: iso, finished_by: userId }
  }
}

/**
 * Colunas do fluxo que acompanham uma troca de status feita pelo seletor genérico da agenda ("Alterar status"),
 * para o fluxo não ficar incoerente: concluir carimba o fim; voltar para agendado/confirmado zera chegada e início.
 * Só vale quando o banco já tem as colunas (o chamador confere).
 */
export function statusChangePatch(a: FlowAppt, newStatus: string, now: Date, userId: string | null): FlowPatch {
  const iso = now.toISOString()
  if (newStatus === 'concluido') {
    const p: FlowPatch = {}
    if (a.started_at && !a.finished_at) { p.finished_at = iso; p.finished_by = userId }
    return p
  }
  if (newStatus === 'agendado' || newStatus === 'confirmado') {
    const stage = stageOf(a)
    if (stage === 'waiting' || stage === 'in_progress') {
      return { arrived_at: null, called_at: null, started_at: null, started_by: null }
    }
  }
  return {}
}

/** A consulta é de hoje (dia de Brasília)? */
export function isSameBrasilDay(iso: string, now: Date): boolean {
  const d = brasilDayOf(iso)
  return !!d && d === brasilDayOf(now.toISOString())
}

export const FLOW_STATUS_LABELS: Record<string, string> = {
  [ARRIVED]: 'Aguardando',
  [IN_PROGRESS]: 'Em atendimento',
}

/** Consulta de pé, ainda por acontecer ou acontecendo (para contagens "em aberto"). */
export const isOpenStatus = (s: string | null | undefined) =>
  s === 'agendado' || s === 'confirmado' || s === ARRIVED || s === IN_PROGRESS
