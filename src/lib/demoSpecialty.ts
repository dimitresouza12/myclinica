import type { AuthClinic, AuthUser, ClinicType } from '@/types'

// Conta de demonstração (clinics.demo_mode = true): a área ativa é uma escolha
// da SESSÃO, nunca gravada no banco. Ela sobrescreve clinic.type, clinic.specialties
// e user.specialtyType/professionalId no store; o que valia antes fica em
// DemoBase pra poder restaurar. Nenhum update do app grava clinic.type nem
// clinic.specialties do store no banco (os updates em clinics usam campos explícitos). Clínicas de clientes nunca passam por aqui.

/** As 9 áreas, na ordem em que aparecem no seletor. */
export const DEMO_AREAS: ClinicType[] = ['odonto', 'medico', 'estetica', 'vet', 'fisio', 'psico', 'nutri', 'fono', 'to']

/** O que a sessão tinha antes da escolha de área. */
export interface DemoBase {
  type: ClinicType
  specialties: ClinicType[]
  specialtyType: ClinicType | null
  professionalId: string | null
}

export function isDemoArea(value: unknown): value is ClinicType {
  return typeof value === 'string' && (DEMO_AREAS as string[]).includes(value)
}

/** Aplica a área escolhida por cima da sessão. Só chamar com clinic.demoMode verdadeiro. */
export function applyDemoSpecialty(
  clinic: AuthClinic,
  user: AuthUser,
  area: ClinicType,
  professionalId: string | null,
): { clinic: AuthClinic; user: AuthUser } {
  return {
    clinic: { ...clinic, type: area, specialties: [area] },
    user: { ...user, specialtyType: area, professionalId },
  }
}

/** Devolve type, specialtyType e professionalId originais. */
export function restoreDemoBase(
  clinic: AuthClinic,
  user: AuthUser,
  base: DemoBase,
): { clinic: AuthClinic; user: AuthUser } {
  return {
    clinic: { ...clinic, type: base.type, specialties: base.specialties ?? clinic.specialties },
    user: { ...user, specialtyType: base.specialtyType, professionalId: base.professionalId },
  }
}
