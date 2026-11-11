import { NextResponse } from 'next/server'
import { requireModulePerm } from '@/lib/whatsapp/auth'
import { revokePortalLink } from '@/lib/portal/server'
import { falhaResponse, UUID_RE as UUID } from '@/lib/portal/http'

// Revoga o link: a página pública deixa de abrir na hora e os documentos pendentes dele deixam de poder ser assinados.
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireModulePerm(req, 'prontuario', true)
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Link inválido.' }, { status: 400 })
  const r = await revokePortalLink(auth.clinicId, id)
  if (r.ok) return NextResponse.json({ ok: true })
  return falhaResponse(r)
}
