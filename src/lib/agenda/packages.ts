// Pacotes de sessões "X/N": saldo, número da sessão e regras de consumo. Funções puras.
//
// Regra central: NÃO existe contador gravado. Sessões usadas = consultas do pacote com status
// 'concluido'. Desfazer a conclusão, excluir ou cancelar a consulta devolve a sessão sozinho.
// Falta do paciente ('faltou') e cancelamento NÃO consomem sessão.

export type PackageStatus = 'ativo' | 'cancelado'

export interface PackageLike {
  id: string
  total_sessions: number
  status: PackageStatus
  /** validade, "AAAA-MM-DD" */
  expires_at?: string | null
  procedure_id?: string | null
  created_at?: string
}

/** O mínimo de uma consulta ligada a um pacote. */
export interface LinkedAppt {
  id: string
  package_id: string | null
  status: string | null
  scheduled_at: string
}

/** Quando restam até tantas sessões, o sistema avisa. */
export const LOW_BALANCE_AT = 2

const isConsumed = (s: string | null) => s === 'concluido'
const isHolding = (s: string | null) => s === 'agendado' || s === 'confirmado' || s === 'arrived' || s === 'in_progress'
/** conta na numeração "Sessão k/N": tudo que ainda vale ou já foi feito */
const isCounted = (s: string | null) => isConsumed(s) || isHolding(s)

export type PackageState = 'ativo' | 'esgotado' | 'expirado' | 'cancelado'

export interface PackageUsage {
  total: number
  /** sessões concluídas */
  used: number
  /** sessões marcadas (agendado ou confirmado) que ainda não aconteceram */
  scheduled: number
  /** saldo: total - usadas */
  remaining: number
  /** ainda sem horário marcado: saldo - marcadas */
  unscheduled: number
  state: PackageState
  /** restam 1 ou 2 sessões e o pacote está valendo */
  low: boolean
}

export function packageUsage(pkg: PackageLike, linked: LinkedAppt[], today?: string): PackageUsage {
  const mine = linked.filter(a => a.package_id === pkg.id)
  const used = mine.filter(a => isConsumed(a.status)).length
  const scheduled = mine.filter(a => isHolding(a.status)).length
  const remaining = Math.max(0, pkg.total_sessions - used)
  const unscheduled = Math.max(0, remaining - scheduled)
  const expired = !!pkg.expires_at && !!today && pkg.expires_at < today
  const state: PackageState = pkg.status === 'cancelado' ? 'cancelado' : remaining === 0 ? 'esgotado' : expired ? 'expirado' : 'ativo'
  return { total: pkg.total_sessions, used, scheduled, remaining, unscheduled, state, low: state === 'ativo' && remaining > 0 && remaining <= LOW_BALANCE_AT }
}

/**
 * Número da sessão ("3" em "Sessão 3/10"): posição da consulta entre as do pacote que valem ou já foram
 * feitas, por data. Cancelada e falta ficam de fora. `null` se a consulta não conta (ou não é do pacote).
 */
export function sessionNumber(apptId: string, linked: LinkedAppt[]): number | null {
  const target = linked.find(a => a.id === apptId)
  if (!target || !target.package_id || !isCounted(target.status)) return null
  const peers = linked
    .filter(a => a.package_id === target.package_id && isCounted(a.status))
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime() || a.id.localeCompare(b.id))
  const i = peers.findIndex(a => a.id === apptId)
  return i < 0 ? null : i + 1
}

export const sessionLabel = (n: number, total: number) => `Sessão ${n}/${total}`

/** "Resta 1 sessão", "Restam 2 sessões" (ou null quando não há o que avisar). */
export function lowBalanceMessage(remaining: number): string | null {
  if (remaining <= 0 || remaining > LOW_BALANCE_AT) return null
  return remaining === 1 ? 'Resta 1 sessão no pacote' : `Restam ${remaining} sessões no pacote`
}

export type ConsumeResult = { ok: true } | { ok: false; reason: 'cancelado' | 'esgotado' }

/**
 * Concluir esta consulta pode consumir uma sessão do pacote? Não se o pacote foi cancelado ou se as N sessões
 * já foram usadas por OUTRAS consultas (a própria consulta não conta contra si: concluir de novo é idempotente).
 * Validade vencida não impede: a sessão já estava marcada e o atendimento aconteceu.
 */
export function canConsumeSession(pkg: PackageLike, linked: LinkedAppt[], apptId: string): ConsumeResult {
  if (pkg.status === 'cancelado') return { ok: false, reason: 'cancelado' }
  const usedByOthers = linked.filter(a => a.package_id === pkg.id && a.id !== apptId && isConsumed(a.status)).length
  if (usedByOthers >= pkg.total_sessions) return { ok: false, reason: 'esgotado' }
  return { ok: true }
}

export type LinkResult = { ok: true } | { ok: false; reason: 'cancelado' | 'esgotado' | 'expirado' | 'sem_sessao_livre' }

/**
 * Posso marcar `count` novas consultas neste pacote? Precisa estar valendo e ter sessões sem horário.
 * `ignoreApptId` deixa a consulta que está sendo editada de fora da conta.
 */
export function canLinkAppointments(pkg: PackageLike, linked: LinkedAppt[], count: number, today: string, ignoreApptId?: string): LinkResult {
  const u = packageUsage(pkg, ignoreApptId ? linked.filter(a => a.id !== ignoreApptId) : linked, today)
  if (u.state === 'cancelado') return { ok: false, reason: 'cancelado' }
  if (u.state === 'esgotado') return { ok: false, reason: 'esgotado' }
  if (u.state === 'expirado') return { ok: false, reason: 'expirado' }
  if (u.unscheduled < count) return { ok: false, reason: 'sem_sessao_livre' }
  return { ok: true }
}

/** Quantas consultas ainda cabem no pacote (sem contar as já marcadas). */
export function freeSessions(pkg: PackageLike, linked: LinkedAppt[], today: string, ignoreApptId?: string): number {
  const u = packageUsage(pkg, ignoreApptId ? linked.filter(a => a.id !== ignoreApptId) : linked, today)
  return u.state === 'ativo' ? u.unscheduled : 0
}

/**
 * Pacote sugerido para um novo agendamento: ativo, com sessão sem horário e do mesmo procedimento
 * (pacote sem procedimento vale para qualquer um). Primeiro o que vence antes; depois o mais antigo.
 */
export function suggestPackage<T extends PackageLike>(packages: T[], linked: LinkedAppt[], procedureId: string | null, today: string): T | null {
  const candidates = packages.filter(p =>
    freeSessions(p, linked, today) > 0 && (!p.procedure_id || !procedureId || p.procedure_id === procedureId))
  candidates.sort((a, b) => {
    const ea = a.expires_at ?? '9999-12-31'
    const eb = b.expires_at ?? '9999-12-31'
    return ea.localeCompare(eb) || (a.created_at ?? '').localeCompare(b.created_at ?? '')
  })
  return candidates[0] ?? null
}

/** Preço de uma sessão do pacote (informativo; a receita da venda é uma só). */
export function pricePerSession(totalPrice: number, totalSessions: number): number {
  return totalSessions > 0 ? Math.round((totalPrice / totalSessions) * 100) / 100 : 0
}
