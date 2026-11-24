import { NextResponse } from 'next/server'
import { parseEnvelope, extractConnectionUpdate } from '@/lib/whatsapp/webhook-parse'
import { extractStatusUpdate } from '@/lib/whatsapp/message-events'
import { handleIncoming, type IncomingOutcome } from '@/lib/whatsapp/incoming'
import { prepareInbound, processInbound, processInboundAudio, type InboundCtx } from '@/lib/automacao/inbound'
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
      // 0) estado da conversa e configuração da automação ANTES de guardar a mensagem (depois, o contato já
      // não parece novo). Falha aqui (ou migração da automação ainda não aplicada) = webhook como antes.
      let auto: InboundCtx | null = null
      try { auto = await prepareInbound(instance, data) } catch (e) {
        console.error('[whatsapp/webhook] automação (preparo)', e instanceof Error ? e.name : 'erro')
      }
      // 1) guarda na conversa (tela Mensagens). Falhar aqui não pode impedir a confirmação abaixo.
      try { await storeIncoming(instance, data) } catch (e) {
        console.error('[whatsapp/webhook] guardar mensagem', e instanceof Error ? e.message : e)
      }
      // 2) resposta a uma confirmação de consulta
      let outcome: IncomingOutcome = 'ignorada'
      try { outcome = await handleIncoming(instance, data) } catch (e) {
        console.error('[whatsapp/webhook] resposta à confirmação', e instanceof Error ? e.message : e)
      }
      // 3) automação: PARAR, resposta fora do horário e repasse ao n8n. Nunca derruba o webhook.
      if (auto) {
        try { await processInbound(auto, outcome) } catch (e) {
          console.error('[whatsapp/webhook] automação', e instanceof Error ? e.name : 'erro')
        }
      } else {
        // mensagem que não é texto: áudio pode ser a resposta falada a uma confirmação (só o id vai ao n8n)
        try { await processInboundAudio(instance, data) } catch (e) {
          console.error('[whatsapp/webhook] automação (áudio)', e instanceof Error ? e.name : 'erro')
        }
      }
    } else if (event === 'messages.update') {
      const u = extractStatusUpdate(data)
      if (u) await applyStatusUpdate(instance, u)
    } else if (event === 'connection.update') {
      const { state: connState } = extractConnectionUpdate(data)
      if (connState) await getConnectionByInstance(instance, connState)
    }
  } catch (e) {
    console.error('[whatsapp/webhook]', e instanceof Error ? e.message : e)
  }
  return NextResponse.json({ ok: true })
}
