import { NextResponse } from 'next/server'
import { requireModulePerm } from '@/lib/whatsapp/auth'
import { getContract, removeContract, updateContract } from '@/lib/contratos/server'
import { contratoFalhaResponse, UUID_RE as UUID } from '@/lib/contratos/http'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Params) {
  const ctx = await requireModulePerm(req, 'prontuario', false)
  if (ctx instanceof NextResponse) return ctx
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Contrato inválido.' }, { status: 400 })
  const r = await getContract(ctx.clinicId, id)
  if (!r.ok) return contratoFalhaResponse(r)
  return NextResponse.json({ contract: r.contract })
}

// Edita um rascunho (contrato enviado tem o texto congelado: 409).
export async function PATCH(req: Request, { params }: Params) {
  const ctx = await requireModulePerm(req, 'prontuario', true)
  if (ctx instanceof NextResponse) return ctx
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Contrato inválido.' }, { status: 400 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })
  const professionalId = body.professionalId === null ? null : typeof body.professionalId === 'string' && UUID.test(body.professionalId) ? body.professionalId : undefined
  const r = await updateContract(ctx.clinicId, id, {
    title: body.title, contentText: body.contentText, validFrom: body.validFrom, validUntil: body.validUntil,
    amount: body.amount, paymentMethod: body.paymentMethod, professionalId,
  })
  if (!r.ok) return contratoFalhaResponse(r)
  return NextResponse.json({ ok: true })
}

// Rascunho: apaga. Enviado ou assinado: cancela (o documento assinado continua guardado).
export async function DELETE(req: Request, { params }: Params) {
  const ctx = await requireModulePerm(req, 'prontuario', true)
  if (ctx instanceof NextResponse) return ctx
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Contrato inválido.' }, { status: 400 })
  const r = await removeContract(ctx.clinicId, id)
  if (!r.ok) return contratoFalhaResponse(r)
  return NextResponse.json({ ok: true, mode: r.mode })
}
