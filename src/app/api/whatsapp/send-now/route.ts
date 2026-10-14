import { NextResponse } from 'next/server'
import { requireAgendaEditor } from '@/lib/whatsapp/auth'
import { sendConfirmationNow } from '@/lib/whatsapp/run'
import { rateLimit } from '@/lib/rateLimit'
import { failure } from '../_shared'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// "Enviar confirmação agora" (botão no detalhe da consulta, na Agenda): reenvia quando o
// paciente diz que não recebeu. A clínica vem do usuário logado, nunca do corpo.
export async function POST(req: Request) {
  const ctx = await requireAgendaEditor(req)
  if (ctx instanceof NextResponse) return ctx

  let appointmentId = ''
  try { appointmentId = String((await req.json())?.appointmentId ?? '') } catch { /* corpo inválido */ }
  if (!UUID.test(appointmentId)) {
    return NextResponse.json({ error: 'Consulta inválida.' }, { status: 400 })
  }

  const limit = rateLimit(`wa-now:${appointmentId}`, { limit: 3, windowMs: 10 * 60_000 })
  if (!limit.success) {
    return NextResponse.json({ error: 'Essa consulta já recebeu várias mensagens agora há pouco. Aguarde alguns minutos.' }, { status: 429 })
  }

  try {
    const r = await sendConfirmationNow(ctx.clinicId, appointmentId)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true, kind: r.kind })
  } catch (e) {
    return failure(e)
  }
}
