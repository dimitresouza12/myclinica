'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatCurrency } from '@/lib/utils'
import { Icon } from '@/components/ui/Icon'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { useDashboardData } from '@/hooks/useClinicData'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Gauge } from '@/components/ui/Gauge'
import { PageHeader } from '@/components/ui/PageHeader'
import { BarList } from '@/components/ui/BarList'
import btn from '@/components/ui/button.module.css'
import styles from './metas.module.css'
import { MoneyInput } from '@/components/ui/NumericInput'
import { moneyShort, axisMoney, statMoney } from '@/lib/ui/money'

const AreaTrendChart = dynamic(() => import('@/components/ui/AreaTrendChart').then(m => m.AreaTrendChart), {
  ssr: false,
  loading: () => <div className={styles.chartLoading} />,
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

  const monthLabel = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const remaining = goal ? Math.max(0, goal - currentMonthRevenue) : 0
  const trend = monthlyData.map(m => ({ label: m.month, value: m.receita, compare: goal ?? null }))

  return (
    <div className={styles.page}>
      <PageHeader title="Metas" subtitle="Acompanhe e defina a meta de faturamento mensal da clínica" />

      {loading ? (
        <p className={styles.loading}>Carregando...</p>
      ) : (
        <>
          <div className={styles.stats}>
            <StatCard title="Faturamento do mês" value={statMoney(currentMonthRevenue)} compact hint={monthLabel} />
            <StatCard title="Meta do mês" value={goal ? statMoney(goal) : '-'} compact hint={goal ? 'definida pela administração' : 'ainda não definida'} />
            <StatCard
              title="Falta para a meta"
              value={goal ? statMoney(remaining) : '-'}
              compact
              hint={goal ? (remaining === 0 ? 'meta atingida' : `${goalProgressPct}% já atingido`) : 'defina uma meta para acompanhar'}
            />
          </div>

          <div className={styles.split}>
            <Card title={`Meta de faturamento, ${monthLabel}`}>
              {goal ? (
                <div className={styles.gaugeWrap}>
                  <Gauge value={goalProgressPct / 100} label={`Meta do mês: ${goalProgressPct}% atingida`}>
                    <span className={styles.gaugeNum}>{goalProgressPct}<small>%</small></span>
                  </Gauge>
                  <p className={styles.gaugeText}>
                    {formatCurrency(currentMonthRevenue)} de {formatCurrency(goal)}
                    {currentMonthRevenue < goal && `, faltam ${formatCurrency(goal - currentMonthRevenue)}`}
                  </p>
                </div>
              ) : (
                <p className={styles.empty}>Nenhuma meta definida ainda. {isAdmin ? 'Defina abaixo para começar a acompanhar o progresso.' : 'Peça para um administrador definir uma meta.'}</p>
              )}

              {isAdmin && (
                <div className={styles.editRow}>
                  <div className={styles.field}>
                    <label>Meta de faturamento mensal (R$)</label>
                    <MoneyInput
                      placeholder="Ex: 30.000,00"
                      value={goalInput}
                      onChange={setGoalInput}
                      className={styles.goalInput}
                    />
                  </div>
                  <button type="button" className={btn.primary} onClick={handleSaveGoal} disabled={savingGoal}>
                    {savingGoal ? 'Salvando...' : 'Salvar meta'}
                  </button>
                  {saved && <span className={styles.savedMsg} role="status"><Icon name="check" size={12} /> Meta salva</span>}
                </div>
              )}
              {goalError && <p className={styles.goalErrorMsg} role="alert">{goalError}</p>}

              <p className={styles.hint}><Icon name="info" size={14} /> A meta aparece no Dashboard, no medidor e no resumo do mês.</p>
            </Card>

            <Card title="Evolução da receita" actions={<span className={styles.cardMeta}>últimos 6 meses</span>}>
              {monthlyData.length === 0 ? (
                <p className={styles.empty}>Sem dados suficientes ainda.</p>
              ) : (
                <AreaTrendChart
                  data={trend}
                  highlightIndex={trend.length - 1}
                  valueName="Receita"
                  compareName={goal ? 'Meta' : undefined}
                  formatValue={moneyShort}
                  formatAxis={axisMoney}
                  height={250}
                  label="Receita dos últimos 6 meses comparada com a meta"
                />
              )}
            </Card>
          </div>

          <Card title="Histórico, últimos 6 meses" actions={goal ? <span className={styles.cardMeta}>barra = parcela da meta</span> : undefined}>
            {monthlyData.length === 0 ? (
              <p className={styles.empty}>Sem dados suficientes ainda.</p>
            ) : (
              <BarList
                items={monthlyData.map((m, i) => ({ label: `${m.month}${i === monthlyData.length - 1 ? ' (atual)' : ''}`, value: m.receita }))}
                format={v => (goal ? `${formatCurrency(v)}, ${Math.round((v / goal) * 100)}%` : formatCurrency(v))}
                total={goal ?? Math.max(...monthlyData.map(m => m.receita), 1)}
              />
            )}
          </Card>
        </>
      )}
    </div>
  )
}

export default function MetasPage() {
  return <PermissionGuard module="metas"><MetasContent /></PermissionGuard>
}
