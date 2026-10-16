// Cuidados para o número da clínica não ser restringido pelo WhatsApp (a Evolution usa o
// WhatsApp comum, não a API oficial). Funções puras: recebem "agora" e os dados já buscados.
//
// 1) Aquecimento: número que começou a enviar há pouco (ou ficou 3 dias parado) manda poucas
//    confirmações por dia e vai subindo. "Atividade" é qualquer mensagem enviada pelo número,
//    inclusive as que a recepção manda do celular.
// 2) Pausa: várias falhas de envio em pouco tempo param a rotina da clínica por um tempo,
//    em vez de continuar insistindo.
// 3) Intervalo entre envios mais longo e aleatório.

const HOUR = 60 * 60_000
const DAY = 24 * HOUR

/** Limite de confirmações automáticas por dia nos primeiros dias; depois, sem limite. */
export const WARMUP_DAILY_LIMITS = [20, 35, 60, 100] as const
/** Sem enviar nada por esse tempo, o número volta para o aquecimento. */
export const INACTIVITY_MS = 72 * HOUR
/** Até onde olhar o histórico de envios para saber em que dia do aquecimento o número está. */
export const ACTIVITY_LOOKBACK_MS = WARMUP_DAILY_LIMITS.length * DAY + INACTIVITY_MS
/** Máximo de envios lidos do histórico; com tanta atividade o número já está aquecido. */
export const ACTIVITY_SAMPLE_LIMIT = 2000

/**
 * Início do período de atividade contínua atual (sem buracos de 3 dias), ou null se o número
 * já passou do aquecimento. `outgoing`: horários de mensagens enviadas dentro do
 * ACTIVITY_LOOKBACK_MS. `sampleFull`: a busca bateu no limite (número muito ativo).
 */
export function warmupStart(outgoing: Date[], now: Date, sampleFull = false): Date | null {
  if (sampleFull) return null
  const points = outgoing
    .map(d => d.getTime())
    .filter(t => t <= now.getTime())
    .sort((a, b) => b - a)

  // anda do agora para trás enquanto não houver um buraco de 3 dias
  let start = now.getTime()
  for (const t of points) {
    if (start - t >= INACTIVITY_MS) break
    start = t
  }
  if (now.getTime() - start >= WARMUP_DAILY_LIMITS.length * DAY) return null
  return new Date(start)
}

/** Limite de hoje para quem começou em `start` (null = sem limite). */
export function warmupDailyLimit(start: Date | null, now: Date): number | null {
  if (!start) return null
  const day = Math.floor((now.getTime() - start.getTime()) / DAY)
  return WARMUP_DAILY_LIMITS[Math.max(0, day)] ?? null
}

// ── pausa por falhas ────────────────────────────────────────────────────────

/** Falhas seguidas numa mesma rodada que fazem a rotina parar de tentar por aquela clínica. */
export const MAX_CONSECUTIVE_FAILURES = 3
/** Falhas dentro dessa janela que deixam a clínica em pausa. */
export const PAUSE_WINDOW_MS = 30 * 60_000
export const PAUSE_THRESHOLD = 3

/** Erro passageiro: a linha fica como não enviada e a rotina tenta de novo depois de um tempo. */
export const RETRYABLE_ERROR = 'tentar_novamente'
export const RETRY_BACKOFF_MS = 15 * 60_000

/**
 * Erros que dizem respeito ao paciente (telefone) ou que a rotina já trata de outro jeito
 * (desconexão, processo interrompido). Não indicam problema do número e não pausam.
 */
const NOT_A_SENDING_PROBLEM = new Set(['telefone_invalido', 'sem_whatsapp', 'interrompido', 'whatsapp_desconectado'])

export function countsTowardPause(error: string | null): boolean {
  return !NOT_A_SENDING_PROBLEM.has(error ?? '')
}

export interface FailureRow { error: string | null; updated_at: string }

/** A clínica está em pausa? `failures`: linhas 'falhou' recentes. */
export function isPaused(failures: FailureRow[], now: Date): boolean {
  const since = now.getTime() - PAUSE_WINDOW_MS
  return failures.filter(f => countsTowardPause(f.error) && new Date(f.updated_at).getTime() >= since).length >= PAUSE_THRESHOLD
}

/** Linha de envio que falhou por erro passageiro e já pode ser tentada de novo. */
export function isRetryable(row: { status: string; error: string | null; updated_at: string }, now: Date): boolean {
  return row.status === 'falhou'
    && row.error === RETRYABLE_ERROR
    && now.getTime() - new Date(row.updated_at).getTime() >= RETRY_BACKOFF_MS
}

// ── intervalo entre envios ──────────────────────────────────────────────────

export const MIN_GAP_MS = 6_000
export const MAX_GAP_MS = 12_000

/** Espera entre um envio e outro: aleatória, mais perto do meio do intervalo. */
export function sendGapMs(random: () => number = Math.random): number {
  const r = (random() + random()) / 2
  return Math.round(MIN_GAP_MS + r * (MAX_GAP_MS - MIN_GAP_MS))
}
