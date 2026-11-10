// Rotina de envio das confirmações/lembretes. Só no servidor (service role).
// Chamada a cada poucos minutos por um agendador externo (ver rota run-confirmations).
//
// Segurança contra envio duplicado: antes de enviar, grava a linha em
// appointment_confirmations com status 'enviando'. A UNIQUE (appointment_id, kind,
// appointment_at) faz só UMA execução conseguir gravar; as outras pulam. Se a
// consulta for remarcada, o horário muda e nasce uma linha nova.
//
// Cuidados com o número da clínica (ver safety.ts): aquecimento de número novo ou parado,
// pausa quando os envios começam a falhar e intervalo aleatório entre um envio e outro.

import { getAdminClient } from '@/lib/supabaseAdmin'
import { demoClinicIds, isDemoClinic, DEMO_SEND_BLOCKED_MESSAGE } from '@/lib/demoGuard'
import { checkNumbers, sendText, EvolutionError } from './evolution'
import { phoneKey, whatsappCandidates } from './phone'
import { renderMessage } from './message'
import { recordOutgoing } from './conversations'
import {
  plannedSends, decideSend, lookaheadLimit, startOfLocalDay,
  type SendSettings, type ConfirmKind, type SkipReason,
} from './window'
import {
  warmupStart, warmupDailyLimit, isPaused, isRetryable, sendGapMs,
  ACTIVITY_LOOKBACK_MS, ACTIVITY_SAMPLE_LIMIT, MAX_CONSECUTIVE_FAILURES, PAUSE_WINDOW_MS, RETRYABLE_ERROR,
  type FailureRow,
} from './safety'

const MAX_SENDS_PER_CLINIC_PER_RUN = 10
const RUN_BUDGET_MS = 4 * 60_000
const STALE_SENDING_MS = 10 * 60_000
/** Clínicas atendidas ao mesmo tempo: cada uma envia pelo próprio número, no próprio ritmo. */
const CLINIC_CONCURRENCY = 5

interface WaRow {
  clinic_id: string
  instance_name: string
  confirm_mode: SendSettings['mode']
  vespera_send_time: string
  no_dia_hours_before: number
  send_window_start: string
  send_window_end: string
  late_booking_policy: SendSettings['lateBookingPolicy']
  timezone: string
  message_template: string
}

interface ApptRow {
  id: string
  status: string
  scheduled_at: string
  created_at: string
  patients: { name: string; phone: string | null } | null
  professionals: { name: string } | null
}

export interface RunOptions { dryRun?: boolean; now?: Date }

export interface ClinicRunResult {
  clinicId: string
  planned: number
  sent: number
  skipped: Partial<Record<SkipReason | 'ja_enviada' | 'sem_telefone' | 'sem_whatsapp' | 'limite_da_rodada' | 'desconectada' | 'pausada' | 'aquecimento' | 'muitas_falhas', number>>
  failed: number
  /** Presente só enquanto o número está em aquecimento. */
  warmup?: { limit: number; sentToday: number }
  paused?: boolean
}

export interface RunResult { dryRun: boolean; clinics: ClinicRunResult[]; staleClosed: number }

const hhmm = (t: string) => t.slice(0, 5)

function settingsFrom(r: WaRow): SendSettings {
  return {
    mode: r.confirm_mode,
    vesperaSendTime: hhmm(r.vespera_send_time),
    noDiaHoursBefore: r.no_dia_hours_before,
    windowStart: hhmm(r.send_window_start),
    windowEnd: hhmm(r.send_window_end),
    lateBookingPolicy: r.late_booking_policy,
    timezone: r.timezone,
  }
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))

/** Erro de rede/servidor da Evolution: vale tentar de novo na próxima rodada. */
const isTransient = (e: unknown) =>
  e instanceof EvolutionError && (e.status === 502 || e.status === 504 || e.status === 503 || e.status >= 500)

export async function runConfirmations(opts: RunOptions = {}): Promise<RunResult> {
  const now = opts.now ?? new Date()
  const dryRun = !!opts.dryRun
  const admin = getAdminClient()
  const started = Date.now()

  // Linhas presas em 'enviando' (processo caiu no meio): fecha como falha, sem reenviar,
  // porque a mensagem pode ter saído e reenviar duplicaria. Conta a partir de updated_at:
  // uma linha antiga que voltou a 'enviando' para nova tentativa não é presa.
  let staleClosed = 0
  if (!dryRun) {
    const { data: stale } = await admin
      .from('appointment_confirmations')
      .update({ status: 'falhou', error: 'interrompido', updated_at: now.toISOString() })
      .eq('status', 'enviando')
      .lt('updated_at', new Date(now.getTime() - STALE_SENDING_MS).toISOString())
      .select('id')
    staleClosed = stale?.length ?? 0
  }

  const { data: waRows } = await admin
    .from('clinic_whatsapp')
    .select('clinic_id, instance_name, confirm_mode, vespera_send_time, no_dia_hours_before, send_window_start, send_window_end, late_booking_policy, timezone, message_template')
    .eq('confirm_enabled', true)
    .eq('status', 'conectado')

  // Algumas clínicas por vez: com o intervalo entre envios, uma fila única deixaria as
  // últimas da lista sem tempo na rodada.
  // Clínica de demonstração nunca envia mensagem real, mesmo que o WhatsApp esteja conectado.
  const allRows = (waRows ?? []) as WaRow[]
  const demoIds = await demoClinicIds(allRows.map(r => r.clinic_id))
  const queue = allRows.filter(r => !demoIds.has(r.clinic_id))
  const clinics: ClinicRunResult[] = []
  const worker = async () => {
    for (let wa = queue.shift(); wa; wa = queue.shift()) {
      if (Date.now() - started > RUN_BUDGET_MS) break
      clinics.push(await runClinic(wa, now, dryRun, started))
    }
  }
  await Promise.all(Array.from({ length: Math.min(CLINIC_CONCURRENCY, queue.length) }, worker))

  return { dryRun, clinics, staleClosed }
}

async function runClinic(wa: WaRow, now: Date, dryRun: boolean, started: number): Promise<ClinicRunResult> {
  const admin = getAdminClient()
  const s = settingsFrom(wa)
  const result: ClinicRunResult = { clinicId: wa.clinic_id, planned: 0, sent: 0, skipped: {}, failed: 0 }
  const skip = (k: keyof ClinicRunResult['skipped']) => { result.skipped[k] = (result.skipped[k] ?? 0) + 1 }

  const { data: clinic } = await admin.from('clinics').select('name').eq('id', wa.clinic_id).maybeSingle()
  const clinicName = (clinic?.name as string | undefined) ?? 'clínica'

  const { data: appts } = await admin
    .from('appointments')
    .select('id, status, scheduled_at, created_at, patients(name, phone), professionals(name)')
    .eq('clinic_id', wa.clinic_id)
    .in('status', ['agendado', 'confirmado'])
    .not('patient_id', 'is', null)
    .gt('scheduled_at', now.toISOString())
    .lt('scheduled_at', lookaheadLimit(now).toISOString())
    .order('scheduled_at', { ascending: true }) // com limite (aquecimento, rodada), as mais próximas primeiro

  const list = (appts ?? []) as unknown as ApptRow[]
  if (list.length === 0) return result

  const { data: existing } = await admin
    .from('appointment_confirmations')
    .select('id, appointment_id, kind, appointment_at, status, error, updated_at')
    .eq('clinic_id', wa.clinic_id)
    .in('appointment_id', list.map(a => a.id))
  const rowByKey = new Map(
    ((existing ?? []) as ExistingRow[]).map(e => [`${e.appointment_id}|${e.kind}|${new Date(e.appointment_at).getTime()}`, e]),
  )

  // pausa e aquecimento só são consultados se houver algo para enviar agora
  let gate: Gate | null = null
  const loadGate = async (): Promise<Gate> => {
    gate ??= await sendingGate(wa, s, now)
    if (gate.paused) result.paused = true
    return gate
  }

  let sentThisRun = 0
  let consecutiveFailures = 0

  outer:
  for (const a of list) {
    const apptAt = new Date(a.scheduled_at)
    const createdAt = new Date(a.created_at)

    for (const planned of plannedSends(apptAt, s)) {
      const kind: ConfirmKind = planned.kind
      // confirmação só para quem ainda não confirmou; lembrete também vai para confirmados
      if (kind === 'confirmacao' && a.status !== 'agendado') continue

      const decision = decideSend({ appointmentAt: apptAt, createdAt, now, planned }, s)
      if (!decision.send) { if (decision.reason) skip(decision.reason); continue }

      const prev = rowByKey.get(`${a.id}|${kind}|${apptAt.getTime()}`)
      // já existe linha: só volta a enviar se falhou por erro passageiro e já deu o tempo de espera
      if (prev && !isRetryable(prev, now)) { skip('ja_enviada'); continue }

      result.planned++

      const g = await loadGate()
      if (g.paused) { skip('pausada'); continue }
      if (g.allowance <= 0) { skip('aquecimento'); continue }
      if (sentThisRun >= MAX_SENDS_PER_CLINIC_PER_RUN || Date.now() - started > RUN_BUDGET_MS) {
        skip('limite_da_rodada'); continue
      }
      if (dryRun) continue

      const outcome = await sendOne(wa, a, apptAt, kind, clinicName, s, now, prev?.id ?? null)
      if (outcome === 'enviada') {
        result.sent++; sentThisRun++; g.allowance--; consecutiveFailures = 0
        await sleep(sendGapMs())
      } else if (outcome === 'sem_telefone' || outcome === 'sem_whatsapp') { result.failed++; skip(outcome) }
      else if (outcome === 'falhou' || outcome === 'adiada') {
        result.failed++
        // o número pode estar sendo recusado: para de insistir nesta rodada
        if (++consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) { skip('muitas_falhas'); break outer }
      }
      else if (outcome === 'desconectada') { skip('desconectada'); break outer }
      // 'duplicada': outra execução pegou esse envio
    }
  }

  const g = gate as Gate | null
  if (g && Number.isFinite(g.limit)) result.warmup = { limit: g.limit, sentToday: g.sentToday }
  return result
}

interface ExistingRow {
  id: string
  appointment_id: string
  kind: ConfirmKind
  appointment_at: string
  status: string
  error: string | null
  updated_at: string
}

interface Gate { paused: boolean; allowance: number; limit: number; sentToday: number }

/** Pausa por falhas recentes e quantos envios o aquecimento ainda permite hoje. */
async function sendingGate(wa: WaRow, s: SendSettings, now: Date): Promise<Gate> {
  const admin = getAdminClient()

  const [failuresRes, activityRes] = await Promise.all([
    admin.from('appointment_confirmations')
      .select('error, updated_at')
      .eq('clinic_id', wa.clinic_id)
      .eq('status', 'falhou')
      .gte('updated_at', new Date(now.getTime() - PAUSE_WINDOW_MS).toISOString()),
    // qualquer mensagem enviada pelo número (rotina, recepção pelo sistema ou pelo celular)
    admin.from('whatsapp_messages')
      .select('created_at')
      .eq('clinic_id', wa.clinic_id)
      .eq('direction', 'out')
      .gte('created_at', new Date(now.getTime() - ACTIVITY_LOOKBACK_MS).toISOString())
      .order('created_at', { ascending: false })
      .limit(ACTIVITY_SAMPLE_LIMIT),
  ])

  const paused = isPaused((failuresRes.data ?? []) as FailureRow[], now)
  // sem conseguir ler o histórico, segue sem limite em vez de travar a clínica
  if (activityRes.error) return { paused, allowance: Infinity, limit: Infinity, sentToday: 0 }

  const outgoing = (activityRes.data ?? []).map(r => new Date(r.created_at as string))
  const limit = warmupDailyLimit(warmupStart(outgoing, now, outgoing.length >= ACTIVITY_SAMPLE_LIMIT), now)
  if (limit === null) return { paused, allowance: Infinity, limit: Infinity, sentToday: 0 }

  const { count } = await admin.from('appointment_confirmations')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', wa.clinic_id)
    .gte('sent_at', startOfLocalDay(now, s.timezone).toISOString())
  const sentToday = count ?? 0
  return { paused, allowance: Math.max(0, limit - sentToday), limit, sentToday }
}

type SendOutcome = 'enviada' | 'duplicada' | 'adiada' | 'desconectada' | 'sem_telefone' | 'sem_whatsapp' | 'falhou'

async function sendOne(
  wa: WaRow, a: ApptRow, apptAt: Date, kind: ConfirmKind, clinicName: string, s: SendSettings, now: Date,
  retryId: string | null,
): Promise<SendOutcome> {
  const admin = getAdminClient()
  const base = { clinic_id: wa.clinic_id, appointment_id: a.id, kind, appointment_at: apptAt.toISOString() }

  let id: string | undefined
  if (retryId) {
    // nova tentativa: só quem conseguir tirar a linha de 'falhou' envia
    const { data: claimed } = await admin
      .from('appointment_confirmations')
      .update({ status: 'enviando', error: null, updated_at: new Date().toISOString() })
      .eq('id', retryId)
      .eq('status', 'falhou')
      .eq('error', RETRYABLE_ERROR)
      .select('id')
    id = claimed?.[0]?.id as string | undefined
  } else {
    // reserva o envio (a UNIQUE decide quem ganha)
    const { data: reserved } = await admin
      .from('appointment_confirmations')
      .upsert({ ...base, status: 'enviando' }, { onConflict: 'appointment_id,kind,appointment_at', ignoreDuplicates: true })
      .select('id')
    id = reserved?.[0]?.id as string | undefined
  }
  if (!id) return 'duplicada'

  return deliver(id, wa, a, apptAt, kind, clinicName, s, now, 'apagar')
}

/**
 * Valida o número, monta e envia a mensagem de uma reserva já criada, e fecha a linha.
 * Erro passageiro da Evolution: a linha fica 'falhou' / tentar_novamente (conta para a pausa)
 * e a rotina tenta de novo depois de RETRY_BACKOFF_MS.
 * `onDisconnected`: Evolution não conhece a instância → 'apagar' a reserva (rotina) ou
 * 'marcar' como falha (envio manual: quem clicou vê o erro e decide).
 */
async function deliver(
  id: string, wa: WaRow, a: ApptRow, apptAt: Date, kind: ConfirmKind, clinicName: string,
  s: SendSettings, now: Date, onDisconnected: 'apagar' | 'marcar',
): Promise<SendOutcome> {
  const admin = getAdminClient()
  const close = (patch: Record<string, unknown>) =>
    admin.from('appointment_confirmations').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  const release = () => admin.from('appointment_confirmations').delete().eq('id', id)

  try {
    // telefone → número que existe no WhatsApp
    const candidates = whatsappCandidates(a.patients?.phone)
    if (candidates.length === 0) { await close({ status: 'falhou', error: 'telefone_invalido' }); return 'sem_telefone' }

    const found = (await checkNumbers(wa.instance_name, candidates)).find(c => c.exists)
    if (!found) { await close({ status: 'falhou', error: 'sem_whatsapp' }); return 'sem_whatsapp' }
    const to = found.jid?.split('@')[0] ?? found.number

    const text = renderMessage(wa.message_template, {
      paciente: a.patients?.name ?? '',
      clinica: clinicName,
      profissional: a.professionals?.name ?? null,
      appointmentAt: apptAt,
      now,
      timezone: s.timezone,
    }, { askReply: kind === 'confirmacao' })

    const sent = await sendText(wa.instance_name, to, text)

    // fica na conversa do paciente, marcada como mensagem automática (não pode derrubar o envio)
    try {
      await recordOutgoing({ clinicId: wa.clinic_id, jid: found.jid ?? `${to}@s.whatsapp.net`, text, providerMessageId: sent.messageId, origin: 'automatico' })
    } catch (e) {
      console.warn('[whatsapp] não foi possível registrar a mensagem na conversa', e instanceof Error ? e.message : e)
    }

    await close({
      status: 'enviado',
      to_jid: found.jid ?? `${to}@s.whatsapp.net`,
      phone_key: phoneKey(a.patients?.phone),
      provider_message_id: sent.messageId,
      sent_at: new Date().toISOString(),
      answered_at: null,
      error: null,
    })
    return 'enviada'
  } catch (e) {
    // A Evolution não conhece a instância: a clínica está desconectada. Não é falha do paciente:
    // libera a reserva (volta a ser enviável quando reconectar), marca a clínica como
    // desconectada e a rotina para de tentar por ela.
    if (e instanceof EvolutionError && e.status === 404) {
      // rotina: apaga a reserva (volta a ser enviável ao reconectar); envio manual: a linha já existia
      // e tem histórico, então fica registrada como não enviada em vez de sumir
      if (onDisconnected === 'apagar') await release()
      else await close({ status: 'falhou', error: 'whatsapp_desconectado' })
      await admin.from('clinic_whatsapp')
        .update({ status: 'desconectado', phone_number: null, connected_at: null, status_changed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('clinic_id', wa.clinic_id)
      return 'desconectada'
    }
    if (isTransient(e)) {
      await close({ status: 'falhou', error: RETRYABLE_ERROR })
      return 'adiada'
    }
    await close({ status: 'falhou', error: e instanceof Error ? e.message.slice(0, 200) : 'erro' })
    return 'falhou'
  }
}

// ── envio manual (botão "Enviar confirmação agora" na Agenda) ───────────────

export type ManualResult = { ok: true; kind: ConfirmKind } | { ok: false; status: number; error: string }

/**
 * Envia agora, ignorando janela e horário planejado. Serve para reenviar quando o paciente diz
 * que não recebeu. Se já existe linha para essa consulta/horário, ela é reaproveitada (a UNIQUE
 * impede uma segunda); agendada recebe pedido de confirmação, confirmada recebe só um lembrete.
 */
export async function sendConfirmationNow(clinicId: string, appointmentId: string): Promise<ManualResult> {
  if (await isDemoClinic(clinicId)) return { ok: false, status: 403, error: DEMO_SEND_BLOCKED_MESSAGE }
  const admin = getAdminClient()
  const now = new Date()

  const { data: waRaw } = await admin
    .from('clinic_whatsapp')
    .select('clinic_id, instance_name, status, confirm_mode, vespera_send_time, no_dia_hours_before, send_window_start, send_window_end, late_booking_policy, timezone, message_template')
    .eq('clinic_id', clinicId)
    .maybeSingle()
  const wa = waRaw as (WaRow & { status: string }) | null
  if (!wa || wa.status !== 'conectado') {
    return { ok: false, status: 409, error: 'O WhatsApp da clínica não está conectado.' }
  }

  const { data: apptRaw } = await admin
    .from('appointments')
    .select('id, status, scheduled_at, created_at, patients(name, phone), professionals(name)')
    .eq('id', appointmentId)
    .eq('clinic_id', clinicId)
    .maybeSingle()
  const a = apptRaw as unknown as ApptRow | null
  if (!a) return { ok: false, status: 404, error: 'Consulta não encontrada.' }
  if (a.status !== 'agendado' && a.status !== 'confirmado') {
    return { ok: false, status: 409, error: 'Só dá para enviar para consultas agendadas ou confirmadas.' }
  }
  const apptAt = new Date(a.scheduled_at)
  if (apptAt.getTime() <= now.getTime()) {
    return { ok: false, status: 409, error: 'Essa consulta já passou.' }
  }
  if (!a.patients) return { ok: false, status: 409, error: 'A consulta não tem paciente.' }

  const kind: ConfirmKind = a.status === 'agendado' ? 'confirmacao' : 'lembrete'
  const base = { clinic_id: clinicId, appointment_id: a.id, kind, appointment_at: apptAt.toISOString() }

  // Compara o instante no código (ms), não por igualdade no banco: o Postgres guarda microssegundos,
  // o JavaScript só milissegundos, e uma igualdade exata deixaria de achar a linha que já existe.
  const { data: rows } = await admin
    .from('appointment_confirmations')
    .select('id, status, appointment_at')
    .eq('appointment_id', a.id).eq('kind', kind)
  const existing = (rows ?? []).find(r => new Date(r.appointment_at as string).getTime() === apptAt.getTime()) ?? null

  let id: string
  if (existing) {
    if (existing.status === 'enviando') return { ok: false, status: 409, error: 'Já tem um envio em andamento para essa consulta.' }
    id = existing.id as string
    await admin.from('appointment_confirmations')
      .update({ status: 'enviando', error: null, answered_at: null, updated_at: now.toISOString() })
      .eq('id', id)
  } else {
    const { data: ins } = await admin.from('appointment_confirmations')
      .upsert({ ...base, status: 'enviando' }, { onConflict: 'appointment_id,kind,appointment_at', ignoreDuplicates: true })
      .select('id')
    const newId = ins?.[0]?.id as string | undefined
    if (!newId) return { ok: false, status: 409, error: 'Já tem um envio em andamento para essa consulta.' }
    id = newId
  }

  const { data: clinic } = await admin.from('clinics').select('name').eq('id', clinicId).maybeSingle()
  const outcome = await deliver(id, wa, a, apptAt, kind, (clinic?.name as string | undefined) ?? 'clínica', settingsFrom(wa), now, 'marcar')

  switch (outcome) {
    case 'enviada': return { ok: true, kind }
    case 'sem_telefone': return { ok: false, status: 422, error: 'O paciente não tem um telefone válido cadastrado.' }
    case 'sem_whatsapp': return { ok: false, status: 422, error: 'Esse número não foi encontrado no WhatsApp.' }
    case 'desconectada': return { ok: false, status: 409, error: 'O WhatsApp da clínica foi desconectado. Conecte de novo em Configurações.' }
    case 'adiada': return { ok: false, status: 502, error: 'O WhatsApp demorou para responder. Tente de novo.' }
    default: return { ok: false, status: 500, error: 'Não foi possível enviar. Tente de novo.' }
  }
}
