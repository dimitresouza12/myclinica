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
import styles from './app.module.css'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { clinic, user, _hydrated, setSession, clearSession } = useAuthStore()
  const { load: loadPermissions, reset: resetPermissions } = usePermissionsStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)

  // Verifica/renova sessão Supabase ao montar — evita redirect desnecessário para /login
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        // Tenta refresh antes de deslogar (silencia "Refresh Token Not Found" — esperado quando não há sessão)
        supabase.auth.refreshSession().then(({ data }) => {
          if (!data.session) {
            clearSession()
            router.replace('/login')
          }
          setAuthChecked(true)
        }).catch(() => {
          clearSession()
          router.replace('/login')
          setAuthChecked(true)
        })
      } else {
        setAuthChecked(true)
      }
    })

    // Mantém sessão atualizada enquanto o app está aberto
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        clearSession()
        resetPermissions()
        router.replace('/login')
      }
    })
    return () => subscription.unsubscribe()
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
        .select('gcal_connected, billing_paid, billing_overdue_since, next_billing_date, asaas_subscription_id, monthly_revenue_goal')
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

      if (Object.keys(updates).length > 0) setSession({ ...currentClinic, ...updates }, currentUser)
      if (connected) silentRefreshGCal(true)
    }

    syncClinicData()

    // Sincroniza a cada 5 min e renova token GCal a cada 45 min
    const syncInterval  = setInterval(syncClinicData, 5 * 60 * 1000)
    const gcalInterval  = setInterval(() => {
      if (clinic.gcalConnected) silentRefreshGCal(true)
    }, 45 * 60 * 1000)

    return () => { clearInterval(syncInterval); clearInterval(gcalInterval) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_hydrated])

  if (!_hydrated || !authChecked) return null
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
        <TopBar clinic={clinic} onMenuToggle={() => setSidebarOpen((v) => !v)} />
        {/* key={clinic.id} força remount completo das páginas quando a clínica muda,
            descartando qualquer estado (lista de pacientes, agenda, etc.) da clínica anterior */}
        <main key={clinic.id} className={styles.main}>{children}</main>
      </div>
      <ToastContainer />
      <ConfirmDialogContainer />
    </div>
  )
}
