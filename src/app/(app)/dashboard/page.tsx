'use client'
import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useAuthStore } from '@/store/auth'
import { formatCurrency, formatCurrencyCompact, formatDate } from '@/lib/utils'
import { syncLeadAppointments } from '@/lib/sync-leads'
import { hasWhatsApp } from '@/lib/planGates'
import { Icon } from '@/components/ui/Icon'
import { useDashboardData } from '@/hooks/useClinicData'
import type { ComponentProps } from 'react'
import styles from './dashboard.module.css'
import { PermissionGuard } from '@/components/ui/PermissionGuard'

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

function DashboardContent() {
  const { clinic, user } = useAuthStore()
  const [hideValues, setHideValues] = useState(false)

  const { data, isLoading: loading } = useDashboardData(clinic?.id)

  // Fire-and-forget in background — does not block dashboard queries
  useEffect(() => {
    if (clinic && hasWhatsApp(clinic.plan)) syncLeadAppointments(clinic.id, clinic.slug)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic?.id])

  const stats = data?.stats ?? { totalPatients: 0, appointmentsToday: 0, monthRevenue: 0, monthExpense: 0, pendingAppointments: 0, newPatientsMonth: 0 }
  const recentAppts = data?.recentAppts ?? []
  const monthlyData = data?.monthlyData ?? []

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

  const cards: { label: string; value: string | number; valueMobile?: string | number; icon: IconName; color: string }[] = [
    { label: 'Pacientes ativos',     value: stats.totalPatients,                                                              icon: 'patients',  color: '#0D9488' },
    { label: 'Consultas hoje',       value: stats.appointmentsToday,                                                          icon: 'calendar',  color: '#0EA5E9' },
    { label: 'Novos este mês',       value: stats.newPatientsMonth,                                                           icon: 'patients',  color: '#8B5CF6' },
    { label: 'Agendamentos abertos', value: stats.pendingAppointments,                                                        icon: 'team',      color: '#F59E0B' },
    { label: 'Receita do mês',       value: formatCurrency(stats.monthRevenue), valueMobile: formatCurrencyCompact(stats.monthRevenue), icon: 'finance', color: '#10B981' },
    { label: 'Despesa do mês',       value: formatCurrency(stats.monthExpense), valueMobile: formatCurrencyCompact(stats.monthExpense), icon: 'finance', color: '#EF4444' },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>{greeting}, {user?.displayName?.split(' ')[0]}</h1>
          <p className={styles.subtitle}>
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button
          className={styles.btnHide}
          onClick={() => setHideValues((v) => !v)}
          title={hideValues ? 'Mostrar valores' : 'Ocultar valores'}
        >
          {hideValues ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          )}
        </button>
      </div>

      {loading ? (
        <p className={styles.loading}>Carregando...</p>
      ) : (
        <>
          <div className={styles.cards}>
            {cards.map((c) => (
              <div key={c.label} className={styles.card} style={{ '--card-accent': c.color } as React.CSSProperties}>
                <span className={styles.cardLabel}>{c.label}</span>
                <span className={styles.cardValue}>
                  {hideValues ? '••••' : (
                    <>
                      <span className={styles.valueDesktop}>{c.value}</span>
                      <span className={styles.valueMobile}>{c.valueMobile ?? c.value}</span>
                    </>
                  )}
                </span>
              </div>
            ))}
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

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Receitas vs Despesas — últimos 6 meses</h2>
            </div>
            <div className={styles.chartWrap}>
              <DashboardChart data={monthlyData} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function DashboardPage() {
  return <PermissionGuard module="dashboard"><DashboardContent /></PermissionGuard>
}
