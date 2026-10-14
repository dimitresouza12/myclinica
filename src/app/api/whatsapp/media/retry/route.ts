import { NextResponse } from 'next/server'
import { requireModulePerm } from '@/lib/whatsapp/auth'
import { retryMediaDownload } from '@/lib/whatsapp/media-store'
import { rateLimit } from '@/lib/rateLimit'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// "Baixar de novo": tenta pegar do WhatsApp o arquivo de uma mensagem cuja cópia falhou ou já foi removida.
export async function POST(req: Request) {
  const ctx = await requireModulePerm(req, 'crm', false)
  if (ctx instanceof NextResponse) return ctx

  const limit = rateLimit(`wa-media-retry:${ctx.userId}`, { limit: 10, windowMs: 60_000 })
  if (!limit.success) return NextResponse.json({ error: 'Muitas tentativas. Aguarde um instante.' }, { status: 429 })

  let body: { messageId?: unknown } = {}
  try { body = await req.json() } catch { /* corpo inválido */ }
  const messageId = String(body.messageId ?? '')
  if (!UUID.test(messageId)) return NextResponse.json({ error: 'Mensagem inválida.' }, { status: 400 })

  const result = await retryMediaDownload(ctx.clinicId, messageId)
  if (result === 'not_found') return NextResponse.json({ error: 'Mensagem não encontrada.' }, { status: 404 })
  if (result === 'failed') {
    return NextResponse.json({ error: 'O WhatsApp não tem mais este arquivo. Peça para o contato enviar de novo.' }, { status: 410 })
  }
  return NextResponse.json({ ok: true, status: result })
}
