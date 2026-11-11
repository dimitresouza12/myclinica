// Apoio ao Receita Saúde (Receita Federal, IN RFB 2.240/2024): lista mensal dos recebimentos de paciente pessoa
// física, com CPF do pagador e do beneficiário, para o profissional conferir e lançar no app oficial.
//
// SUPOSIÇÃO (documentada para o dono do produto): não há um layout oficial de importação em CSV que tenhamos
// confirmado. Este arquivo é uma planilha de conferência/cópia, com as colunas que o recibo do Receita Saúde pede
// (data do pagamento, CPF do pagador, CPF do beneficiário, valor) mais nomes e o registro do profissional.
// Recebimento por convênio (pago pela operadora, pessoa jurídica) fica fora: não é recibo de pessoa física.
// A "data do pagamento" é a data do lançamento no financeiro (financial_records.created_at, fuso de Brasília).
import { brasilDayOf } from '@/lib/brasilDate'
import { onlyDigits, formatCpf } from '@/lib/numericFormat'
import { PAYMENT_METHOD_LABELS } from '@/lib/print'
import { diaBR, montarCsv, valorCsv } from './csv'
import type { ConvenioPatient, ConvenioProfessional, ConvenioRecord } from './types'

/** CPF válido: 11 números, não todos iguais, dígitos verificadores corretos. */
export function isValidCpf(value: string | null | undefined): boolean {
  const d = onlyDigits(value)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const calc = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i)
    const r = (sum * 10) % 11
    return r === 10 ? 0 : r
  }
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10])
}

export interface ReceitaSaudeRow {
  recordId: string
  /** AAAA-MM-DD */
  dia: string
  pagadorNome: string
  pagadorCpf: string
  beneficiarioNome: string
  beneficiarioCpf: string
  valor: number
  formaPagamento: string
  profissional: string
  registro: string
  /** o que falta ou está errado para lançar no Receita Saúde (vazio = pronto) */
  pendencias: string[]
}

export interface ReceitaSaudeInput {
  records: ConvenioRecord[]
  patients: ConvenioPatient[]
  professionals: Array<Pick<ConvenioProfessional, 'id' | 'name' | 'registration_number'>>
  /** profissional de cada receita (financial_records.professional_id), por id da receita */
  professionalByRecord: Record<string, string | null | undefined>
  /** 'AAAA-MM' (mês no fuso de Brasília) */
  mes: string
}

export function buildReceitaSaude(input: ReceitaSaudeInput): ReceitaSaudeRow[] {
  const patById = new Map(input.patients.map(p => [p.id, p]))
  const profById = new Map(input.professionals.map(p => [p.id, p]))
  const rows: ReceitaSaudeRow[] = []
  for (const r of input.records) {
    if (r.type !== 'receita' || r.payment_method === 'convenio') continue
    if (!r.patient_id || !(r.total_amount && r.total_amount > 0)) continue
    const dia = brasilDayOf(r.created_at)
    if (!dia || !dia.startsWith(input.mes)) continue
    const pat = patById.get(r.patient_id)
    if (!pat) continue

    const pagadorNome = (pat.payer_name ?? '').trim() || pat.name
    const temPagador = !!onlyDigits(pat.payer_cpf)
    const pagadorCpf = temPagador ? onlyDigits(pat.payer_cpf) : onlyDigits(pat.cpf)
    const benefCpf = onlyDigits(pat.cpf)
    const prof = profById.get(input.professionalByRecord[r.id] ?? '')

    const pendencias: string[] = []
    if (!pagadorCpf) pendencias.push('CPF do pagador em branco')
    else if (!isValidCpf(pagadorCpf)) pendencias.push('CPF do pagador inválido')
    if (!benefCpf) pendencias.push('CPF do beneficiário em branco')
    else if (!isValidCpf(benefCpf)) pendencias.push('CPF do beneficiário inválido')

    rows.push({
      recordId: r.id,
      dia,
      pagadorNome,
      pagadorCpf: formatCpf(pagadorCpf),
      beneficiarioNome: pat.name,
      beneficiarioCpf: formatCpf(benefCpf),
      valor: r.total_amount,
      formaPagamento: PAYMENT_METHOD_LABELS[r.payment_method ?? ''] ?? r.payment_method ?? '',
      profissional: prof?.name ?? '',
      registro: prof?.registration_number ?? '',
      pendencias,
    })
  }
  return rows.sort((a, b) => a.dia.localeCompare(b.dia) || a.beneficiarioNome.localeCompare(b.beneficiarioNome, 'pt-BR'))
}

export interface ReceitaSaudeResumo { total: number; lancamentos: number; comPendencia: number }

export function resumirReceitaSaude(rows: ReceitaSaudeRow[]): ReceitaSaudeResumo {
  return {
    total: Math.round(rows.reduce((s, r) => s + r.valor, 0) * 100) / 100,
    lancamentos: rows.length,
    comPendencia: rows.filter(r => r.pendencias.length > 0).length,
  }
}

export function receitaSaudeParaCsv(rows: ReceitaSaudeRow[]): string {
  return montarCsv(
    ['Data do pagamento', 'CPF do pagador', 'Nome do pagador', 'CPF do beneficiário', 'Nome do beneficiário', 'Valor', 'Forma de pagamento', 'Profissional', 'Registro no conselho', 'Pendências'],
    rows.map(r => [diaBR(r.dia), r.pagadorCpf, r.pagadorNome, r.beneficiarioCpf, r.beneficiarioNome, valorCsv(r.valor), r.formaPagamento, r.profissional, r.registro, r.pendencias.join(' / ')]),
  )
}
