// Leituras e gravações do módulo de convênios. Toda consulta vai escopada à clínica (.eq('clinic_id')) e, para
// quem só vê o que é seu (acesso por profissional), ao profissional. Colunas novas só entram quando o banco as tem.
'use client'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { brasilDayRange } from '@/lib/brasilDate'
import { isMissingSchemaError } from '@/lib/agenda/extrasSchema'
import { PATIENT_EXTRA_COLUMNS, probeConveniosSchema } from './schema'
import { toInsurancePlan } from './plans'
import type { ConvenioAppointment, ConvenioPatient, ConvenioProfessional, ConvenioRecord, InsurancePlan } from './types'

const PAGE = 1000
const MAX_PAGES = 10
const CHUNK = 120

type PageResult = { data: unknown[] | null; error: { code?: string | null; message?: string | null } | null }

/** Lê todas as páginas de uma consulta (o PostgREST corta em 1000 linhas por pedido). */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<PageResult>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(i * PAGE, i * PAGE + PAGE - 1)
    if (error) throw new Error(error.message ?? 'Erro ao ler os dados.')
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export async function fetchPlans(clinicId: string): Promise<{ available: boolean; plans: InsurancePlan[] }> {
  const schema = await probeConveniosSchema()
  if (!schema.plans) return { available: false, plans: [] }
  const { data, error } = await supabase.from('insurance_plans').select('*').eq('clinic_id', clinicId).order('name')
  if (error) {
    if (isMissingSchemaError(error)) return { available: false, plans: [] }
    throw new Error(error.message)
  }
  return { available: true, plans: (data ?? []).map(r => toInsurancePlan(r as Record<string, unknown>)) }
}

export function usePlans(clinicId: string | undefined) {
  return useQuery({
    queryKey: ['convenios-plans', clinicId],
    queryFn: () => fetchPlans(clinicId!),
    enabled: !!clinicId,
    staleTime: 2 * 60 * 1000,
  })
}

async function fetchPatientsByIds(clinicId: string, ids: string[]): Promise<ConvenioPatient[]> {
  if (ids.length === 0) return []
  const { patientColumns } = await probeConveniosSchema()
  const cols = `id, name, cpf, birth_date, convenio, convenio_carteirinha${patientColumns ? `, ${PATIENT_EXTRA_COLUMNS}` : ''}`
  const out: ConvenioPatient[] = []
  for (const part of chunks(ids, CHUNK)) {
    const { data, error } = await supabase.from('patients').select(cols).eq('clinic_id', clinicId).in('id', part)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as unknown as ConvenioPatient[]))
  }
  return out
}

const RECORD_COLUMNS = 'id, appointment_id, patient_id, type, total_amount, payment_method, convenio, created_at, professional_id'

export interface ProducaoDados {
  appointments: ConvenioAppointment[]
  patients: ConvenioPatient[]
  records: ConvenioRecord[]
}

/** Atendimentos de um período (dias AAAA-MM-DD, fuso de Brasília), com os pacientes e as receitas ligadas a eles. */
export async function fetchProducao(clinicId: string, from: string, to: string, scopeProfessionalId: string | null): Promise<ProducaoDados> {
  const start = brasilDayRange(from)?.start
  const end = brasilDayRange(to)?.end
  if (!start || !end) throw new Error('Período inválido.')
  const appointments = await fetchAll<ConvenioAppointment>((a, b) => {
    let q = supabase.from('appointments')
      .select('id, patient_id, professional_id, procedure_id, procedure_name, procedure_price, status, scheduled_at')
      .eq('clinic_id', clinicId).gte('scheduled_at', start).lte('scheduled_at', end)
    if (scopeProfessionalId) q = q.eq('professional_id', scopeProfessionalId)
    return q.order('scheduled_at').order('id').range(a, b)
  })
  const patientIds = [...new Set(appointments.map(x => x.patient_id).filter((x): x is string => !!x))]
  const apptIds = appointments.map(x => x.id)
  const [patients, records] = await Promise.all([
    fetchPatientsByIds(clinicId, patientIds),
    (async () => {
      const out: ConvenioRecord[] = []
      for (const part of chunks(apptIds, CHUNK)) {
        const { data, error } = await supabase.from('financial_records').select(RECORD_COLUMNS).eq('clinic_id', clinicId).in('appointment_id', part)
        if (error) throw new Error(error.message)
        out.push(...((data ?? []) as unknown as ConvenioRecord[]))
      }
      return out
    })(),
  ])
  return { appointments, patients, records }
}

export function useProducao(clinicId: string | undefined, from: string, to: string, scopeProfessionalId: string | null) {
  return useQuery({
    queryKey: ['convenios-producao', clinicId, from, to, scopeProfessionalId],
    queryFn: () => fetchProducao(clinicId!, from, to, scopeProfessionalId),
    enabled: !!clinicId && !!from && !!to && from <= to,
    staleTime: 60 * 1000,
  })
}

export interface ReceitaSaudeDados {
  records: ConvenioRecord[]
  patients: ConvenioPatient[]
  professionalByRecord: Record<string, string | null>
}

/** Receitas de um mês ('AAAA-MM', fuso de Brasília) com o paciente de cada uma. */
export async function fetchReceitaSaude(clinicId: string, mes: string, scopeProfessionalId: string | null): Promise<ReceitaSaudeDados> {
  const [y, m] = mes.split('-').map(Number)
  if (!y || !m) throw new Error('Mês inválido.')
  const last = new Date(y, m, 0).getDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  const start = brasilDayRange(`${y}-${pad(m)}-01`)?.start
  const end = brasilDayRange(`${y}-${pad(m)}-${pad(last)}`)?.end
  if (!start || !end) throw new Error('Mês inválido.')
  type Raw = ConvenioRecord & { professional_id: string | null }
  const raw = await fetchAll<Raw>((a, b) => {
    let q = supabase.from('financial_records').select(RECORD_COLUMNS)
      .eq('clinic_id', clinicId).eq('type', 'receita').gte('created_at', start).lte('created_at', end)
    if (scopeProfessionalId) q = q.eq('professional_id', scopeProfessionalId)
    return q.order('created_at').order('id').range(a, b)
  })
  const patients = await fetchPatientsByIds(clinicId, [...new Set(raw.map(r => r.patient_id).filter((x): x is string => !!x))])
  return {
    records: raw,
    patients,
    professionalByRecord: Object.fromEntries(raw.map(r => [r.id, r.professional_id ?? null])),
  }
}

export function useReceitaSaude(clinicId: string | undefined, mes: string, scopeProfessionalId: string | null) {
  return useQuery({
    queryKey: ['convenios-receita-saude', clinicId, mes, scopeProfessionalId],
    queryFn: () => fetchReceitaSaude(clinicId!, mes, scopeProfessionalId),
    enabled: !!clinicId && !!mes,
    staleTime: 60 * 1000,
  })
}

/** Profissionais da clínica para o cabeçalho das guias e do recibo (select('*'): rqe só vem se a coluna existir). */
export function useConvenioProfessionals(clinicId: string | undefined) {
  return useQuery({
    queryKey: ['convenios-professionals', clinicId],
    queryFn: async () => {
      const { data, error } = await supabase.from('professionals').select('*').eq('clinic_id', clinicId!).order('name')
      if (error) throw new Error(error.message)
      return (data ?? []) as ConvenioProfessional[]
    },
    enabled: !!clinicId,
    staleTime: 10 * 60 * 1000,
  })
}

/** Mensagem útil para o erro mais provável: policy do convênio ainda não colada no Supabase. */
export function planSaveErrorMessage(error: { code?: string | null; message?: string | null }): string {
  const text = `${error.code ?? ''} ${error.message ?? ''}`
  if (/row-level security|42501/i.test(text)) return 'Sem permissão para salvar convênios. Confirme se o acesso do financeiro está liberado e se as regras do banco foram aplicadas.'
  if (/23505|duplicate key/i.test(text)) return 'Já existe um convênio com esse nome.'
  return error.message ?? 'Erro ao salvar o convênio.'
}
