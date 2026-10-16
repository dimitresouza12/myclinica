import { getSpecialtyConfig, specialtyRoleLabel } from '@/lib/specialtyConfig'
import type { AuthClinic, AuthUser } from '@/types'

// Rótulo humano do cargo: primeiro o específico da especialidade da clínica (ex: "Dentista", "Esteticista"),
// com fallback genérico. Usado pelo menu do perfil e pela barra lateral do celular.
const ROLE_LABELS_FALLBACK: Record<string, string> = {
  admin:        'Admin',
  recepcao:     'Recepção',
  auxiliar:     'Auxiliar',
  dentista:     'Dentista',
  medico:       'Médico',
  profissional: 'Profissional',
  superadmin:   'Superadmin',
}

export function userRoleLabel(user: AuthUser, clinic: Pick<AuthClinic, 'type'> | null): string {
  if (user.isSuperAdmin) return 'Superadmin'
  // specialtyType manda quando existe: diferencia "Nutricionista" de "Esteticista" numa clínica
  // multi-área (os dois têm o mesmo cargo genérico 'profissional' no banco)
  if (user.specialtyType) return specialtyRoleLabel(user.specialtyType)
  return (clinic ? getSpecialtyConfig(clinic.type).roles.find(r => r.value === user.role)?.label : undefined)
    ?? ROLE_LABELS_FALLBACK[user.role]
    ?? user.role
}

export function userInitials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}
