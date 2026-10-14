import { NextResponse } from 'next/server'
import { parseEnvelope, extractConnectionUpdate } from '@/lib/whatsapp/webhook-parse'
import { extractStatusUpdate } from '@/lib/whatsapp/message-events'
import { handleIncoming } from '@/lib/whatsapp/incoming'
import { storeIncoming, applyStatusUpdate } from '@/lib/whatsapp/conversations'
import { getConnectionByInstance } from '@/lib/whatsapp/connection'
import { secretMatches } from '../_token'

// Chamado pela Evolution (servidor a servidor, sem cookie de sessão — por isso está na lista
// de caminhos públicos do middleware). Autenticado por token no cabeçalho x-webhook-token.
//
// Responde 200 mesmo quando descarta o evento: a Evolution reenvia em caso de erro, e um
// reenvio infinito de algo que não nos interessa só gera carga.
export async function POST(req: Request) {
  if (!secretMatches(req.headers.get('x-webhook-token'), process.env.WHATSAPP_WEBHOOK_TOKEN)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ ok: true }) }

  const { event, instance, data } = parseEnvelope(body)
  if (!instance || !instance.startsWith('mc_')) return NextResponse.json({ ok: true })

  try {
    if (event === 'messages.upsert') {
      // 1) guarda na conversa (tela Mensagens). Falhar aqui não pode impedir a confirmação abaixo.
      try { await storeIncoming(instance, data) } catch (e) {
        console.error('[whatsapp/webhook] guardar mensagem', e instanceof Error ? e.message : e)
      }
      // 2) resposta a uma confirmação de consulta
      await handleIncoming(instance, data)
    } else if (event === 'messages.update') {
      const u = extractStatusUpdate(data)
      if (u) await applyStatusUpdate(instance, u)
    } else if (event === 'connection.update') {
      if (extractConnectionUpdate(data).state) await getConnectionByInstance(instance)
    }
  } catch (e) {
    console.error('[whatsapp/webhook]', e instanceof Error ? e.message : e)
  }
  return NextResponse.json({ ok: true })
}
