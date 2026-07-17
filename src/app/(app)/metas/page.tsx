'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatCurrency } from '@/lib/utils'
import { Icon } from '@/components/ui/Icon'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { useDashboardData } from '@/hooks/useClinicData'
import styles from './metas.module.css'

const MetasHistoryChart = dynamic(() => import('./MetasHistoryChart'), {
  ssr: false,
  loading: () => <div className={styles.chartLoading}>Carregando gráfico...</div>,
})

function MetasContent() {
  const { clinic, user, setSession } = useAuthStore()
  const isAdmin = user?.role === 'admin' || user?.isSuperAdmin
  const { data, isLoading: loading } = useDashboardData(clinic?.id)

  const [goalInput, setGoalInput] = useState(() => clinic?.monthlyRevenueGoal ? String(clinic.monthlyRevenueGoal) : '')
  const [savingGoal, setSavingGoal] = useState(false)
  const [goalError, setGoalError] = useState('')
  const [saved, setSaved] = useState(false)

  const monthlyData = data?.monthlyData ?? []
  const currentMonthRevenue = data?.stats.monthRevenue ?? 0
  const goal = clinic?.monthlyRevenueGoal ?? null
  const goalProgressPct = goal ? Math.min(100, Math.round((currentMonthRevenue / goal) * 100)) : 0

  async function handleSaveGoal() {
    if (!clinic || !isAdmin) return
    const value = goalInput.trim() === '' ? null : Number(goalInput.replace(',', '.'))
    if (value !== null && (Number.isNaN(value) || value < 0)) {
      setGoalError('Informe um valor válido.')
      return
    }
    setSavingGoal(true)
    setGoalError('')
    setSaved(false)
    const { error } = await supabase.from('clinics').update({ monthly_revenue_goal: value }).eq('id', clinic.id)
    setSavingGoal(false)
    if (error) { setGoalError('Não foi possível salvar. Tente novamente.'); return }
    setSession({ ...clinic, monthlyRevenueGoal: value }, user!)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Metas</h1>
          <p className={styles.subtitle}>Acompanhe e defina a meta de faturamento mensal da clínica</p>
        </div>
      </div>

      {loading ? (
        <p className={styles.loading}>Carregando...</p>
      ) : (
        <>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardIcon}><Icon name="target" size={18} /></span>
              <h2 className={styles.cardTitle}>Meta de faturamento — {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h2>
            </div>

            {goal ? (
              <div className={styles.progress}>
                <div className={styles.progressHeader}>
                  <span className={styles.progressValue}>{formatCurrency(currentMonthRevenue)}</span>
                  <span className={styles.progressGoal}>de {formatCurrency(goal)}</span>
                </div>
                <div className={styles.progressTrack}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${goalProgressPct}%`, background: goalProgressPct >= 100 ? '#10B981' : goalProgressPct >= 60 ? '#4DD9C0' : '#F59E0B' }}
                  />
                </div>
                <span className={styles.progressPct}>
                  {goalProgressPct}% da meta atingida
                  {currentMonthRevenue < goal && ` · faltam ${formatCurrency(goal - currentMonthRevenue)}`}
                </span>
              </div>
            ) : (
              <p className={styles.empty}>Nenhuma meta definida ainda. {isAdmin ? 'Defina abaixo para começar a acompanhar o progresso.' : 'Peça para um administrador definir uma meta.'}</p>
            )}

            {isAdmin && (
              <div className={styles.editRow}>
                <div className={styles.field}>
                  <label>Meta de faturamento mensal (R$)</label>
                  <input
                    type="number"
                    min={0}
                    step="50"
                    placeholder="Ex: 30000"
                    value={goalInput}
                    onChange={(e) => setGoalInput(e.target.value)}
                    className={styles.goalInput}
                  />
                </div>
                <button className={styles.btnSave} onClick={handleSaveGoal} disabled={savingGoal}>
                  {savingGoal ? 'Salvando...' : 'Salvar meta'}
                </button>
                {saved && <span className={styles.savedMsg}><Icon name="check" size={12} /> Meta salva</span>}
              </div>
            )}
            {goalError && <p className={styles.goalErrorMsg}>{goalError}</p>}

            <p className={styles.hint}>A meta aparece no Dashboard como linha de referência no gráfico e no resumo do mês.</p>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardIcon}><Icon name="reports" size={18} /></span>
              <h2 className={styles.cardTitle}>Evolução da receita</h2>
            </div>
            {monthlyData.length === 0 ? (
              <p className={styles.empty}>Sem dados suficientes ainda.</p>
            ) : (
              <MetasHistoryChart data={monthlyData} goal={goal} />
            )}
          </div>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Histórico — últimos 6 meses</h2>
            {monthlyData.length === 0 ? (
              <p className={styles.empty}>Sem dados suficientes ainda.</p>
            ) : (
              <div className={styles.historyList}>
                {monthlyData.map((m, i) => {
                  const pct = goal ? Math.min(100, Math.round((m.receita / goal) * 100)) : null
                  const isCurrent = i === monthlyData.length - 1
                  return (
                    <div key={`${m.month}-${i}`} className={styles.historyRow}>
                      <span className={styles.historyMonth}>{m.month}{isCurrent && <span className={styles.historyNow}>atual</span>}</span>
                      <div className={styles.historyBarTrack}>
                        {goal && (
                          <div className={styles.historyBarFill} style={{ width: `${pct}%`, background: (pct ?? 0) >= 100 ? '#10B981' : '#4DD9C0' }} />
                        )}
                      </div>
                      <span className={styles.historyValue}>{formatCurrency(m.receita)}</span>
                      {goal && <span className={styles.historyPct}>{pct}%</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default function MetasPage() {
  return <PermissionGuard module="metas"><MetasContent /></PermissionGuard>
}
