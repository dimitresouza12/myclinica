import { NextResponse } from 'next/server'
import { requireModulePerm } from '@/lib/whatsapp/auth'
import { publicOrigin } from '@/lib/portal/link'
import { sendContract } from '@/lib/contratos/server'
import { contratoFalhaResponse, UUID_RE as UUID } from '@/lib/contratos/http'

// Gera o link do paciente com este contrato para assinar (reenvio revoga o link anterior). O link só aparece nesta resposta.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireModulePerm(req, 'prontuario', true)
  if (ctx instanceof NextResponse) return ctx
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Contrato inválido.' }, { status: 400 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const r = await sendContract({ clinicId: ctx.clinicId, userId: ctx.userId, id, origin: publicOrigin(new URL(req.url).origin), ttlDays: body?.ttlDays })
  if (!r.ok) return contratoFalhaResponse(r)
  return NextResponse.json({ url: r.url, expiresAt: r.expiresAt })
}
