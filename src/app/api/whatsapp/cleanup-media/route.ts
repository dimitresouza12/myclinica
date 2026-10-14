import { NextResponse } from 'next/server'
import { cleanupMedia } from '@/lib/whatsapp/media-store'
import { secretMatches } from '../_token'

// Chamado uma vez por dia pelo agendador com Authorization: Bearer <CRON_SECRET>.
// Apaga as cópias de arquivos vencidas; as mensagens continuam nas conversas.
// A resposta traz só contagens.
export const maxDuration = 300

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!secretMatches(token, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json(await cleanupMedia())
  } catch (e) {
    console.error('[whatsapp/cleanup-media]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Falha na rotina' }, { status: 500 })
  }
}
