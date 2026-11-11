import { NextResponse } from 'next/server'
import { requireModulePerm } from '@/lib/whatsapp/auth'
import { createContract, listContracts } from '@/lib/contratos/server'
import { contratoFalhaResponse, UUID_RE as UUID } from '@/lib/contratos/http'

// Contratos de paciente. A clínica vem do usuário logado e a permissão é a do módulo Prontuário (ver para listar,
// editar para criar). Sem patientId, lista os contratos de toda a clínica (visão geral /contratos).
export async function GET(req: Request) {
  const ctx = await requireModulePerm(req, 'prontuario', false)
  if (ctx instanceof NextResponse) return ctx
  const patientId = new URL(req.url).searchParams.get('patientId')
  if (patientId !== null && !UUID.test(patientId)) return NextResponse.json({ error: 'Paciente inválido.' }, { status: 400 })
  const r = await listContracts(ctx.clinicId, { patientId: patientId ?? undefined })
  if (!r.ok) return contratoFalhaResponse(r)
  return NextResponse.json({ contracts: r.contracts })
}

const optionalId = (v: unknown): string | null => (typeof v === 'string' && UUID.test(v) ? v : null)

export async function POST(req: Request) {
  const ctx = await requireModulePerm(req, 'prontuario', true)
  if (ctx instanceof NextResponse) return ctx
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.patientId !== 'string' || !UUID.test(body.patientId)) {
    return NextResponse.json({ error: 'Paciente inválido.' }, { status: 400 })
  }
  const r = await createContract({
    clinicId: ctx.clinicId, userId: ctx.userId, patientId: body.patientId,
    title: body.title, contentText: body.contentText, validFrom: body.validFrom, validUntil: body.validUntil,
    amount: body.amount, paymentMethod: body.paymentMethod,
    templateId: optionalId(body.templateId), professionalId: optionalId(body.professionalId), packageId: optionalId(body.packageId),
  })
  if (!r.ok) return contratoFalhaResponse(r)
  return NextResponse.json({ id: r.id })
}
