import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { clientIpFrom } from '@/lib/portal/token'
import { isValidSlug } from '@/lib/agendamentoOnline/slug'
import { isValidDateKey } from '@/lib/agendamentoOnline/tz'
import { UUID_RE } from '@/lib/agendamentoOnline/validar'
import { loadFreeSlots, MAX_RANGE_DAYS } from '@/lib/agendamentoOnline/server'

const NO_STORE = { 'Cache-Control': 'no-store' }
const UNAVAILABLE = { error: 'O agendamento online não está disponível agora.' }
const TOO_MANY = { error: 'Muitas consultas seguidas. Aguarde um minuto.' }

// Horários livres de um profissional, sem sessão. A resposta traz SÓ os horários livres (nada de quem ocupa o
// resto). Sempre a mesma resposta para slug ou profissional inexistente, desligado ou de outra clínica.
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const ip = clientIpFrom(req.headers)

  if (!rateLimit(`aghor:${ip}`, { limit: 40, windowMs: 60_000 }).success) return NextResponse.json(TOO_MANY, { status: 429, headers: NO_STORE })
  if (!isValidSlug(slug)) return NextResponse.json(UNAVAILABLE, { status: 404, headers: NO_STORE })

  const url = new URL(req.url)
  const professionalId = url.searchParams.get('profissional') ?? ''
  const from = url.searchParams.get('inicio') ?? ''
  const daysRaw = Number(url.searchParams.get('dias') ?? MAX_RANGE_DAYS)
  if (!UUID_RE.test(professionalId) || !isValidDateKey(from) || !Number.isInteger(daysRaw) || daysRaw < 1) {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400, headers: NO_STORE })
  }

  // O IP (acima) é o freio principal e gasta a cada pedido. Os baldes global e da clínica só gastam com pedido
  // válido: lixo mandado por um atacante não esgota a cota que as clínicas usam de verdade.
  if (!rateLimit('agglobal:horarios', { limit: 1500, windowMs: 60_000 }).success) return NextResponse.json(TOO_MANY, { status: 429, headers: NO_STORE })
  if (!rateLimit(`aghor-s:${slug}`, { limit: 240, windowMs: 60_000 }).success) return NextResponse.json(TOO_MANY, { status: 429, headers: NO_STORE })

  const r = await loadFreeSlots(slug, professionalId.toLowerCase(), from, Math.min(daysRaw, MAX_RANGE_DAYS))
  if (!r.ok) {
    if (r.notFound) return NextResponse.json(UNAVAILABLE, { status: 404, headers: NO_STORE })
    return NextResponse.json({ error: 'Não foi possível carregar os horários agora. Tente de novo em instantes.' }, { status: 500, headers: NO_STORE })
  }
  return NextResponse.json({ days: r.days, nextFrom: r.nextFrom, durationMin: r.durationMin }, { headers: NO_STORE })
}
