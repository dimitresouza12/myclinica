import { NextResponse } from 'next/server'
import { requireModulePerm } from '@/lib/whatsapp/auth'
import { getSignedDocument } from '@/lib/portal/server'
import { falhaResponse, UUID_RE as UUID } from '@/lib/portal/http'

// Documento assinado (imutável) para a clínica ver e imprimir com o carimbo. A clínica vem do usuário logado.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireModulePerm(req, 'prontuario', false)
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Documento inválido.' }, { status: 400 })
  const r = await getSignedDocument(auth.clinicId, id)
  if (r.ok) return NextResponse.json({ doc: r.doc })
  return falhaResponse(r)
}
