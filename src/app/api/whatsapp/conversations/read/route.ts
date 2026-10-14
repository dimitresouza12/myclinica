import { NextResponse } from 'next/server'
import { requireModulePerm } from '@/lib/whatsapp/auth'
import { markConversationRead } from '@/lib/whatsapp/conversations'
import { failure } from '../../_shared'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Marca a conversa como lida. Basta poder VER o módulo CRM.
export async function POST(req: Request) {
  const ctx = await requireModulePerm(req, 'crm', false)
  if (ctx instanceof NextResponse) return ctx

  let conversationId = ''
  try { conversationId = String((await req.json())?.conversationId ?? '') } catch { /* corpo inválido */ }
  if (!UUID.test(conversationId)) return NextResponse.json({ error: 'Conversa inválida.' }, { status: 400 })

  try {
    await markConversationRead(ctx.clinicId, conversationId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return failure(e)
  }
}
