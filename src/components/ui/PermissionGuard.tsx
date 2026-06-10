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
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Acesso restrito</p>
          <p style={{ fontSize: '0.875rem' }}>Você não tem permissão para acessar este módulo.</p>
          <p style={{ fontSize: '0.78rem' }}>Fale com o administrador da clínica.</p>
        </div>
      )
    )
  }

  return <>{children}</>
}
