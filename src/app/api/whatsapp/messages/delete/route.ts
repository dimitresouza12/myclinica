import { NextResponse } from 'next/server'
import { requireModulePerm } from '@/lib/whatsapp/auth'
import { deleteOwnMessage } from '@/lib/whatsapp/conversations'
import { rateLimit } from '@/lib/rateLimit'
import { failure } from '../../_shared'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Apaga para todos uma mensagem que a clínica enviou. Exige permissão de EDITAR o módulo CRM.
export async function POST(req: Request) {
  const ctx = await requireModulePerm(req, 'crm', true)
  if (ctx instanceof NextResponse) return ctx
  if (!rateLimit(`wa-msg-delete:${ctx.userId}`, { limit: 20, windowMs: 60_000 }).success) {
    return NextResponse.json({ error: 'Muitas ações em pouco tempo. Aguarde um instante.' }, { status: 429 })
  }
  let body: { messageId?: unknown } = {}
  try { body = await req.json() } catch { /* corpo inválido */ }
  const messageId = String(body.messageId ?? '')
  if (!UUID.test(messageId)) return NextResponse.json({ error: 'Mensagem inválida.' }, { status: 400 })
  try {
    const r = await deleteOwnMessage({ clinicId: ctx.clinicId, messageId })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return failure(e)
  }
}
