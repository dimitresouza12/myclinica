'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatCurrency, formatDate } from '@/lib/utils'
import { syncLeadAppointments } from '@/lib/sync-leads'
import { Icon } from '@/components/ui/Icon'
import type { Appointment, FinancialRecord } from '@/types'
import type { ComponentProps } from 'react'
import styles from './dashboard.module.css'

const DashboardChart = dynamic(() => import('./DashboardChart'), { ssr: false, loading: () => <div className={styles.chartLoading}>Carregando gráfico...</div> })

type IconName = ComponentProps<typeof Icon>['name']

interface MonthlyData { month: string; receita: number; despesa: number }

interface Stats {
  totalPatients: number
  appointmentsToday: number
  monthRevenue: number
  monthExpense: number
  pendingAppointments: number
  newPatientsMonth: number
}

export default function DashboardPage() {
  const { clinic, user } = useAuthStore()
  const [stats, setStats] = useState<Stats>({ totalPatients: 0, appointmentsToday: 0, monthRevenue: 0, monthExpense: 0, pendingAppointments: 0, newPatientsMonth: 0 })
  const [recentAppts, setRecentAppts] = useState<Appointment[]>([])
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!clinic?.id) return
    // Reset estado ao trocar de clínica
    setStats({ totalPatients: 0, appointmentsToday: 0, monthRevenue: 0, monthExpense: 0, pendingAppointments: 0, newPatientsMonth: 0 })
    setRecentAppts([])
    setLoading(true)
    loadDashboard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic?.id])

  async function loadDashboard() {
    if (!clinic) return
    if (clinic.plan === 'plus') {
      await syncLeadAppointments(clinic.id, clinic.slug)
    }
    const today = new Date()
    const now = new Date().toISOString()
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0).toISOString()
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString()
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()
    const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1).toISOString()

    const [patientsRes, todayApptRes, pendingRes, allFinRes, newPatientsRes, recentRes] = await Promise.all([
      supabase.from('patients').select('id', { count: 'exact', head: true }).eq('clinic_id', clinic.id).eq('is_active', true),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('clinic_id', clinic.id).gte('scheduled_at', startOfDay).lte('scheduled_at', endOfDay),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('clinic_id', clinic.id).eq('status', 'agendado'),
      supabase.from('financial_records').select('total_amount, type, created_at').eq('clinic_id', clinic.id).gte('created_at', sixMonthsAgo),
      supabase.from('patients').select('id', { count: 'exact', head: true }).eq('clinic_id', clinic.id).eq('is_active', true).gte('created_at', startOfMonth),
      supabase.from('appointments').select('*, patients(name, phone)').eq('clinic_id', clinic.id).gte('scheduled_at', now).order('scheduled_at', { ascending: true }).limit(8),
    ])

    const allFin = (allFinRes.data ?? []) as Pick<FinancialRecord, 'total_amount' | 'type' | 'created_at'>[]

    // Build last 6 months data
    const monthMap: Record<string, MonthlyData> = {}
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
      monthMap[key] = { month: label, receita: 0, despesa: 0 }
    }
    allFin.forEach((r) => {
      const key = r.created_at!.slice(0, 7)
      if (!monthMap[key]) return
      if (r.type === 'receita') monthMap[key].receita += r.total_amount ?? 0
      else monthMap[key].despesa += r.total_amount ?? 0
    })
    setMonthlyData(Object.values(monthMap))

    const currentMonthFin = allFin.filter(r => r.created_at!.slice(0, 7) === startOfMonth.slice(0, 7))
    const monthRevenue = currentMonthFin.filter(r => r.type === 'receita').reduce((s, r) => s + (r.total_amount ?? 0), 0)
    const monthExpense = currentMonthFin.filter(r => r.type === 'despesa').reduce((s, r) => s + (r.total_amount ?? 0), 0)

    setStats({
      totalPatients: patientsRes.count ?? 0,
      appointmentsToday: todayApptRes.count ?? 0,
      pendingAppointments: pendingRes.count ?? 0,
      newPatientsMonth: newPatientsRes.count ?? 0,
      monthRevenue,
      monthExpense,
    })
    setRecentAppts((recentRes.data ?? []) as Appointment[])
    setLoading(false)
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

  const cards: { label: string; value: string | number; icon: IconName; color: string }[] = [
    { label: 'Pacientes ativos',     value: stats.totalPatients,               icon: 'patients',  color: '#0D9488' },
    { label: 'Consultas hoje',       value: stats.appointmentsToday,           icon: 'calendar',  color: '#0EA5E9' },
    { label: 'Novos este mês',       value: stats.newPatientsMonth,            icon: 'patients',  color: '#8B5CF6' },
    { label: 'Agendamentos abertos', value: stats.pendingAppointments,         icon: 'team',      color: '#F59E0B' },
    { label: 'Receita do mês',       value: formatCurrency(stats.monthRevenue),icon: 'finance',   color: '#10B981' },
    { label: 'Despesa do mês',       value: formatCurrency(stats.monthExpense),icon: 'finance',   color: '#EF4444' },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>{greeting}, {user?.displayName?.split(' ')[0]}</h1>
        <p className={styles.subtitle}>
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {loading ? (
        <p className={styles.loading}>Carregando...</p>
      ) : (
        <>
          <div className={styles.cards}>
            {cards.map((c) => (
              <div key={c.label} className={styles.card} style={{ '--card-accent': c.color } as React.CSSProperties}>
                <div className={styles.cardIconWrap} style={{ color: c.color }}>
                  <Icon name={c.icon} size={20} />
                </div>
                <div className={styles.cardBody}>
                  <span className={styles.cardValue}>{c.value}</span>
                  <span className={styles.cardLabel}>{c.label}</span>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Receitas vs Despesas — últimos 6 meses</h2>
            </div>
            <div className={styles.chartWrap}>
              <DashboardChart data={monthlyData} />
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Próximos agendamentos</h2>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Paciente</th>
                    <th>Procedimento</th>
                    <th>Data</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentAppts.length === 0 ? (
                    <tr><td colSpan={4} className={styles.empty}>Nenhum agendamento encontrado.</td></tr>
                  ) : recentAppts.map((a) => (
                    <tr key={a.id}>
                      <td>{a.patients?.name ?? '-'}</td>
                      <td>{a.procedure_name ?? '-'}</td>
                      <td>{formatDate(a.scheduled_at)}</td>
                      <td><span className={`status-badge status-${a.status}`}>{a.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
