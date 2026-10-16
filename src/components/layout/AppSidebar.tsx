'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { usePermissionsStore } from '@/store/permissions'
import { useTheme } from '@/hooks/useTheme'
import { Icon } from '@/components/ui/Icon'
import type { AuthClinic, AuthUser } from '@/types'
import styles from './AppSidebar.module.css'
import { hasWhatsAppAI } from '@/lib/planGates'
import { useWhatsAppState } from '@/hooks/useClinicData'
import { useUnreadTotal, useWhatsAppRealtime } from '@/hooks/useWhatsAppInbox'
import { userRoleLabel, userInitials } from '@/lib/roleLabel'
import { logout } from '@/lib/logout'

const NAV = [
  { path: '/dashboard',     label: 'Dashboard',     icon: 'dashboard'  as const, plusOnly: false },
  { path: '/pacientes',     label: 'Pacientes',     icon: 'patients'   as const, plusOnly: false },
  { path: '/agenda',        label: 'Agenda',        icon: 'calendar'   as const, plusOnly: false },
  { path: '/financeiro',    label: 'Financeiro',    icon: 'finance'     as const, plusOnly: false },
  { path: '/comissoes',     label: 'Comissões',     icon: 'percent'    as const, plusOnly: false },
  { path: '/procedimentos', label: 'Procedimentos', icon: 'procedures' as const, plusOnly: false },
  { path: '/relatorios',    label: 'Relatórios',    icon: 'reports'    as const, plusOnly: false },
  { path: '/metas',         label: 'Metas',         icon: 'target'     as const, plusOnly: false },
  { path: '/estoque',       label: 'Estoque',       icon: 'stock'      as const, plusOnly: false },
  { path: '/equipe',        label: 'Equipe',        icon: 'team'       as const, plusOnly: false },
  { path: '/mensagens',     label: 'Mensagens',     icon: 'chat'       as const, plusOnly: false, module: 'crm' as string | undefined },
  { path: '/crm',           label: 'CRM',           icon: 'crm'        as const, plusOnly: false },
  { path: '/campanhas',     label: 'Campanhas',     icon: 'campaigns'  as const, plusOnly: true  },
  { path: '/configuracoes', label: 'Configurações', icon: 'settings'   as const, plusOnly: false },
]

interface Props {
  clinic: AuthClinic
  user: AuthUser
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function AppSidebar({ clinic, user, mobileOpen = false, onMobileClose }: Props) {
  const pathname = usePathname()
  const { permissions, loaded: permsLoaded } = usePermissionsStore()
  const { theme, toggle: toggleTheme } = useTheme()
  const [collapsed, setCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const isAdmin = user.role === 'admin' || user.isSuperAdmin
  // Mensagens: contador de não lidas no menu, atualizado em tempo real (só quando a clínica já conectou o WhatsApp)
  const { data: waState } = useWhatsAppState(clinic.id)
  useWhatsAppRealtime(clinic.id, !!waState)
  const { data: unreadTotal = 0 } = useUnreadTotal(clinic.id, !!waState)
  const roleLabel = userRoleLabel(user, clinic)

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved === 'true') setCollapsed(true)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // No mobile a sidebar sempre abre expandida (collapsed só vale no desktop)
  const isCollapsed = isMobile ? false : collapsed

  function toggleCollapse() {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })
  }

  const handleLogout = logout

  const isPlus = hasWhatsAppAI(clinic.plan)
  const filteredNav = NAV.filter((item) => {
    // Filtra plano plus
    if (item.plusOnly && !isPlus) return false
    // Admin e superadmin sempre veem tudo
    if (isAdmin) return true
    // Aguarda permissões carregarem para não piscar
    if (!permsLoaded) return false
    // Verifica permissão de visualização para o módulo
    const module = ('module' in item && item.module) || item.path.replace('/', '')
    const perm = permissions[module]
    return perm?.can_view ?? false
  })
  const navItems = user.isSuperAdmin
    ? [...filteredNav, { path: '/admin', label: 'Admin', icon: 'admin' as const, plusOnly: false }]
    : filteredNav

  const initials = userInitials(user.displayName)

  return (
    <aside
      className={[
        styles.sidebar,
        isCollapsed ? styles.collapsed : '',
        mobileOpen ? styles.mobileOpen : '',
      ].join(' ')}
      style={{ '--clinic-color': clinic.color } as React.CSSProperties}
    >
      <div className={`${styles.brand} ${isCollapsed ? styles.brandCollapsed : ''}`}>
        {isCollapsed ? (
          <img src="/favicon.svg" alt="MyClinica" className={styles.brandIcon} />
        ) : (
          <>
            <span className={styles.logoText}>My<strong>Clinica</strong></span>
            <span className={styles.clinicName}>{clinic.name}</span>
          </>
        )}
      </div>

      <button
        className={`${styles.collapseBtn} ${isCollapsed ? styles.collapseBtnCenter : ''}`}
        onClick={toggleCollapse}
        title={isCollapsed ? 'Expandir' : 'Recolher'}
      >
        <Icon name={isCollapsed ? 'chevronRight' : 'chevronLeft'} size={13} />
      </button>

      <nav className={`${styles.nav} ${isCollapsed ? styles.navCollapsed : ''}`}>
        {navItems.map((item) => {
          const active = pathname.startsWith(item.path)
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`${styles.navItem} ${active ? styles.active : ''} ${isCollapsed ? styles.navItemCollapsed : ''}`}
              title={isCollapsed ? item.label : undefined}
              onClick={onMobileClose}
            >
              <span className={styles.iconWrap}>
                <Icon name={item.icon} size={16} />
              </span>
              <span className={`${styles.navLabel} ${isCollapsed ? styles.navLabelHidden : ''}`}>{item.label}</span>
              {item.path === '/mensagens' && unreadTotal > 0 && (
                <span className={`${styles.navBadge} ${isCollapsed ? styles.navBadgeDot : ''}`} aria-label={`${unreadTotal} mensagens não lidas`}>
                  {isCollapsed ? '' : unreadTotal > 99 ? '99+' : unreadTotal}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* ── Tema — elemento único, label some com CSS ── */}
      <button
        className={`${styles.themeRow} ${isCollapsed ? styles.sideItemCollapsed : ''}`}
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
      >
        <span className={styles.themeIconWrap}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
        </span>
        <span className={styles.sideItemLabel}>{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</span>
      </button>

      {/* ── Suporte — elemento único, label some com CSS ── */}
      <a
        href="https://wa.me/5588920020570?text=Ol%C3%A1%2C+preciso+de+suporte+com+o+MyClinica."
        target="_blank"
        rel="noopener noreferrer"
        className={`${styles.supportRow} ${isCollapsed ? styles.sideItemCollapsed : ''}`}
        title="Suporte via WhatsApp"
      >
        <span className={styles.supportIcon}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
          </svg>
        </span>
        <span className={styles.sideItemLabel}>Suporte via WhatsApp</span>
      </a>

      {/* ── Footer ── */}
      <div className={`${styles.footer} ${isCollapsed ? styles.footerCollapsed : ''}`}>
        <div className={styles.avatar}>{initials}</div>
        <div className={styles.userInfo}>
          <span className={styles.userName}>{user.displayName}</span>
          <span className={styles.userRole}>{roleLabel}</span>
        </div>
        <button onClick={handleLogout} className={styles.logoutBtn} title="Sair">
          <Icon name="logout" size={15} />
        </button>
      </div>
    </aside>
  )
}
