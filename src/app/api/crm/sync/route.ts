import { NextResponse } from 'next/server'
import { requireModulePerm } from '@/lib/whatsapp/auth'
import { syncClinicLeads } from '@/lib/crm/sync'
import { rateLimit } from '@/lib/rateLimit'

// Chamado quando alguém abre o CRM: põe o funil da clínica em dia com a agenda e o silêncio, sem esperar
// o agendador. A clínica vem do usuário logado; basta poder VER o CRM (não altera dado do usuário, só aplica as regras).
export async function POST(req: Request) {
  const ctx = await requireModulePerm(req, 'crm', false)
  if (ctx instanceof NextResponse) return ctx

  const limit = rateLimit(`crm-sync:${ctx.userId}`, { limit: 6, windowMs: 60_000 })
  if (!limit.success) return NextResponse.json({ error: 'Aguarde um instante.' }, { status: 429 })

  try {
    return NextResponse.json(await syncClinicLeads(ctx.clinicId))
  } catch (e) {
    console.error('[crm/sync]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Não foi possível atualizar o funil agora.' }, { status: 500 })
  }
}
