import { authenticateAutomacao, automacaoError, automacaoJson, isUuid, loadAutomacaoClinic, readJsonBody } from '@/lib/automacaoIntegration'
import { avisarRecepcao, AVISO_TIPOS, OperacaoError, type AvisoTipo } from '@/lib/automacao/operacoes'

// n8n -> MyClinica. Grava um aviso para a recepção (sino, aviso na tela, Ações necessárias). O texto é montado
// aqui, com os dados da consulta, e fica só na própria clínica. Autenticada por AUTOMACAO_N8N_KEY.
export async function POST(req: Request) {
  const denied = authenticateAutomacao(req)
  if (denied) return denied

  const body = await readJsonBody(req)
  if (!body.ok) return body.response
  if (!isUuid(body.value.appointmentId)) return automacaoError('appointmentId inválido.', 400)
  const tipo = body.value.tipo
  if (typeof tipo !== 'string' || !(AVISO_TIPOS as readonly string[]).includes(tipo)) {
    return automacaoError(`tipo inválido. Use: ${AVISO_TIPOS.join(', ')}.`, 400)
  }

  const clinic = await loadAutomacaoClinic(body.value.clinicId)
  if (!clinic.ok) return clinic.response

  try {
    const r = await avisarRecepcao(clinic.clinic.id, body.value.appointmentId, tipo as AvisoTipo)
    return automacaoJson({ ok: true, ...r })
  } catch (e) {
    if (e instanceof OperacaoError) return automacaoError(e.message, e.status)
    console.error('[automacao/avisar-recepcao]', e instanceof Error ? e.name : 'erro')
    return automacaoError('Erro interno.', 500)
  }
}
