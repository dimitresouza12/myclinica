import { NextResponse } from 'next/server'
import { requireModulePerm } from '@/lib/whatsapp/auth'
import { linkConversationPatient } from '@/lib/whatsapp/conversations'
import { failure } from '../../_shared'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Liga a conversa ao paciente recém-cadastrado com o mesmo telefone. Basta poder VER o módulo CRM:
// a rota só procura um paciente que já existe na clínica, não cria nem altera paciente.
export async function POST(req: Request) {
  const ctx = await requireModulePerm(req, 'crm', false)
  if (ctx instanceof NextResponse) return ctx

  // a conversa pode ser indicada pelo id (tela de Mensagens) ou pelo telefone (CRM, que só conhece o lead)
  let conversationId = ''
  let phoneKey = ''
  try {
    const body = await req.json()
    conversationId = String(body?.conversationId ?? '')
    phoneKey = String(body?.phoneKey ?? '')
  } catch { /* corpo inválido */ }
  if (conversationId ? !UUID.test(conversationId) : !phoneKey || phoneKey.length > 40) {
    return NextResponse.json({ error: 'Conversa inválida.' }, { status: 400 })
  }

  try {
    const patientId = await linkConversationPatient(ctx.clinicId, conversationId ? { conversationId } : { phoneKey })
    return NextResponse.json({ ok: true, linked: !!patientId })
  } catch (e) {
    return failure(e)
  }
}
