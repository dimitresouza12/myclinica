import { NextResponse } from 'next/server'
import { authContext, badId, failResponse, isUuid } from '@/lib/contratoClinica/http'
import { retryBilling } from '@/lib/contratoClinica/server'

export const dynamic = 'force-dynamic'

/** Cria a cobrança no Asaas de um contrato já assinado que ficou sem cobrança. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await authContext(req)
  if (ctx instanceof NextResponse) return ctx
  const { id } = await params
  if (!isUuid(id)) return badId()
  const r = await retryBilling(ctx, id)
  if (!r.ok) return failResponse(r)
  return NextResponse.json({ ok: true, agreement: r.agreement, billing: r.billing, warnings: r.warnings })
}
