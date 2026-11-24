// Operações das rotas /api/automacao/* que não enviam mensagem (consultas, marcar confirmada, avisar recepção,
// aniversariantes). Só no servidor (service role): TODA consulta ao banco é escopada por clinic_id.
//
// Nenhuma resposta daqui carrega nome, telefone ou CPF de paciente. O único lugar onde o nome do paciente é
// usado é o texto do aviso para a recepção, que fica gravado na própria clínica (automacao_notificacoes).

import { getAdminClient } from '@/lib/supabaseAdmin'
import { zonedParts } from '@/lib/whatsapp/window'

export class OperacaoError extends Error {
  constructor(message: string, public status: number, public codigo?: string) { super(message) }
}

// ─── Consultas por janela ────────────────────────────────────────────────────

export const CONSULTA_STATUSES = ['agendado', 'confirmado', 'cancelado', 'concluido', 'faltou', 'arrived', 'in_progress'] as const
export const CONSULTAS_JANELA_MAX_DIAS = 31
export const CONSULTAS_MAX = 1000

export interface ConsultasQuery { de: Date; ate: Date; status: string[] }

const parseInstant = (v: string | null): Date | null => {
  if (!v || !/^\d{4}-\d{2}-\d{2}T/.test(v)) return null
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : new Date(t)
}

/** `de` e `ate` em ISO com fuso (ex.: 2026-11-18T00:00:00-03:00); `ate` exclusivo; janela de até 31 dias. */
export function parseConsultasQuery(sp: URLSearchParams): { ok: true; value: ConsultasQuery } | { ok: false; error: string } {
  const de = parseInstant(sp.get('de'))
  const ate = parseInstant(sp.get('ate'))
  if (!de || !ate) return { ok: false, error: 'Informe de e ate em ISO 8601 com fuso (ex.: 2026-11-18T00:00:00-03:00).' }
  if (ate.getTime() <= de.getTime()) return { ok: false, error: 'ate deve ser depois de de.' }
  if (ate.getTime() - de.getTime() > CONSULTAS_JANELA_MAX_DIAS * 86_400_000) {
    return { ok: false, error: `A janela máxima é de ${CONSULTAS_JANELA_MAX_DIAS} dias.` }
  }
  const raw = sp.get('status')
  const list = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : ['agendado', 'confirmado']
  const bad = list.filter(s => !(CONSULTA_STATUSES as readonly string[]).includes(s))
  if (list.length === 0 || bad.length > 0) return { ok: false, error: `status inválido. Use: ${CONSULTA_STATUSES.join(', ')}.` }
  return { ok: true, value: { de, ate, status: [...new Set(list)] } }
}

/**
 * LIMITAÇÃO CONHECIDA (conferida em information_schema.columns, 2026-11-17): `appointments` NÃO tem coluna de
 * "status atualizado em" (nem updated_at). As únicas datas de transição são arrived_at, called_at, started_at e
 * finished_at, que cobrem só chegada, chamada, início e fim do atendimento, e não "confirmado", "faltou" nem
 * "cancelado". Por isso `statusAtualizadoEm` NÃO é devolvido: usar created_at ou scheduled_at seria inventar o dado.
 * Para o n8n saber QUANDO o paciente confirmou, use `confirmacao.respondidaEm`. Se a data de mudança de status for
 * necessária, exige DDL (coluna + gatilho) em migração própria, a cargo do mc-db.
 */
export interface ConsultaOut {
  id: string
  horario: string
  status: string
  procedimento: string | null
  profissionalId: string | null
  profissional: string | null
  /** Última confirmação enviada para esta consulta e horário (para o fluxo "sem resposta"). */
  confirmacao: { status: string; enviadaEm: string | null; respondidaEm: string | null } | null
}

interface ApptRow {
  id: string
  status: string
  scheduled_at: string
  procedure_name: string | null
  professional_id: string | null
  professionals: { name: string } | null
}

export async function listarConsultas(clinicId: string, q: ConsultasQuery): Promise<{ consultas: ConsultaOut[]; truncado: boolean }> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('appointments')
    .select('id, status, scheduled_at, procedure_name, professional_id, professionals(name)')
    .eq('clinic_id', clinicId)
    .not('patient_id', 'is', null) // bloqueios de agenda não têm paciente
    .in('status', q.status)
    .gte('scheduled_at', q.de.toISOString())
    .lt('scheduled_at', q.ate.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(CONSULTAS_MAX + 1)
  if (error) throw new OperacaoError('Erro ao buscar consultas.', 500)

  const rows = (data ?? []) as unknown as ApptRow[]
  const truncado = rows.length > CONSULTAS_MAX
  const list = rows.slice(0, CONSULTAS_MAX)

  const confBy = new Map<string, ConsultaOut['confirmacao']>()
  if (list.length > 0) {
    const { data: conf, error: confErr } = await admin
      .from('appointment_confirmations')
      .select('appointment_id, appointment_at, status, sent_at, answered_at')
      .eq('clinic_id', clinicId)
      .eq('kind', 'confirmacao')
      .in('appointment_id', list.map(r => r.id))
    if (confErr) throw new OperacaoError('Erro ao buscar confirmações.', 500)
    const at = new Map(list.map(r => [r.id, new Date(r.scheduled_at).getTime()]))
    for (const c of (conf ?? []) as { appointment_id: string; appointment_at: string; status: string; sent_at: string | null; answered_at: string | null }[]) {
      // só a confirmação do horário atual da consulta (remarcou: a antiga não vale)
      if (new Date(c.appointment_at).getTime() !== at.get(c.appointment_id)) continue
      confBy.set(c.appointment_id, { status: c.status, enviadaEm: c.sent_at, respondidaEm: c.answered_at })
    }
  }

  return {
    truncado,
    consultas: list.map(r => ({
      id: r.id,
      horario: r.scheduled_at,
      status: r.status,
      procedimento: r.procedure_name,
      profissionalId: r.professional_id,
      profissional: r.professionals?.name ?? null,
      confirmacao: confBy.get(r.id) ?? null,
    })),
  }
}

// ─── Marcar como confirmada ──────────────────────────────────────────────────

export interface MarcarResult { alterada: boolean; status: string; motivo?: string }

/**
 * Só 'agendado' vira 'confirmado' (a condição vai no UPDATE, então duas chamadas ao mesmo tempo não se atropelam).
 * Nunca cancela, nunca mexe em consulta concluída, cancelada ou faltou.
 */
export async function marcarConfirmada(clinicId: string, appointmentId: string, now: Date = new Date()): Promise<MarcarResult> {
  const admin = getAdminClient()
  const { data: appt, error } = await admin
    .from('appointments')
    .select('id, status')
    .eq('id', appointmentId)
    .eq('clinic_id', clinicId)
    .maybeSingle()
  if (error) throw new OperacaoError('Erro ao buscar a consulta.', 500)
  if (!appt) throw new OperacaoError('Consulta não encontrada.', 404)
  const status = (appt as { status: string }).status

  if (status !== 'agendado' && status !== 'confirmado') {
    return { alterada: false, status, motivo: 'status_nao_permite' }
  }

  let alterada = false
  if (status === 'agendado') {
    const { data: changed, error: upErr } = await admin
      .from('appointments')
      .update({ status: 'confirmado' })
      .eq('id', appointmentId)
      .eq('clinic_id', clinicId)
      .eq('status', 'agendado')
      .select('id')
    if (upErr) throw new OperacaoError('Erro ao confirmar a consulta.', 500)
    alterada = (changed ?? []).length > 0
  }

  // a confirmação pendente desta consulta vira 'confirmado' (idempotente: se não há pendente, nada muda)
  const stamp = now.toISOString()
  const { error: confErr } = await admin
    .from('appointment_confirmations')
    .update({ status: 'confirmado', answered_at: stamp, updated_at: stamp })
    .eq('clinic_id', clinicId)
    .eq('appointment_id', appointmentId)
    .eq('kind', 'confirmacao')
    .eq('status', 'enviado')
  if (confErr) throw new OperacaoError('Erro ao atualizar a confirmação.', 500)

  return { alterada, status: 'confirmado' }
}

// ─── Aviso para a recepção ───────────────────────────────────────────────────

export const AVISO_TIPOS = ['confirmou', 'pediu_remarcar', 'nao_entendi', 'sem_resposta'] as const
export type AvisoTipo = (typeof AVISO_TIPOS)[number]
/** Mesmo aviso (clínica, tipo, consulta) dentro dessa janela não é gravado de novo (o n8n pode repetir a chamada). */
export const AVISO_DEDUPE_MS = 6 * 3_600_000

const TITULOS: Record<AvisoTipo, string> = {
  confirmou: 'Consulta confirmada',
  pediu_remarcar: 'Paciente pediu para remarcar',
  nao_entendi: 'Resposta que precisa de atenção',
  sem_resposta: 'Paciente não respondeu',
}

/** "18/11 às 11h" ou "18/11 às 11h30", no fuso da clínica (data absoluta: o aviso é lido horas depois). */
export function quandoLabel(at: Date, timezone: string): string {
  let p
  try { p = zonedParts(at, timezone) } catch { p = zonedParts(at, 'America/Sao_Paulo') }
  const dd = String(p.d).padStart(2, '0')
  const mm = String(p.m).padStart(2, '0')
  const hora = p.min === 0 ? `${p.h}h` : `${p.h}h${String(p.min).padStart(2, '0')}`
  return `${dd}/${mm} às ${hora}`
}

export function montarAviso(tipo: AvisoTipo, nome: string, at: Date, timezone: string): { titulo: string; corpo: string } {
  const primeiro = (nome || '').trim().split(/\s+/)[0] || 'O paciente'
  const quando = quandoLabel(at, timezone)
  const corpo: Record<AvisoTipo, string> = {
    confirmou: `${primeiro} confirmou a consulta de ${quando}.`,
    pediu_remarcar: `${primeiro} pediu para remarcar a consulta de ${quando}.`,
    nao_entendi: `${primeiro} respondeu à confirmação da consulta de ${quando} e o sistema não entendeu a resposta. Abra a conversa para ver.`,
    sem_resposta: `${primeiro} ainda não respondeu à confirmação da consulta de ${quando}.`,
  }
  return { titulo: TITULOS[tipo], corpo: corpo[tipo] }
}

export async function avisarRecepcao(
  clinicId: string, appointmentId: string, tipo: AvisoTipo, now: Date = new Date(),
): Promise<{ id: string | null; duplicada: boolean }> {
  const admin = getAdminClient()
  const { data: apptRaw, error } = await admin
    .from('appointments')
    .select('id, scheduled_at, patients(name)')
    .eq('id', appointmentId)
    .eq('clinic_id', clinicId)
    .maybeSingle()
  if (error) throw new OperacaoError('Erro ao buscar a consulta.', 500)
  const appt = apptRaw as unknown as { id: string; scheduled_at: string; patients: { name: string } | null } | null
  if (!appt) throw new OperacaoError('Consulta não encontrada.', 404)

  const { data: recent, error: recentErr } = await admin
    .from('automacao_notificacoes')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('appointment_id', appointmentId)
    .eq('tipo', tipo)
    .gte('criada_em', new Date(now.getTime() - AVISO_DEDUPE_MS).toISOString())
    .limit(1)
  if (recentErr) throw new OperacaoError('Erro ao gravar o aviso.', 500)
  if ((recent ?? []).length > 0) return { id: null, duplicada: true }

  const { data: wa } = await admin.from('clinic_whatsapp').select('timezone').eq('clinic_id', clinicId).maybeSingle()
  const tz = (wa as { timezone?: string } | null)?.timezone ?? 'America/Sao_Paulo'
  const { titulo, corpo } = montarAviso(tipo, appt.patients?.name ?? '', new Date(appt.scheduled_at), tz)

  // Dedupe ATÔMICO: a leitura acima só barra repetição sequencial; duas chamadas simultâneas passariam as duas por
  // ela. A chave (tipo + consulta + janela de 6h) cai no índice único (clinic_id, chave_dedupe) e a segunda não grava.
  const janela = Math.floor(now.getTime() / AVISO_DEDUPE_MS)
  const { data: inserted, error: insErr } = await admin
    .from('automacao_notificacoes')
    .upsert(
      {
        clinic_id: clinicId, tipo, titulo, corpo, link: `/agenda?consulta=${appt.id}`, appointment_id: appt.id,
        chave_dedupe: `${tipo}:${appt.id}:${janela}`,
      },
      { onConflict: 'clinic_id,chave_dedupe', ignoreDuplicates: true },
    )
    .select('id')
  if (insErr) throw new OperacaoError('Erro ao gravar o aviso.', 500)
  const id = (inserted?.[0]?.id as string | undefined) ?? null
  return id ? { id, duplicada: false } : { id: null, duplicada: true }
}

// ─── Aniversariantes ─────────────────────────────────────────────────────────

/** "YYYY-MM-DD" que existe no calendário, ou null. */
export function parseIsoDate(v: string | null): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? '')
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? { y, m: mo, d } : null
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

/** Faz aniversário nesse dia? Quem nasceu em 29/02 comemora em 28/02 nos anos não bissextos. */
export function birthdayMatches(birthDate: string, day: { y: number; m: number; d: number }): boolean {
  const b = /^\d{4}-(\d{2})-(\d{2})/.exec(birthDate)
  if (!b) return false
  const bm = Number(b[1]), bd = Number(b[2])
  if (bm === 2 && bd === 29 && !isLeap(day.y)) return day.m === 2 && day.d === 28
  return bm === day.m && bd === day.d
}

export async function listarAniversariantes(clinicId: string, day: { y: number; m: number; d: number }): Promise<string[]> {
  const { data, error } = await getAdminClient()
    .from('patients')
    .select('id, birth_date')
    .eq('clinic_id', clinicId)
    .eq('is_active', true)
    .not('birth_date', 'is', null)
    .limit(20000)
  if (error) throw new OperacaoError('Erro ao buscar pacientes.', 500)
  return ((data ?? []) as { id: string; birth_date: string }[])
    .filter(p => birthdayMatches(p.birth_date, day))
    .map(p => p.id)
}
