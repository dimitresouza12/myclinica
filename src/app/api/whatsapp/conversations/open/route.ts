import { NextResponse } from 'next/server'
import { requireModulePerm } from '@/lib/whatsapp/auth'
import { openLeadConversation } from '@/lib/whatsapp/lead-chat'
import { rateLimit } from '@/lib/rateLimit'
import { failure } from '../../_shared'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Abre (ou cria) a conversa de um lead do CRM. A clínica vem do usuário logado; exige EDITAR o módulo CRM.
export async function POST(req: Request) {
  const ctx = await requireModulePerm(req, 'crm', true)
  if (ctx instanceof NextResponse) return ctx

  // consulta o WhatsApp a cada chamada sem conversa: limita para ninguém varrer números
  const limit = rateLimit(`wa-open:${ctx.userId}`, { limit: 20, windowMs: 60_000 })
  if (!limit.success) return NextResponse.json({ error: 'Muitas tentativas em pouco tempo. Aguarde um instante.' }, { status: 429 })

  let leadId = ''
  try { leadId = String((await req.json())?.leadId ?? '') } catch { /* corpo inválido */ }
  if (!UUID.test(leadId)) return NextResponse.json({ error: 'Lead inválido.' }, { status: 400 })

  try {
    const r = await openLeadConversation(ctx.clinicId, leadId)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true, conversationId: r.conversationId })
  } catch (e) {
    return failure(e)
  }
}
