import { NextResponse } from 'next/server'
import { authContext, badBody, failResponse, readBody } from '@/lib/contratoClinica/http'
import { createDraft, listAgreements } from '@/lib/contratoClinica/server'

export const dynamic = 'force-dynamic'

/** Lista os contratos da clínica do usuário (sem o texto). */
export async function GET(req: Request) {
  const ctx = await authContext(req)
  if (ctx instanceof NextResponse) return ctx
  const r = await listAgreements(ctx)
  if (!r.ok) return failResponse(r)
  return NextResponse.json({ agreements: r.agreements })
}

/** Cria o rascunho. Valores e texto são calculados no servidor; o corpo só escolhe plano, prazo e pagamento. */
export async function POST(req: Request) {
  const ctx = await authContext(req)
  if (ctx instanceof NextResponse) return ctx
  const body = await readBody(req)
  if (!body) return badBody()
  const r = await createDraft(ctx, {
    plan: body.plan,
    months: body.months,
    paymentMode: body.paymentMode,
    installments: body.installments,
    responsibleName: body.responsibleName,
    responsibleCpf: body.responsibleCpf,
  })
  if (!r.ok) return failResponse(r)
  return NextResponse.json({ agreement: r.agreement }, { status: 201 })
}
