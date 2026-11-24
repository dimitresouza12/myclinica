import { authenticateAutomacao, automacaoJson, loadAutomacaoClinic, readJsonBody } from '@/lib/automacaoIntegration'
import { rejectIfDemo } from '@/lib/demoGuard'
import { startConnection } from '@/lib/whatsapp/connection'
import { erroDoWhatsapp, visaoPublica } from '../whatsapp-visao'

// Dashboard -> MyClinica. Inicia a conexão do WhatsApp da clínica e devolve o QR. Clínica de demonstração é recusada.
export async function POST(req: Request) {
  const denied = authenticateAutomacao(req)
  if (denied) return denied
  const body = await readJsonBody(req)
  if (!body.ok) return body.response
  const clinic = await loadAutomacaoClinic(body.value.clinicId)
  if (!clinic.ok) return clinic.response
  const demo = await rejectIfDemo(clinic.clinic.id)
  if (demo) return demo
  try {
    return automacaoJson({ ok: true, ...visaoPublica(await startConnection(clinic.clinic.id)) })
  } catch (e) {
    return erroDoWhatsapp(e)
  }
}
