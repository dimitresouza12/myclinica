import { NextResponse } from 'next/server'
import { requireModulePerm } from '@/lib/whatsapp/auth'
import { sendFromInbox } from '@/lib/whatsapp/conversations'
import { rateLimit } from '@/lib/rateLimit'
import { failure } from '../../_shared'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_TEXT = 4000

// Responde uma conversa pela caixa de entrada. A clínica vem do usuário logado; exige permissão
// de EDITAR o módulo CRM (a mesma que a tela de CRM usa).
export async function POST(req: Request) {
  const ctx = await requireModulePerm(req, 'crm', true)
  if (ctx instanceof NextResponse) return ctx

  const limit = rateLimit(`wa-inbox:${ctx.userId}`, { limit: 40, windowMs: 60_000 })
  if (!limit.success) {
    return NextResponse.json({ error: 'Muitas mensagens em pouco tempo. Aguarde um instante.' }, { status: 429 })
  }

  let body: { conversationId?: unknown; text?: unknown } = {}
  try { body = await req.json() } catch { /* corpo inválido */ }
  const conversationId = String(body.conversationId ?? '')
  const text = typeof body.text === 'string' ? body.text.replace(/\r\n/g, '\n').trim() : ''

  if (!UUID.test(conversationId)) return NextResponse.json({ error: 'Conversa inválida.' }, { status: 400 })
  if (!text) return NextResponse.json({ error: 'Escreva a mensagem.' }, { status: 400 })
  if (text.length > MAX_TEXT) return NextResponse.json({ error: `A mensagem pode ter até ${MAX_TEXT} caracteres.` }, { status: 400 })

  try {
    const r = await sendFromInbox({ clinicId: ctx.clinicId, conversationId, text, userId: ctx.userId, userName: ctx.userName })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return failure(e)
  }
}
