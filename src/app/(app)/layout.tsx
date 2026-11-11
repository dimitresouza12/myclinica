'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { usePermissionsStore } from '@/store/permissions'
import { supabase } from '@/lib/supabase'
import { silentRefreshGCal } from '@/lib/googleCalendar'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { TopBar } from '@/components/layout/TopBar'
import { SystemAlertBanner } from '@/components/layout/SystemAlertBanner'
import { ImpersonationBanner } from '@/components/layout/ImpersonationBanner'
import { PaymentLateBanner } from '@/components/layout/PaymentLateBanner'
import { ToastContainer } from '@/components/ui/Toast'
import { ConfirmDialogContainer } from '@/components/ui/ConfirmDialog'
import { SpecialtyPickerModal } from '@/components/demo/SpecialtyPickerModal'
import styles from './app.module.css'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { clinic, user, _hydrated, setSession, clearSession } = useAuthStore()
  const { load: loadPermissions, reset: resetPermissions } = usePermissionsStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  // true quando a checagem de sessão ao montar nunca resolve (rede instável,
  // lock de sessão preso entre abas) — sem isso o app fica em branco pra
  // sempre, sem spinner nem mensagem (return null enquanto !authChecked).
  const [authTimedOut, setAuthTimedOut] = useState(false)

  // Verifica/renova sessão Supabase ao montar — evita redirect desnecessário para /login
  useEffect(() => {
    let timedOut = false
    const timeoutId = setTimeout(() => { timedOut = true; setAuthTimedOut(true) }, 12_000)

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        // Tenta refresh antes de deslogar (silencia "Refresh Token Not Found" — esperado quando não há sessão)
        supabase.auth.refreshSession().then(({ data }) => {
          clearTimeout(timeoutId)
          if (timedOut) return
          if (!data.session) {
            clearSession()
            router.replace('/login')
          }
          setAuthChecked(true)
        }).catch(() => {
          clearTimeout(timeoutId)
          if (timedOut) return
          clearSession()
          router.replace('/login')
          setAuthChecked(true)
        })
      } else {
        clearTimeout(timeoutId)
        if (timedOut) return
        setAuthChecked(true)
      }
    }).catch(() => {
      clearTimeout(timeoutId)
      if (timedOut) return
      clearSession()
      router.replace('/login')
      setAuthChecked(true)
    })

    // Mantém sessão atualizada enquanto o app está aberto
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        clearSession()
        resetPermissions()
        router.replace('/login')
      }
    })
    return () => { clearTimeout(timeoutId); subscription.unsubscribe() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!_hydrated || !authChecked) return
    if (!clinic || !user) { router.replace('/login'); return }
    // Sem bloqueio — o PaymentLateBanner exibe o aviso dentro do app
  }, [_hydrated, authChecked, clinic, user, router])

  // Ao montar o app, sincroniza gcal_connected do banco e tenta refresh silencioso do token
  // Carrega permissões quando o usuário está autenticado
  useEffect(() => {
    if (_hydrated && user) loadPermissions()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_hydrated, user?.id])

  useEffect(() => {
    if (!_hydrated || !clinic || !user) return
    if (user.isSuperAdmin) return // superadmin não tem clínica real — pula sync

    // Captura snapshot para uso dentro das funções async (evita null check do TS)
    const currentClinic = clinic
    const currentUser   = user

    // Sincroniza dados de cobrança e gcal do banco
    async function syncClinicData() {
      const { data } = await supabase
        .from('clinics')
        .select('gcal_connected, billing_paid, billing_overdue_since, next_billing_date, asaas_subscription_id, monthly_revenue_goal, specialties, is_multi_specialty')
        .eq('id', currentClinic.id)
        .single()
      if (!data) return

      const connected = data.gcal_connected ?? false
      const updates: Partial<import('@/types').AuthClinic> = {}

      if (connected !== currentClinic.gcalConnected) updates.gcalConnected = connected
      if ((data.billing_paid ?? false) !== currentClinic.billingPaid) updates.billingPaid = data.billing_paid ?? false
      if ((data.billing_overdue_since ?? null) !== currentClinic.billingOverdueSince) updates.billingOverdueSince = data.billing_overdue_since ?? null
      if ((data.next_billing_date ?? null) !== currentClinic.nextBillingDate) updates.nextBillingDate = data.next_billing_date ?? null
      if ((data.asaas_subscription_id ?? null) !== currentClinic.asaasSubscriptionId) updates.asaasSubscriptionId = data.asaas_subscription_id ?? null
      if ((data.monthly_revenue_goal ?? null) !== currentClinic.monthlyRevenueGoal) updates.monthlyRevenueGoal = data.monthly_revenue_goal ?? null
      // Áreas atendidas: uma área adicionada por outro admin/dispositivo (ou o RPC de membro) chega aqui.
      // Fora da conta de demonstração, onde specialties é um override de sessão.
      if (!currentClinic.demoMode) {
        const dbAreas = (data.specialties?.length ? data.specialties : [currentClinic.type]) as import('@/types').ClinicType[]
        if (dbAreas.join(',') !== currentClinic.specialties.join(',')) updates.specialties = dbAreas
        if ((data.is_multi_specialty ?? false) !== currentClinic.isMultiSpecialty) updates.isMultiSpecialty = data.is_multi_specialty ?? false
      }

      // Parte do snapshot mais recente do store, não do capturado ao montar: na conta de
      // demonstração a pessoa pode ter escolhido a área depois que este efeito rodou.
      // (setSession também preserva a escolha, isto só evita gravar dados velhos por cima.)
      if (Object.keys(updates).length > 0) {
        const latest = useAuthStore.getState()
        setSession({ ...(latest.clinic ?? currentClinic), ...updates }, latest.user ?? currentUser)
      }
      if (connected) silentRefreshGCal(true)
    }

    // demo_mode em consulta separada: a coluna pode não existir (ainda) e um select explícito
    // junto das outras quebraria a sincronização de TODAS as clínicas; aqui o erro só é ignorado.
    // Roda uma vez por montagem, o flag não muda durante a sessão.
    async function syncDemoMode() {
      const { data, error } = await supabase
        .from('clinics')
        .select('demo_mode')
        .eq('id', currentClinic.id)
        .maybeSingle()
      if (error || !data) return
      const demo = (data as { demo_mode?: boolean | null }).demo_mode === true
      const latest = useAuthStore.getState()
      if (!latest.clinic || !latest.user || latest.clinic.id !== currentClinic.id) return
      if ((latest.clinic.demoMode ?? false) !== demo) setSession({ ...latest.clinic, demoMode: demo }, latest.user)
    }

    // professional_scoped_access também em consulta separada, pelo mesmo motivo do demo_mode.
    async function syncScopedAccess() {
      const { data, error } = await supabase
        .from('clinics')
        .select('professional_scoped_access')
        .eq('id', currentClinic.id)
        .maybeSingle()
      if (error || !data) return
      const scoped = (data as { professional_scoped_access?: boolean | null }).professional_scoped_access === true
      const latest = useAuthStore.getState()
      if (!latest.clinic || !latest.user || latest.clinic.id !== currentClinic.id) return
      if ((latest.clinic.professionalScopedAccess ?? false) !== scoped) setSession({ ...latest.clinic, professionalScopedAccess: scoped }, latest.user)
    }

    syncClinicData()
    syncDemoMode()
    syncScopedAccess()

    // Sincroniza a cada 5 min e renova token GCal a cada 45 min
    const syncInterval  = setInterval(syncClinicData, 5 * 60 * 1000)
    const gcalInterval  = setInterval(() => {
      if (clinic.gcalConnected) silentRefreshGCal(true)
    }, 45 * 60 * 1000)

    return () => { clearInterval(syncInterval); clearInterval(gcalInterval) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_hydrated])

  if (!_hydrated) return null
  if (!authChecked) {
    if (authTimedOut) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', gap: '0.75rem', padding: '1.5rem', textAlign: 'center' }}>
          <p style={{ fontSize: '0.9rem', color: '#475569' }}>Não conseguimos confirmar sua sessão. Verifique sua conexão.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ minHeight: 44, padding: '0.6rem 1.25rem', background: '#0D9488', color: '#fff', border: 'none', borderRadius: 9, fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer' }}
          >
            Recarregar
          </button>
        </div>
      )
    }
    return null
  }
  if (!clinic || !user) return null

  return (
    <div className={styles.shell}>
      {sidebarOpen && (
        <div className={styles.backdrop} onClick={() => setSidebarOpen(false)} />
      )}

      <AppSidebar
        clinic={clinic}
        user={user}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      <div className={styles.content}>
        <ImpersonationBanner />
        <PaymentLateBanner />
        <SystemAlertBanner />
        <TopBar onMenuToggle={() => setSidebarOpen((v) => !v)} />
        {/* key={clinic.id} força remount completo das páginas quando a clínica muda,
            descartando qualquer estado (lista de pacientes, agenda, etc.) da clínica anterior */}
        <main key={clinic.id} className={styles.main}>{children}</main>
      </div>
      <ToastContainer />
      <ConfirmDialogContainer />
      <SpecialtyPickerModal />
    </div>
  )
}
