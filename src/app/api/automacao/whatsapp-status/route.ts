import { authenticateAutomacao, automacaoJson, loadAutomacaoClinic } from '@/lib/automacaoIntegration'
import { getConnection } from '@/lib/whatsapp/connection'
import { erroDoWhatsapp, visaoPublica } from '../whatsapp-visao'

// Dashboard/n8n -> MyClinica. Situação do WhatsApp da clínica (sem QR). Autenticada por AUTOMACAO_N8N_KEY.
export async function GET(req: Request) {
  const denied = authenticateAutomacao(req)
  if (denied) return denied
  const clinic = await loadAutomacaoClinic(new URL(req.url).searchParams.get('clinicId'))
  if (!clinic.ok) return clinic.response
  try {
    const v = visaoPublica(await getConnection(clinic.clinic.id))
    return automacaoJson({ ok: true, status: v.status, telefone: v.telefone, conectadoEm: v.conectadoEm })
  } catch (e) {
    return erroDoWhatsapp(e)
  }
}
