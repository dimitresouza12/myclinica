// O que a automação faz com cada mensagem recebida no webhook do WhatsApp. Só no servidor (service role).
//
//   1. PARAR (texto exato; palavras em automacao_config.parar.palavras, padrão parar/pare/sair/stop):
//      grava em whatsapp_optout e responde UMA vez com texto fixo. Sem IA. Vale para toda clínica.
//   2. Contato em whatsapp_optout: nada é respondido nem repassado.
//   3. Resposta fora do horário de atendimento: texto fixo da clínica (automacao_config.foraDoHorario), só se a
//      função estiver ligada, o contato for novo ou sem conversa recente, e fora de opening_hours (fuso da clínica).
//      Não responde quem está respondendo a uma confirmação de consulta.
//   4. Clínica com automacao_gerenciada: repassa ao n8n, quando há AUTOMACAO_N8N_WEBHOOK_URL, só o que a
//      automação deve tratar (boas-vindas, resposta ambígua à confirmação, mensagem de contato que não é paciente).
//
// Tudo aqui é "melhor esforço" depois que a mensagem já foi guardada: o webhook captura qualquer exceção
// e segue. Ver app/api/whatsapp/webhook/route.ts.

import { getAdminClient } from '@/lib/supabaseAdmin'
import { isDemoClinic } from '@/lib/demoGuard'
import { extractIncomingText, extractMessage } from '@/lib/whatsapp/webhook-parse'
import { sendText } from '@/lib/whatsapp/evolution'
import { recordOutgoing, conversationKeyFromJid } from '@/lib/whatsapp/conversations'
import { isLidJid } from '@/lib/whatsapp/phone'
import { sendingGate, paceClinic } from '@/lib/whatsapp/sendGate'
import type { IncomingOutcome } from '@/lib/whatsapp/incoming'
import {
  parseAutomacaoConfig, isStopWord, PARAR_CONFIRMACAO_TEXTO, type AutomacaoConfig,
} from './config'
import { isOptedOut, registerOptOut } from './optout'
import { confirmacoesPendentes, camposPendentes } from './conversa'
import { isOutsideOpeningHours, openingFromRow } from './horario'
import { forwardToN8n, type ForwardPayload, type ForwardTipo } from './forward'

/**
 * Fila do ritmo para respostas automáticas do webhook: acima disso a resposta é DESCARTADA em vez de segurar
 * o webhook da Evolution esperando o intervalo entre envios (aviso de fora do horário não vale uma fila).
 */
export const RESPOND_MAX_QUEUE = 2

/** Conversa parada há menos que isso conta como "em andamento": não leva a resposta de fora do horário de novo. */
export const FORA_HORARIO_SILENCIO_MS = 12 * 3_600_000
const DAY_MS = 86_400_000

export interface ConversationSnapshot {
  existed: boolean
  lastMessageAt: Date | null
}

export interface InboundCtx {
  clinicId: string
  instance: string
  jid: string
  /** Chave do contato: DDD + 8 dígitos; "lid:<id>" quando só há o identificador interno. */
  key: string
  messageId: string | null
  text: string
  timezone: string
  connected: boolean
  gerenciada: boolean
  config: AutomacaoConfig
  /** Estado da conversa ANTES desta mensagem; null quando nenhuma função precisa dele. */
  previous: ConversationSnapshot | null
  /**
   * Consultas com confirmação aguardando resposta deste telefone, lidas ANTES de handleIncoming (que marca a
   * confirmação como respondida e a tiraria da busca). Só em clínica gerenciada; vazio caso contrário.
   */
  pendentes: string[]
}

interface WaRow {
  clinic_id: string
  status: string
  timezone: string
  automacao_gerenciada: boolean | null
  automacao_config: unknown
}

/**
 * Lê a configuração e o estado da conversa ANTES de a mensagem ser guardada (depois, a conversa já terá
 * a mensagem nova e não dá para saber se o contato era novo). Devolve null para o que não é texto de contato
 * individual, instância desconhecida ou leitura falha (por exemplo, migração 20261139 ainda não aplicada):
 * nesse caso o webhook segue exatamente como antes.
 */
export async function prepareInbound(instance: string, data: unknown): Promise<InboundCtx | null> {
  const inc = extractIncomingText(data)
  if (!inc) return null
  const admin = getAdminClient()

  const { data: waRaw, error } = await admin
    .from('clinic_whatsapp')
    .select('clinic_id, status, timezone, automacao_gerenciada, automacao_config')
    .eq('instance_name', instance)
    .maybeSingle()
  if (error) {
    console.warn(`[automacao/inbound] leitura de clinic_whatsapp falhou (erro ${error.code ?? 'desconhecido'}); automação do webhook desligada nesta mensagem`)
    return null
  }
  const wa = waRaw as WaRow | null
  if (!wa) return null

  const config = parseAutomacaoConfig(wa.automacao_config)
  const gerenciada = wa.automacao_gerenciada === true
  const key = inc.phoneKey || conversationKeyFromJid(inc.jid)

  let previous: ConversationSnapshot | null = null
  if (gerenciada || config.foraDoHorario.ativa) previous = await snapshot(wa.clinic_id, key, inc.jid)

  // mesma chave que handleIncoming usa (inc.phoneKey): falha de leitura não derruba o webhook, só tira o id do repasse
  let pendentes: string[] = []
  if (gerenciada) {
    try { pendentes = await confirmacoesPendentes(wa.clinic_id, inc.phoneKey, new Date()) } catch (e) {
      console.warn('[automacao/inbound] leitura das confirmações pendentes falhou:', e instanceof Error ? e.name : 'erro')
    }
  }

  return {
    clinicId: wa.clinic_id, instance, jid: inc.jid, key, messageId: inc.messageId, text: inc.text,
    timezone: wa.timezone, connected: wa.status === 'conectado', gerenciada, config, previous, pendentes,
  }
}

async function snapshot(clinicId: string, key: string, jid: string): Promise<ConversationSnapshot> {
  const admin = getAdminClient()
  const cols = 'id, last_message_at'
  let { data } = await admin.from('whatsapp_conversations').select(cols).eq('clinic_id', clinicId).eq('phone_key', key).maybeSingle()
  if (!data && isLidJid(jid)) {
    // contato que já tinha conversa pelo telefone e agora chega só com o @lid
    ;({ data } = await admin.from('whatsapp_conversations').select(cols).eq('clinic_id', clinicId).eq('lid', jid.split('@')[0]).maybeSingle())
  }
  const row = data as { last_message_at: string | null } | null
  return { existed: !!row, lastMessageAt: row?.last_message_at ? new Date(row.last_message_at) : null }
}

// ── classificação (pura) ────────────────────────────────────────────────────

const CONFIRMATION_REPLY: ReadonlySet<IncomingOutcome> = new Set<IncomingOutcome>(['confirmada', 'pediu_remarcacao', 'respondeu', 'varias_pendentes'])

/**
 * Tipo do repasse ao n8n, ou null quando não há o que repassar.
 *  - resposta_confirmacao: ambígua (ou de telefone com várias consultas pendentes). SIM/NÃO exatos o MyClinica já resolveu.
 *  - paciente cadastrado fora de uma confirmação: não é assunto da automação.
 *  - boas_vindas: contato novo ou sem conversa há `diasSemConversar` dias. outro: o resto das mensagens de não pacientes.
 */
export function classifyForward(p: {
  outcome: IncomingOutcome
  isPatient: boolean
  previous: ConversationSnapshot | null
  now: Date
  diasSemConversar: number
}): ForwardTipo | null {
  if (p.outcome === 'respondeu' || p.outcome === 'varias_pendentes') return 'resposta_confirmacao'
  if (p.outcome === 'confirmada' || p.outcome === 'pediu_remarcacao') return null
  if (p.isPatient) return null
  const prev = p.previous
  const novo = !prev || !prev.existed || !prev.lastMessageAt
  const semConversa = !novo && p.now.getTime() - prev!.lastMessageAt!.getTime() > p.diasSemConversar * DAY_MS
  return novo || semConversa ? 'boas_vindas' : 'outro'
}

// ── execução ────────────────────────────────────────────────────────────────

export type InboundAction =
  | { acao: 'nada' }
  | { acao: 'parar'; respondeu: boolean }
  | { acao: 'optout' }
  | { acao: 'fora_do_horario'; enviou: boolean }
  | { acao: 'repassada'; tipo: ForwardTipo; ok: boolean }

export interface InboundDeps { now?: Date; forward?: (p: ForwardPayload) => Promise<boolean> }

export async function processInbound(ctx: InboundCtx, outcome: IncomingOutcome, deps: InboundDeps = {}): Promise<InboundAction> {
  const now = deps.now ?? new Date()

  // 1) PARAR vale para toda clínica, mesmo sem nenhuma função ligada
  if (isStopWord(ctx.text, ctx.config.parar.palavras)) {
    const novo = await registerOptOut(ctx.clinicId, ctx.key)
    if (!novo) return { acao: 'parar', respondeu: false }
    const respondeu = await respond(ctx, PARAR_CONFIRMACAO_TEXTO, { gate: false, idempotency: null, now })
    return { acao: 'parar', respondeu }
  }

  if (!ctx.gerenciada && !ctx.config.foraDoHorario.ativa) return { acao: 'nada' }

  // 2) quem pediu para parar não recebe resposta nem entra na automação
  if (await isOptedOut(ctx.clinicId, [ctx.key])) return { acao: 'optout' }

  const isConfirmationReply = CONFIRMATION_REPLY.has(outcome)

  // 3) fora do horário de atendimento
  if (!isConfirmationReply && ctx.config.foraDoHorario.ativa && ctx.previous) {
    const prev = ctx.previous
    const semConversaRecente = !prev.existed || !prev.lastMessageAt || now.getTime() - prev.lastMessageAt.getTime() > FORA_HORARIO_SILENCIO_MS
    if (semConversaRecente && (await foraDoHorario(ctx, now))) {
      const enviou = await respond(ctx, ctx.config.foraDoHorario.texto, {
        gate: true, idempotency: { funcao: 'fora_do_horario', chave: `fora_do_horario:${ctx.clinicId}:${ctx.key}:${ctx.messageId ?? Math.floor(now.getTime() / FORA_HORARIO_SILENCIO_MS)}` }, now,
      })
      // quem recebeu o aviso de fora do horário não recebe também boas-vindas do n8n (seria mensagem em dobro)
      return { acao: 'fora_do_horario', enviou }
    }
  }

  // 4) repasse ao n8n
  if (!ctx.gerenciada) return { acao: 'nada' }
  const conv = await readConversation(ctx.clinicId, ctx.key, ctx.jid)
  if (!conv) return { acao: 'nada' }
  const tipo = classifyForward({
    outcome, isPatient: conv.patientId !== null, previous: ctx.previous, now, diasSemConversar: ctx.config.boasVindas.diasSemConversar,
  })
  if (!tipo) return { acao: 'nada' }
  const forward = deps.forward ?? forwardToN8n
  const ok = await forward({
    clinicId: ctx.clinicId, conversationId: conv.id, phoneKey: ctx.key, texto: ctx.text, tipo,
    ...(tipo === 'resposta_confirmacao' ? camposPendentes(ctx.pendentes) : {}),
  })
  return { acao: 'repassada', tipo, ok }
}

/**
 * Áudio recebido de contato com uma confirmação de consulta aguardando resposta: pode ser um "sim" falado.
 * O MyClinica NÃO baixa nem repassa o arquivo (só o id da mensagem): quem quiser transcrever pede o arquivo
 * por um caminho próprio. Só clínica com automacao_gerenciada, contato fora do opt-out e com conversa guardada.
 * Chamar DEPOIS de storeIncoming (a conversa precisa existir).
 */
export async function processInboundAudio(
  instance: string, data: unknown, deps: { forward?: (p: ForwardPayload) => Promise<boolean>; now?: Date } = {},
): Promise<InboundAction> {
  const m = extractMessage(data)
  if (!m || m.fromMe || m.kind !== 'audio' || !m.messageId) return { acao: 'nada' }
  const admin = getAdminClient()

  const { data: waRaw, error } = await admin
    .from('clinic_whatsapp').select('clinic_id, automacao_gerenciada').eq('instance_name', instance).maybeSingle()
  if (error) {
    console.warn(`[automacao/inbound] leitura de clinic_whatsapp falhou (erro ${error.code ?? 'desconhecido'}); repasse de áudio desligado nesta mensagem`)
    return { acao: 'nada' }
  }
  const wa = waRaw as { clinic_id: string; automacao_gerenciada: boolean | null } | null
  if (!wa || wa.automacao_gerenciada !== true) return { acao: 'nada' }
  const clinicId = wa.clinic_id

  const conv = await readConversation(clinicId, m.phoneKey, m.jid)
  if (!conv) return { acao: 'nada' }
  // opt-out pelo telefone e pelo lid (a conversa liga os dois)
  if (await isOptedOut(clinicId, [m.phoneKey, conv.phoneKey])) return { acao: 'optout' }

  // só interessa se há confirmação aguardando resposta deste telefone (o áudio não passa por handleIncoming:
  // a confirmação continua 'enviado' e a busca é a mesma)
  const now = deps.now ?? new Date()
  let pendentes: string[]
  try { pendentes = await confirmacoesPendentes(clinicId, conv.phoneKey, now) } catch { return { acao: 'nada' } }
  if (pendentes.length === 0) return { acao: 'nada' }

  const forward = deps.forward ?? forwardToN8n
  const tipo: ForwardTipo = 'resposta_confirmacao_audio'
  const ok = await forward({ clinicId, conversationId: conv.id, phoneKey: conv.phoneKey, texto: '', tipo, mensagemId: m.messageId, ...camposPendentes(pendentes) })
  return { acao: 'repassada', tipo, ok }
}

async function foraDoHorario(ctx: InboundCtx, now: Date): Promise<boolean> {
  const { data } = await getAdminClient()
    .from('clinic_schedule_settings')
    .select('opening_hours')
    .eq('clinic_id', ctx.clinicId)
    .maybeSingle()
  return isOutsideOpeningHours(now, ctx.timezone, openingFromRow(data as { opening_hours?: unknown } | null))
}

async function readConversation(clinicId: string, key: string, jid: string): Promise<{ id: string; patientId: string | null; phoneKey: string } | null> {
  const admin = getAdminClient()
  const cols = 'id, patient_id, phone_key'
  let { data } = await admin.from('whatsapp_conversations').select(cols).eq('clinic_id', clinicId).eq('phone_key', key).maybeSingle()
  if (!data && isLidJid(jid)) {
    ;({ data } = await admin.from('whatsapp_conversations').select(cols).eq('clinic_id', clinicId).eq('lid', jid.split('@')[0]).maybeSingle())
  }
  const row = data as { id: string; patient_id: string | null; phone_key: string } | null
  return row ? { id: row.id, patientId: row.patient_id, phoneKey: row.phone_key } : null
}

/**
 * Resposta automática de texto fixo ao contato que acabou de escrever. Respeita: conta demo (nunca envia),
 * WhatsApp conectado e, quando `gate`, a pausa e o aquecimento do número. Com `idempotency`, a mesma
 * mensagem recebida (evento repetido da Evolution) não gera duas respostas. Falha de envio nunca sobe.
 */
async function respond(
  ctx: InboundCtx, text: string,
  opts: { gate: boolean; idempotency: { funcao: string; chave: string } | null; now: Date },
): Promise<boolean> {
  if (!ctx.connected) return false
  if (await isDemoClinic(ctx.clinicId)) return false
  const admin = getAdminClient()

  let envioId: string | null = null
  try {
    if (opts.idempotency) {
      const { data: ins } = await admin
        .from('automacao_envios')
        .upsert(
          { chave_idempotencia: opts.idempotency.chave, clinic_id: ctx.clinicId, funcao: opts.idempotency.funcao, status: 'enviando' },
          { onConflict: 'chave_idempotencia', ignoreDuplicates: true },
        )
        .select('id')
      envioId = (ins?.[0]?.id as string | undefined) ?? null
      if (!envioId) return false // este evento já foi tratado
    }

    if (opts.gate) {
      const discard = async () => { if (envioId) await admin.from('automacao_envios').delete().eq('id', envioId); return false }
      const gateOpts = { includeAutomacao: true, ...(envioId ? { excludeEnvioId: envioId } : {}) }
      const t0 = Date.now()
      const pre = await sendingGate({ clinic_id: ctx.clinicId }, { timezone: ctx.timezone }, opts.now, gateOpts)
      if (pre.paused || pre.allowance <= 0) return await discard()
      // o intervalo entre envios vale também para a resposta automática; fila longa descarta a resposta
      if ((await paceClinic(ctx.clinicId, { maxQueue: RESPOND_MAX_QUEUE })) === false) return await discard()
      const after = new Date(opts.now.getTime() + (Date.now() - t0))
      const gate = await sendingGate({ clinic_id: ctx.clinicId }, { timezone: ctx.timezone }, after, gateOpts)
      if (gate.paused || gate.allowance <= 0) return await discard()
    }

    const to = isLidJid(ctx.jid) ? ctx.jid : ctx.jid.split('@')[0]
    const sent = await sendText(ctx.instance, to, text)
    try {
      await recordOutgoing({ clinicId: ctx.clinicId, jid: ctx.jid, text, providerMessageId: sent.messageId, origin: 'automatico' })
    } catch (e) {
      console.warn('[automacao/inbound] não foi possível registrar a resposta na conversa', e instanceof Error ? e.name : 'erro')
    }
    if (envioId) {
      const stamp = new Date().toISOString()
      await admin.from('automacao_envios').update({ status: 'enviado', enviado_em: stamp, atualizado_em: stamp }).eq('id', envioId)
    }
    return true
  } catch (e) {
    console.warn('[automacao/inbound] resposta automática não enviada:', e instanceof Error ? e.name : 'erro')
    if (envioId) {
      await admin.from('automacao_envios')
        .update({ status: 'falhou', erro: 'erro_envio', atualizado_em: new Date().toISOString() })
        .eq('id', envioId)
    }
    return false
  }
}
