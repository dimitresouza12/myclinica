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
