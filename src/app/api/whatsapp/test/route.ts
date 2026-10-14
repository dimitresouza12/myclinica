import { NextResponse } from 'next/server'
import { requireClinicAdmin } from '@/lib/whatsapp/auth'
import { connectedInstanceFor } from '@/lib/whatsapp/connection'
import { checkNumbers, sendText } from '@/lib/whatsapp/evolution'
import { whatsappCandidates } from '@/lib/whatsapp/phone'
import { rateLimit } from '@/lib/rateLimit'
import { failure } from '../_shared'

const TEST_TEXT = 'Mensagem de teste do MyClinica. Se você recebeu este texto, a conexão com o WhatsApp da clínica está funcionando.'

// Manda uma mensagem de teste para um número informado pelo admin.
export async function POST(req: Request) {
  const ctx = await requireClinicAdmin(req)
  if (ctx instanceof NextResponse) return ctx

  const limit = rateLimit(`wa-test:${ctx.clinicId}`, { limit: 5, windowMs: 10 * 60_000 })
  if (!limit.success) {
    return NextResponse.json({ error: 'Muitos testes seguidos. Aguarde alguns minutos.' }, { status: 429 })
  }

  let number = ''
  try { number = String((await req.json())?.number ?? '') } catch { /* corpo inválido */ }
  const candidates = whatsappCandidates(number)
  if (candidates.length === 0) {
    return NextResponse.json({ error: 'Informe um telefone válido com DDD.' }, { status: 400 })
  }

  try {
    const instance = await connectedInstanceFor(ctx.clinicId)
    if (!instance) {
      return NextResponse.json({ error: 'O WhatsApp da clínica não está conectado.' }, { status: 409 })
    }
    const found = (await checkNumbers(instance, candidates)).find(c => c.exists)
    if (!found) {
      return NextResponse.json({ error: 'Esse número não foi encontrado no WhatsApp.' }, { status: 404 })
    }
    await sendText(instance, found.jid?.split('@')[0] ?? found.number, TEST_TEXT)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return failure(e)
  }
}
