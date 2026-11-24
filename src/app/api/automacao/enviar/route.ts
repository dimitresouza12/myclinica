import { authenticateAutomacao, automacaoError, automacaoJson, loadAutomacaoClinic, readJsonBody } from '@/lib/automacaoIntegration'
import { enviarAutomacao, validateEnvioBody } from '@/lib/automacao/envio'

// n8n -> MyClinica. Envia uma mensagem de WhatsApp a partir de uma consulta e de um MODELO de texto:
// o MyClinica monta o texto com os dados do paciente (que nunca saem daqui) e envia pelo portão do número
// (aquecimento, pausa por falhas, ritmo). Idempotente pela `chave`. Autenticada por AUTOMACAO_N8N_KEY.
export const maxDuration = 60

export async function POST(req: Request) {
  const denied = authenticateAutomacao(req)
  if (denied) return denied

  const body = await readJsonBody(req)
  if (!body.ok) return body.response

  const parsed = validateEnvioBody(body.value)
  if (!parsed.ok) return automacaoError(parsed.error, 400)

  const clinic = await loadAutomacaoClinic(parsed.value.clinicId)
  if (!clinic.ok) return clinic.response

  try {
    const r = await enviarAutomacao(clinic.clinic, parsed.value)
    return automacaoJson(r.body, r.status)
  } catch (e) {
    console.error('[automacao/enviar]', e instanceof Error ? e.name : 'erro')
    return automacaoError('Erro interno.', 500)
  }
}
