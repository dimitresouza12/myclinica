// Portão completo do número antes de um envio da automação: pausa por falhas, aquecimento, fila do ritmo e,
// DEPOIS da espera na fila, o portão de novo (a espera pode durar segundos, e falhas e envios acontecem nela).
// Usado por /enviar e /responder. Só no servidor.

import { sendingGate, paceClinic } from '@/lib/whatsapp/sendGate'

/** Fila do ritmo por clínica: acima disso devolve "tente depois" em vez de segurar a requisição (maxDuration 60s). */
export const ENVIO_MAX_QUEUE = 3

export type Bloqueio = 'pausada' | 'aquecimento' | 'ritmo'

/**
 * null = pode enviar; senão o motivo. `envioId` é a reserva da própria chamada (já 'enviando'), que não conta
 * contra ela mesma. Pode lançar (leitura do banco): quem chama decide o que liberar.
 */
export async function portaoDoNumero(
  wa: { clinic_id: string; timezone: string }, envioId: string, now: Date, maxQueue: number = ENVIO_MAX_QUEUE,
): Promise<Bloqueio | null> {
  const t0 = Date.now()
  const opts = { includeAutomacao: true, excludeEnvioId: envioId }
  const pre = await sendingGate(wa, wa, now, opts)
  if (pre.paused) return 'pausada'
  if (pre.allowance <= 0) return 'aquecimento'

  // só `false` é fila cheia (mocks e chamadas antigas que não devolvem nada contam como liberado)
  if ((await paceClinic(wa.clinic_id, { maxQueue })) === false) return 'ritmo'

  const gate = await sendingGate(wa, wa, new Date(now.getTime() + (Date.now() - t0)), opts)
  if (gate.paused) return 'pausada'
  if (gate.allowance <= 0) return 'aquecimento'
  return null
}
