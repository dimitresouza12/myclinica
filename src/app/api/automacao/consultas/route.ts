import { authenticateAutomacao, automacaoError, automacaoJson, loadAutomacaoClinic } from '@/lib/automacaoIntegration'
import { listarConsultas, parseConsultasQuery, OperacaoError } from '@/lib/automacao/operacoes'

// n8n -> MyClinica. Consultas de uma clínica numa janela (de/ate), só ids, horário, status, procedimento e
// profissional: nunca nome nem telefone do paciente. Autenticada por AUTOMACAO_N8N_KEY.
// Não devolve "status atualizado em": appointments não tem essa coluna (ver ConsultaOut em operacoes.ts).
export async function GET(req: Request) {
  const denied = authenticateAutomacao(req)
  if (denied) return denied

  const sp = new URL(req.url).searchParams
  const clinic = await loadAutomacaoClinic(sp.get('clinicId'))
  if (!clinic.ok) return clinic.response

  const q = parseConsultasQuery(sp)
  if (!q.ok) return automacaoError(q.error, 400)

  try {
    const { consultas, truncado } = await listarConsultas(clinic.clinic.id, q.value)
    return automacaoJson({ consultas, total: consultas.length, truncado })
  } catch (e) {
    if (e instanceof OperacaoError) return automacaoError(e.message, e.status)
    console.error('[automacao/consultas]', e instanceof Error ? e.name : 'erro')
    return automacaoError('Erro interno.', 500)
  }
}
