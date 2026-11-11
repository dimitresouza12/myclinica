import { NextResponse } from 'next/server'
import { requireModulePerm } from '@/lib/whatsapp/auth'
import { publicOrigin } from '@/lib/portal/link'
import { issueDocument } from '@/lib/portal/server'
import { falhaResponse, UUID_RE as UUID } from '@/lib/portal/http'
import { verificationUrl } from '@/lib/assinatura/verificacao'

// Registra o documento próprio emitido (atestado, declaração, laudo, receita comum) e devolve o código do QR verificador.
// Só o hash do conteúdo vai para o banco: nenhum texto clínico é guardado aqui.
export async function POST(req: Request) {
  const ctx = await requireModulePerm(req, 'prontuario', true)
  if (ctx instanceof NextResponse) return ctx
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.patientId !== 'string' || !UUID.test(body.patientId)) {
    return NextResponse.json({ error: 'Paciente inválido.' }, { status: 400 })
  }
  const professionalId = typeof body.professionalId === 'string' && UUID.test(body.professionalId) ? body.professionalId : null
  const r = await issueDocument({
    clinicId: ctx.clinicId, userId: ctx.userId, patientId: body.patientId, docType: body.docType,
    contentHash: body.contentHash, professionalId,
  })
  if (r.ok) {
    return NextResponse.json({ code: r.code, url: verificationUrl(publicOrigin(new URL(req.url).origin), r.code), issuedAt: r.issuedAt })
  }
  return falhaResponse(r)
}
