import { NextResponse } from 'next/server'
import { syncAllClinics } from '@/lib/crm/sync'
import { secretMatches } from '@/app/api/whatsapp/_token'

// Chamado pelo agendador (a cada ~5 min, junto com /api/whatsapp/run-confirmations) com
// Authorization: Bearer <CRON_SECRET>. Põe o funil de todas as clínicas em dia com a agenda e o silêncio.
// A resposta traz só contagens: nenhum dado de paciente ou lead.
export const maxDuration = 300

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!secretMatches(token, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json(await syncAllClinics())
  } catch (e) {
    console.error('[crm/automate]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Falha na rotina' }, { status: 500 })
  }
}
