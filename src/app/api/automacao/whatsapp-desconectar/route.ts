import { authenticateAutomacao, automacaoJson, loadAutomacaoClinic, readJsonBody } from '@/lib/automacaoIntegration'
import { rejectIfDemo } from '@/lib/demoGuard'
import { stopConnection } from '@/lib/whatsapp/connection'
import { erroDoWhatsapp, visaoPublica } from '../whatsapp-visao'

// Dashboard -> MyClinica. Desconecta o WhatsApp da clínica e apaga a instância. Clínica de demonstração é recusada.
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
    const v = visaoPublica(await stopConnection(clinic.clinic.id))
    return automacaoJson({ ok: true, status: v.status })
  } catch (e) {
    return erroDoWhatsapp(e)
  }
}
