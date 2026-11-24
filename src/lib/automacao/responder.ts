// POST /api/automacao/responder: texto livre do n8n numa conversa que já existe. Só no servidor.
//
// Mesmas proteções do /enviar: demo nunca envia, opt-out (telefone e lid), chave de idempotência, portão do
// número (pausa, aquecimento, ritmo, de novo depois da fila). Mais uma trava própria: se um humano respondeu na
// conversa DEPOIS da última mensagem do contato (o que foi repassado ao n8n), a automação não fala por cima dele.
// Modo teste (modoTeste + numeroTeste, mesma semântica do /enviar): o destino é SÓ o número de teste, a chave é
// prefixada com "teste:" (fora da pausa e do aquecimento), nada é gravado na caixa de entrada e a trava de "humano
// assumiu" não vale (a mensagem não vai para o contato). Demo continua bloqueando e o opt-out vale para o número de teste.
// O texto vem do n8n (pode ser de IA): só o limite de tamanho é imposto aqui. Nada do texto vai para log nem tabela.

import { getAdminClient } from '@/lib/supabaseAdmin'
import { isDemoClinic, DEMO_SEND_BLOCKED_MESSAGE } from '@/lib/demoGuard'
import { sendText, checkNumbers, EvolutionError } from '@/lib/whatsapp/evolution'
import { recordOutgoing } from '@/lib/whatsapp/conversations'
import { isLidJid, phoneKey, whatsappCandidates } from '@/lib/whatsapp/phone'
import { TEST_KEY_PREFIX } from '@/lib/whatsapp/sendGate'
import { RETRYABLE_ERROR } from '@/lib/whatsapp/safety'
import { isUuid, type AutomacaoClinic } from '@/lib/automacaoIntegration'
import { isOptedOut } from './optout'
import { lerConversa, ultimaSaidaHumana, humanoAssumiu, ConversaError } from './conversa'
import { portaoDoNumero } from './portao'
import { done, skip, reserveKey, type EnvioResult } from './envio'

export const RESPONDER_TEXTO_MAX = 1000
const CHAVE_RE = /^[A-Za-z0-9:_.|\-]{8,200}$/

export interface ResponderInput {
  clinicId: string; conversationId: string; texto: string; chave: string
  modoTeste: boolean
  numeroTeste: string | null
}

export function validateResponderBody(body: Record<string, unknown>): { ok: true; value: ResponderInput } | { ok: false; error: string } {
  if (!isUuid(body.clinicId)) return { ok: false, error: 'clinicId inválido.' }
  if (!isUuid(body.conversationId)) return { ok: false, error: 'conversationId inválido.' }
  if (typeof body.texto !== 'string' || body.texto.trim() === '' || body.texto.length > RESPONDER_TEXTO_MAX) {
    return { ok: false, error: `texto deve ter de 1 a ${RESPONDER_TEXTO_MAX} caracteres.` }
  }
  if (typeof body.chave !== 'string' || !CHAVE_RE.test(body.chave)) {
    return { ok: false, error: 'chave deve ter de 8 a 200 caracteres (letras, números e : _ . | -).' }
  }
  // o prefixo "teste:" é reservado ao modo teste do /enviar e escapa da conta de pausa e aquecimento
  if (body.chave.startsWith(TEST_KEY_PREFIX)) return { ok: false, error: `chave não pode começar com "${TEST_KEY_PREFIX}".` }
  if (body.modoTeste !== undefined && typeof body.modoTeste !== 'boolean') return { ok: false, error: 'modoTeste deve ser booleano.' }
  if (body.numeroTeste !== undefined && body.numeroTeste !== null && typeof body.numeroTeste !== 'string') {
    return { ok: false, error: 'numeroTeste deve ser texto.' }
  }
  const modoTeste = body.modoTeste === true
  const numeroTeste = typeof body.numeroTeste === 'string' && body.numeroTeste.trim() !== '' ? body.numeroTeste.trim() : null
  // modo teste sem um número utilizável NUNCA cai para o contato real
  if (modoTeste && (!numeroTeste || whatsappCandidates(numeroTeste).length === 0)) {
    return { ok: false, error: 'modoTeste exige numeroTeste com um telefone brasileiro válido.' }
  }
  return {
    ok: true,
    value: {
      clinicId: body.clinicId, conversationId: body.conversationId, texto: body.texto.trim(), chave: body.chave,
      modoTeste, numeroTeste: modoTeste ? numeroTeste : null,
    },
  }
}

interface WaRow { clinic_id: string; instance_name: string; status: string; timezone: string; automacao_gerenciada: boolean | null }

export async function responderAutomacao(clinic: AutomacaoClinic, input: ResponderInput, now: Date = new Date()): Promise<EnvioResult> {
  const admin = getAdminClient()
  const clinicId = clinic.id

  if (await isDemoClinic(clinicId)) return done(403, { error: DEMO_SEND_BLOCKED_MESSAGE })

  const { data: waRaw, error: waErr } = await admin
    .from('clinic_whatsapp')
    .select('clinic_id, instance_name, status, timezone, automacao_gerenciada')
    .eq('clinic_id', clinicId)
    .maybeSingle()
  if (waErr) {
    console.error('[automacao/responder] leitura de clinic_whatsapp falhou:', waErr.code ?? 'sem código')
    return done(500, { error: 'Erro ao ler a conexão do WhatsApp.' })
  }
  const wa = waRaw as WaRow | null
  if (!wa || wa.status !== 'conectado') return done(409, { error: 'O WhatsApp da clínica não está conectado.', codigo: 'whatsapp_desconectado' })
  if (wa.automacao_gerenciada !== true && !input.modoTeste) return done(409, { error: 'A automação não está habilitada para esta clínica.', codigo: 'automacao_nao_habilitada' })

  let conv, saida
  try {
    conv = await lerConversa(clinicId, input.conversationId)
    if (!conv) return done(404, { error: 'Conversa não encontrada.' })
    // quem pediu PARAR nunca recebe automação (telefone e lid da conversa)
    // (em modo teste o destino é o número de teste, não o contato da conversa)
    const keys = input.modoTeste ? [phoneKey(input.numeroTeste)] : [conv.phone_key, ...(conv.lid ? [`lid:${conv.lid}`] : [])]
    if (await isOptedOut(clinicId, keys)) return skip('opt_out')
    saida = input.modoTeste ? null : await ultimaSaidaHumana(clinicId, conv.id)
  } catch (e) {
    console.error('[automacao/responder] leitura falhou:', e instanceof ConversaError ? e.message : e instanceof Error ? e.name : 'erro')
    return done(500, { error: 'Não foi possível conferir a conversa.' })
  }
  if (humanoAssumiu(conv, saida)) return skip('humano_assumiu')

  // chave própria do modo teste: nunca ocupa a chave de produção nem conta na pausa e no aquecimento
  const chave = input.modoTeste ? `${TEST_KEY_PREFIX}${input.chave}` : input.chave
  const reserved = await reserveKey(clinicId, { chave, funcao: 'responder', appointmentId: null, pacienteId: conv.patient_id }, now)
  if ('result' in reserved) return reserved.result
  const envioId = reserved.id
  const release = () => admin.from('automacao_envios').delete().eq('id', envioId)

  try {
    const bloqueio = await portaoDoNumero(wa, envioId, now)
    if (bloqueio) { await release(); return skip(bloqueio, { tentarNovamente: true }) }
    // a fila pode ter demorado: um humano pode ter escrito enquanto isso
    if (!input.modoTeste) {
      const depois = await ultimaSaidaHumana(clinicId, conv.id)
      if (humanoAssumiu(conv, depois)) { await release(); return skip('humano_assumiu') }
    }
  } catch (e) {
    console.error('[automacao/responder] portão/ritmo falhou:', e instanceof Error ? e.name : 'erro')
    await release()
    return done(502, { error: 'Não foi possível preparar o envio.', codigo: 'preparo_falhou', tentarNovamente: true })
  }

  const closeEnvio = (status: 'falhou', erro: string) =>
    admin.from('automacao_envios').update({ status, erro, atualizado_em: new Date().toISOString() }).eq('id', envioId)

  try {
    let to: string
    if (input.modoTeste) {
      // só o número de teste, e só se ele existe no WhatsApp
      const found = (await checkNumbers(wa.instance_name, whatsappCandidates(input.numeroTeste))).find(c => c.exists)
      if (!found) {
        await closeEnvio('falhou', 'sem_whatsapp')
        return done(422, { error: 'O número de teste não foi encontrado no WhatsApp.', codigo: 'sem_whatsapp' })
      }
      to = found.jid?.split('@')[0] ?? found.number
    } else {
      // jid da própria conversa: o que o WhatsApp do contato aceita (telefone, ou @lid quando só há ele)
      to = isLidJid(conv.jid) ? conv.jid : conv.jid.split('@')[0]
    }
    const sent = await sendText(wa.instance_name, to, input.texto)
    if (!input.modoTeste) {
      try {
        await recordOutgoing({ clinicId, jid: conv.jid, text: input.texto, providerMessageId: sent.messageId, origin: 'automatico' })
      } catch (e) {
        console.warn('[automacao/responder] não foi possível registrar a mensagem na conversa', e instanceof Error ? e.name : 'erro')
      }
    }
    const stamp = new Date().toISOString()
    await admin.from('automacao_envios').update({ status: 'enviado', erro: null, enviado_em: stamp, atualizado_em: stamp }).eq('id', envioId)
    return done(200, { ok: true, enviado: true, modoTeste: input.modoTeste })
  } catch (e) {
    if (e instanceof EvolutionError && e.status === 404) {
      await release()
      await admin.from('clinic_whatsapp')
        .update({ status: 'desconectado', phone_number: null, connected_at: null, status_changed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('clinic_id', clinicId)
      return done(409, { error: 'O WhatsApp da clínica foi desconectado.', codigo: 'whatsapp_desconectado' })
    }
    if (e instanceof EvolutionError && e.status >= 500) {
      await closeEnvio('falhou', RETRYABLE_ERROR)
      return done(502, { error: 'O WhatsApp demorou para responder.', codigo: 'whatsapp_instavel', tentarNovamente: true })
    }
    const code = e instanceof EvolutionError ? `evolution_${e.status}` : 'erro_envio'
    console.error('[automacao/responder] envio falhou:', code)
    await closeEnvio('falhou', code)
    return done(502, { error: 'Não foi possível enviar a mensagem.', codigo: code })
  }
}
