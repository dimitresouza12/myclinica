'use client'
import { usePermissions } from '@/hooks/usePermissions'

interface Props {
  module: string
  require?: 'view' | 'edit'
  children: React.ReactNode
  fallback?: React.ReactNode
}

/**
 * Renderiza children somente se o usuário tiver permissão no módulo.
 * Se não tiver, renderiza fallback (ou uma tela padrão de acesso negado).
 */
export function PermissionGuard({ module, require = 'view', children, fallback }: Props) {
  const { canView, canEdit, loaded } = usePermissions(module)

  if (!loaded) return null

  const allowed = require === 'edit' ? canEdit : canView

  if (!allowed) {
    return (
      fallback ?? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '60vh', gap: '0.75rem', color: 'var(--text-secondary)',
        }}>
          <span style={{ fontSize: '2.5rem' }}>🔒</span>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Acesso restrito</p>
          <p style={{ fontSize: '0.875rem' }}>Você não tem permissão para acessar este módulo.</p>
          <p style={{ fontSize: '0.78rem' }}>Fale com o administrador da clínica.</p>
        </div>
      )
    )
  }

  return <>{children}</>
}
