// Campos variáveis dos documentos (nome, CPF, data, profissional, registro no conselho / RQE), resolvidos sempre
// do cadastro e nunca digitados à mão. As chaves seguem o catálogo de documentFieldCatalog.ts
// (paciente, data, medico, registro, rqe) e valem tanto para o atestado estruturado quanto para os contratos.

import { formatRegistration, formatRqe, type CouncilInfo } from '@/lib/professionalCouncil'

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/

/** "AAAA-MM-DD" válido (data de calendário real), senão null. */
export function parseIsoDay(iso: string | null | undefined): { y: number; m: number; d: number } | null {
  const mt = ISO_DAY.exec((iso ?? '').trim())
  if (!mt) return null
  const y = Number(mt[1]); const m = Number(mt[2]); const d = Number(mt[3])
  const t = new Date(Date.UTC(y, m - 1, d))
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null
  return { y, m, d }
}

/** "2026-11-10" -> "10/11/2026" (vazio se inválido). */
export function formatDateBr(iso: string | null | undefined): string {
  const p = parseIsoDay(iso)
  return p ? `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.y}` : ''
}

/** "2026-11-10" -> "10 de novembro de 2026" (vazio se inválido). */
export function formatDateExtenso(iso: string | null | undefined): string {
  const p = parseIsoDay(iso)
  return p ? `${p.d} de ${MESES[p.m - 1]} de ${p.y}` : ''
}

/** Soma dias a um dia "AAAA-MM-DD" (sem fuso: a conta é de calendário). */
export function addDaysIso(iso: string, days: number): string {
  const p = parseIsoDay(iso)
  if (!p) return ''
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + Math.trunc(days)))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

/** Soma meses mantendo o dia (31/01 + 1 mês = 28 ou 29/02). Usado na vigência sugerida do contrato. */
export function addMonthsIso(iso: string, months: number): string {
  const p = parseIsoDay(iso)
  if (!p) return ''
  const first = new Date(Date.UTC(p.y, p.m - 1 + Math.trunc(months), 1))
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  const day = Math.min(p.d, lastDay)
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** CPF com máscara quando tem 11 dígitos; qualquer outra coisa volta limpa, sem inventar dígitos. */
export function formatCpf(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length === 11) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
  return (raw ?? '').trim()
}

const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

/** Inteiro de 0 a 999 por extenso, em português ("trinta e um", "cento e vinte"). Fora da faixa: o número em dígitos. */
export function numeroPorExtenso(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999) return String(n)
  if (n < 20) return UNIDADES[n]
  if (n < 100) {
    const u = n % 10
    return u === 0 ? DEZENAS[Math.floor(n / 10)] : `${DEZENAS[Math.floor(n / 10)]} e ${UNIDADES[u]}`
  }
  if (n === 100) return 'cem'
  const resto = n % 100
  return resto === 0 ? CENTENAS[Math.floor(n / 100)] : `${CENTENAS[Math.floor(n / 100)]} e ${numeroPorExtenso(resto)}`
}

/** Valor em reais no formato "1.234,50" (sem o símbolo). */
export function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export interface DocFieldContext {
  patientName: string
  patientCpf?: string | null
  /** Responsável legal (ou tutor) do cadastro; vazio = sem responsável (o campo fica pendente só se o modelo o usar). */
  guardianName?: string | null
  guardianCpf?: string | null
  clinicName?: string | null
  professionalName?: string | null
  registrationNumber?: string | null
  rqe?: string | null
  council: CouncilInfo
  /** Dia do documento, "AAAA-MM-DD". */
  today: string
}

export interface ResolvedDocFields {
  /** chave `paciente` do catálogo */
  paciente: string
  cpf: string
  /** chave `data` do catálogo */
  data: string
  dataExtenso: string
  /** chave `medico` do catálogo */
  medico: string
  /** chave `registro` do catálogo: "CRM 12345" (sigla do conselho + número) */
  registro: string
  /** chave `rqe` do catálogo: "RQE 678" */
  rqe: string
  clinica: string
  /** "Maria Souza, CPF 000.000.000-00" (sem CPF: só o nome) */
  pacienteIdent: string
  /** chaves `responsavel` e `responsavel_ident`: vazios quando o cadastro não tem responsável */
  responsavel: string
  responsavelIdent: string
  /** "Dra. ... " não é presumido: "Ana Lima, CRM 12345, RQE 678" (sem registro: só o nome) */
  profissionalIdent: string
}

/** Resolve os campos variáveis do documento a partir do cadastro (paciente, profissional, clínica) e do conselho da área. */
export function resolveDocFields(ctx: DocFieldContext): ResolvedDocFields {
  const paciente = ctx.patientName.trim()
  const cpf = formatCpf(ctx.patientCpf)
  const medico = (ctx.professionalName ?? '').trim()
  const registro = formatRegistration(ctx.council, ctx.registrationNumber)
  const rqe = formatRqe(ctx.rqe)
  return {
    paciente,
    cpf,
    data: formatDateBr(ctx.today),
    dataExtenso: formatDateExtenso(ctx.today),
    medico,
    registro,
    rqe,
    clinica: (ctx.clinicName ?? '').trim(),
    pacienteIdent: cpf ? `${paciente}, CPF ${cpf}` : paciente,
    responsavel: (ctx.guardianName ?? '').trim(),
    responsavelIdent: (ctx.guardianName ?? '').trim()
      ? (formatCpf(ctx.guardianCpf) ? `${(ctx.guardianName ?? '').trim()}, CPF ${formatCpf(ctx.guardianCpf)}` : (ctx.guardianName ?? '').trim())
      : '',
    profissionalIdent: [medico, registro, rqe].filter(Boolean).join(', '),
  }
}
