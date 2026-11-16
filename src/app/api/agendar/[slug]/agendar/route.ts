import { NextResponse } from 'next/server'
import { rateLimit, rateLimitPeek } from '@/lib/rateLimit'
import { clientIpFrom, hashIp, ipHashSecret } from '@/lib/portal/token'
import { BOOKING_ERRORS } from '@/lib/agendamentoOnline/config'
import { isValidSlug } from '@/lib/agendamentoOnline/slug'
import { consentText, validateBooking } from '@/lib/agendamentoOnline/validar'
import { createOnlineBooking, loadPublicContext } from '@/lib/agendamentoOnline/server'

const MAX_BODY_CHARS = 4_000
const NO_STORE = { 'Cache-Control': 'no-store' }
const TOO_MANY = { error: 'Muitas tentativas. Aguarde alguns minutos.' }

// Criação do agendamento online, sem sessão. Camadas, nesta ordem: limite por IP (o freio principal: gasta a cada
// pedido), tamanho do corpo, campo isca e tempo de preenchimento, validação de cada campo, limites por clínica e
// global (gastam SÓ com corpo válido: lixo mandado por um atacante não esgota o balde das clínicas) e, por fim,
// a função do banco, que confere tudo de novo e faz a reserva de forma atômica.
// Evolução prevista: captcha (ex.: Turnstile) ou código de confirmação por WhatsApp antes de gravar.
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const ip = clientIpFrom(req.headers)

  const byIp = rateLimit(`agbook:${ip}`, { limit: 5, windowMs: 10 * 60_000 })
  if (!byIp.success) {
    return NextResponse.json(TOO_MANY, { status: 429, headers: { ...NO_STORE, 'Retry-After': String(Math.ceil((byIp.resetAt - Date.now()) / 1000)) } })
  }
  if (!isValidSlug(slug)) return NextResponse.json({ error: BOOKING_ERRORS.indisponivel.message }, { status: 404, headers: NO_STORE })

  const raw = await req.text()
  if (raw.length > MAX_BODY_CHARS) return NextResponse.json({ error: 'Envio grande demais.' }, { status: 413, headers: NO_STORE })
  let body: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('corpo inválido')
    body = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Envio inválido.' }, { status: 400, headers: NO_STORE })
  }

  const v = validateBooking(body, Date.now())
  if (!v.ok) {
    // robô que preencheu o campo isca recebe um "deu certo" sem nada gravado: não aprende que foi barrado
    if (v.honeypot) return NextResponse.json({ ok: true }, { headers: NO_STORE })
    return NextResponse.json({ error: v.error }, { status: 400, headers: NO_STORE })
  }

  // Daqui em diante o corpo é válido: só agora gastam os baldes global e da clínica.
  if (!rateLimit('agglobal:agendar', { limit: 300, windowMs: 10 * 60_000 }).success) return NextResponse.json(TOO_MANY, { status: 429, headers: NO_STORE })
  if (!rateLimit(`agbook-s:${slug}`, { limit: 120, windowMs: 60 * 60_000 }).success) return NextResponse.json(TOO_MANY, { status: 429, headers: NO_STORE })

  // mesmo celular repetido: limite próprio, que vale mesmo com IP rotacionado. Só consulta aqui; o gasto é depois,
  // e só quando a reserva foi gravada (horário ocupado ou dado recusado não queima a cota de quem tenta de novo).
  const phoneBucket = { limit: 3, windowMs: 60 * 60_000 }
  const phoneKey = `agbook-p:${slug}:${v.value.phoneKey}`
  if (!rateLimitPeek(phoneKey, phoneBucket)) {
    return NextResponse.json({ error: BOOKING_ERRORS.limite.message }, { status: 429, headers: NO_STORE })
  }

  // o texto de consentimento leva o nome atual da clínica (e some junto se o link estiver indisponível)
  const ctxResult = await loadPublicContext(slug)
  if (!ctxResult.ok) return NextResponse.json({ error: 'Não foi possível concluir agora. Tente de novo em instantes.' }, { status: 500, headers: NO_STORE })
  if (!ctxResult.context) return NextResponse.json({ error: BOOKING_ERRORS.indisponivel.message }, { status: 404, headers: NO_STORE })

  const r = await createOnlineBooking(slug, v.value, {
    consentText: consentText(ctxResult.context.clinic.name),
    ipHash: hashIp(ip, ipHashSecret()),
  })
  if (!r.ok) {
    if (r.code === 'erro') return NextResponse.json({ error: 'Não foi possível concluir agora. Tente de novo em instantes.' }, { status: 500, headers: NO_STORE })
    const e = BOOKING_ERRORS[r.code]
    return NextResponse.json({ error: e.message, code: r.code }, { status: e.status, headers: NO_STORE })
  }
  rateLimit(phoneKey, phoneBucket) // reserva gravada: agora sim conta para o telefone
  return NextResponse.json({ ok: true, ...r.done }, { headers: NO_STORE })
}
