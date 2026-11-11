import { NextResponse } from 'next/server'
import { requireModulePerm } from '@/lib/whatsapp/auth'
import { createTemplate, listTemplates } from '@/lib/contratos/server'
import { contratoFalhaResponse } from '@/lib/contratos/http'

// Modelos de contrato da clínica. O modelo padrão (CONTRATADA / CONTRATANTE) vive em código e não é listado aqui.
export async function GET(req: Request) {
  const ctx = await requireModulePerm(req, 'prontuario', false)
  if (ctx instanceof NextResponse) return ctx
  const r = await listTemplates(ctx.clinicId)
  if (!r.ok) return contratoFalhaResponse(r)
  return NextResponse.json({ templates: r.templates })
}

export async function POST(req: Request) {
  const ctx = await requireModulePerm(req, 'prontuario', true)
  if (ctx instanceof NextResponse) return ctx
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })
  const r = await createTemplate(ctx.clinicId, ctx.userId, { name: body.name, body: body.body })
  if (!r.ok) return contratoFalhaResponse(r)
  return NextResponse.json({ template: r.template })
}
