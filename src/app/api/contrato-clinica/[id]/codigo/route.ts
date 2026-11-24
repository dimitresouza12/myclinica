import { NextResponse } from 'next/server'
import { authContext, badBody, badId, failResponse, isUuid, readBody } from '@/lib/contratoClinica/http'
import { sendCode } from '@/lib/contratoClinica/server'

export const dynamic = 'force-dynamic'

/** Envia o código de 6 dígitos por WhatsApp para o celular informado. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await authContext(req)
  if (ctx instanceof NextResponse) return ctx
  const { id } = await params
  if (!isUuid(id)) return badId()
  const body = await readBody(req)
  if (!body) return badBody()
  const r = await sendCode(ctx, id, { phone: body.phone })
  if (!r.ok) return failResponse(r)
  return NextResponse.json({ ok: true, sentTo: r.sentTo, expiresAt: r.expiresAt, resendAvailableAt: r.resendAvailableAt, codeValidMinutes: r.codeValidMinutes })
}
