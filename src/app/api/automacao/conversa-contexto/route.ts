import { authenticateAutomacao, automacaoError, automacaoJson, loadAutomacaoClinic, isUuid } from '@/lib/automacaoIntegration'
import { contextoDaConversa, ConversaError } from '@/lib/automacao/conversa'

// n8n -> MyClinica. Contexto mínimo de uma conversa (a IA decide se responde): chave do contato, se é paciente,
// quando um humano falou por último, quando houve a última mensagem e se há confirmação aguardando resposta.
// Nunca devolve nome, telefone completo nem texto de mensagem. Autenticada por AUTOMACAO_N8N_KEY.
export async function GET(req: Request) {
  const denied = authenticateAutomacao(req)
  if (denied) return denied

  const sp = new URL(req.url).searchParams
  const clinic = await loadAutomacaoClinic(sp.get('clinicId'))
  if (!clinic.ok) return clinic.response
  const conversationId = sp.get('conversationId')
  if (!isUuid(conversationId)) return automacaoError('conversationId inválido.', 400)

  try {
    const ctx = await contextoDaConversa(clinic.clinic.id, conversationId)
    if (!ctx) return automacaoError('Conversa não encontrada.', 404)
    return automacaoJson(ctx)
  } catch (e) {
    if (e instanceof ConversaError) return automacaoError(e.message, e.status)
    console.error('[automacao/conversa-contexto]', e instanceof Error ? e.name : 'erro')
    return automacaoError('Erro interno.', 500)
  }
}
