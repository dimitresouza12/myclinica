'use client'
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './TopBar.module.css'
import { Icon } from '@/components/ui/Icon'
import { GlobalSearch } from '@/components/layout/GlobalSearch'
import { useAuthStore } from '@/store/auth'
import { usePermissionsStore } from '@/store/permissions'
import { usePageSearch } from '@/store/pageSearch'
import { useDashboardData, useEstoqueData, useProfessionals } from '@/hooks/useClinicData'
import { useSchedules, scheduleOf } from '@/hooks/useSchedules'
import { useOnlineBookingPending } from '@/hooks/useOnlineBookingPending'
import { useEstoqueLotes } from '@/hooks/useEstoqueLotes'
import { useAutomacaoNotificacoes } from '@/hooks/useAutomacaoNotificacoes'
import { showToast } from '@/components/ui/Toast'
import { createToastGate, podeVerAvisosAutomacao, textoDoAviso, linkDoAviso, type AutomacaoNotificacao } from '@/lib/automacaoNotificacoes'
import { resumoAlertas, textoAlertaValidade } from '@/lib/estoque/lotes'
import { withExpiryAlert } from '@/lib/estoque/alertaValidade'
import { hojeBrasil } from '@/lib/brasilDate'
import { scheduleReminder } from '@/lib/agenda/reminder'
import { isAdminOrRecepcao } from '@/lib/professionalScope'
import { ALERT_META, AUTOMACAO_REASONS, PRIMARY_LABEL, SYSTEM_ALERT_LINK, alertMessage, buildAlertRows, buildWaLink, countUrgent, dismissAlert, groupAlertRows, ignoredStorageKey, isDismissed, parseDismissed, subscribeIgnoredAlerts, withLowStockAlert, withAutomacaoAlerts, withOnlineBookingAlert, withScheduleAlert, type AlertRow } from '@/lib/actionAlerts'
import { waMeNumber } from '@/lib/phoneFormat'
import { useTheme } from '@/hooks/useTheme'
import { userRoleLabel } from '@/lib/roleLabel'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { logout } from '@/lib/logout'
import { useDemoPicker } from '@/store/demoPicker'
import { CLINIC_TYPE_LABELS } from '@/lib/specialtyConfig'
import { patientHref } from '@/lib/prontuario/navigation'

interface Props {
  onMenuToggle: () => void
}

const SUPPORT_URL = 'https://wa.me/5588920020570?text=Ol%C3%A1%2C+preciso+de+suporte+com+o+MyClinica.'

/** Fecha o painel ao clicar fora ou apertar Esc (devolvendo o foco ao botão que o abriu). */
function useDismiss(open: boolean, onClose: () => void, wrap: React.RefObject<HTMLElement | null>, extra?: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (wrap.current && !wrap.current.contains(t) && !extra?.current?.contains(t)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      onClose()
      wrap.current?.querySelector<HTMLElement>('[aria-haspopup]')?.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, onClose, wrap, extra])
}

/** Telas estreitas (celular): o painel vira folha de baixo. Mesmo corte do resto do app. */
const MOBILE_QUERY = '(max-width: 768px)'
function useIsMobile() {
  return useSyncExternalStore(
    onChange => { const m = window.matchMedia(MOBILE_QUERY); m.addEventListener('change', onChange); return () => m.removeEventListener('change', onChange) },
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  )
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

/** Quantas linhas cada grupo mostra antes do "Ver mais" (sobrando só uma ou duas, mostra tudo) */
const GROUP_PREVIEW = 5
const GROUP_FOLD_AT = GROUP_PREVIEW + 2

/** Aviso no canto da tela: no máximo 3 ao mesmo tempo (cada um fica 6 s, como o Toast com link). O resto fica só no sino. */
const AVISO_MAX_NA_TELA = 3
const AVISO_DURACAO_MS = 6000

/** "Ações necessárias" do Dashboard, também na barra: uma linha por paciente, agrupada por tipo, com uma ação principal. */
function AlertsMenu() {
  const { clinic, user } = useAuthStore()
  const { permissions, loaded } = usePermissionsStore()
  const canSee = !!user && (user.role === 'admin' || !!user.isSuperAdmin || (loaded && !!permissions['dashboard']?.can_view))
  const clinicId = canSee && !user?.isSuperAdmin ? clinic?.id : undefined
  // nome, telefone e "Abrir paciente" só para quem tem Ver em Pacientes; sem isso ficam só os avisos da clínica (estoque, WhatsApp, escala)
  const canSeePatients = !!user && (user.role === 'admin' || !!user.isSuperAdmin || (loaded && !!permissions['pacientes']?.can_view))
  // As 3 buscas do menu (Dashboard com ~14 consultas, estoque e lotes) não podem disputar a rede com a página aberta:
  // começam só ao abrir o menu, na Dashboard (que já as carrega, mesmo cache) ou após ~3 s de ociosidade.
  const pathname = usePathname()
  const [idleReady, setIdleReady] = useState(false)
  const [everOpened, setEverOpened] = useState(false)
  useEffect(() => {
    if (idleReady) return
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void }
    let idleHandle: number | undefined
    const timer = setTimeout(() => {
      if (w.requestIdleCallback) idleHandle = w.requestIdleCallback(() => setIdleReady(true), { timeout: 2000 })
      else setIdleReady(true)
    }, 3000)
    return () => { clearTimeout(timer); if (idleHandle !== undefined) w.cancelIdleCallback?.(idleHandle) }
  }, [idleReady])
  // na Dashboard as buscas já existem (mesmo cache): liga de vez, sem voltar atrás ao sair dela
  if (!everOpened && pathname.startsWith('/dashboard')) setEverOpened(true)
  const fetchAlerts = idleReady || everOpened
  const alertsClinicId = fetchAlerts ? clinicId : undefined
  const { data } = useDashboardData(alertsClinicId)
  const { data: estoque } = useEstoqueData(alertsClinicId)
  const { data: estoqueLotes } = useEstoqueLotes(alertsClinicId)
  // avisos da automação (confirmou, pediu para remarcar...): módulo Agenda, não Dashboard
  const avisosClinicId = podeVerAvisosAutomacao(user, permissions, loaded) ? clinic?.id : undefined
  const toastGate = useRef(createToastGate(AVISO_MAX_NA_TELA, AVISO_DURACAO_MS))
  // o aviso na tela e o sino ficam separados do resto: um aviso novo em tempo real vira toast com botão para abrir a consulta
  const avisosRef = useRef<{ marcarLida: (id: string) => void }>({ marcarLida: () => {} })
  const onAvisoNovo = useCallback((n: AutomacaoNotificacao) => {
    if (!toastGate.current.tryShow(Date.now())) return
    showToast(n.tipo === 'confirmou' ? 'ok' : 'error', textoDoAviso(n), {
      href: linkDoAviso(n),
      actionLabel: 'Abrir consulta',
      onAction: () => avisosRef.current.marcarLida(n.id),
    })
  }, [])
  const { items: avisos, marcarLida, marcarTodasLidas } = useAutomacaoNotificacoes(avisosClinicId, onAvisoNovo)
  useEffect(() => { avisosRef.current = { marcarLida: id => { void marcarLida(id) } } }, [marcarLida])
  // o tempo relativo dos avisos ("há 5 min") se atualiza enquanto o menu está aberto
  const [avisoNow, setAvisoNow] = useState(() => Date.now())
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open || avisos.length === 0) return
    const t = setInterval(() => setAvisoNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [open, avisos.length])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  // linhas em que o WhatsApp já foi aberto: o botão principal vira "Já resolvi"
  const [contacted, setContacted] = useState<Record<string, boolean>>({})
  const [menuKey, setMenuKey] = useState<string | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  const id = useId()
  const isMobile = useIsMobile()
  const sheetOpen = open && isMobile
  useDismiss(open, () => setOpen(false), wrap, sheet)

  // folha de baixo aberta: prende a rolagem da página e leva o foco para o botão de fechar
  useEffect(() => {
    if (!sheetOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeBtn.current?.focus()
    return () => { document.body.style.overflow = prev }
  }, [sheetOpen])

  // as resolvidas e adiadas ficam guardadas neste navegador e valem em qualquer tela
  const [now] = useState(() => Date.now())
  const rawDismissed = useSyncExternalStore(
    subscribeIgnoredAlerts,
    () => (clinicId ? window.localStorage.getItem(ignoredStorageKey(clinicId)) : null),
    () => null,
  )
  const dismissed = useMemo(() => parseDismissed(rawDismissed, now), [rawDismissed, now])
  function dismiss(row: AlertRow, kind: 'resolved' | 'snoozed') {
    if (!clinicId) return
    dismissAlert(clinicId, row, kind, dismissed)
    setMenuKey(null)
  }

  const lowStock = (estoque?.items ?? []).filter(i => i.quantity <= i.min_quantity).length
  // lotes vencidos ou vencendo em 30 dias (só aparece depois da migration de lote e validade)
  const validadeTexto = useMemo(() => (estoqueLotes?.available ? textoAlertaValidade(resumoAlertas(estoqueLotes.lots, hojeBrasil())) : null), [estoqueLotes])
  // lembrete de escala: só para quem edita a escala (admin e recepção)
  const scheduleClinicId = isAdminOrRecepcao(user) && !user?.isSuperAdmin ? clinic?.id : undefined
  const { data: schedules } = useSchedules(scheduleClinicId)
  const { data: professionals } = useProfessionals(scheduleClinicId)
  // agendamentos do link público esperando confirmação: mesmo público do lembrete de escala (admin e recepção)
  const { data: onlinePending = 0 } = useOnlineBookingPending(fetchAlerts ? scheduleClinicId : undefined)
  const reminder = useMemo(
    () => schedules?.available && professionals
      ? scheduleReminder(
          professionals.filter(p => p.schedule_enabled).map(p => p.id),
          id => scheduleOf(schedules, id, true),
          new Date(now),
          schedules.settings.reminderDaysBefore,
          schedules.settings.reminderEnabled,
        )
      : null,
    [schedules, professionals, now],
  )
  const rows = useMemo(
    () => buildAlertRows(withAutomacaoAlerts(withOnlineBookingAlert(withScheduleAlert(withExpiryAlert(withLowStockAlert(data?.alerts ?? [], lowStock), validadeTexto), reminder), onlinePending), avisos, avisoNow), now)
      .filter(r => canSeePatients || !!SYSTEM_ALERT_LINK[r.reason] || AUTOMACAO_REASONS.has(r.reason))
      .filter(r => !isDismissed(dismissed[r.key], r)),
    [data, lowStock, validadeTexto, reminder, onlinePending, avisos, avisoNow, now, dismissed, canSeePatients],
  )
  const groups = useMemo(() => groupAlertRows(rows), [rows])
  const urgent = useMemo(() => countUrgent(rows), [rows])
  if ((!clinicId && !avisosClinicId) || rows.length === 0) return null

  function closeSheet() {
    setOpen(false)
    wrap.current?.querySelector<HTMLElement>('[aria-haspopup]')?.focus()
  }

  function primaryAction(r: AlertRow) {
    if (r.notificacaoId && r.href) {
      const id = r.notificacaoId
      return <Link className={styles.alertAct} href={r.href} onClick={() => { void marcarLida(id); setOpen(false) }}>Abrir consulta</Link>
    }
    const system = SYSTEM_ALERT_LINK[r.reason]
    if (system) return <Link className={styles.alertAct} href={system.href} onClick={() => setOpen(false)}>{system.label}</Link>
    if (contacted[r.key]) {
      return <button type="button" className={`${styles.alertAct} ${styles.alertActPrimary}`} onClick={() => dismiss(r, 'resolved')}><Icon name="check" size={13} /> Já resolvi</button>
    }
    if (waMeNumber(r.phone)) {
      const href = buildWaLink(r.phone ?? '', alertMessage(r.reason, r.name, clinic?.name ?? 'nossa clínica'))
      return (
        <a className={`${styles.alertAct} ${styles.alertActPrimary}`} href={href} target="_blank" rel="noopener noreferrer" onClick={() => setContacted(c => ({ ...c, [r.key]: true }))}>
          {PRIMARY_LABEL[r.reason] ?? 'WhatsApp'}
        </a>
      )
    }
    return <Link className={styles.alertAct} href={patientHref(r.patientId)} onClick={() => setOpen(false)}>Abrir paciente</Link>
  }

  const list = (
      <div className={styles.alertList}>
        {avisos.length > 0 && (
          <button type="button" className={styles.alertMoreRows} onClick={() => { void marcarTodasLidas() }}>Marcar avisos da automação como lidos</button>
        )}
        {groups.map(g => {
          const meta = ALERT_META[g.reason]
          const foldable = g.rows.length > GROUP_FOLD_AT
          const all = !foldable || expanded[g.reason]
          const shown = all ? g.rows : g.rows.slice(0, GROUP_PREVIEW)
          const hidden = g.rows.length - shown.length
          return (
            <section key={g.reason} className={styles.alertGroup} aria-label={g.title}>
              <h3 className={styles.alertGroupTitle}>
                <span style={{ color: meta.color }} aria-hidden="true"><Icon name={meta.icon} size={13} /></span>
                {g.title}
                <span className={styles.alertGroupCount}>{g.rows.length}</span>
              </h3>
              {shown.map(r => (
                <div key={r.key} className={styles.alertRow}>
                  <div className={styles.alertMain}>
                    <span className={styles.alertWho}>
                      <b title={r.name}>{r.name}</b>
                      {r.context && <small>{r.context}</small>}
                    </span>
                    <span className={styles.alertActions}>
                      {primaryAction(r)}
                      <button
                        type="button"
                        className={`${styles.alertMore} ${menuKey === r.key ? styles.alertMoreOn : ''}`}
                        aria-label={`Mais opções para ${r.name}`}
                        aria-expanded={menuKey === r.key}
                        onClick={() => setMenuKey(k => (k === r.key ? null : r.key))}
                      >
                        <Icon name="more" size={20} />
                      </button>
                    </span>
                  </div>
                  {menuKey === r.key && (
                    <div className={styles.alertMenu}>
                      {r.notificacaoId ? (
                        <button type="button" className={styles.alertMenuBtn} onClick={() => { void marcarLida(r.notificacaoId!); setMenuKey(null) }}>Marcar como lida</button>
                      ) : (
                        <>
                          <button type="button" className={styles.alertMenuBtn} onClick={() => dismiss(r, 'resolved')}>Já resolvi</button>
                          <button type="button" className={styles.alertMenuBtn} onClick={() => dismiss(r, 'snoozed')} title="Esconde por 7 dias">Adiar 7 dias</button>
                        </>
                      )}
                      {!SYSTEM_ALERT_LINK[r.reason] && !r.notificacaoId && waMeNumber(r.phone) && (
                        <Link className={styles.alertMenuBtn} href={patientHref(r.patientId)} onClick={() => setOpen(false)}>Abrir paciente</Link>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {foldable && (
                <button type="button" className={styles.alertMoreRows} onClick={() => setExpanded(e => ({ ...e, [g.reason]: !all }))} aria-expanded={!!all}>
                  {all ? 'Ver menos' : `Ver mais ${hidden}`}
                </button>
              )}
            </section>
          )
        })}
      </div>
  )

  const label = `Ações necessárias: ${rows.length}${urgent > 0 ? `, ${urgent} ${urgent === 1 ? 'urgente' : 'urgentes'}` : ''}`

  return (
    <div className={styles.menuWrap} ref={wrap}>
      <button type="button" className={`${styles.iconBtn} ${styles.alertBtn} ${open ? styles.iconBtnOn : ''}`} aria-label={label} aria-haspopup={isMobile ? 'dialog' : 'menu'} aria-expanded={open} aria-controls={id} onClick={() => { setEverOpened(true); setAvisoNow(Date.now()); setOpen(v => !v) }}>
        <Icon name="bell" size={20} />
        <span className={`${styles.bellBadge} ${urgent > 0 ? styles.bellBadgeUrgent : ''}`} aria-hidden="true">{rows.length > 9 ? '9+' : rows.length}</span>
      </button>
      {open && !isMobile && (
        <Popover id={id} label="Ações necessárias" className={styles.popAlerts}>
          <p className={styles.popTitle}>Ações necessárias <span className={styles.popTitleCount}>{rows.length}</span></p>
          {list}
        </Popover>
      )}
      {sheetOpen && createPortal(
        <div className={styles.sheetScrim} onClick={closeSheet}>
          <div id={id} ref={sheet} role="dialog" aria-modal="true" aria-label="Ações necessárias" className={styles.sheet} onClick={e => e.stopPropagation()}>
            <div className={styles.sheetHandle} aria-hidden="true" />
            <div className={styles.sheetHead}>
              <p className={`${styles.popTitle} ${styles.sheetTitle}`}>Ações necessárias <span className={styles.popTitleCount}>{rows.length}</span></p>
              <button type="button" ref={closeBtn} className={styles.sheetClose} aria-label="Fechar" onClick={closeSheet}><Icon name="close" size={18} /></button>
            </div>
            {list}
          </div>
        </div>,
        document.body,
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
  const openSwitch = useDemoPicker(s => s.openSwitch)
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
        <UserAvatar name={user.displayName} avatar={user.avatarData} size={32} variant="brand" />
        <span className={styles.who}><b>{user.displayName}</b><small>{role}</small></span>
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <Popover id={id} label="Perfil" className={styles.popProfile}>
          <div className={styles.popHead}>
            <UserAvatar name={user.displayName} avatar={user.avatarData} size={40} variant="brand" />
            <span className={styles.itemText}><b>{user.displayName}</b><small>{role}{clinic ? ` · ${clinic.name}` : ''}</small></span>
          </div>
          {canSettings && (
            <Link role="menuitem" className={styles.item} href="/configuracoes" onClick={() => setOpen(false)}>
              <span className={styles.itemIcon}><Icon name="settings" size={16} /></span>
              <span className={styles.itemText}><b>Configurações</b><small>Clínica, equipe, plano e integrações</small></span>
            </Link>
          )}
          <Link role="menuitem" className={styles.item} href="/minha-conta" onClick={() => setOpen(false)}>
            <span className={styles.itemIcon}><Icon name="admin" size={16} /></span>
            <span className={styles.itemText}><b>Minha conta</b><small>Senha e acesso</small></span>
          </Link>
          {clinic?.demoMode && (
            <button role="menuitem" type="button" className={styles.item} onClick={() => { setOpen(false); openSwitch() }}>
              <span className={styles.itemIcon}><Icon name="swap" size={16} /></span>
              <span className={styles.itemText}><b>Trocar especialidade</b><small>Agora: {CLINIC_TYPE_LABELS[clinic.type]}</small></span>
            </button>
          )}
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
