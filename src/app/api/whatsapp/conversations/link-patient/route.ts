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

  let conversationId = ''
  try { conversationId = String((await req.json())?.conversationId ?? '') } catch { /* corpo inválido */ }
  if (!UUID.test(conversationId)) return NextResponse.json({ error: 'Conversa inválida.' }, { status: 400 })

  try {
    const patientId = await linkConversationPatient(ctx.clinicId, conversationId)
    return NextResponse.json({ ok: true, linked: !!patientId })
  } catch (e) {
    return failure(e)
  }
}
