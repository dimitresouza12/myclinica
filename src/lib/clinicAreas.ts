import type { ClinicType, UserRole } from '@/types'
import { getSpecialtyConfig, roleForSpecialty } from '@/lib/specialtyConfig'

// Regras puras de "áreas de atuação" da clínica, usadas em Equipe e em
// Configurações → Equipe. A clínica nasce com uma área (clinic.type), mas
// qualquer admin pode cadastrar profissional de QUALQUER das 9 áreas; a área
// nova entra em clinic.specialties e a clínica passa a ser multi-área.

/** Cargos que não atendem paciente (não viram linha em `professionals`). */
const NON_CLINICAL_ROLES: UserRole[] = ['recepcao', 'auxiliar', 'admin']

export function isClinicalRole(role: UserRole): boolean {
  return !NON_CLINICAL_ROLES.includes(role)
}

/** Áreas que a clínica já atende: specialties, ou só a área do cadastro quando a lista vem vazia. */
export function clinicAreaList(clinic: { type: ClinicType; specialties?: ClinicType[] | null }): ClinicType[] {
  return clinic.specialties?.length ? clinic.specialties : [clinic.type]
}

/** Multi-área = flag do cadastro OU mais de uma área em uso (a flag não é atualizada pelos RPCs de membro). */
export function isMultiArea(clinic: { type: ClinicType; specialties?: ClinicType[] | null; isMultiSpecialty?: boolean }): boolean {
  return !!clinic.isMultiSpecialty || clinicAreaList(clinic).length > 1
}

/** Junta uma área à lista, sem duplicar. `changed` diz se algo foi acrescentado. */
export function withClinicArea(areas: ClinicType[], area: ClinicType): { areas: ClinicType[]; changed: boolean } {
  return areas.includes(area) ? { areas, changed: false } : { areas: [...areas, area], changed: true }
}

/** Área pré-selecionada ao cadastrar profissional: a da clínica quando ela tem uma só; senão a pessoa escolhe. */
export function defaultProfessionalArea(clinic: { type: ClinicType; specialties?: ClinicType[] | null; isMultiSpecialty?: boolean }): ClinicType | '' {
  return isMultiArea(clinic) ? '' : clinic.type
}

/** Cargo (clinic_users.role) de um profissional clínico da área; sem área, o genérico. */
export function clinicalRoleForArea(area: ClinicType | ''): UserRole {
  return area ? roleForSpecialty(area) : 'profissional'
}

/**
 * Valor do seletor de "Função / Área" para um usuário. Usuários antigos de clínica de uma área só têm
 * specialty_type nulo e cargo genérico ('dentista', 'medico', 'profissional'): resolve pra área da clínica
 * quando o cargo bate com ela, senão devolve o próprio cargo.
 */
export function roleOrAreaValue(role: UserRole, specialtyType: ClinicType | '' | null | undefined, clinicType: ClinicType): string {
  if (specialtyType) return specialtyType
  if (isClinicalRole(role) && roleForSpecialty(clinicType) === role) return clinicType
  return role
}

/** Texto do campo Especialidade (seleção fechada): sem área ainda, manda escolher a área primeiro. */
export function specialtyPlaceholder(area: ClinicType | '' | null | undefined): string {
  return area ? 'Selecione a especialidade' : 'Escolha a área acima primeiro'
}

/**
 * Opções do seletor de Especialidade: só as da área (professionalSpecialties), sem digitação livre.
 * Cadastro antigo com valor fora da lista (texto livre de antes) mantém o valor atual como opção extra,
 * pra editar o profissional sem perder o que já estava salvo.
 */
export function specialtyOptions(area: ClinicType | '' | null | undefined, current?: string | null): { value: string; label: string }[] {
  const list = area ? getSpecialtyConfig(area).professionalSpecialties : []
  const saved = (current ?? '').trim()
  const extra = saved && !list.includes(saved) ? [saved] : []
  return [{ value: '', label: 'Sem especialidade' }, ...[...list, ...extra].map(v => ({ value: v, label: v }))]
}

/** Texto de apoio do campo Especialidade (só Medicina precisa: a área é ampla). */
export function specialtyHint(area: ClinicType | '' | null | undefined): string | null {
  return area === 'medico' ? 'Em Medicina, a especialidade médica entra aqui (Cardiologia, Pediatria, Ginecologia...).' : null
}
