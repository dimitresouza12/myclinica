// Escrita de pacotes de sessões e a ponte com a cobrança do atendimento (appointmentRevenue.ts).
import { supabase } from '@/lib/supabase'
import { probeAgendaExtras, isMissingSchemaError } from './extrasSchema'
import { canConsumeSession, packageUsage, type LinkedAppt, type PackageLike } from './packages'

export interface NewPackageInput {
  clinicId: string
  userId?: string | null
  patientId: string
  procedureId: string | null
  name: string
  totalSessions: number
  totalPrice: number
  expiresAt: string | null
  notes?: string | null
  /** lança a venda do pacote no Financeiro (uma única receita, forma de pagamento pendente) */
  launchRevenue: boolean
}

export type CreatePackageResult = { ok: true; id: string; recordId: string | null; revenueError?: string } | { ok: false; error: string }

/**
 * Cria o pacote e, se pedido, a receita da venda. A receita nasce sem procedimento e sem profissional de
 * propósito: o atendimento de cada sessão NÃO gera outra receita, e assim também não dispara comissão em dobro.
 */
export async function createPatientPackage(input: NewPackageInput): Promise<CreatePackageResult> {
  const sessions = Math.floor(input.totalSessions)
  if (!input.name.trim()) return { ok: false, error: 'Dê um nome ao pacote.' }
  if (!Number.isFinite(sessions) || sessions < 1 || sessions > 500) return { ok: false, error: 'O pacote precisa ter de 1 a 500 sessões.' }
  if (!Number.isFinite(input.totalPrice) || input.totalPrice < 0) return { ok: false, error: 'O valor do pacote não pode ser negativo.' }

  const { data, error } = await supabase.from('patient_packages').insert([{
    clinic_id: input.clinicId,
    patient_id: input.patientId,
    procedure_id: input.procedureId,
    name: input.name.trim(),
    total_sessions: sessions,
    total_price: input.totalPrice,
    expires_at: input.expiresAt || null,
    notes: input.notes?.trim() || null,
    created_by: input.userId ?? null,
  }]).select('id').single()
  if (error || !data) {
    return { ok: false, error: isMissingSchemaError(error) ? 'Pacotes ainda não estão disponíveis neste banco.' : `Erro ao criar o pacote: ${error?.message ?? 'sem resposta'}` }
  }

  if (!input.launchRevenue || input.totalPrice <= 0) return { ok: true, id: data.id, recordId: null }

  const { data: rec, error: recErr } = await supabase.from('financial_records').insert([{
    clinic_id: input.clinicId,
    patient_id: input.patientId,
    total_amount: input.totalPrice,
    category: 'Pacote',
    type: 'receita',
    payment_method: null,
    notes: input.name.trim(),
  }]).select('id').single()
  if (recErr || !rec) {
    // o pacote existe e vale; só a receita não saiu (ex.: sem permissão no Financeiro). Quem chamou avisa.
    return { ok: true, id: data.id, recordId: null, revenueError: recErr?.message ?? 'Falha ao lançar a receita.' }
  }
  const { error: linkErr } = await supabase.from('patient_packages').update({ financial_record_id: rec.id }).eq('id', data.id).eq('clinic_id', input.clinicId)
  if (linkErr) return { ok: true, id: data.id, recordId: rec.id, revenueError: `Receita lançada, mas não foi possível ligá-la ao pacote: ${linkErr.message}` }
  return { ok: true, id: data.id, recordId: rec.id }
}

/** Cancela o pacote: some das sugestões e não aceita novas consultas. O histórico de sessões feitas fica. */
export async function cancelPatientPackage(clinicId: string, packageId: string): Promise<string | null> {
  const { error } = await supabase.from('patient_packages').update({ status: 'cancelado', updated_at: new Date().toISOString() }).eq('id', packageId).eq('clinic_id', clinicId)
  return error ? error.message : null
}

/**
 * Pacote ao qual a consulta está ligada. `undefined` = não sei (a linha veio sem a coluna): pergunta ao banco.
 * Sem a migration devolve null sem erro.
 */
export async function lookupAppointmentPackageId(clinicId: string, apptId: string): Promise<string | null> {
  const extras = await probeAgendaExtras()
  if (!extras.packages) return null
  const { data, error } = await supabase.from('appointments').select('package_id').eq('id', apptId).eq('clinic_id', clinicId).maybeSingle()
  if (error) return null
  return (data as { package_id: string | null } | null)?.package_id ?? null
}

export interface SessionPackageInfo {
  pkg: PackageLike & { name: string }
  /** a consulta ainda pode consumir uma sessão (pacote valendo e com saldo) */
  consumable: boolean
  reason?: 'cancelado' | 'esgotado'
  used: number
  total: number
  remaining: number
}

/**
 * Situação do pacote de uma consulta que está sendo concluída. `null` = consulta sem pacote (cobrança normal).
 * A consulta já deve estar gravada como concluída: ela entra na conta das sessões usadas.
 */
export async function resolveSessionPackage(clinicId: string, appt: { id: string; package_id?: string | null }): Promise<SessionPackageInfo | null> {
  const packageId = appt.package_id !== undefined ? appt.package_id : await lookupAppointmentPackageId(clinicId, appt.id)
  if (!packageId) return null
  const { data: pkg, error } = await supabase
    .from('patient_packages')
    .select('id, name, total_sessions, status, expires_at, procedure_id')
    .eq('id', packageId).eq('clinic_id', clinicId).maybeSingle()
  if (error || !pkg) return null
  const { data: rows, error: linkErr } = await supabase
    .from('appointments')
    .select('id, package_id, status, scheduled_at')
    .eq('clinic_id', clinicId).eq('package_id', packageId).eq('status', 'concluido')
  if (linkErr) return null
  const linked = (rows ?? []) as LinkedAppt[]
  const like = pkg as PackageLike & { name: string }
  const check = canConsumeSession(like, linked, appt.id)
  // a própria consulta já está concluída e entra em `used`; se a leitura veio atrasada, conta mesmo assim
  const used = packageUsage(like, linked).used + (linked.some(a => a.id === appt.id) ? 0 : 1)
  return {
    pkg: like,
    consumable: check.ok,
    reason: check.ok ? undefined : check.reason,
    used,
    total: like.total_sessions,
    remaining: Math.max(0, like.total_sessions - used),
  }
}

/** Desliga a consulta do pacote (pacote esgotado ou cancelado): ela volta a ser cobrada normalmente. */
export async function unlinkAppointmentFromPackage(clinicId: string, apptId: string): Promise<string | null> {
  const { error } = await supabase.from('appointments').update({ package_id: null }).eq('id', apptId).eq('clinic_id', clinicId)
  return error ? error.message : null
}
