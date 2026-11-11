import { NextResponse } from 'next/server'
import { requireModulePerm } from '@/lib/whatsapp/auth'
import { deleteTemplate, updateTemplate } from '@/lib/contratos/server'
import { contratoFalhaResponse, UUID_RE as UUID } from '@/lib/contratos/http'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const ctx = await requireModulePerm(req, 'prontuario', true)
  if (ctx instanceof NextResponse) return ctx
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Modelo inválido.' }, { status: 400 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })
  const r = await updateTemplate(ctx.clinicId, id, { name: body.name, body: body.body })
  if (!r.ok) return contratoFalhaResponse(r)
  return NextResponse.json({ template: r.template })
}

export async function DELETE(req: Request, { params }: Params) {
  const ctx = await requireModulePerm(req, 'prontuario', true)
  if (ctx instanceof NextResponse) return ctx
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Modelo inválido.' }, { status: 400 })
  const r = await deleteTemplate(ctx.clinicId, id)
  if (!r.ok) return contratoFalhaResponse(r)
  return NextResponse.json({ ok: true })
}
