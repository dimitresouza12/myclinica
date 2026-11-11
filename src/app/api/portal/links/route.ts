import { NextResponse } from 'next/server'
import { requireModulePerm } from '@/lib/whatsapp/auth'
import { clampTtlDays, publicOrigin } from '@/lib/portal/link'
import { normalizeScopes } from '@/lib/portal/scopes'
import { createPortalLink, listPatientPortal } from '@/lib/portal/server'
import { falhaResponse, UUID_RE as UUID } from '@/lib/portal/http'

// Gera o link mágico (e os documentos a assinar). O token em claro só existe nesta resposta: o banco guarda o hash.
export async function POST(req: Request) {
  const ctx = await requireModulePerm(req, 'prontuario', true)
  if (ctx instanceof NextResponse) return ctx

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.patientId !== 'string' || !UUID.test(body.patientId)) {
    return NextResponse.json({ error: 'Paciente inválido.' }, { status: 400 })
  }
  const scopes = normalizeScopes(body.scopes)
  if (scopes.length === 0) return NextResponse.json({ error: 'Escolha o que o paciente poderá ver.' }, { status: 400 })

  const result = await createPortalLink({
    clinicId: ctx.clinicId, userId: ctx.userId, patientId: body.patientId, scopes,
    ttlDays: clampTtlDays(body.ttlDays),
    message: typeof body.message === 'string' ? body.message : null,
    docs: Array.isArray(body.docs) ? (body.docs as { docType: unknown; title: unknown; contentText: unknown }[]) : [],
    origin: publicOrigin(new URL(req.url).origin),
  })
  if (!result.ok) return falhaResponse(result)
  return NextResponse.json({ id: result.id, url: result.url, expiresAt: result.expiresAt, scopes: result.scopes })
}

export async function GET(req: Request) {
  const ctx = await requireModulePerm(req, 'prontuario', false)
  if (ctx instanceof NextResponse) return ctx
  const patientId = new URL(req.url).searchParams.get('patientId') ?? ''
  if (!UUID.test(patientId)) return NextResponse.json({ error: 'Paciente inválido.' }, { status: 400 })
  const result = await listPatientPortal(ctx.clinicId, patientId)
  if (!result.ok) return falhaResponse(result)
  return NextResponse.json({ links: result.links, signatures: result.signatures })
}
