import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { clientIpFrom, hashToken, isWellFormedToken } from '@/lib/portal/token'
import { resolveLink } from '@/lib/portal/server'
import { apagarRegistroDiario, registrarDiario } from '@/lib/portal/diarioServer'
import { lerFormularioLimitado } from '@/lib/portal/corpoLimitado'
import { hasScope } from '@/lib/portal/scopes'
import { LIMITES_DIARIO } from '@/lib/nutri/diario'

const UNAVAILABLE = { error: 'Link indisponível. Peça um novo à clínica.' }
const MUITAS = { error: 'Muitas tentativas. Aguarde alguns minutos.' }
// o corpo do formulário tem a foto mais um pouco de cabeçalho e os campos de texto
const MAX_BODY_BYTES = LIMITES_DIARIO.fotoBytes + 64 * 1024
const MAX_DELETE_BODY_CHARS = 1_000

type Entrada = { ok: true; ip: string } | { ok: false; res: NextResponse }

// Mesmas travas das outras rotas públicas: limite por IP, por token e global; token malformado e link inexistente
// recebem sempre a mesma resposta (sem enumeração).
function entrar(req: Request, token: string, prefixo: string): Entrada {
  const ip = clientIpFrom(req.headers)
  const byIp = rateLimit(`${prefixo}:${ip}`, { limit: 60, windowMs: 10 * 60_000 })
  if (!byIp.success) return { ok: false, res: NextResponse.json(MUITAS, { status: 429, headers: { 'Retry-After': String(Math.ceil((byIp.resetAt - Date.now()) / 1000)) } }) }
  if (!rateLimit(`pglobal:${prefixo}`, { limit: 1000, windowMs: 10 * 60_000 }).success) return { ok: false, res: NextResponse.json(MUITAS, { status: 429 }) }
  if (!isWellFormedToken(token)) return { ok: false, res: NextResponse.json(UNAVAILABLE, { status: 404 }) }
  if (!rateLimit(`${prefixo}-t:${hashToken(token)}`, { limit: 120, windowMs: 60 * 60_000 }).success) return { ok: false, res: NextResponse.json(MUITAS, { status: 429 }) }
  return { ok: true, ip }
}

async function linkOu404(token: string, ip: string) {
  const link = await resolveLink(token)
  if (link) return { link, res: null }
  const bad = rateLimit(`pfail:${ip}`, { limit: 10, windowMs: 10 * 60_000 })
  return { link: null, res: NextResponse.json(bad.success ? UNAVAILABLE : MUITAS, { status: bad.success ? 404 : 429 }) }
}

// O paciente registra uma refeição no diário (multipart: refeicao, horario, descricao, dia, foto opcional).
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const e = entrar(req, token, 'pdia')
  if (!e.ok) return e.res

  // 1) link e escopo ANTES de ler o corpo: quem não tem acesso não faz o servidor receber nem interpretar a foto
  const { link, res } = await linkOu404(token, e.ip)
  if (!link) return res
  if (!hasScope(link.scopes, 'diario')) return NextResponse.json({ error: 'Diário não disponível.' }, { status: 404 })

  // 2) corpo com limite em bytes realmente lidos (Content-Length sozinho não protege: pode faltar ou mentir)
  const lido = await lerFormularioLimitado(req, MAX_BODY_BYTES)
  if (!lido.ok) {
    return lido.motivo === 'grande'
      ? NextResponse.json({ error: 'A foto é grande demais. Escolha uma menor.' }, { status: 413 })
      : NextResponse.json({ error: 'Envio inválido.' }, { status: 400 })
  }
  const form = lido.form
  const foto = form.get('foto')
  if (foto !== null && !(foto instanceof File)) return NextResponse.json({ error: 'Envio inválido.' }, { status: 400 })

  const r = await registrarDiario(
    link,
    { refeicao: form.get('refeicao'), horario: form.get('horario') ?? '', descricao: form.get('descricao'), dia: form.get('dia') ?? '' },
    foto && foto.size > 0 ? foto : null,
  )
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true, entry: r.entry })
}

// O paciente apaga um registro dele, de hoje ou de ontem (JSON: { id }).
export async function DELETE(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const e = entrar(req, token, 'pdia')
  if (!e.ok) return e.res

  const raw = await req.text()
  if (raw.length > MAX_DELETE_BODY_CHARS) return NextResponse.json({ error: 'Envio grande demais.' }, { status: 413 })
  let body: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('corpo inválido')
    body = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Envio inválido.' }, { status: 400 })
  }

  const { link, res } = await linkOu404(token, e.ip)
  if (!link) return res

  const r = await apagarRegistroDiario(link, body.id)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true })
}
