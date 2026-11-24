// Envio de mensagem da automação (POST /api/automacao/enviar). Só no servidor.
//
// Modelos: lembrete_vespera, confirmacao_dia e quem_faltou partem de uma consulta (appointmentId);
// aniversario parte de um paciente (pacienteId). O n8n manda o MODELO de texto ({paciente}, {clinica},
// {data}, {hora}...) e a chave de idempotência; o MyClinica monta o texto com os dados do paciente e envia.
// Nome e telefone nunca saem daqui.
//
// Ordem das travas (o que é barato e definitivo vem primeiro):
//   clínica demo -> WhatsApp conectado e automação habilitada -> alvo da clínica e elegível para o modelo
//   -> contato em whatsapp_optout (telefone e lid) -> chave de idempotência (reserva) -> portão do número
//   -> fila do ritmo -> portão de novo (depois da espera) -> reserva em appointment_confirmations
//   -> validação do número -> envio.
//
// Falha do envio libera as reservas, exceto quando a falha é do próprio paciente (sem WhatsApp, telefone
// inválido) ou quando a mensagem pode ter saído (interrompido): essas ficam registradas e não se repetem.

import { getAdminClient } from '@/lib/supabaseAdmin'
import { isDemoClinic, DEMO_SEND_BLOCKED_MESSAGE } from '@/lib/demoGuard'
import { checkNumbers, sendText, EvolutionError } from '@/lib/whatsapp/evolution'
import { phoneKey, phoneKeys, whatsappCandidates } from '@/lib/whatsapp/phone'
import { renderMessage } from '@/lib/whatsapp/message'
import { recordOutgoing } from '@/lib/whatsapp/conversations'
import { TEST_KEY_PREFIX } from '@/lib/whatsapp/sendGate'
import { portaoDoNumero, ENVIO_MAX_QUEUE } from './portao'
import { zonedParts } from '@/lib/whatsapp/window'
import { RETRYABLE_ERROR } from '@/lib/whatsapp/safety'
import { isOptedOut } from './optout'
import { birthdayMatches } from './operacoes'
import type { AutomacaoClinic } from '@/lib/automacaoIntegration'
import { isUuid } from '@/lib/automacaoIntegration'

export const MODELOS = ['lembrete_vespera', 'confirmacao_dia', 'quem_faltou', 'aniversario'] as const
export type Modelo = (typeof MODELOS)[number]

export const TEXTO_MODELO_MAX = 1000
const CHAVE_RE = /^[A-Za-z0-9:_.|\-]{8,200}$/
/** 'enviando' parado por mais que isso: o processo caiu no meio; não reenvia (a mensagem pode ter saído). */
const STALE_SENDING_MS = 10 * 60_000
export { ENVIO_MAX_QUEUE }

export interface EnvioInput {
  clinicId: string
  /** Obrigatório nos modelos de consulta; nulo em aniversario. */
  appointmentId: string | null
  /** Obrigatório em aniversario; nulo nos modelos de consulta. */
  pacienteId: string | null
  modelo: Modelo
  textoModelo: string
  chave: string
  modoTeste: boolean
  numeroTeste: string | null
}

export type ParsedEnvio = { ok: true; value: EnvioInput } | { ok: false; error: string }

export function validateEnvioBody(body: Record<string, unknown>): ParsedEnvio {
  if (!isUuid(body.clinicId)) return { ok: false, error: 'clinicId inválido.' }
  if (typeof body.modelo !== 'string' || !(MODELOS as readonly string[]).includes(body.modelo)) {
    return { ok: false, error: `modelo inválido. Use: ${MODELOS.join(', ')}.` }
  }
  const modelo = body.modelo as Modelo
  let appointmentId: string | null = null
  let pacienteId: string | null = null
  if (modelo === 'aniversario') {
    if (!isUuid(body.pacienteId)) return { ok: false, error: 'pacienteId inválido (obrigatório no modelo aniversario).' }
    pacienteId = body.pacienteId
  } else {
    if (!isUuid(body.appointmentId)) return { ok: false, error: 'appointmentId inválido.' }
    appointmentId = body.appointmentId
  }
  if (typeof body.textoModelo !== 'string' || body.textoModelo.trim() === '' || body.textoModelo.length > TEXTO_MODELO_MAX) {
    return { ok: false, error: `textoModelo deve ser um texto de 1 a ${TEXTO_MODELO_MAX} caracteres.` }
  }
  if (typeof body.chave !== 'string' || !CHAVE_RE.test(body.chave)) {
    return { ok: false, error: 'chave deve ter de 8 a 200 caracteres (letras, números e : _ . | -).' }
  }
  if (body.modoTeste !== undefined && typeof body.modoTeste !== 'boolean') {
    return { ok: false, error: 'modoTeste deve ser booleano.' }
  }
  if (body.numeroTeste !== undefined && body.numeroTeste !== null && typeof body.numeroTeste !== 'string') {
    return { ok: false, error: 'numeroTeste deve ser texto.' }
  }
  const modoTeste = body.modoTeste === true
  // O prefixo "teste:" é reservado aos envios em modo teste (a chave deles é prefixada aqui): uma chave de
  // produção com esse prefixo escaparia da conta de pausa e de aquecimento.
  if (!modoTeste && body.chave.startsWith(TEST_KEY_PREFIX)) {
    return { ok: false, error: `chave não pode começar com "${TEST_KEY_PREFIX}" fora do modo teste.` }
  }
  const numeroTeste = typeof body.numeroTeste === 'string' && body.numeroTeste.trim() !== '' ? body.numeroTeste.trim() : null
  // Modo teste sem um número utilizável NUNCA cai para o paciente real.
  if (modoTeste && (!numeroTeste || whatsappCandidates(numeroTeste).length === 0)) {
    return { ok: false, error: 'modoTeste exige numeroTeste com um telefone brasileiro válido.' }
  }
  return {
    ok: true,
    value: {
      clinicId: body.clinicId, appointmentId, pacienteId, modelo,
      textoModelo: body.textoModelo, chave: body.chave, modoTeste, numeroTeste: modoTeste ? numeroTeste : null,
    },
  }
}

export interface EnvioResult { status: number; body: Record<string, unknown> }

export const done = (status: number, body: Record<string, unknown>): EnvioResult => ({ status, body })
export const skip = (motivo: string, extra: Record<string, unknown> = {}): EnvioResult => done(200, { ok: true, enviado: false, motivo, ...extra })

interface WaRow {
  clinic_id: string
  instance_name: string
  status: string
  timezone: string
  automacao_gerenciada: boolean | null
}

interface ApptRow {
  id: string
  status: string
  scheduled_at: string
  patients: { name: string; phone: string | null } | null
  professionals: { name: string } | null
}

/** Quem recebe e o que a mensagem diz respeito. */
interface Alvo {
  nome: string
  telefone: string | null
  /** Data da consulta (modelos de consulta) ou o próprio momento do envio (aniversario). */
  quando: Date
  profissional: string | null
}

interface EnvioRow { id: string; clinic_id: string; status: string; erro: string | null; atualizado_em: string }

function eligible(modelo: Exclude<Modelo, 'aniversario'>, a: ApptRow, now: Date): string | null {
  const future = new Date(a.scheduled_at).getTime() > now.getTime()
  switch (modelo) {
    case 'lembrete_vespera':
      return (a.status === 'agendado' || a.status === 'confirmado') && future ? null : 'consulta_nao_elegivel'
    case 'confirmacao_dia':
      if (a.status === 'confirmado') return 'ja_confirmada'
      return a.status === 'agendado' && future ? null : 'consulta_nao_elegivel'
    case 'quem_faltou':
      return a.status === 'faltou' ? null : 'consulta_nao_elegivel'
  }
}

/** Dia de hoje no fuso da clínica (fuso inválido cai para o de Brasília). */
function todayIn(timezone: string, now: Date): { y: number; m: number; d: number } {
  let p
  try { p = zonedParts(now, timezone) } catch { p = zonedParts(now, 'America/Sao_Paulo') }
  return { y: p.y, m: p.m, d: p.d }
}

export async function enviarAutomacao(clinic: AutomacaoClinic, input: EnvioInput, now: Date = new Date()): Promise<EnvioResult> {
  const admin = getAdminClient()
  const clinicId = clinic.id

  // 1) demonstração nunca envia, nem em modo teste
  if (await isDemoClinic(clinicId)) return done(403, { error: DEMO_SEND_BLOCKED_MESSAGE })

  // 2) WhatsApp conectado e automação habilitada (ou modo teste, que só fala com o número de teste)
  const { data: waRaw, error: waErr } = await admin
    .from('clinic_whatsapp')
    .select('clinic_id, instance_name, status, timezone, automacao_gerenciada')
    .eq('clinic_id', clinicId)
    .maybeSingle()
  if (waErr) {
    console.error('[automacao/enviar] leitura de clinic_whatsapp falhou:', waErr.code ?? 'sem código')
    return done(500, { error: 'Erro ao ler a conexão do WhatsApp.' })
  }
  const wa = waRaw as WaRow | null
  if (!wa || wa.status !== 'conectado') return done(409, { error: 'O WhatsApp da clínica não está conectado.', codigo: 'whatsapp_desconectado' })
  if (wa.automacao_gerenciada !== true && !input.modoTeste) {
    return done(409, { error: 'A automação não está habilitada para esta clínica.', codigo: 'automacao_nao_habilitada' })
  }

  // 3) o alvo é desta clínica e está no estado certo para o modelo
  let alvo: Alvo
  if (input.modelo === 'aniversario') {
    const { data: patRaw, error: patErr } = await admin
      .from('patients')
      .select('id, name, phone, birth_date, is_active')
      .eq('id', input.pacienteId!)
      .eq('clinic_id', clinicId)
      .maybeSingle()
    if (patErr) {
      console.error('[automacao/enviar] leitura do paciente falhou:', patErr.code ?? 'sem código')
      return done(500, { error: 'Erro ao ler o paciente.' })
    }
    const pat = patRaw as { name: string; phone: string | null; birth_date: string | null; is_active: boolean | null } | null
    if (!pat) return done(404, { error: 'Paciente não encontrado.' })
    if (pat.is_active !== true) return skip('paciente_inativo')
    if (!pat.birth_date || !birthdayMatches(pat.birth_date, todayIn(wa.timezone, now))) return skip('nao_e_aniversario')
    alvo = { nome: pat.name, telefone: pat.phone, quando: now, profissional: null }
  } else {
    const { data: apptRaw, error: apptErr } = await admin
      .from('appointments')
      .select('id, status, scheduled_at, patients(name, phone), professionals(name)')
      .eq('id', input.appointmentId!)
      .eq('clinic_id', clinicId)
      .maybeSingle()
    if (apptErr) {
      console.error('[automacao/enviar] leitura da consulta falhou:', apptErr.code ?? 'sem código')
      return done(500, { error: 'Erro ao ler a consulta.' })
    }
    const appt = apptRaw as unknown as ApptRow | null
    if (!appt) return done(404, { error: 'Consulta não encontrada.' })
    if (!appt.patients) return done(422, { error: 'A consulta não tem paciente.', codigo: 'sem_paciente' })
    const notEligible = eligible(input.modelo, appt, now)
    if (notEligible) return skip(notEligible)
    alvo = { nome: appt.patients.name, telefone: appt.patients.phone, quando: new Date(appt.scheduled_at), profissional: appt.professionals?.name ?? null }
  }

  // 4) quem pediu PARAR nunca recebe automação (confere o destino real da mensagem, por telefone e por lid)
  const destinationKeys = input.modoTeste ? [phoneKey(input.numeroTeste)] : phoneKeys(alvo.telefone)
  try {
    if (await isOptedOut(clinicId, destinationKeys)) return skip('opt_out')
  } catch (e) {
    console.error('[automacao/enviar] leitura de opt-out falhou:', e instanceof Error ? e.message : 'erro')
    return done(500, { error: 'Não foi possível conferir as preferências do contato.' })
  }

  // 5) idempotência: a chave é única; quem já enviou (ou está enviando) não envia de novo.
  // Envio em modo teste usa chave própria ("teste:..."), para nunca ocupar a chave de produção nem contar no aquecimento.
  const chave = input.modoTeste ? `${TEST_KEY_PREFIX}${input.chave}` : input.chave
  const reserved = await reserveKey(clinicId, {
    chave, funcao: input.modelo, appointmentId: input.appointmentId, pacienteId: input.pacienteId,
  }, now)
  if ('result' in reserved) return reserved.result
  const envioId = reserved.id

  const closeEnvio = (status: 'falhou' | 'ignorado', erro: string) =>
    admin.from('automacao_envios').update({ status, erro, atualizado_em: new Date().toISOString() }).eq('id', envioId)
  const releaseConfirmation = async (id: string | null) => {
    if (id) await admin.from('appointment_confirmations').delete().eq('id', id)
  }
  const releaseAll = async (confirmationId: string | null) => {
    await releaseConfirmation(confirmationId)
    await admin.from('automacao_envios').delete().eq('id', envioId)
  }

  // 6) número que existe no WhatsApp (o cadastro pode estar sem o nono dígito, com DDI, etc.)
  const candidates = whatsappCandidates(input.modoTeste ? input.numeroTeste : alvo.telefone)
  if (candidates.length === 0) {
    await closeEnvio('falhou', 'telefone_invalido')
    return done(422, { error: 'O paciente não tem um telefone válido cadastrado.', codigo: 'telefone_invalido' })
  }

  // 7) portão do número, fila do ritmo e portão de novo. Qualquer exceção aqui libera as reservas.
  let confirmationId: string | null = null
  try {
    // pausa, aquecimento, fila do ritmo e portão de novo depois da espera (ver portao.ts)
    const bloqueio = await portaoDoNumero(wa, envioId, now)
    if (bloqueio) { await releaseAll(null); return skip(bloqueio, { tentarNovamente: true }) }

    // confirmação do dia: a UNIQUE de appointment_confirmations impede dois envios para a mesma consulta e horário
    if (input.modelo === 'confirmacao_dia' && !input.modoTeste) {
      const { data: ins, error: insErr } = await admin
        .from('appointment_confirmations')
        .upsert(
          { clinic_id: clinicId, appointment_id: input.appointmentId, kind: 'confirmacao', appointment_at: alvo.quando.toISOString(), status: 'enviando' },
          { onConflict: 'appointment_id,kind,appointment_at', ignoreDuplicates: true },
        )
        .select('id')
      if (insErr) {
        console.error('[automacao/enviar] reserva da confirmação falhou:', insErr.code ?? 'sem código')
        await releaseAll(null)
        return done(502, { error: 'Não foi possível reservar a confirmação.', codigo: 'reserva_falhou', tentarNovamente: true })
      }
      confirmationId = (ins?.[0]?.id as string | undefined) ?? null
      if (!confirmationId) {
        // outra rotina já enviou a confirmação desta consulta e horário: não é falha de envio
        await closeEnvio('ignorado', 'confirmacao_ja_enviada')
        return skip('confirmacao_ja_enviada')
      }
    }
  } catch (e) {
    console.error('[automacao/enviar] portão/ritmo falhou:', e instanceof Error ? e.name : 'erro')
    await releaseAll(confirmationId)
    return done(502, { error: 'Não foi possível preparar o envio.', codigo: 'preparo_falhou', tentarNovamente: true })
  }

  const closeConfirmation = (patch: Record<string, unknown>) =>
    confirmationId
      ? admin.from('appointment_confirmations').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', confirmationId)
      : Promise.resolve()

  try {
    const found = (await checkNumbers(wa.instance_name, candidates)).find(c => c.exists)
    if (!found) {
      await releaseConfirmation(confirmationId)
      await closeEnvio('falhou', 'sem_whatsapp')
      return done(422, { error: 'Esse número não foi encontrado no WhatsApp.', codigo: 'sem_whatsapp' })
    }
    const to = found.jid?.split('@')[0] ?? found.number
    const jid = found.jid ?? `${to}@s.whatsapp.net`

    // 8) o texto é montado aqui, com os dados do paciente
    const text = renderMessage(input.textoModelo, {
      paciente: alvo.nome ?? '',
      clinica: clinic.name,
      profissional: alvo.profissional,
      appointmentAt: alvo.quando,
      now,
      timezone: wa.timezone,
    }, { askReply: input.modelo === 'confirmacao_dia' })

    const sent = await sendText(wa.instance_name, to, text)

    // 9) registros (não podem derrubar um envio que já saiu)
    if (!input.modoTeste) {
      try {
        await recordOutgoing({ clinicId, jid, text, providerMessageId: sent.messageId, origin: 'automatico' })
      } catch (e) {
        console.warn('[automacao/enviar] não foi possível registrar a mensagem na conversa', e instanceof Error ? e.name : 'erro')
      }
    }
    const sentAt = new Date().toISOString()
    await closeConfirmation({
      status: 'enviado', to_jid: jid, phone_key: phoneKey(alvo.telefone), provider_message_id: sent.messageId,
      sent_at: sentAt, answered_at: null, error: null,
    })
    await admin.from('automacao_envios')
      .update({ status: 'enviado', erro: null, enviado_em: sentAt, atualizado_em: sentAt })
      .eq('id', envioId)
    return done(200, { ok: true, enviado: true, modelo: input.modelo, modoTeste: input.modoTeste })
  } catch (e) {
    // A Evolution não conhece a instância: a clínica está desconectada. Não é falha do paciente:
    // libera tudo (volta a ser enviável ao reconectar) e marca a clínica como desconectada.
    if (e instanceof EvolutionError && e.status === 404) {
      await releaseAll(confirmationId)
      await admin.from('clinic_whatsapp')
        .update({ status: 'desconectado', phone_number: null, connected_at: null, status_changed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('clinic_id', clinicId)
      return done(409, { error: 'O WhatsApp da clínica foi desconectado.', codigo: 'whatsapp_desconectado' })
    }
    await releaseConfirmation(confirmationId)
    if (e instanceof EvolutionError && e.status >= 500) {
      await closeEnvio('falhou', RETRYABLE_ERROR)
      return done(502, { error: 'O WhatsApp demorou para responder.', codigo: 'whatsapp_instavel', tentarNovamente: true })
    }
    // detalhe só no log do servidor e sem texto da mensagem; na tabela fica só um código
    const code = e instanceof EvolutionError ? `evolution_${e.status}` : 'erro_envio'
    console.error('[automacao/enviar] envio falhou:', code)
    await closeEnvio('falhou', code)
    return done(502, { error: 'Não foi possível enviar a mensagem.', codigo: code })
  }
}

export interface ReserveInput {
  chave: string
  funcao: string
  appointmentId: string | null
  pacienteId: string | null
}

/**
 * Reserva a chave de idempotência. Devolve o id da linha reservada, ou o resultado pronto quando a chave
 * já foi usada (enviada, em andamento, falha anterior) ou pertence a outra clínica.
 */
export async function reserveKey(clinicId: string, input: ReserveInput, now: Date): Promise<{ id: string } | { result: EnvioResult }> {
  const admin = getAdminClient()
  const { data: ins, error } = await admin
    .from('automacao_envios')
    .upsert(
      {
        chave_idempotencia: input.chave, clinic_id: clinicId, funcao: input.funcao,
        appointment_id: input.appointmentId, paciente_id: input.pacienteId, status: 'enviando',
      },
      { onConflict: 'chave_idempotencia', ignoreDuplicates: true },
    )
    .select('id')
  if (error) {
    console.error('[automacao/enviar] reserva da chave falhou:', error.code ?? 'sem código')
    return { result: done(500, { error: 'Erro ao registrar o envio.' }) }
  }
  const id = ins?.[0]?.id as string | undefined
  if (id) return { id }

  const { data: existingRaw } = await admin
    .from('automacao_envios')
    .select('id, clinic_id, status, erro, atualizado_em')
    .eq('chave_idempotencia', input.chave)
    .maybeSingle()
  const existing = existingRaw as EnvioRow | null
  // chave de outra clínica: não revela nada sobre ela
  if (!existing || existing.clinic_id !== clinicId) return { result: done(409, { error: 'Chave de idempotência já usada.', codigo: 'chave_em_uso' }) }

  if (existing.status === 'enviado') return { result: skip('ja_enviado') }
  if (existing.status === 'ignorado') return { result: skip(existing.erro ?? 'ignorado') }

  if (existing.status === 'falhou') {
    if (existing.erro !== RETRYABLE_ERROR) return { result: skip('falha_anterior', { erro: existing.erro }) }
    // falha passageira: só quem conseguir tirar a linha de 'falhou' reenvia
    const { data: claimed } = await admin
      .from('automacao_envios')
      .update({ status: 'enviando', erro: null, atualizado_em: now.toISOString() })
      .eq('id', existing.id)
      .eq('status', 'falhou')
      .eq('erro', RETRYABLE_ERROR)
      .select('id')
    const claimedId = claimed?.[0]?.id as string | undefined
    return claimedId ? { id: claimedId } : { result: skip('em_andamento') }
  }

  // 'enviando': outra chamada está enviando agora, ou o processo caiu no meio
  if (now.getTime() - new Date(existing.atualizado_em).getTime() > STALE_SENDING_MS) {
    await admin.from('automacao_envios')
      .update({ status: 'falhou', erro: 'interrompido', atualizado_em: now.toISOString() })
      .eq('id', existing.id)
      .eq('status', 'enviando')
    return { result: skip('falha_anterior', { erro: 'interrompido' }) }
  }
  return { result: skip('em_andamento') }
}
