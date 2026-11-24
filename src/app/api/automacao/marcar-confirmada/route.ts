import { authenticateAutomacao, automacaoError, automacaoJson, isUuid, loadAutomacaoClinic, readJsonBody } from '@/lib/automacaoIntegration'
import { marcarConfirmada, OperacaoError } from '@/lib/automacao/operacoes'

// n8n -> MyClinica. Consulta 'agendado' vira 'confirmado' e a confirmação pendente vira 'confirmado'.
// Nunca cancela nem altera consulta em outro estado. Autenticada por AUTOMACAO_N8N_KEY.
export async function POST(req: Request) {
  const denied = authenticateAutomacao(req)
  if (denied) return denied

  const body = await readJsonBody(req)
  if (!body.ok) return body.response
  if (!isUuid(body.value.appointmentId)) return automacaoError('appointmentId inválido.', 400)

  const clinic = await loadAutomacaoClinic(body.value.clinicId)
  if (!clinic.ok) return clinic.response

  try {
    const r = await marcarConfirmada(clinic.clinic.id, body.value.appointmentId)
    return automacaoJson({ ok: true, ...r })
  } catch (e) {
    if (e instanceof OperacaoError) return automacaoError(e.message, e.status)
    console.error('[automacao/marcar-confirmada]', e instanceof Error ? e.name : 'erro')
    return automacaoError('Erro interno.', 500)
  }
}
