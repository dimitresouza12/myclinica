import { NextResponse } from 'next/server'
import { authContext, badId, failResponse, isUuid } from '@/lib/contratoClinica/http'
import { getAgreement } from '@/lib/contratoClinica/server'

export const dynamic = 'force-dynamic'

/** Contrato da clínica com o texto e, se assinado, a URL assinada (5 min) do PDF. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await authContext(req)
  if (ctx instanceof NextResponse) return ctx
  const { id } = await params
  if (!isUuid(id)) return badId()
  const r = await getAgreement(ctx, id)
  if (!r.ok) return failResponse(r)
  return NextResponse.json({ agreement: r.detail.agreement, pdfUrl: r.detail.pdfUrl, pdfUrlExpiresInSeconds: r.detail.pdfUrlExpiresInSeconds })
}
