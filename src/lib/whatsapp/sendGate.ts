// Proteção do número da clínica antes de cada envio automático: pausa por falhas recentes,
// aquecimento de número novo ou parado e ritmo entre envios. Só no servidor (service role).
//
// Foi extraída de run.ts sem mudar o comportamento da rotina de confirmações (run-confirmations);
// os envios da automação (/api/automacao/enviar e respostas automáticas do webhook) usam o mesmo
// portão, para um caminho novo de envio nunca escapar da proteção.
//
// Regras em safety.ts (funções puras). Aqui ficam só as leituras do banco e o ritmo.

import { getAdminClient } from '@/lib/supabaseAdmin'
import { startOfLocalDay } from './window'
import {
  warmupStart, warmupDailyLimit, isPaused, sendGapMs,
  ACTIVITY_LOOKBACK_MS, ACTIVITY_SAMPLE_LIMIT, PAUSE_WINDOW_MS,
  type FailureRow,
} from './safety'

export interface Gate { paused: boolean; allowance: number; limit: number; sentToday: number }

/** 'enviando' parado por mais que isso é linha presa (processo caiu): não conta como envio em andamento. */
const IN_FLIGHT_MS = 10 * 60_000
/** Prefixo da chave de idempotência dos envios em modo teste: nunca entram na conta de pausa nem de aquecimento. */
export const TEST_KEY_PREFIX = 'teste:'

export interface GateOptions {
  /**
   * Inclui os envios e falhas da automação (tabela automacao_envios) na conta de pausa e de aquecimento.
   * A rotina antiga (run.ts) não liga esta opção: comportamento idêntico ao de antes.
   */
  includeAutomacao?: boolean
  /** Reserva da própria chamada: já está 'enviando' e não pode contar contra ela mesma. */
  excludeEnvioId?: string
}

/**
 * Função da automação que também grava em appointment_confirmations: o ENVIO dela já é contado por essa tabela
 * (sent_at), então fica fora da conta de aquecimento de automacao_envios. As FALHAS dela são gravadas só em
 * automacao_envios (a reserva em appointment_confirmations é apagada quando falha), então entram na pausa.
 */
const FUNCAO_COM_CONFIRMACAO = 'confirmacao_dia'

/** Pausa por falhas recentes e quantos envios o aquecimento ainda permite hoje. */
export async function sendingGate(
  wa: { clinic_id: string },
  s: { timezone: string },
  now: Date,
  opts: GateOptions = {},
): Promise<Gate> {
  const admin = getAdminClient()
  const sinceFailures = new Date(now.getTime() - PAUSE_WINDOW_MS).toISOString()

  const [failuresRes, activityRes, autoFailuresRes] = await Promise.all([
    admin.from('appointment_confirmations')
      .select('error, updated_at')
      .eq('clinic_id', wa.clinic_id)
      .eq('status', 'falhou')
      .gte('updated_at', sinceFailures),
    // qualquer mensagem enviada pelo número (rotina, recepção pelo sistema ou pelo celular)
    admin.from('whatsapp_messages')
      .select('created_at')
      .eq('clinic_id', wa.clinic_id)
      .eq('direction', 'out')
      .gte('created_at', new Date(now.getTime() - ACTIVITY_LOOKBACK_MS).toISOString())
      .order('created_at', { ascending: false })
      .limit(ACTIVITY_SAMPLE_LIMIT),
    opts.includeAutomacao
      ? admin.from('automacao_envios')
          .select('erro, atualizado_em')
          .eq('clinic_id', wa.clinic_id)
          .eq('status', 'falhou')
          .not('chave_idempotencia', 'like', `${TEST_KEY_PREFIX}%`)
          .gte('atualizado_em', sinceFailures)
      : Promise.resolve({ data: [] as { erro: string | null; atualizado_em: string }[] }),
  ])

  const failures: FailureRow[] = [
    ...((failuresRes.data ?? []) as FailureRow[]),
    ...((autoFailuresRes.data ?? []) as { erro: string | null; atualizado_em: string }[])
      .map(r => ({ error: r.erro, updated_at: r.atualizado_em })),
  ]
  const paused = isPaused(failures, now)
  // sem conseguir ler o histórico, segue sem limite em vez de travar a clínica
  if (activityRes.error) return { paused, allowance: Infinity, limit: Infinity, sentToday: 0 }

  const outgoing = (activityRes.data ?? []).map(r => new Date(r.created_at as string))
  const limit = warmupDailyLimit(warmupStart(outgoing, now, outgoing.length >= ACTIVITY_SAMPLE_LIMIT), now)
  if (limit === null) return { paused, allowance: Infinity, limit: Infinity, sentToday: 0 }

  const dayStart = startOfLocalDay(now, s.timezone).toISOString()
  const { count } = await admin.from('appointment_confirmations')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', wa.clinic_id)
    .gte('sent_at', dayStart)
  let sentToday = count ?? 0

  if (opts.includeAutomacao) {
    const { count: autoCount } = await admin.from('automacao_envios')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', wa.clinic_id)
      .eq('status', 'enviado')
      .neq('funcao', FUNCAO_COM_CONFIRMACAO)
      .not('chave_idempotencia', 'like', `${TEST_KEY_PREFIX}%`)
      .gte('enviado_em', dayStart)
    sentToday += autoCount ?? 0

    // Reservas 'enviando' recentes de outras chamadas (inclui a confirmação do dia, que ainda não tem sent_at)
    // já vão ocupar a cota do dia: sem contá-las, chamadas simultâneas passam todas pelo mesmo portão.
    let inFlight = admin.from('automacao_envios')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', wa.clinic_id)
      .eq('status', 'enviando')
      .not('chave_idempotencia', 'like', `${TEST_KEY_PREFIX}%`)
      .gte('atualizado_em', new Date(now.getTime() - IN_FLIGHT_MS).toISOString())
    if (opts.excludeEnvioId) inFlight = inFlight.neq('id', opts.excludeEnvioId)
    const { count: flying } = await inFlight
    sentToday += flying ?? 0
  }
  return { paused, allowance: Math.max(0, limit - sentToday), limit, sentToday }
}

// ── ritmo entre envios ──────────────────────────────────────────────────────

const tails = new Map<string, Promise<void>>()
const waiting = new Map<string, number>()
const lastSendAt = new Map<string, number>()

const realSleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms))

export interface PaceDeps {
  gapMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  /** Fila máxima da clínica (quem está esperando, incluindo quem está sendo atendido). Acima disso não entra na fila. */
  maxQueue?: number
}

/**
 * Segura o envio até passar o intervalo aleatório desde o último envio da mesma clínica neste processo.
 * Chamadas simultâneas da mesma clínica entram em fila (uma por vez), então o n8n pode disparar vários
 * envios em paralelo sem rajada no número. Vale por processo: com mais de uma instância do servidor,
 * o intervalo é por instância (o aquecimento e a pausa continuam valendo pelo banco).
 *
 * Devolve false, SEM esperar nem entrar na fila, quando já há `maxQueue` chamadas na fila da clínica: quem
 * chama devolve "tente depois" em vez de segurar a requisição (maxDuration) com uma fila longa.
 */
export async function paceClinic(clinicId: string, deps: PaceDeps = {}): Promise<boolean> {
  const now = deps.now ?? Date.now
  const sleep = deps.sleep ?? realSleep
  const queued = waiting.get(clinicId) ?? 0
  if (deps.maxQueue !== undefined && queued >= deps.maxQueue) return false
  waiting.set(clinicId, queued + 1)
  const gap = deps.gapMs ?? sendGapMs()

  const previous = tails.get(clinicId) ?? Promise.resolve()
  let release!: () => void
  const mine = new Promise<void>(res => { release = res })
  const tail = previous.then(() => mine)
  tails.set(clinicId, tail)
  // limpa o mapa quando não há mais ninguém na fila
  void tail.then(() => { if (tails.get(clinicId) === tail) tails.delete(clinicId) })

  try {
    await previous
    const wait = (lastSendAt.get(clinicId) ?? 0) + gap - now()
    if (wait > 0) await sleep(wait)
    lastSendAt.set(clinicId, now())
  } finally {
    const left = (waiting.get(clinicId) ?? 1) - 1
    if (left <= 0) waiting.delete(clinicId); else waiting.set(clinicId, left)
    release()
  }
  return true
}

/** Só para testes. */
export function resetPaceForTests(): void { tails.clear(); lastSendAt.clear(); waiting.clear() }
