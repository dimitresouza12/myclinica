'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useAuthStore } from '@/store/auth'
import { formatCurrency, formatCurrencyCompact, formatDate } from '@/lib/utils'
import { syncLeadAppointments } from '@/lib/sync-leads'
import { hasWhatsApp } from '@/lib/planGates'
import { Icon } from '@/components/ui/Icon'
import { useDashboardData } from '@/hooks/useClinicData'
import type { DashboardAlertReason, DashboardAlert, RevenueByCategory } from '@/hooks/useClinicData'
import type { ComponentProps } from 'react'
import styles from './dashboard.module.css'
import { PermissionGuard } from '@/components/ui/PermissionGuard'

const DashboardChart = dynamic(() => import('./DashboardChart'), { ssr: false, loading: () => <div className={styles.chartLoading}>Carregando gráfico...</div> })
const RevenueByCategoryChart = dynamic(() => import('./RevenueByCategoryChart'), { ssr: false, loading: () => <div className={styles.chartLoading}>Carregando gráfico...</div> })

type IconName = ComponentProps<typeof Icon>['name']

interface MonthlyData { month: string; receita: number; despesa: number }

interface Stats {
  totalPatients: number
  appointmentsToday: number
  monthRevenue: number
  monthExpense: number
  pendingAppointments: number
  newPatientsMonth: number
  treatmentsCompleted: number
  treatmentsOpen: number
  avgTicket: number
}

const ALERT_META: Record<DashboardAlertReason, { label: string; icon: IconName; color: string }> = {
  faltou:      { label: 'Faltou',      icon: 'alert',    color: '#EF4444' },
  sem_retorno: { label: 'Sem retorno', icon: 'calendar', color: '#F59E0B' },
  aniversario: { label: 'Aniversário', icon: 'cake',     color: '#8B5CF6' },
}

function buildWaLink(phone: string, message: string): string {
  const clean = phone.replace(/\D/g, '')
  const number = clean.startsWith('55') ? clean : `55${clean}`
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}

function Money({ value, hide }: { value: number; hide: boolean }) {
  if (hide) return <>••••</>
  return (
    <>
      <span className={styles.valueDesktop}>{formatCurrency(value)}</span>
      <span className={styles.valueMobile}>{formatCurrencyCompact(value)}</span>
    </>
  )
}

function alertMessage(reason: DashboardAlertReason, name: string, clinicName: string): string {
  const first = name.split(' ')[0]
  if (reason === 'faltou') return `Olá ${first}! Notamos que você não conseguiu comparecer à sua última consulta na ${clinicName}. Vamos reagendar? 😊`
  if (reason === 'aniversario') return `Olá ${first}! 🎉 A equipe da ${clinicName} deseja um Feliz Aniversário! Se quiser aproveitar para marcar sua próxima consulta, é só chamar por aqui.`
  return `Olá ${first}! Faz um tempo desde seu último atendimento na ${clinicName}. Que tal agendarmos seu retorno? 😊`
}

interface Insight { icon: IconName; color: string; text: string }

interface GoalPace { status: 'done' | 'ahead' | 'behind'; pct: number; remaining: number; daysLeft: number }

// Ritmo da meta do mês (batida / no ritmo / atrasada) — única fonte de verdade,
// usada tanto na faixa de metas do dashboard quanto nas Conclusões & Dicas.
function getGoalPace(monthRevenue: number, goal: number | null): GoalPace | null {
  if (!goal || goal <= 0) return null
  const today = new Date()
  const dayOfMonth = today.getDate()
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const expectedPct = dayOfMonth / daysInMonth
  const actualPct = monthRevenue / goal
  const daysLeft = daysInMonth - dayOfMonth
  const remaining = Math.max(0, goal - monthRevenue)
  if (actualPct >= 1) return { status: 'done', pct: actualPct, remaining: 0, daysLeft }
  if (actualPct < expectedPct - 0.1) return { status: 'behind', pct: actualPct, remaining, daysLeft }
  return { status: 'ahead', pct: actualPct, remaining, daysLeft }
}

// Gera observações e sugestões a partir dos dados já carregados no dashboard —
// nenhuma consulta nova ao banco, só leitura dos números já disponíveis.
function buildInsights(params: {
  stats: Stats
  monthlyData: MonthlyData[]
  revenueByCategory: RevenueByCategory[]
  alerts: DashboardAlert[]
  monthlyRevenueGoal: number | null
}): Insight[] {
  const { stats, monthlyData, revenueByCategory, alerts, monthlyRevenueGoal } = params
  const out: Insight[] = []

  // Ritmo da meta do mês
  const pace = getGoalPace(stats.monthRevenue, monthlyRevenueGoal)
  if (pace) {
    if (pace.status === 'done') {
      out.push({ icon: 'target', color: '#10B981', text: `Meta do mês batida — você já alcançou ${Math.round(pace.pct * 100)}% do objetivo de faturamento.` })
    } else if (pace.status === 'behind') {
      out.push({ icon: 'target', color: '#EF4444', text: `Abaixo do ritmo para bater a meta: faltam ${formatCurrency(pace.remaining)} com ${pace.daysLeft} dia(s) restantes no mês.` })
    } else {
      out.push({ icon: 'target', color: '#4DD9C0', text: `No ritmo certo para bater a meta do mês (${Math.round(pace.pct * 100)}% já alcançado).` })
    }
  }

  // Tendência de receita vs. mês anterior
  if (monthlyData.length >= 2) {
    const prev = monthlyData[monthlyData.length - 2].receita
    const cur = monthlyData[monthlyData.length - 1].receita
    if (prev > 0) {
      const pct = Math.round(((cur - prev) / prev) * 100)
      if (pct <= -15) out.push({ icon: 'finance', color: '#EF4444', text: `Receita caiu ${Math.abs(pct)}% em relação ao mês anterior. Vale revisar a agenda e reengajar pacientes sem retorno.` })
      else if (pct >= 15) out.push({ icon: 'finance', color: '#10B981', text: `Receita cresceu ${pct}% em relação ao mês anterior — bom ritmo!` })
    }
  }

  // Faltas e pacientes sem retorno acumulados
  const noShowCount = alerts.filter(a => a.reason === 'faltou').length
  const noReturnCount = alerts.filter(a => a.reason === 'sem_retorno').length
  if (noShowCount + noReturnCount >= 3) {
    out.push({ icon: 'alert', color: '#F59E0B', text: `${noShowCount + noReturnCount} pacientes com falta recente ou sem retorno agendado. Reative esses contatos no widget "Ações necessárias" para recuperar receita.` })
  }

  // Concentração de receita numa única categoria de procedimento
  const totalCat = revenueByCategory.reduce((s, c) => s + c.value, 0)
  if (totalCat > 0 && revenueByCategory.length > 1) {
    const topPct = Math.round((revenueByCategory[0].value / totalCat) * 100)
    if (topPct >= 70) {
      out.push({ icon: 'reports', color: '#8B5CF6', text: `${topPct}% da receita do mês vem de "${revenueByCategory[0].category}". Diversificar procedimentos pode reduzir a dependência de uma única categoria.` })
    }
  }

  // Nenhum paciente novo no mês
  if (stats.newPatientsMonth === 0 && stats.totalPatients > 0) {
    out.push({ icon: 'patients', color: '#0EA5E9', text: 'Nenhum paciente novo captado este mês. Considere uma campanha de divulgação para atrair novos pacientes.' })
  }

  // Muitos tratamentos em aberto e nenhum concluído
  if (stats.treatmentsOpen >= 5 && stats.treatmentsCompleted === 0) {
    out.push({ icon: 'procedures', color: '#F59E0B', text: `${stats.treatmentsOpen} tratamentos em aberto este mês e nenhum concluído ainda. Vale revisar o andamento da agenda.` })
  }

  if (out.length === 0 && stats.totalPatients > 0) {
    out.push({ icon: 'target', color: '#4DD9C0', text: 'Nenhum ponto de atenção identificado no momento — continue acompanhando o dashboard regularmente.' })
  }

  return out.slice(0, 4)
}

function DashboardContent() {
  const { clinic, user } = useAuthStore()
  const [hideValues, setHideValues] = useState(false)
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set())
  const [alertsCollapsed, setAlertsCollapsed] = useState(false)

  const { data, isLoading: loading } = useDashboardData(clinic?.id)

  // Fire-and-forget in background — does not block dashboard queries
  useEffect(() => {
    if (clinic && hasWhatsApp(clinic.plan)) syncLeadAppointments(clinic.id, clinic.slug)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic?.id])

  const stats: Stats = data?.stats ?? {
    totalPatients: 0, appointmentsToday: 0, monthRevenue: 0, monthExpense: 0,
    pendingAppointments: 0, newPatientsMonth: 0, treatmentsCompleted: 0, treatmentsOpen: 0, avgTicket: 0,
  }
  const recentAppts = data?.recentAppts ?? []
  const monthlyData: MonthlyData[] = data?.monthlyData ?? []
  const revenueByCategory = data?.revenueByCategory ?? []
  const alerts = (data?.alerts ?? []).filter(a => !dismissedAlerts.has(`${a.reason}-${a.patientId}`))

  const revenueTrendPct = (() => {
    if (monthlyData.length < 2) return null
    const prev = monthlyData[monthlyData.length - 2].receita
    const cur = monthlyData[monthlyData.length - 1].receita
    if (prev <= 0) return null
    return Math.round(((cur - prev) / prev) * 100)
  })()

  const insights = data ? buildInsights({ stats, monthlyData, revenueByCategory, alerts, monthlyRevenueGoal: clinic?.monthlyRevenueGoal ?? null }) : []

  const monthProfit = stats.monthRevenue - stats.monthExpense
  const goal = clinic?.monthlyRevenueGoal ?? null
  const goalPct = goal ? Math.min(100, Math.round((stats.monthRevenue / goal) * 100)) : 0
  const pace = getGoalPace(stats.monthRevenue, goal)
  const RING_R = 54
  const RING_C = 2 * Math.PI * RING_R
  const ringOffset = RING_C * (1 - goalPct / 100)

  const maxReceita = Math.max(...monthlyData.map((m) => m.receita), 1)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

  function mask(value: string | number): string | number {
    return hideValues ? '••••' : value
  }

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
          {alerts.length > 0 && (
            <div className={styles.alertWidget}>
              <div className={styles.alertHeader}>
                <span className={styles.alertHeaderIcon}><Icon name="alert" size={16} /></span>
                <h2 className={styles.alertTitle}>Ações necessárias</h2>
                <span className={styles.alertCount}>{alerts.length}</span>
                <button
                  className={styles.alertCollapseBtn}
                  onClick={() => setAlertsCollapsed(v => !v)}
                  title={alertsCollapsed ? 'Expandir' : 'Encolher'}
                  aria-label={alertsCollapsed ? 'Expandir' : 'Encolher'}
                >
                  <Icon name="chevronRight" size={14} className={alertsCollapsed ? '' : styles.alertCollapseIconOpen} />
                </button>
              </div>
              {!alertsCollapsed && (
              <div className={styles.alertList}>
                {alerts.slice(0, 6).map((a) => {
                  const meta = ALERT_META[a.reason]
                  const msg = alertMessage(a.reason, a.name, clinic?.name ?? 'nossa clínica')
                  const alertKey = `${a.reason}-${a.patientId}`
                  return (
                    <div key={alertKey} className={styles.alertItem}>
                      <span className={styles.alertBadge} style={{ background: `${meta.color}1a`, color: meta.color }}>
                        <Icon name={meta.icon} size={12} /> {meta.label}
                      </span>
                      <div className={styles.alertInfo}>
                        <span className={styles.alertName}>{a.name}</span>
                        <span className={styles.alertDate}>{a.reason === 'aniversario' ? 'Hoje' : formatDate(a.date, true)}</span>
                      </div>
                      <div className={styles.alertActions}>
                        {a.phone && (
                          <a className={styles.alertBtnWa} href={buildWaLink(a.phone, msg)} target="_blank" rel="noopener noreferrer" title="WhatsApp">
                            WhatsApp
                          </a>
                        )}
                        <button
                          className={styles.alertBtnIgnore}
                          onClick={() => setDismissedAlerts(prev => new Set(prev).add(alertKey))}
                          title="Ignorar"
                        >
                          Ignorar
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              )}
            </div>
          )}

          <div className={styles.bento}>
            <article className={styles.heroCard}>
              <div className={styles.cardHead}>
                <span className={styles.eyebrow}>Financeiro do mês</span>
              </div>
              <div className={styles.heroRow}>
                <span className={styles.heroValue}><Money value={stats.monthRevenue} hide={hideValues} /></span>
                {revenueTrendPct !== null && !hideValues && (
                  <span className={`${styles.delta} ${revenueTrendPct >= 0 ? styles.deltaUp : styles.deltaDown}`}>
                    {revenueTrendPct >= 0 ? '▲' : '▼'} {Math.abs(revenueTrendPct)}%
                    <span className={styles.deltaRef}>vs. mês anterior</span>
                  </span>
                )}
              </div>

              {monthlyData.length > 1 && (
                <>
                  <div className={styles.spark}>
                    {monthlyData.map((m, i) => (
                      <span
                        key={i}
                        className={i === monthlyData.length - 1 ? styles.sparkOn : ''}
                        style={{ height: `${Math.max(6, Math.round((m.receita / maxReceita) * 100))}%` }}
                      />
                    ))}
                  </div>
                  <div className={styles.sparkAxis}>
                    {monthlyData.map((m, i) => <span key={i}>{m.month}</span>)}
                  </div>
                </>
              )}

              <div className={styles.subGrid}>
                <div>
                  <div className={styles.subMetric}><Money value={stats.monthExpense} hide={hideValues} /></div>
                  <div className={styles.subLabel}>Despesas</div>
                </div>
                <div>
                  <div className={`${styles.subMetric} ${styles.subAccent}`}><Money value={monthProfit} hide={hideValues} /></div>
                  <div className={styles.subLabel}>Lucro líquido</div>
                </div>
                <div>
                  <div className={styles.subMetric}><Money value={stats.avgTicket} hide={hideValues} /></div>
                  <div className={styles.subLabel}>Ticket médio</div>
                </div>
              </div>
            </article>

            {goal ? (
              <Link href="/metas" className={styles.metaCard}>
                <div className={styles.cardHead}>
                  <span className={styles.eyebrow}>Meta do mês</span>
                  <span className={styles.metaEdit}>Editar <Icon name="chevronRight" size={12} /></span>
                </div>
                <div className={styles.ring}>
                  <svg width="128" height="128" viewBox="0 0 128 128">
                    <circle className={styles.ringTrack} cx="64" cy="64" r={RING_R} fill="none" strokeWidth="12" />
                    <circle
                      className={styles.ringFill}
                      cx="64" cy="64" r={RING_R} fill="none" strokeWidth="12"
                      strokeDasharray={RING_C} strokeDashoffset={ringOffset} strokeLinecap="round"
                      transform="rotate(-90 64 64)"
                      stroke={goalPct >= 100 ? '#10B981' : 'url(#dashboardGoalGrad)'}
                    />
                    <defs>
                      <linearGradient id="dashboardGoalGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#4DD9C0" />
                        <stop offset="1" stopColor="#0B9B85" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className={styles.ringPct}>
                    <b>{hideValues ? '••' : `${goalPct}%`}</b>
                    <small>da meta</small>
                  </div>
                </div>
                <div className={styles.metaFig}>
                  <Money value={stats.monthRevenue} hide={hideValues} /> <span className={styles.metaOf}>de {hideValues ? '••••' : formatCurrency(goal)}</span>
                </div>
                {pace && (
                  <div className={styles.metaPace}>
                    <span className={styles.pacePill} style={{ background: pace.status === 'behind' ? '#EF4444' : '#10B981' }} />
                    {pace.status === 'done'
                      ? 'Meta batida'
                      : `${pace.status === 'ahead' ? 'No ritmo' : 'Abaixo do ritmo'} — faltam ${hideValues ? '••••' : formatCurrency(pace.remaining)} em ${pace.daysLeft} dia(s)`}
                  </div>
                )}
              </Link>
            ) : (
              <Link href="/metas" className={styles.metaCardEmpty}>
                <span className={styles.metaEmptyIcon}><Icon name="target" size={20} /></span>
                <p>Defina uma meta de faturamento mensal para acompanhar seu progresso aqui.</p>
                <span className={styles.metaEdit}>Definir meta <Icon name="chevronRight" size={12} /></span>
              </Link>
            )}
          </div>

          <div className={styles.opsStrip}>
            <div className={styles.opsCell}>
              <span className={styles.cellVal}>{mask(stats.totalPatients)}</span>
              <span className={styles.cellLabel}>Pacientes ativos</span>
            </div>
            <div className={styles.opsCell}>
              <span className={styles.cellVal}>{mask(stats.appointmentsToday)}</span>
              <span className={styles.cellLabel}>Consultas hoje</span>
            </div>
            <div className={styles.opsCell}>
              <span className={styles.cellVal}>{mask(stats.newPatientsMonth)}</span>
              <span className={styles.cellLabel}>Novos este mês</span>
            </div>
            <div className={styles.opsCell}>
              <span className={styles.cellSplit}>
                <b>{mask(stats.treatmentsCompleted)}</b>
                <span className={styles.cellSep}>/</span>
                <b className={styles.cellWarn}>{mask(stats.treatmentsOpen)}</b>
              </span>
              <span className={styles.cellLabel}>Concluídos / em aberto</span>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Próximos agendamentos</h2>
            </div>

            <div className={styles.apptTableWrap}>
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

            {/* Cards no mobile — mesma linguagem visual dos cards da Agenda */}
            {recentAppts.length === 0 ? (
              <p className={styles.apptCardsEmpty}>Nenhum agendamento encontrado.</p>
            ) : (
              <div className={styles.apptCards}>
                {recentAppts.map((a) => (
                  <div key={a.id} className={styles.apptCard}>
                    <div className={styles.apptCardTop}>
                      <strong className={styles.apptCardName}>{a.patients?.name ?? '-'}</strong>
                      <span className={`status-badge status-${a.status}`}>{a.status}</span>
                    </div>
                    <span className={styles.apptCardProc}>{a.procedure_name ?? '-'}</span>
                    <span className={styles.apptCardDate}>{formatDate(a.scheduled_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.chartsGrid}>
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Receitas vs Despesas — últimos 6 meses</h2>
              </div>
              <div className={styles.chartWrap}>
                <DashboardChart data={monthlyData} goal={clinic?.monthlyRevenueGoal} />
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Receita por categoria — mês atual</h2>
              </div>
              <div className={styles.chartWrap}>
                <RevenueByCategoryChart data={revenueByCategory} />
              </div>
            </div>
          </div>

          {insights.length > 0 && (
            <div className={styles.insightsCard}>
              <h2 className={styles.insightsTitle}>Conclusões & Dicas</h2>
              <div className={styles.insightsList}>
                {insights.map((ins, i) => (
                  <div key={i} className={styles.insightItem}>
                    <span className={styles.insightIcon} style={{ background: `${ins.color}1a`, color: ins.color }}>
                      <Icon name={ins.icon} size={14} />
                    </span>
                    <p className={styles.insightText}>{ins.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function DashboardPage() {
  return <PermissionGuard module="dashboard"><DashboardContent /></PermissionGuard>
}
