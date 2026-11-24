import { NextResponse } from 'next/server'
import { clientIpFrom } from '@/lib/portal/token'
import { authContext, badBody, badId, failResponse, isUuid, readBody } from '@/lib/contratoClinica/http'
import { signAgreement } from '@/lib/contratoClinica/server'

export const dynamic = 'force-dynamic'
// jsPDF + upload: dá folga além do padrão.
export const maxDuration = 60

/** Confere o código, grava a prova, gera o PDF e dispara a cobrança. IP e user agent vêm da requisição. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await authContext(req)
  if (ctx instanceof NextResponse) return ctx
  const { id } = await params
  if (!isUuid(id)) return badId()
  const body = await readBody(req)
  if (!body) return badBody()
  const r = await signAgreement(
    ctx, id,
    { code: body.code, method: body.method, signerName: body.signerName, drawing: body.drawing, accepted: body.accepted },
    { ip: clientIpFrom(req.headers), userAgent: req.headers.get('user-agent') },
  )
  if (!r.ok) return failResponse(r)
  return NextResponse.json({ ok: true, agreement: r.agreement, billing: r.billing, warnings: r.warnings })
}
