import { NextResponse } from 'next/server'
import { runConfirmations } from '@/lib/whatsapp/run'
import { secretMatches } from '../_token'

// Chamado por um agendador (a cada ~5 min) com Authorization: Bearer <CRON_SECRET>.
// ?dryRun=1 só lista o que seria enviado, sem gravar nem mandar nada.
// A resposta traz apenas contagens por clínica — nenhum dado de paciente.
export const maxDuration = 300

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!secretMatches(token, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = new URL(req.url).searchParams.get('dryRun') === '1'
  try {
    return NextResponse.json(await runConfirmations({ dryRun }))
  } catch (e) {
    console.error('[whatsapp/run-confirmations]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Falha na rotina' }, { status: 500 })
  }
}
