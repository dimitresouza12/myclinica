import type { ClinicType } from '@/types'

// Conselho profissional de cada área — usado no cabeçalho/assinatura dos
// documentos do prontuário no lugar do antigo rótulo fixo "CRO/CRM". O número
// em si continua vindo do campo de texto livre `registration_number` do
// profissional (nada é inventado aqui, só o rótulo).
export interface CouncilInfo {
  /** Sigla curta, como aparece no documento */
  code: string
  /** Rótulo do campo ("CRM / RQE", "CREFITO"...) */
  label: string
}

const COUNCIL_BY_TYPE: Record<ClinicType, CouncilInfo> = {
  medico: { code: 'CRM', label: 'CRM / RQE' },
  odonto: { code: 'CRO', label: 'CRO' },
  vet: { code: 'CRMV', label: 'CRMV' },
  fisio: { code: 'CREFITO', label: 'CREFITO' },
  to: { code: 'CREFITO', label: 'CREFITO' },
  psico: { code: 'CRP', label: 'CRP' },
  nutri: { code: 'CRN', label: 'CRN' },
  fono: { code: 'CREFONO', label: 'CREFONO' },
  // Estética não tem conselho único (esteticista não tem conselho federal);
  // o texto livre do cadastro vale como está. Ver `councilForProfessional`
  // para os casos com conselho próprio (biomedicina, dermatologia...).
  estetica: { code: '', label: 'Registro profissional' },
}

const GENERIC_COUNCIL: CouncilInfo = { code: '', label: 'Registro profissional' }

// Especialidades da lista de estética que pertencem a um conselho próprio.
const ESTETICA_SPECIALTY_COUNCIL: Array<[RegExp, CouncilInfo]> = [
  [/biomedic/i, { code: 'CRBM', label: 'CRBM' }],
  [/dermatolog/i, { code: 'CRM', label: 'CRM / RQE' }],
  [/fisioterap/i, { code: 'CREFITO', label: 'CREFITO' }],
]

export function councilForType(type: ClinicType | null | undefined): CouncilInfo {
  return type ? (COUNCIL_BY_TYPE[type] ?? GENERIC_COUNCIL) : GENERIC_COUNCIL
}

/**
 * Conselho do profissional: a área dele (`specialty_type`) manda; na estética
 * o texto da especialidade pode apontar pra um conselho próprio. Sem área,
 * cai na área da clínica.
 */
export function councilForProfessional(args: {
  specialtyType?: ClinicType | null
  specialty?: string | null
  clinicType?: ClinicType | null
}): CouncilInfo {
  const type = args.specialtyType ?? args.clinicType ?? null
  if (type === 'estetica' && args.specialty) {
    const hit = ESTETICA_SPECIALTY_COUNCIL.find(([re]) => re.test(args.specialty!))
    if (hit) return hit[1]
  }
  return councilForType(type)
}

/**
 * Conselho único de um conjunto de áreas (clínica multi-área): se todas caem
 * no mesmo conselho devolve ele; se divergem (ex.: odonto + fisio), devolve o
 * rótulo genérico, pra não imprimir "CRO" no campo de quem é fisioterapeuta.
 */
export function councilForAreas(areas: Array<ClinicType | null | undefined>): CouncilInfo {
  const list = areas.filter((a): a is ClinicType => !!a)
  if (list.length === 0) return GENERIC_COUNCIL
  const first = councilForType(list[0])
  return list.every(a => councilForType(a).label === first.label) ? first : GENERIC_COUNCIL
}

/**
 * Rótulo de campo/placeholder de registro conforme o conselho: "Registro
 * profissional (CRM / RQE)" quando há conselho; "Registro profissional" sem.
 */
export function registrationFieldLabel(council: CouncilInfo): string {
  return council.code ? `Registro profissional (${council.label})` : 'Registro profissional'
}

/** RQE pronto pra imprimir: "RQE 1234" (mantém se já vier com a sigla); vazio devolve ''. */
export function formatRqe(rqe: string | null | undefined): string {
  const v = (rqe ?? '').trim()
  if (!v) return ''
  return /^RQE\b/i.test(v) ? v : `RQE ${v}`
}

// Qualquer sigla de conselho no começo do texto digitado (CRM-CE 123, CREFITO 5/12345-F...)
const STARTS_WITH_COUNCIL = /^\s*(?:CR[A-Z]{1,6}|COREN|CFN)\b/i

/**
 * Texto de registro pronto pra imprimir: se o profissional já digitou a sigla
 * ("CRM-CE 12345") mantém como está; se digitou só o número, prefixa a sigla
 * do conselho da área. Sem número, devolve ''.
 */
export function formatRegistration(council: CouncilInfo, registrationNumber: string | null | undefined): string {
  const reg = (registrationNumber ?? '').trim()
  if (!reg) return ''
  if (!council.code || STARTS_WITH_COUNCIL.test(reg)) return reg
  return `${council.code} ${reg}`
}

// Norma citada no aviso de imutabilidade da evolução. Só onde a norma do
// conselho está confirmada no plano do produto; nas demais áreas o aviso fica
// sem citação (melhor que citar a norma errada).
const RECORD_NORM_BY_TYPE: Partial<Record<ClinicType, string>> = {
  medico: 'CFM 1.638/2002',
  fisio: 'COFFITO 414/2012',
  psico: 'CFP 001/2009',
}

export function recordNormForType(type: ClinicType | null | undefined): string | null {
  return (type && RECORD_NORM_BY_TYPE[type]) || null
}
