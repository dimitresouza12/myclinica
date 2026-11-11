// Responsável legal do paciente (fono, TO, psico infantil; tutor na veterinária). Lógica pura: quais áreas destacam
// o bloco, rótulo, sugestão para menor de 18 anos, payload e textos para documentos. As colunas guardian_* só existem
// depois da migration 20261120_patients_responsavel_legal.sql (ver guardianColumns.ts).
import type { ClinicType } from '@/types'
import { formatCpf } from '@/lib/numericFormat'

/** Colunas de `patients` que só existem depois da migration 20261120_patients_responsavel_legal.sql. */
export const GUARDIAN_COLUMNS = ['guardian_name', 'guardian_cpf', 'guardian_relationship', 'guardian_phone'] as const

/** Áreas em que o responsável legal é parte normal do cadastro (destaque no formulário). */
export const GUARDIAN_FOCUS_AREAS: readonly ClinicType[] = ['fono', 'to', 'psico', 'vet']

export const GUARDIAN_RELATIONSHIPS = ['Mãe', 'Pai', 'Avó', 'Avô', 'Tio(a)', 'Irmão(ã)', 'Tutor legal', 'Cuidador(a)', 'Outro'] as const

export const ADULT_AGE = 18

export interface GuardianFormValues {
  nome: string
  /** CPF mascarado ou só dígitos */
  cpf: string
  parentesco: string
  telefone: string
}

export const EMPTY_GUARDIAN_FORM: GuardianFormValues = { nome: '', cpf: '', parentesco: '', telefone: '' }

/** Alguma das áreas ativas pede o bloco destacado (fono, to, psico, vet). */
export function guardianIsFocus(areas: readonly ClinicType[]): boolean {
  return areas.some(a => GUARDIAN_FOCUS_AREAS.includes(a))
}

/** Rótulos do bloco: "Tutor" quando a clínica é só de veterinária (ou o profissional é vet); senão "Responsável legal". */
export function guardianLabels(areas: readonly ClinicType[]): { title: string; name: string; cpf: string; phone: string; hint: string } {
  const vet = areas.length > 0 && areas.every(a => a === 'vet')
  if (vet) {
    return {
      title: 'Outro tutor ou responsável',
      name: 'Nome do tutor',
      cpf: 'CPF do tutor',
      phone: 'Telefone do tutor',
      hint: 'Preencha se outra pessoa responde pelo animal. O tutor principal é o cadastro acima.',
    }
  }
  return {
    title: 'Responsável legal',
    name: 'Nome do responsável',
    cpf: 'CPF do responsável',
    phone: 'Telefone do responsável',
    hint: 'Quem assina termos e responde pelo paciente (menor de idade ou sem autonomia).',
  }
}

/** Idade em anos completos a partir do nascimento (AAAA-MM-DD); null se a data for inválida ou futura. */
export function ageInYears(birthISO: string | null | undefined, today: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthISO ?? '')
  if (!m) return null
  const by = Number(m[1]), bm = Number(m[2]), bd = Number(m[3])
  const ty = today.getFullYear(), tm = today.getMonth() + 1, td = today.getDate()
  let age = ty - by
  if (tm < bm || (tm === bm && td < bd)) age -= 1
  return age >= 0 ? age : null
}

/** Paciente menor de 18 anos (nascimento válido). */
export function isMinor(birthISO: string | null | undefined, today: Date = new Date()): boolean {
  const age = ageInYears(birthISO, today)
  return age !== null && age < ADULT_AGE
}

/** O bloco tem algum dado preenchido. */
export function hasGuardianData(v: Partial<GuardianFormValues> | null | undefined): boolean {
  return !!v && [v.nome, v.cpf, v.parentesco, v.telefone].some(x => (x ?? '').trim() !== '')
}

const orNull = (v: string) => (v.trim() ? v.trim() : null)

/**
 * Colunas de `patients` do responsável. Sem as colunas no banco devolve {} (nada é enviado e o cadastro grava como antes).
 * `cpf` e `telefone` chegam já validados pela tela (CPF guardado como no campo `cpf`, com máscara).
 */
export function buildGuardianColumns(v: GuardianFormValues, opts: { enabled: boolean }): Record<string, unknown> {
  if (!opts.enabled) return {}
  return {
    guardian_name: orNull(v.nome),
    guardian_cpf: v.cpf.trim() || null,
    guardian_relationship: orNull(v.parentesco),
    guardian_phone: orNull(v.telefone),
  }
}

/** Erro de "coluna inexistente" ligado às colunas do responsável (o banco ainda não recebeu o SQL). */
export function isGuardianColumnError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false
  const text = `${error.code ?? ''} ${error.message ?? ''}`
  return /guardian_/i.test(text) && /42703|PGRST204|schema cache|column|does not exist/i.test(text)
}

/** Remove as colunas do responsável de um payload (nova tentativa de gravação quando o banco ainda não as tem). */
export function stripGuardianColumns<T extends Record<string, unknown>>(payload: T): Omit<T, typeof GUARDIAN_COLUMNS[number]> {
  const copy: Record<string, unknown> = { ...payload }
  for (const c of GUARDIAN_COLUMNS) delete copy[c]
  return copy as Omit<T, typeof GUARDIAN_COLUMNS[number]>
}

export interface GuardianLike {
  guardian_name?: string | null
  guardian_cpf?: string | null
  guardian_relationship?: string | null
}

/** "Maria Souza, CPF 000.000.000-00" (sem CPF: só o nome; sem nome: ''), para os campos {{responsavel_ident}} dos documentos. */
export function guardianIdent(p: GuardianLike | null | undefined): string {
  const name = (p?.guardian_name ?? '').trim()
  if (!name) return ''
  const cpf = formatCpf(p?.guardian_cpf)
  return cpf ? `${name}, CPF ${cpf}` : name
}
