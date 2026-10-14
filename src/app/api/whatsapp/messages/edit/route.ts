import { NextResponse } from 'next/server'
import { requireModulePerm } from '@/lib/whatsapp/auth'
import { editOwnMessage } from '@/lib/whatsapp/conversations'
import { rateLimit } from '@/lib/rateLimit'
import { failure } from '../../_shared'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_TEXT = 4000

// Edita o texto de uma mensagem que a clínica enviou (até 15 minutos). Exige permissão de EDITAR o módulo CRM.
export async function POST(req: Request) {
  const ctx = await requireModulePerm(req, 'crm', true)
  if (ctx instanceof NextResponse) return ctx
  if (!rateLimit(`wa-msg-edit:${ctx.userId}`, { limit: 20, windowMs: 60_000 }).success) {
    return NextResponse.json({ error: 'Muitas ações em pouco tempo. Aguarde um instante.' }, { status: 429 })
  }
  let body: { messageId?: unknown; text?: unknown } = {}
  try { body = await req.json() } catch { /* corpo inválido */ }
  const messageId = String(body.messageId ?? '')
  const text = typeof body.text === 'string' ? body.text.replace(/\r\n/g, '\n').trim() : ''
  if (!UUID.test(messageId)) return NextResponse.json({ error: 'Mensagem inválida.' }, { status: 400 })
  if (!text) return NextResponse.json({ error: 'Escreva o novo texto.' }, { status: 400 })
  if (text.length > MAX_TEXT) return NextResponse.json({ error: `A mensagem pode ter até ${MAX_TEXT} caracteres.` }, { status: 400 })
  try {
    const r = await editOwnMessage({ clinicId: ctx.clinicId, messageId, text })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return failure(e)
  }
}
