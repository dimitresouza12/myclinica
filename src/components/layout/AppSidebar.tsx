'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { usePermissionsStore } from '@/store/permissions'
import { useTheme } from '@/hooks/useTheme'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Portal } from '@/components/ui/Portal'
import type { AuthClinic, AuthUser } from '@/types'
import styles from './AppSidebar.module.css'
import { hasWhatsAppAI } from '@/lib/planGates'
import { useWhatsAppState } from '@/hooks/useClinicData'
import { useUnreadTotal, useWhatsAppRealtime } from '@/hooks/useWhatsAppInbox'
import { userRoleLabel, userInitials } from '@/lib/roleLabel'
import { logout } from '@/lib/logout'

interface NavItem { path: string; label: string; icon: IconName; plusOnly?: boolean; module?: string }

// Grupos por rotina: o que se usa todo dia fica no alto; Configurações vai para o pé da barra
const NAV_GROUPS: { title: string | null; items: NavItem[] }[] = [
  { title: null, items: [
    { path: '/dashboard',     label: 'Dashboard',     icon: 'dashboard' },
  ] },
  { title: 'Dia a dia', items: [
    { path: '/agenda',        label: 'Agenda',        icon: 'calendar' },
    { path: '/pacientes',     label: 'Pacientes',     icon: 'patients' },
    { path: '/mensagens',     label: 'Mensagens',     icon: 'messages', module: 'crm' },
  ] },
  { title: 'Gestão', items: [
    { path: '/financeiro',    label: 'Financeiro',    icon: 'wallet' },
    { path: '/comissoes',     label: 'Comissões',     icon: 'percent' },
    { path: '/metas',         label: 'Metas',         icon: 'target' },
    { path: '/relatorios',    label: 'Relatórios',    icon: 'reports' },
  ] },
  { title: 'Clínica', items: [
    { path: '/procedimentos', label: 'Procedimentos', icon: 'procedures' },
    { path: '/estoque',       label: 'Estoque',       icon: 'stock' },
    { path: '/equipe',        label: 'Equipe',        icon: 'team' },
  ] },
  { title: 'Captação', items: [
    { path: '/crm',           label: 'CRM',           icon: 'crm' },
    { path: '/campanhas',     label: 'Campanhas',     icon: 'campaigns', plusOnly: true },
  ] },
]
const SETTINGS_ITEM: NavItem = { path: '/configuracoes', label: 'Configurações', icon: 'settings' }
const ADMIN_ITEM: NavItem = { path: '/admin', label: 'Admin', icon: 'admin' }

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
  // dica de nome no modo recolhido (posição fixa: a barra tem overflow hidden e cortaria um balão em CSS puro)
  const [tip, setTip] = useState<{ label: string; top: number; left: number } | null>(null)
  // "agora" fixado na montagem: o aviso de teste conta dias, não precisa mudar a cada render
  const [now] = useState(() => Date.now())
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
  function canSee(item: NavItem) {
    // Filtra plano plus
    if (item.plusOnly && !isPlus) return false
    // Admin e superadmin sempre veem tudo
    if (isAdmin) return true
    // Aguarda permissões carregarem para não piscar
    if (!permsLoaded) return false
    // Verifica permissão de visualização para o módulo
    const perm = permissions[item.module ?? item.path.replace('/', '')]
    return perm?.can_view ?? false
  }
  const groups = NAV_GROUPS
    .map(g => ({ ...g, items: g.items.filter(canSee) }))
    .filter(g => g.items.length > 0)
  const bottomItems = [
    ...(canSee(SETTINGS_ITEM) ? [SETTINGS_ITEM] : []),
    ...(user.isSuperAdmin ? [ADMIN_ITEM] : []),
  ]

  const initials = userInitials(user.displayName)

  function showTip(e: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>, label: string) {
    if (!isCollapsed) return
    const r = e.currentTarget.getBoundingClientRect()
    setTip({ label, top: r.top + r.height / 2, left: r.right + 10 })
  }
  const hideTip = () => setTip(null)

  // Aviso de período de teste: só para clínica em teste e que ainda não assinou
  const trialDaysLeft = clinic.status === 'trial' && !clinic.billingPaid && clinic.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(clinic.trialEndsAt).getTime() - now) / 86_400_000))
    : null

  function renderItem(item: NavItem) {
    const active = pathname.startsWith(item.path)
    return (
      <Link
        key={item.path}
        href={item.path}
        className={`${styles.navItem} ${active ? styles.active : ''}`}
        aria-current={active ? 'page' : undefined}
        onClick={onMobileClose}
        onMouseEnter={e => showTip(e, item.label)}
        onMouseLeave={hideTip}
        onFocus={e => showTip(e, item.label)}
        onBlur={hideTip}
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
  }

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
            <div className={styles.clinic}>
              {clinic.logo
                ? <img src={clinic.logo} alt="" className={styles.clinicMark} />
                : <span className={styles.clinicMark} aria-hidden>{clinic.name.trim().charAt(0).toUpperCase()}</span>}
              <span className={styles.clinicText}>
                <b>{clinic.name}</b>
              </span>
            </div>
          </>
        )}
      </div>

      <nav className={styles.nav} aria-label="Menu principal">
        {groups.map((g, i) => (
          <div key={g.title ?? i} className={styles.group}>
            {g.title && (
              <span className={`${styles.groupTitle} ${isCollapsed ? styles.groupTitleCollapsed : ''}`}>{g.title}</span>
            )}
            {g.items.map(renderItem)}
          </div>
        ))}
      </nav>

      <div className={styles.bottom}>
        {trialDaysLeft !== null && !isCollapsed && (
          <Link href="/configuracoes?tab=plano" className={styles.trialNote} onClick={onMobileClose}>
            <b>{trialDaysLeft === 0 ? 'Seu teste termina hoje' : `Teste: ${trialDaysLeft} ${trialDaysLeft === 1 ? 'dia restante' : 'dias restantes'}`}</b>
            <span>Ver planos</span>
          </Link>
        )}
        {bottomItems.map(renderItem)}
        <button
          type="button"
          className={styles.collapseBtn}
          onClick={toggleCollapse}
          aria-label={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
          onMouseEnter={e => showTip(e, 'Expandir menu')}
          onMouseLeave={hideTip}
          onFocus={e => showTip(e, 'Expandir menu')}
          onBlur={hideTip}
        >
          <span className={styles.iconWrap}>
            <Icon name={isCollapsed ? 'chevronRight' : 'chevronLeft'} size={16} />
          </span>
          <span className={`${styles.navLabel} ${isCollapsed ? styles.navLabelHidden : ''}`}>Recolher menu</span>
        </button>
      </div>

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
      {tip && isCollapsed && (
        <Portal>
          <div role="tooltip" className={styles.tip} style={{ top: tip.top, left: tip.left }}>{tip.label}</div>
        </Portal>
      )}
    </aside>
  )
}
