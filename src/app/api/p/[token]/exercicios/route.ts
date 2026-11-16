import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { clientIpFrom, hashToken, isWellFormedToken } from '@/lib/portal/token'
import { marcarExercicio, resolveLink } from '@/lib/portal/server'

const MAX_BODY_CHARS = 1_000
const UNAVAILABLE = { error: 'Link indisponível. Peça um novo à clínica.' }
const MUITAS = { error: 'Muitas tentativas. Aguarde alguns minutos.' }

// O paciente marca (ou desmarca) um exercício como feito hoje, na página pública. Sem sessão: a autorização é o token
// do link (hash no banco). Sempre a mesma resposta para token desconhecido, expirado ou revogado (sem enumeração).
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const ip = clientIpFrom(req.headers)

  const byIp = rateLimit(`pexe:${ip}`, { limit: 90, windowMs: 10 * 60_000 })
  if (!byIp.success) return NextResponse.json(MUITAS, { status: 429, headers: { 'Retry-After': String(Math.ceil((byIp.resetAt - Date.now()) / 1000)) } })
  if (!rateLimit('pglobal:pexe', { limit: 1500, windowMs: 10 * 60_000 }).success) return NextResponse.json(MUITAS, { status: 429 })
  if (!isWellFormedToken(token)) return NextResponse.json(UNAVAILABLE, { status: 404 })
  if (!rateLimit(`pexe-t:${hashToken(token)}`, { limit: 200, windowMs: 60 * 60_000 }).success) return NextResponse.json(MUITAS, { status: 429 })

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
    if (!bad.success) return NextResponse.json(MUITAS, { status: 429 })
    return NextResponse.json(UNAVAILABLE, { status: 404 })
  }

  const r = await marcarExercicio(link, body.itemId, body.done)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true, done: r.done })
}
