'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { usePermissionsStore } from '@/store/permissions'
import { useTheme } from '@/hooks/useTheme'
import { Icon, type IconName } from '@/components/ui/Icon'
import type { AuthClinic, AuthUser } from '@/types'
import styles from './AppSidebar.module.css'
import { Logotype } from '@/components/login/Logotype'
import { hasWhatsAppAI } from '@/lib/planGates'
import { useWhatsAppState } from '@/hooks/useClinicData'
import { useUnreadTotal, useWhatsAppRealtime } from '@/hooks/useWhatsAppInbox'
import { userRoleLabel, userInitials } from '@/lib/roleLabel'
import { CLINIC_TYPE_LABELS } from '@/lib/specialtyConfig'
import { logout } from '@/lib/logout'
import { useDemoPicker } from '@/store/demoPicker'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useSidebarRail } from '@/hooks/useSidebarRail'

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
  const openSwitchSpecialty = useDemoPicker(s => s.openSwitch)
  // "agora" fixado na montagem: o aviso de teste conta dias, não precisa mudar a cada render
  const [now] = useState(() => Date.now())
  const isAdmin = user.role === 'admin' || user.isSuperAdmin
  // Mensagens: contador de não lidas no menu, atualizado em tempo real (só quando a clínica já conectou o WhatsApp)
  const { data: waState } = useWhatsAppState(clinic.id)
  useWhatsAppRealtime(clinic.id, !!waState)
  const { data: unreadTotal = 0 } = useUnreadTotal(clinic.id, !!waState)
  const roleLabel = userRoleLabel(user, clinic)

  // Desktop com mouse: trilho estreito que se estende no hover/foco. Celular, toque e tablet seguem como antes
  const isRail = useMediaQuery('(min-width: 769px) and (hover: hover) and (pointer: fine)')
  const { expanded, handlers: railHandlers } = useSidebarRail(isRail)
  // true quando só os ícones aparecem (trilho encolhido): serve para dicas de nome e rótulos
  const isCollapsed = isRail && !expanded

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
        title={isCollapsed ? item.label : undefined}
        onClick={onMobileClose}
      >
        <span className={styles.iconWrap}>
          <Icon name={item.icon} size={16} />
        </span>
        <span className={styles.navLabel}>{item.label}</span>
        {item.path === '/mensagens' && unreadTotal > 0 && (
          <span className={styles.navBadge} aria-label={`${unreadTotal} mensagens não lidas`}>
            {unreadTotal > 99 ? '99+' : unreadTotal}
          </span>
        )}
      </Link>
    )
  }

  return (
    <div className={styles.slot}>
    <aside
      className={[
        styles.sidebar,
        isRail ? styles.rail : '',
        isRail && expanded ? styles.railOpen : '',
        mobileOpen ? styles.mobileOpen : '',
      ].join(' ')}
      style={{ '--clinic-color': clinic.color } as React.CSSProperties}
      {...railHandlers}
    >
      <div className={styles.brand}>
        <div className={styles.brandTop}>
          <img src="/favicon.svg" alt="" className={styles.brandIcon} />
          <Logotype className={styles.brandLogotype} />
        </div>
        <div className={styles.clinic}>
          {clinic.logo
            ? <img src={clinic.logo} alt="" className={styles.clinicMark} />
            : <span className={styles.clinicMark} aria-hidden>{clinic.name.trim().charAt(0).toUpperCase()}</span>}
          <span className={styles.clinicText}>
            <b>{clinic.name}</b>
          </span>
        </div>
      </div>

      <nav className={styles.nav} aria-label="Menu principal">
        {groups.map((g, i) => (
          <div key={g.title ?? i} className={styles.group}>
            {g.title && <span className={styles.groupTitle}>{g.title}</span>}
            {g.items.map(renderItem)}
          </div>
        ))}
      </nav>

      <div className={styles.bottom}>
        {trialDaysLeft !== null && (
          <Link href="/configuracoes?tab=plano" className={styles.trialNote} title={isCollapsed ? 'Período de teste: ver planos' : undefined} onClick={onMobileClose}>
            <span className={styles.trialIcon} aria-hidden><Icon name="clock" size={16} /></span>
            <span className={styles.trialText}>
              <b>{trialDaysLeft === 0 ? 'Seu teste termina hoje' : `Teste: ${trialDaysLeft} ${trialDaysLeft === 1 ? 'dia restante' : 'dias restantes'}`}</b>
              <span>Ver planos</span>
            </span>
          </Link>
        )}
        {bottomItems.map(renderItem)}
      </div>

      {/* ── Conta de demonstração: trocar de especialidade (no desktop o item fica no menu do perfil, na barra de cima) ── */}
      {clinic.demoMode && (
        <button
          type="button"
          className={styles.themeRow}
          onClick={() => { onMobileClose?.(); openSwitchSpecialty() }}
          title="Trocar especialidade"
        >
          <span className={styles.themeIconWrap}>
            <Icon name="swap" size={16} />
          </span>
          <span className={styles.sideItemLabel}>
            Trocar especialidade
            <small className={styles.demoNow}>Agora: {CLINIC_TYPE_LABELS[clinic.type]}</small>
          </span>
        </button>
      )}

      {/* ── Tema — elemento único, label some com CSS ── */}
      <button
        className={styles.themeRow}
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
        className={styles.supportRow}
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
      <div className={styles.footer}>
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
    </div>
  )
}
