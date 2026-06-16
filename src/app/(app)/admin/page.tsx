'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import type { Clinic, ClinicUser } from '@/types'
import { AdminOverview } from '@/components/admin/AdminOverview'
import { AdminClinicas } from '@/components/admin/AdminClinicas'
import { AdminAlertas } from '@/components/admin/AdminAlertas'
import { AdminLogs } from '@/components/admin/AdminLogs'
import { AdminUsuarios } from '@/components/admin/AdminUsuarios'
import styles from '@/components/admin/admin.module.css'

type AdminTab = 'overview' | 'clinicas' | 'alertas' | 'logs' | 'usuarios'

type UserWithClinic = ClinicUser & { clinics?: { name: string } | null }

const TABS: { key: AdminTab; label: string; icon: string }[] = [
  { key: 'overview',  label: 'Overview',  icon: '' },
  { key: 'clinicas',  label: 'Clínicas',  icon: '' },
  { key: 'alertas',   label: 'Avisos',    icon: '' },
  { key: 'logs',      label: 'Auditoria', icon: '' },
  { key: 'usuarios',  label: 'Usuários',  icon: '' },
]

export default function AdminPage() {
  const { user } = useAuthStore()
  const [verified, setVerified] = useState<boolean | null>(null)
  const [tab, setTab] = useState<AdminTab>('overview')
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [users, setUsers] = useState<UserWithClinic[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function verifyAndLoad() {
      if (!user?.id) { setVerified(false); return }
      const { data } = await supabase
        .from('clinic_users')
        .select('is_superadmin')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle()
      if (!data?.is_superadmin) { setVerified(false); return }
      setVerified(true)
      loadBase()
    }
    verifyAndLoad()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  useEffect(() => {
    if (!verified) return
    const interval = setInterval(loadBase, 30 * 1000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verified])

  async function loadBase() {
    const [clinicsRes, usersRes] = await Promise.all([
      supabase.from('clinics').select('*').order('created_at', { ascending: false }),
      supabase.from('clinic_users').select('*, clinics(name)').order('created_at', { ascending: false }).limit(200),
    ])
    setClinics((clinicsRes.data ?? []) as Clinic[])
    setUsers((usersRes.data ?? []) as UserWithClinic[])
    setLoading(false)
  }

  if (verified === null) return <div className={styles.denied}>Verificando permissões...</div>
  if (!verified) return <div className={styles.denied}>⛔ Acesso restrito a superadmins.</div>

  return (
    <div className={styles.adminPage}>
      <div className={styles.adminHeader}>
        <div>
          <h1 className={styles.adminTitle}>Painel de Comando</h1>
          <p className={styles.adminSub}>Superadmin — MyClinica SaaS</p>
        </div>
      </div>

      <nav className={styles.tabNav}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`${styles.tabBtn} ${tab === t.key ? styles.tabBtnActive : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </nav>

      {loading && tab !== 'overview' && tab !== 'alertas' ? (
        <p className={styles.loading}>Carregando...</p>
      ) : (
        <>
          {tab === 'overview'  && <AdminOverview />}
          {tab === 'clinicas'  && <AdminClinicas clinics={clinics} onReload={loadBase} />}
          {tab === 'alertas'   && <AdminAlertas />}
          {tab === 'logs'      && <AdminLogs clinics={clinics} />}
          {tab === 'usuarios'  && <AdminUsuarios users={users} clinics={clinics} />}
        </>
      )}
    </div>
  )
}
