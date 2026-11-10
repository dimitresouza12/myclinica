import type { AuthUser } from '@/types'

// Modelo de acesso por profissional (docs/plano-acesso-por-profissional-2026-08-12.md):
// admin e recepção sempre veem tudo da clínica; qualquer outro profissional
// com login vinculado (professionalId) fica restrito ao que é dele quando a
// clínica tem professional_scoped_access = true. A restrição de verdade é a
// RLS no banco — isto aqui é só pra a query já vir filtrada/eficiente e a UI
// refletir o que o banco de qualquer forma vai devolver.
export function isAdminOrRecepcao(user: AuthUser | null | undefined): boolean {
  return !!user && (user.isSuperAdmin || user.role === 'admin' || user.role === 'recepcao')
}

export function myScopedProfessionalId(user: AuthUser | null | undefined): string | null {
  if (!user || isAdminOrRecepcao(user)) return null
  return user.professionalId ?? null
}

/** Só o administrador (e o superadmin): ações que não devem ficar soltas na recepção, como excluir. */
export function isAdmin(user: AuthUser | null | undefined): boolean {
  return !!user && (user.isSuperAdmin || user.role === 'admin')
}

/**
 * Como achar o `professionals` do login atual: pelo id já resolvido na sessão (user.professionalId,
 * que no login vem de professionals.clinic_user_id = clinicUserId, ou é o profissional da área
 * escolhida na conta de demonstração) e, sem ele, pelo vínculo clinic_user_id. null = sem como achar.
 */
export function ownProfessionalLookup(user: AuthUser | null | undefined):
  { column: 'id' | 'clinic_user_id'; value: string } | null {
  if (!user) return null
  if (user.professionalId) return { column: 'id', value: user.professionalId }
  if (user.clinicUserId) return { column: 'clinic_user_id', value: user.clinicUserId }
  return null
}
