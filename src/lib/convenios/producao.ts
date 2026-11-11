// Relatório de produção por convênio: um atendimento por linha (período, paciente, procedimento, valor, status).
// Funções puras. A origem do valor fica explícita em cada linha: nada é inventado, "sem valor" aparece como tal.
import { STATUS_LABELS } from '@/lib/appointmentStatus'
import { brasilDayOf } from '@/lib/brasilDate'
import type { AppointmentStatus } from '@/types'
import { findPlan, planPrice } from './plans'
import { PARTICULAR, type ConvenioAppointment, type ConvenioPatient, type ConvenioProcedure, type ConvenioRecord, type InsurancePlan } from './types'
import { diaBR, montarCsv, valorCsv } from './csv'

export type ValorOrigem = 'lancamento' | 'tabela_convenio' | 'agendamento' | 'procedimento' | 'sem_valor'

export const VALOR_ORIGEM_LABEL: Record<ValorOrigem, string> = {
  lancamento: 'Lançado no financeiro',
  tabela_convenio: 'Tabela do convênio',
  agendamento: 'Valor do agendamento',
  procedimento: 'Preço do procedimento',
  sem_valor: 'Sem valor',
}

export interface ProducaoRow {
  appointmentId: string
  patientId: string | null
  /** AAAA-MM-DD em Brasília */
  dia: string
  paciente: string
  /** nome do convênio, ou "Particular" */
  convenio: string
  carteirinha: string
  procedimento: string
  valor: number | null
  valorOrigem: ValorOrigem
  status: AppointmentStatus
  statusLabel: string
  /** existe receita lançada no financeiro para este atendimento */
  lancado: boolean
}

export interface ProducaoInput {
  appointments: ConvenioAppointment[]
  patients: ConvenioPatient[]
  plans: InsurancePlan[]
  procedures: ConvenioProcedure[]
  records: ConvenioRecord[]
}

/** Atendimentos que contam como produção: tudo que não é bloqueio de agenda e tem paciente. */
export function buildProducao(input: ProducaoInput): ProducaoRow[] {
  const patientById = new Map(input.patients.map(p => [p.id, p]))
  const procById = new Map(input.procedures.map(p => [p.id, p]))
  // receita lançada por atendimento (a mais recente vence, caso haja mais de uma)
  const recByAppt = new Map<string, ConvenioRecord>()
  for (const r of input.records) {
    if (r.type !== 'receita' || !r.appointment_id) continue
    const prev = recByAppt.get(r.appointment_id)
    if (!prev || r.created_at > prev.created_at) recByAppt.set(r.appointment_id, r)
  }

  const rows: ProducaoRow[] = []
  for (const a of input.appointments) {
    if (a.status === 'bloqueado' || !a.patient_id) continue
    const pat = patientById.get(a.patient_id)
    if (!pat) continue
    const dia = brasilDayOf(a.scheduled_at)
    if (!dia) continue
    const rec = recByAppt.get(a.id)

    // Se a receita do atendimento foi lançada por outra forma de pagamento, é atendimento particular.
    let convenio = (pat.convenio ?? '').trim()
    if (rec && rec.payment_method && rec.payment_method !== 'convenio') convenio = ''
    else if (rec?.payment_method === 'convenio' && rec.convenio?.trim()) convenio = rec.convenio.trim()
    const plan = convenio ? findPlan(input.plans, { insurance_plan_id: pat.insurance_plan_id, convenio }) : null

    let valor: number | null = null
    let valorOrigem: ValorOrigem = 'sem_valor'
    if (rec && rec.total_amount != null) { valor = rec.total_amount; valorOrigem = 'lancamento' }
    else if (plan && planPrice(plan, a.procedure_id) != null) { valor = planPrice(plan, a.procedure_id); valorOrigem = 'tabela_convenio' }
    else if (a.procedure_price != null) { valor = a.procedure_price; valorOrigem = 'agendamento' }
    else if (a.procedure_id && procById.get(a.procedure_id)?.price != null) { valor = procById.get(a.procedure_id)!.price; valorOrigem = 'procedimento' }

    rows.push({
      appointmentId: a.id,
      patientId: a.patient_id,
      dia,
      paciente: pat.name,
      convenio: convenio || PARTICULAR,
      carteirinha: convenio ? (pat.convenio_carteirinha ?? '') : '',
      procedimento: a.procedure_name?.trim() || (a.procedure_id ? procById.get(a.procedure_id)?.name ?? '' : ''),
      valor,
      valorOrigem,
      status: a.status,
      statusLabel: STATUS_LABELS[a.status] ?? a.status,
      lancado: !!rec,
    })
  }
  return rows.sort((x, y) => x.dia.localeCompare(y.dia) || x.paciente.localeCompare(y.paciente, 'pt-BR'))
}

/** Filtro por convênio: '' = todos; PARTICULAR = sem convênio; senão o nome (sem diferenciar maiúscula). */
export function filtrarPorConvenio(rows: ProducaoRow[], convenio: string): ProducaoRow[] {
  const c = convenio.trim().toLowerCase()
  if (!c) return rows
  return rows.filter(r => r.convenio.toLowerCase() === c)
}

/** Nomes de convênio presentes nas linhas (convênios primeiro, "Particular" por último). */
export function conveniosNasLinhas(rows: ProducaoRow[]): string[] {
  const set = new Set(rows.map(r => r.convenio))
  const nomes = [...set].filter(n => n !== PARTICULAR).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  return set.has(PARTICULAR) ? [...nomes, PARTICULAR] : nomes
}

export interface ProducaoResumo {
  convenio: string
  atendimentos: number
  realizados: number
  /** soma dos atendimentos realizados (concluído) */
  valorRealizado: number
  /** soma dos agendados e confirmados */
  valorPrevisto: number
  /** realizados sem valor: o relatório avisa para conferir */
  semValor: number
}

export function resumirPorConvenio(rows: ProducaoRow[]): ProducaoResumo[] {
  const map = new Map<string, ProducaoResumo>()
  for (const r of rows) {
    if (r.status === 'cancelado') continue
    const s = map.get(r.convenio) ?? { convenio: r.convenio, atendimentos: 0, realizados: 0, valorRealizado: 0, valorPrevisto: 0, semValor: 0 }
    s.atendimentos += 1
    if (r.status === 'concluido') {
      s.realizados += 1
      s.valorRealizado += r.valor ?? 0
      if (r.valor == null) s.semValor += 1
    } else if (r.status === 'agendado' || r.status === 'confirmado') {
      s.valorPrevisto += r.valor ?? 0
    }
    map.set(r.convenio, s)
  }
  return [...map.values()].map(s => ({ ...s, valorRealizado: round2(s.valorRealizado), valorPrevisto: round2(s.valorPrevisto) }))
    .sort((a, b) => (a.convenio === PARTICULAR ? 1 : 0) - (b.convenio === PARTICULAR ? 1 : 0) || b.valorRealizado - a.valorRealizado)
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function producaoParaCsv(rows: ProducaoRow[]): string {
  return montarCsv(
    ['Data', 'Paciente', 'Convênio', 'Carteirinha', 'Procedimento', 'Valor', 'Origem do valor', 'Status', 'Lançado no financeiro'],
    rows.map(r => [diaBR(r.dia), r.paciente, r.convenio, r.carteirinha, r.procedimento, valorCsv(r.valor), VALOR_ORIGEM_LABEL[r.valorOrigem], r.statusLabel, r.lancado ? 'Sim' : 'Não']),
  )
}
