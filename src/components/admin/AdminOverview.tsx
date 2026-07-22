'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { computeClinicStatus } from '@/lib/clinicStatus'
import styles from './admin.module.css'

const AdminCharts = dynamic(() => import('./AdminCharts'), { ssr: false, loading: () => <div className={styles.chartLoading}>Carregando gráficos...</div> })

interface KPI {
  clinicasAtivas: number
  totalUsuarios: number
  totalAgendamentos: number
  receitaTotal: number
  novasMes: number
}

interface PlanData { name: string; value: number }
interface MonthData { month: string; clinicas: number }

const KPIS: { key: keyof KPI; label: string; icon: string; color: string; grad: string; format?: string }[] = [
  { key: 'clinicasAtivas',      label: 'Clínicas Ativas',      icon: '', color: '#0D9488', grad: 'linear-gradient(135deg,#0D9488,#5EEAD4)' },
  { key: 'totalUsuarios',       label: 'Usuários na plataforma',icon: '', color: '#0EA5E9', grad: 'linear-gradient(135deg,#0EA5E9,#38BDF8)' },
  { key: 'totalAgendamentos',   label: 'Agendamentos totais',   icon: '', color: '#F59E0B', grad: 'linear-gradient(135deg,#F59E0B,#FCD34D)' },
  { key: 'receitaTotal',        label: 'Receita acumulada',     icon: '', color: '#10B981', grad: 'linear-gradient(135deg,#10B981,#34D399)', format: 'currency' },
  { key: 'novasMes',            label: 'Novas clínicas no mês', icon: '', color: '#A855F7', grad: 'linear-gradient(135deg,#A855F7,#C084FC)' },
]

export function AdminOverview() {
  const [kpi, setKpi] = useState<KPI>({ clinicasAtivas: 0, totalUsuarios: 0, totalAgendamentos: 0, receitaTotal: 0, novasMes: 0 })
  const [planData, setPlanData] = useState<PlanData[]>([])
  const [monthData, setMonthData] = useState<MonthData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const [clinicStatuses, allUsers, appts, revenue, newClinics, allClinics] = await Promise.all([
        supabase.from('clinics').select('trial_ends_at, billing_paid, billing_overdue_since'),
        supabase.from('clinic_users').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('appointments').select('id', { count: 'exact', head: true }),
        supabase.from('financial_records').select('total_amount').eq('type', 'receita'),
        supabase.from('clinics').select('id', { count: 'exact', head: true }).gte('created_at', startOfMonth.toISOString()),
        supabase.from('clinics').select('plan, created_at'),
      ])

      const receitaTotal = ((revenue.data ?? []) as { total_amount: number | null }[])
        .reduce((s, r) => s + (r.total_amount ?? 0), 0)

      // "Ativa" = clínica em uso normal (trial em andamento ou já paga) —
      // exclui quem está travado no modal de trial expirado ou suspenso por atraso
      const clinicasAtivas = (clinicStatuses.data ?? []).filter((c) => {
        const s = computeClinicStatus(c)
        return s === 'active' || s === 'trial'
      }).length

      setKpi({
        clinicasAtivas,
        totalUsuarios:     allUsers.count ?? 0,
        totalAgendamentos: appts.count ?? 0,
        receitaTotal,
        novasMes:          newClinics.count ?? 0,
      })

      // Plan distribution
      const planMap: Record<string, number> = {}
      ;(allClinics.data ?? []).forEach((c: { plan: string | null }) => {
        const p = c.plan ?? 'basico'
        planMap[p] = (planMap[p] ?? 0) + 1
      })
      setPlanData(Object.entries(planMap).map(([name, value]) => ({ name, value })))

      // Monthly new clinics (last 6 months)
      const months: MonthData[] = []
      for (let i = 5; i >= 0; i--) {
        const d = new Date()
        d.setDate(1)
        d.setMonth(d.getMonth() - i)
        const start = new Date(d)
        const end = new Date(d)
        end.setMonth(end.getMonth() + 1)
        const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
        const count = ((allClinics.data ?? []) as { created_at: string | null }[])
          .filter(c => c.created_at && c.created_at >= start.toISOString() && c.created_at < end.toISOString()).length
        months.push({ month: label, clinicas: count })
      }
      setMonthData(months)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <p className={styles.loading}>Carregando métricas...</p>

  return (
    <div className={styles.overviewWrap}>
      <div className={styles.kpiGrid}>
        {KPIS.map((k) => {
          const val = kpi[k.key]
          const display = k.format === 'currency' ? formatCurrency(val as number) : String(val)
          return (
            <div key={k.key} className={styles.kpiCard} style={{ '--kpi-color': k.color, '--kpi-grad': k.grad } as React.CSSProperties}>
              <div className={styles.kpiIcon}>{k.icon}</div>
              <div className={styles.kpiBody}>
                <span className={styles.kpiValue}>{display}</span>
                <span className={styles.kpiLabel}>{k.label}</span>
              </div>
            </div>
          )
        })}
      </div>
      <AdminCharts planData={planData} monthData={monthData} />
    </div>
  )
}
