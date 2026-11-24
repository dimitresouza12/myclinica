import { authenticateAutomacao, automacaoError, automacaoJson, loadAutomacaoClinic } from '@/lib/automacaoIntegration'
import { buscarAudio, isMensagemId, MidiaError } from '@/lib/automacao/midia'

// n8n -> MyClinica. Áudio de uma mensagem RECEBIDA (base64 + mimetype) para transcrever. `mensagemId` é o id do
// provedor que vai no repasse do áudio. Só mensagem da clínica, de entrada, do tipo áudio, até 3 MB. Nada é gravado
// em disco e o conteúdo não vai para log. Autenticada por AUTOMACAO_N8N_KEY.
export const maxDuration = 60

export async function GET(req: Request) {
  const denied = authenticateAutomacao(req)
  if (denied) return denied

  const sp = new URL(req.url).searchParams
  const clinic = await loadAutomacaoClinic(sp.get('clinicId'))
  if (!clinic.ok) return clinic.response
  const mensagemId = sp.get('mensagemId')
  if (!isMensagemId(mensagemId)) return automacaoError('mensagemId inválido.', 400)

  try {
    return automacaoJson(await buscarAudio(clinic.clinic.id, mensagemId))
  } catch (e) {
    if (e instanceof MidiaError) return automacaoError(e.message, e.status, { codigo: e.codigo })
    console.error('[automacao/midia]', e instanceof Error ? e.name : 'erro')
    return automacaoError('Erro interno.', 500)
  }
}
