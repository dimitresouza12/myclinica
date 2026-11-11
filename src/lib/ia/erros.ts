// Tradução do erro do provedor de IA na resposta HTTP das rotas. As mensagens de limite e bloqueio são as MESMAS
// da IA escriba (src/app/api/ia/escriba/route.ts) e de MSG_LIMITE_MENSAL; nunca carregam texto do provedor, da
// imagem nem do documento. Só no servidor.

import { NextResponse } from 'next/server'
import { LlmProviderError } from './provider'
import { MSG_LIMITE_MENSAL } from './gestorProvider'

export const MSG_IA_INDISPONIVEL = 'IA ainda não configurada.'

function json(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, { status })
}

export const respostaLimiteMensal = () => json({ error: 'limite_mensal', message: MSG_LIMITE_MENSAL }, 429)
export const respostaIaIndisponivel = () => json({ error: 'ia_indisponivel', message: MSG_IA_INDISPONIVEL }, 503)

/** `falhou` = mensagem do 502 genérico, específica de cada recurso. */
export function respostaDeErroDoProvedor(e: unknown, falhou: string): NextResponse {
  const kind = e instanceof LlmProviderError ? e.kind : 'erro'
  const code = e instanceof LlmProviderError ? e.code : undefined
  if (kind === 'limite' && code === 'limite_mensal') return respostaLimiteMensal()
  if (kind === 'indisponivel' && code === 'cliente_bloqueado') {
    return json({ error: 'ia_bloqueada', message: 'O uso de IA está bloqueado para esta clínica. Fale com o suporte.' }, 403)
  }
  if (kind === 'indisponivel' && code === 'ia_desativada') {
    return json({ error: 'ia_desativada', message: 'A IA está desativada para esta clínica. Fale com o suporte.' }, 403)
  }
  if (kind === 'indisponivel' || kind === 'autenticacao') return respostaIaIndisponivel()
  if (kind === 'limite' || kind === 'sobrecarga') {
    return json({ error: 'ia_ocupada', message: 'A IA está ocupada agora. Tente de novo em instantes.' }, 503)
  }
  if (kind === 'timeout') return json({ error: 'ia_demorou', message: 'A IA demorou para responder. Tente de novo.' }, 504)
  if (code === 'modelo_sem_visao') {
    return json({ error: 'modelo_sem_visao', message: 'O modelo de IA configurado não lê imagens. Fale com o suporte.' }, 503)
  }
  return json({ error: 'ia_falhou', message: falhou }, 502)
}
