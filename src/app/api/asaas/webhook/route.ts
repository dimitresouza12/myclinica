import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { getAdminClient } from '@/lib/supabaseAdmin'
import { processAsaasEvent } from '@/lib/asaasWebhook'

// Token configurado no painel Asaas (Webhooks → Token de autenticação) e
// enviado de volta no header `asaas-access-token` em toda chamada.
function isValidAsaasToken(req: Request): boolean {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN
  if (!expected) return false

  const received = req.headers.get('asaas-access-token') ?? ''
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  if (!isValidAsaasToken(req)) {
    console.warn('[asaas/webhook] Token de autenticação inválido ou ausente')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })
  }

  try {
    await processAsaasEvent(getAdminClient(), body)
    return NextResponse.json({ ok: true })
  } catch (err) {
    // 500 faz o Asaas reenviar; o evento foi liberado para ser processado de novo.
    console.error('[asaas/webhook]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
