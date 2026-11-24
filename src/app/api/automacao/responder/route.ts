import { authenticateAutomacao, automacaoError, automacaoJson, loadAutomacaoClinic, readJsonBody } from '@/lib/automacaoIntegration'
import { responderAutomacao, validateResponderBody } from '@/lib/automacao/responder'

// n8n -> MyClinica. Texto livre (até 1000 caracteres) numa conversa que já existe, pelo portão do número
// (pausa, aquecimento, ritmo). Idempotente pela `chave`. Não envia para quem pediu PARAR, para clínica demo
// nem para conversa em que um humano respondeu depois do contato. Autenticada por AUTOMACAO_N8N_KEY.
export const maxDuration = 60

export async function POST(req: Request) {
  const denied = authenticateAutomacao(req)
  if (denied) return denied

  const body = await readJsonBody(req)
  if (!body.ok) return body.response

  const parsed = validateResponderBody(body.value)
  if (!parsed.ok) return automacaoError(parsed.error, 400)

  const clinic = await loadAutomacaoClinic(parsed.value.clinicId)
  if (!clinic.ok) return clinic.response

  try {
    const r = await responderAutomacao(clinic.clinic, parsed.value)
    return automacaoJson(r.body, r.status)
  } catch (e) {
    console.error('[automacao/responder]', e instanceof Error ? e.name : 'erro')
    return automacaoError('Erro interno.', 500)
  }
}
