import { authenticateAutomacao, automacaoError, automacaoJson, loadAutomacaoClinic } from '@/lib/automacaoIntegration'
import { listarAniversariantes, parseIsoDate, OperacaoError } from '@/lib/automacao/operacoes'

// n8n -> MyClinica. Ids dos pacientes ativos que fazem aniversário na data (sem nome nem telefone).
// Autenticada por AUTOMACAO_N8N_KEY.
export async function GET(req: Request) {
  const denied = authenticateAutomacao(req)
  if (denied) return denied

  const sp = new URL(req.url).searchParams
  const clinic = await loadAutomacaoClinic(sp.get('clinicId'))
  if (!clinic.ok) return clinic.response

  const day = parseIsoDate(sp.get('data'))
  if (!day) return automacaoError('data deve ser uma data válida no formato AAAA-MM-DD.', 400)

  try {
    const ids = await listarAniversariantes(clinic.clinic.id, day)
    return automacaoJson({ data: sp.get('data'), total: ids.length, pacientes: ids.map(id => ({ id })) })
  } catch (e) {
    if (e instanceof OperacaoError) return automacaoError(e.message, e.status)
    console.error('[automacao/aniversariantes]', e instanceof Error ? e.name : 'erro')
    return automacaoError('Erro interno.', 500)
  }
}
