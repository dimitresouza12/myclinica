import { NextResponse } from 'next/server'
import { cleanupMedia, type CleanupResult } from '@/lib/whatsapp/media-store'
import { cleanupTeamChatAttachments, type TeamChatCleanupResult } from '@/lib/teamChat/cleanup'
import { secretMatches } from '../_token'

// Chamado uma vez por dia pelo agendador com Authorization: Bearer <CRON_SECRET>.
// Apaga as cópias de arquivos vencidas do WhatsApp e os anexos vencidos do Chat da equipe;
// as mensagens continuam nas conversas. A resposta traz só contagens.
// As duas limpezas são independentes: falha numa não impede a outra.
export const maxDuration = 300

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!secretMatches(token, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let whatsapp: CleanupResult | null = null
  let whatsappFailed = false
  try {
    whatsapp = await cleanupMedia()
  } catch (e) {
    whatsappFailed = true
    console.error('[whatsapp/cleanup-media]', e instanceof Error ? e.message : e)
  }

  let teamChat: TeamChatCleanupResult | { error: string }
  try {
    teamChat = await cleanupTeamChatAttachments()
  } catch (e) {
    console.error('[whatsapp/cleanup-media] chat da equipe', e instanceof Error ? e.message : e)
    teamChat = { error: 'Falha na rotina' }
  }

  // formato atual preservado: contagens do WhatsApp na raiz, 500 se a limpeza do WhatsApp falhou
  if (whatsappFailed || !whatsapp) {
    return NextResponse.json({ error: 'Falha na rotina', teamChat }, { status: 500 })
  }
  return NextResponse.json({ ...whatsapp, teamChat })
}
