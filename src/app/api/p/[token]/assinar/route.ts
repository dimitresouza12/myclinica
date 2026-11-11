import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { clientIpFrom, hashToken, isWellFormedToken } from '@/lib/portal/token'
import { resolveLink, signRequest } from '@/lib/portal/server'
import { MAX_DRAWING_CHARS } from '@/lib/assinatura/validar'

const MAX_BODY_CHARS = MAX_DRAWING_CHARS + 2_000
const UNAVAILABLE = { error: 'Link indisponível. Peça um novo à clínica.' }

// Assinatura eletrônica simples feita pelo paciente na página pública. Sem sessão: a autorização é o token do
// link (hash no banco). Sempre a mesma resposta para token desconhecido, expirado ou revogado (sem enumeração).
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const ip = clientIpFrom(req.headers)

  const byIp = rateLimit(`psign:${ip}`, { limit: 10, windowMs: 10 * 60_000 })
  if (!byIp.success) return NextResponse.json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429, headers: { 'Retry-After': String(Math.ceil((byIp.resetAt - Date.now()) / 1000)) } })
  if (!rateLimit('pglobal:psign', { limit: 300, windowMs: 10 * 60_000 }).success) return NextResponse.json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429 })
  if (!isWellFormedToken(token)) return NextResponse.json(UNAVAILABLE, { status: 404 })
  const byToken = rateLimit(`psign-t:${hashToken(token)}`, { limit: 20, windowMs: 60 * 60_000 })
  if (!byToken.success) return NextResponse.json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429 })

  const raw = await req.text()
  if (raw.length > MAX_BODY_CHARS) return NextResponse.json({ error: 'Envio grande demais.' }, { status: 413 })
  let body: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('corpo inválido')
    body = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Envio inválido.' }, { status: 400 })
  }

  const link = await resolveLink(token)
  if (!link) {
    // tentativas em link inexistente contam num balde próprio, mais apertado
    const bad = rateLimit(`pfail:${ip}`, { limit: 10, windowMs: 10 * 60_000 })
    if (!bad.success) return NextResponse.json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429 })
    return NextResponse.json(UNAVAILABLE, { status: 404 })
  }

  const r = await signRequest(link, {
    requestId: body.requestId, method: body.method, signerName: body.signerName, drawing: body.drawing, accepted: body.accepted,
  }, { ip, userAgent: req.headers.get('user-agent') })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true, signedAt: r.signedAt, hash: r.hashShort })
}
