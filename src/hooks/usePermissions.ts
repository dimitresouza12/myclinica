'use client'
import { useEffect } from 'react'
import { usePermissionsStore } from '@/store/permissions'
import { useAuthStore } from '@/store/auth'

/**
 * Carrega e expõe as permissões do usuário logado.
 * Admin/superadmin sempre têm acesso total.
 *
 * Uso:
 *   const { canView, canEdit } = usePermissions('financeiro')
 */
export function usePermissions(module?: string) {
  const { user } = useAuthStore()
  const { permissions, loaded, load, error } = usePermissionsStore()

  useEffect(() => {
    if (user && !loaded) load()
  }, [user, loaded, load])

  // Admin e superadmin têm acesso total
  const isAdmin = user?.role === 'admin' || user?.isSuperAdmin
  if (isAdmin) return { canView: true, canEdit: true, metadata: {}, loaded: true, isAdmin: true, error: false }

  if (!module) return { canView: true, canEdit: true, metadata: {}, loaded, isAdmin: false, error }

  const perm = permissions[module]

  // Se não há registro de permissão para o módulo, nega por padrão
  const canView = perm?.can_view ?? false
  const canEdit = perm?.can_edit ?? false
  const metadata = perm?.metadata ?? {}

  return { canView, canEdit, metadata, loaded, isAdmin: false, error }
}
