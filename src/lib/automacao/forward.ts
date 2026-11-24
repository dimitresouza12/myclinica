// Repasse de mensagens recebidas ao n8n (webhook da automação). Só no servidor.
//
// Variáveis de ambiente (opcionais):
//   AUTOMACAO_N8N_WEBHOOK_URL    URL do webhook do n8n. Sem ela, NADA é repassado.
//   AUTOMACAO_N8N_WEBHOOK_TOKEN  se definida, vai no cabeçalho x-webhook-token para o n8n conferir.
//
// O corpo leva só {clinicId, conversationId, phoneKey, texto, tipo} (mais mensagemId no áudio e os ids das consultas pendentes nas respostas de confirmação): nunca o telefone
// completo, nome, jid, dado da consulta nem o arquivo de mídia. Timeout curto e falha silenciosa: o repasse NUNCA derruba o webhook da Evolution,
// e nem a URL nem o conteúdo vão para o log.

export type ForwardTipo = 'boas_vindas' | 'resposta_confirmacao' | 'resposta_confirmacao_audio' | 'outro'

export interface ForwardPayload {
  clinicId: string
  conversationId: string
  /** DDD + 8 últimos dígitos (ou "lid:<id>"): identifica o contato sem expor o número completo. */
  phoneKey: string
  /** Vazio no áudio: o arquivo não é baixado nem repassado. */
  texto: string
  tipo: ForwardTipo
  /** Só no áudio: id da mensagem de mídia no WhatsApp (key.id da Evolution). */
  mensagemId?: string
  /** Só em resposta_confirmacao(_audio): a consulta da confirmação pendente; nulo se não há ou há mais de uma. */
  appointmentId?: string | null
  /** Só em resposta_confirmacao(_audio): todas as consultas pendentes do telefone (recepção resolve quando há mais de uma). */
  appointmentIds?: string[]
}

export const FORWARD_TIMEOUT_MS = 3000

export interface ForwardDeps { fetchImpl?: typeof fetch; url?: string | undefined; token?: string | undefined }

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

function validUrl(raw: string | undefined): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw)
    // https obrigatório (o corpo leva o id do contato e o token): http só para o próprio computador, em desenvolvimento
    if (u.protocol === 'https:') return u.toString()
    return u.protocol === 'http:' && LOCAL_HOSTS.has(u.hostname) ? u.toString() : null
  } catch { return null }
}

/** true se o n8n aceitou o repasse; false se não há URL, deu erro, ou estourou o tempo. Nunca lança. */
export async function forwardToN8n(payload: ForwardPayload, deps: ForwardDeps = {}): Promise<boolean> {
  const url = validUrl('url' in deps ? deps.url : process.env.AUTOMACAO_N8N_WEBHOOK_URL)
  if (!url) return false
  const token = 'token' in deps ? deps.token : process.env.AUTOMACAO_N8N_WEBHOOK_TOKEN
  const doFetch = deps.fetchImpl ?? fetch
  try {
    const res = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { 'x-webhook-token': token } : {}) },
      // só os campos combinados, mesmo que quem chama passe mais coisa
      body: JSON.stringify({
        clinicId: payload.clinicId, conversationId: payload.conversationId, phoneKey: payload.phoneKey,
        texto: payload.texto, tipo: payload.tipo,
        ...(payload.mensagemId ? { mensagemId: payload.mensagemId } : {}),
        ...(payload.appointmentIds ? { appointmentId: payload.appointmentId ?? null, appointmentIds: payload.appointmentIds } : {}),
      }),
      signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!res.ok) console.warn(`[automacao/forward] n8n respondeu ${res.status}`)
    return res.ok
  } catch (e) {
    console.warn('[automacao/forward] repasse ao n8n falhou:', e instanceof Error ? e.name : 'erro')
    return false
  }
}
