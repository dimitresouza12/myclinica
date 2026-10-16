'use client'
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './TopBar.module.css'
import { Icon } from '@/components/ui/Icon'
import { GlobalSearch } from '@/components/layout/GlobalSearch'
import { useAuthStore } from '@/store/auth'
import { usePermissionsStore } from '@/store/permissions'
import { usePageSearch } from '@/store/pageSearch'
import { useDashboardData, useEstoqueData } from '@/hooks/useClinicData'
import { ALERT_META, SYSTEM_ALERT_LINK, alertKeyOf, alertMessage, buildWaLink, ignoreAlert, ignoredStorageKey, parseIgnoredAlerts, subscribeIgnoredAlerts, withLowStockAlert } from '@/lib/actionAlerts'
import { waMeNumber } from '@/lib/phoneFormat'
import { formatDate } from '@/lib/utils'
import { useTheme } from '@/hooks/useTheme'
import { userInitials, userRoleLabel } from '@/lib/roleLabel'
import { logout } from '@/lib/logout'

interface Props {
  onMenuToggle: () => void
}

const SUPPORT_URL = 'https://wa.me/5588920020570?text=Ol%C3%A1%2C+preciso+de+suporte+com+o+MyClinica.'

/** Fecha o painel ao clicar fora ou apertar Esc (devolvendo o foco ao botão que o abriu). */
function useDismiss(open: boolean, onClose: () => void, wrap: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      onClose()
      wrap.current?.querySelector<HTMLElement>('[aria-haspopup]')?.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, onClose, wrap])
}

function Popover({ id, label, children, className }: { id: string; label: string; children: ReactNode; className?: string }) {
  return <div id={id} role="menu" aria-label={label} className={`${styles.popover} ${className ?? ''}`}>{children}</div>
}

/** Busca da barra: a palavra muda por tela. Onde a tela já tem lista para filtrar, filtra a lista; no resto abre o paciente. */
const PAGE_SEARCH: { prefix: string; placeholder: string }[] = [
  { prefix: '/agenda',   placeholder: 'Buscar agendamentos' },
  { prefix: '/crm',      placeholder: 'Buscar leads' },
  { prefix: '/estoque',  placeholder: 'Buscar produtos' },
  { prefix: '/mensagens', placeholder: 'Buscar conversas' },
]

function BarSearch() {
  const pathname = usePathname()
  const [query, setQuery] = usePageSearch()
  const page = PAGE_SEARCH.find(p => pathname.startsWith(p.prefix))
  if (pathname.startsWith('/admin')) return null
  if (!page) return <GlobalSearch size="bar" placeholder="Buscar pacientes" />
  return (
    <label className={styles.pageSearch}>
      <Icon name="search" size={16} />
      <input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') setQuery('') }}
        placeholder={page.placeholder}
        aria-label={page.placeholder}
      />
    </label>
  )
}

/** "Ações necessárias" do Dashboard, também na barra: contador e lista curta com o botão de cada ação. */
function AlertsMenu() {
  const { clinic, user } = useAuthStore()
  const { permissions, loaded } = usePermissionsStore()
  const canSee = !!user && (user.role === 'admin' || !!user.isSuperAdmin || (loaded && !!permissions['dashboard']?.can_view))
  const clinicId = canSee && !user?.isSuperAdmin ? clinic?.id : undefined
  const { data } = useDashboardData(clinicId)
  const { data: estoque } = useEstoqueData(clinicId)
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const id = useId()
  useDismiss(open, () => setOpen(false), wrap)

  // as ignoradas ficam guardadas neste navegador (7 dias) e valem em qualquer tela
  const [now] = useState(() => Date.now())
  const rawIgnored = useSyncExternalStore(
    subscribeIgnoredAlerts,
    () => (clinicId ? window.localStorage.getItem(ignoredStorageKey(clinicId)) : null),
    () => null,
  )
  const ignored = useMemo(() => parseIgnoredAlerts(rawIgnored, now), [rawIgnored, now])
  function ignore(key: string) {
    if (clinicId) ignoreAlert(clinicId, key, ignored)
  }

  const lowStock = (estoque?.items ?? []).filter(i => i.quantity <= i.min_quantity).length
  const alerts = withLowStockAlert(data?.alerts ?? [], lowStock).filter(a => !ignored[alertKeyOf(a)])
  if (!clinicId || alerts.length === 0) return null

  return (
    <div className={styles.menuWrap} ref={wrap}>
      <button type="button" className={`${styles.iconBtn} ${styles.alertBtn} ${open ? styles.iconBtnOn : ''}`} aria-label={`Ações necessárias: ${alerts.length}`} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}>
        <Icon name="alert" size={18} />
        <sup className={styles.alertCount}>{alerts.length > 99 ? '99+' : alerts.length}</sup>
      </button>
      {open && (
        <Popover id={id} label="Ações necessárias" className={styles.popAlerts}>
          <p className={styles.popTitle}>Ações necessárias</p>
          <div className={styles.alertList}>
            {alerts.map(a => {
              const meta = ALERT_META[a.reason]
              const system = SYSTEM_ALERT_LINK[a.reason]
              const wa = !system && waMeNumber(a.phone) ? buildWaLink(a.phone ?? '', alertMessage(a.reason, a.name, clinic?.name ?? 'nossa clínica')) : null
              return (
                <div key={`${a.reason}-${a.patientId}`} className={styles.alertItem}>
                  <span className={styles.alertBadge} style={{ background: `${meta.color}1a`, color: meta.color }}>
                    <Icon name={meta.icon} size={12} /> {meta.label}
                  </span>
                  <span className={styles.alertWho}>
                    <b title={a.name}>{a.name}</b>
                    {!system && <small>{a.reason === 'aniversario' ? 'Hoje' : formatDate(a.date, true)}</small>}
                  </span>
                  <span className={styles.alertActions}>
                    {system
                      ? <Link className={styles.alertAct} href={system.href} onClick={() => setOpen(false)}>{system.label}</Link>
                      : wa && <a className={`${styles.alertAct} ${styles.alertActPrimary}`} href={wa} target="_blank" rel="noopener noreferrer">Responder</a>}
                    <button type="button" className={styles.alertAct} onClick={() => ignore(alertKeyOf(a))} title="Esconder esta pendência por 7 dias">Ignorar</button>
                  </span>
                </div>
              )
            })}
          </div>
        </Popover>
      )}
    </div>
  )
}

function HelpMenu() {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const id = useId()
  useDismiss(open, () => setOpen(false), wrap)
  return (
    <div className={styles.menuWrap} ref={wrap}>
      <button type="button" className={`${styles.iconBtn} ${open ? styles.iconBtnOn : ''}`} aria-label="Ajuda" aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}>
        <Icon name="help" size={18} />
      </button>
      {open && (
        <Popover id={id} label="Ajuda" className={styles.popHelp}>
          <p className={styles.popTitle}>Precisa de ajuda?</p>
          <a role="menuitem" className={styles.item} href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
            <span className={styles.itemIcon}><Icon name="chat" size={16} /></span>
            <span className={styles.itemText}><b>Falar com o suporte</b><small>Abre uma conversa no WhatsApp</small></span>
          </a>
        </Popover>
      )}
    </div>
  )
}

function ProfileMenu() {
  const { user, clinic } = useAuthStore()
  const { theme, toggle } = useTheme()
  const { permissions, loaded } = usePermissionsStore()
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const id = useId()
  useDismiss(open, () => setOpen(false), wrap)
  if (!user) return null
  // mesma regra do menu lateral: admin vê tudo; os demais, só o que a permissão libera
  const canSettings = user.role === 'admin' || !!user.isSuperAdmin || (loaded && !!permissions['configuracoes']?.can_view)
  const role = userRoleLabel(user, clinic)
  return (
    <div className={styles.menuWrap} ref={wrap}>
      <button type="button" className={`${styles.profileBtn} ${open ? styles.iconBtnOn : ''}`} aria-label="Menu do perfil" aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}>
        <span className={styles.avatar}>{userInitials(user.displayName)}</span>
        <span className={styles.who}><b>{user.displayName}</b><small>{role}</small></span>
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <Popover id={id} label="Perfil" className={styles.popProfile}>
          <div className={styles.popHead}>
            <span className={`${styles.avatar} ${styles.avatarLg}`}>{userInitials(user.displayName)}</span>
            <span className={styles.itemText}><b>{user.displayName}</b><small>{role}{clinic ? ` · ${clinic.name}` : ''}</small></span>
          </div>
          {canSettings && (
            <Link role="menuitem" className={styles.item} href="/configuracoes" onClick={() => setOpen(false)}>
              <span className={styles.itemIcon}><Icon name="settings" size={16} /></span>
              <span className={styles.itemText}><b>Configurações</b><small>Clínica, equipe, plano e integrações</small></span>
            </Link>
          )}
          <Link role="menuitem" className={styles.item} href="/configuracoes?tab=conta" onClick={() => setOpen(false)}>
            <span className={styles.itemIcon}><Icon name="admin" size={16} /></span>
            <span className={styles.itemText}><b>Minha conta</b><small>Senha e acesso</small></span>
          </Link>
          <button role="menuitem" type="button" className={styles.item} onClick={toggle}>
            <span className={styles.itemIcon}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} /></span>
            <span className={styles.itemText}><b>{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</b></span>
          </button>
          <div className={styles.sep} />
          <button role="menuitem" type="button" className={`${styles.item} ${styles.itemDanger}`} onClick={() => void logout()}>
            <span className={styles.itemIcon}><Icon name="logout" size={16} /></span>
            <span className={styles.itemText}><b>Sair</b></span>
          </button>
        </Popover>
      )}
    </div>
  )
}

// Nota: a logo da clínica (clinic.logo) não aparece na UI do sistema — só
// no cabeçalho dos documentos gerados no prontuário (ver TabDocumentos.tsx).
export function TopBar({ onMenuToggle }: Props) {
  return (
    <header className={styles.bar}>
      <button className={styles.menuBtn} onClick={onMenuToggle} aria-label="Menu">
        <Icon name="menu" size={20} />
      </button>
      {/* Alvo de portal: no celular a página injeta aqui o próprio título (ver PageTitle). */}
      <div id="topbar-title-slot" className={styles.titleSlot} />
      {/* Busca e ações da conta: só no desktop. No celular ficam nas telas e no menu lateral. */}
      <div className={styles.search}><BarSearch /></div>
      <div className={styles.alertsSlot}><AlertsMenu /></div>
      <div className={styles.actions}>
        <HelpMenu />
        <ProfileMenu />
      </div>
    </header>
  )
}
