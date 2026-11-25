import { NextResponse } from 'next/server'
import { authContext, badId, failResponse, isUuid } from '@/lib/contratoClinica/http'
import { previewAgreementPdf } from '@/lib/contratoClinica/server'

export const dynamic = 'force-dynamic'

/** PDF de leitura do contrato ainda não assinado (gerado na hora, não é guardado). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await authContext(req)
  if (ctx instanceof NextResponse) return ctx
  const { id } = await params
  if (!isUuid(id)) return badId()
  const r = await previewAgreementPdf(ctx, id)
  if (!r.ok) return failResponse(r)
  return new NextResponse(Buffer.from(r.pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="contrato-myclinica.pdf"', 'Cache-Control': 'private, no-store' },
  })
}
