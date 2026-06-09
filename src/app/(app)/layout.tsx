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
import { ToastContainer } from '@/components/ui/Toast'
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
    if (clinic.trialEndsAt && new Date() > new Date(clinic.trialEndsAt) && !user.isSuperAdmin) {
      router.replace('/trial-expirado')
    }
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

    // 1. Sincroniza flag gcal_connected do banco
    supabase
      .from('clinics')
      .select('gcal_connected')
      .eq('id', clinic.id)
      .single()
      .then(({ data }) => {
        const connected = data?.gcal_connected ?? false
        if (connected !== clinic.gcalConnected) {
          setSession({ ...clinic, gcalConnected: connected }, user)
        }
        // 2. Se conectado, tenta renovar o token silenciosamente agora
        if (connected) silentRefreshGCal(true)
      })

    // 3. Renova o token a cada 45 min para nunca deixar expirar durante o uso
    const interval = setInterval(() => {
      if (clinic.gcalConnected) silentRefreshGCal(true)
    }, 45 * 60 * 1000)

    return () => clearInterval(interval)
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
        <SystemAlertBanner />
        <TopBar clinic={clinic} onMenuToggle={() => setSidebarOpen((v) => !v)} />
        {/* key={clinic.id} força remount completo das páginas quando a clínica muda,
            descartando qualquer estado (lista de pacientes, agenda, etc.) da clínica anterior */}
        <main key={clinic.id} className={styles.main}>{children}</main>
      </div>
      <ToastContainer />
    </div>
  )
}
