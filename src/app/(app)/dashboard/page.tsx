'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatCurrencyCompact } from '@/lib/utils'
import { syncLeadAppointments } from '@/lib/sync-leads'
import { hasWhatsAppAI } from '@/lib/planGates'
import { nextAppointment } from '@/lib/dashboard/metrics'
import { Icon } from '@/components/ui/Icon'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Gauge } from '@/components/ui/Gauge'
import { PillTabs } from '@/components/ui/PillTabs'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusDot, type StatusTone } from '@/components/ui/StatusDot'
import type { TrendPoint } from '@/components/ui/AreaTrendChart'
import { useDashboardData, useProcedures, useWhatsAppState } from '@/hooks/useClinicData'
import type { DashboardAlert, DashboardInsights, RevenueByCategory } from '@/hooks/useClinicData'
import { usePermissions } from '@/hooks/usePermissions'
import { showToast } from '@/components/ui/Toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { STATUS_LABELS } from '@/lib/appointmentStatus'
import { ensureRevenueForAppointment, notifyRevenuePending, promptCreditUsage } from '@/lib/appointmentRevenue'
import type { Appointment, AppointmentStatus } from '@/types'
import type { ComponentProps } from 'react'
import styles from './dashboard.module.css'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { OnboardingChecklist } from './OnboardingChecklist'
import { OnboardingModal } from './OnboardingModal'
import { WelcomeModal } from './WelcomeModal'
import { moneyShort, axisMoney, statMoney } from '@/lib/ui/money'

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const AreaTrendChart = dynamic(() => import('@/components/ui/AreaTrendChart').then(m => m.AreaTrendChart), { ssr: false, loading: () => <Skeleton height={262} radius={12} /> })

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

const STATUS_TONE: Record<AppointmentStatus, StatusTone> = {
  agendado: 'wait', confirmado: 'ok', concluido: 'idle', faltou: 'warn', cancelado: 'bad', bloqueado: 'idle',
}

type Period = 'semana' | 'mes' | 'seis'
const PERIODS: { value: Period; label: string }[] = [
  { value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mês' }, { value: 'seis', label: '6 meses' },
]

/** "R$ 2.150" sem centavos, para etiquetas e eixos */
/** porcentagem com o sinal pequeno; sem dado, só o traço */
function Pct({ value }: { value: number | null }) {
  if (value == null) return <>–</>
  return <>{Math.round(value * 100)}<small>%</small></>
}
const pct = (v: number) => String(Math.round(v * 100))

function trendData(period: Period, insights: DashboardInsights | undefined, monthly: MonthlyData[]): { data: TrendPoint[]; highlight: number; valueName: string; compareName: string; title: string } {
  if (period === 'seis' || !insights) {
    return {
      data: monthly.map(m => ({ label: m.month, value: m.receita, compare: m.despesa })),
      highlight: monthly.length - 1, valueName: 'Receitas', compareName: 'Despesas', title: 'Receita por mês',
    }
  }
  const t = period === 'semana' ? insights.trend.week : insights.trend.month
  return {
    // dias que ainda não chegaram ficam sem ponto (a curva para em hoje)
    data: t.labels.map((label, i) => ({ label, value: i <= t.todayIndex ? t.current[i] : null, compare: t.previous[i] })),
    highlight: t.todayIndex,
    valueName: period === 'semana' ? 'Esta semana' : 'Este mês',
    compareName: period === 'semana' ? 'Semana passada' : 'Mês passado',
    title: 'Receita por dia',
  }
}

/** Barras finas do comparecimento: uma por dia, altura pela quantidade do dia. */
function DayBars({ values, max }: { values: number[]; max: number }) {
  return (
    <div className={styles.dayBars} aria-hidden="true">
      {values.map((v, i) => <i key={i} style={{ height: `${v > 0 ? Math.max(18, Math.round((v / max) * 100)) : 6}%` }} className={v > 0 ? undefined : styles.dayBarZero} />)}
    </div>
  )
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

  // Tendência de receita vs. mês anterior — projeta o mês corrente pelo ritmo
  // (receita até hoje ÷ dias já passados × dias no mês) antes de comparar.
  // Comparar totais crus faria isso disparar "caiu 90%" todo dia 1º, já que
  // o mês corrente sempre está parcial frente a um mês anterior fechado.
  if (monthlyData.length >= 2) {
    const prev = monthlyData[monthlyData.length - 2].receita
    const cur = monthlyData[monthlyData.length - 1].receita
    const today = new Date()
    const dayOfMonth = today.getDate()
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    const projected = dayOfMonth > 0 ? (cur / dayOfMonth) * daysInMonth : cur
    if (prev > 0) {
      const pct = Math.round(((projected - prev) / prev) * 100)
      if (pct <= -15) out.push({ icon: 'finance', color: '#EF4444', text: `No ritmo atual, a receita do mês deve fechar ${Math.abs(pct)}% abaixo do mês anterior. Vale revisar a agenda e reengajar pacientes sem retorno.` })
      else if (pct >= 15) out.push({ icon: 'finance', color: '#10B981', text: `No ritmo atual, a receita do mês deve fechar ${pct}% acima do mês anterior — bom ritmo!` })
    }
  }

  // Faltas e pacientes sem retorno acumulados
  const noShowCount = alerts.filter(a => a.reason === 'faltou').length
  const noReturnCount = alerts.filter(a => a.reason === 'sem_retorno').length
  if (noShowCount + noReturnCount >= 3) {
    out.push({ icon: 'alert', color: '#F59E0B', text: `${noShowCount + noReturnCount} pacientes com falta recente ou sem retorno agendado. Reative esses contatos pelo alerta "Ações necessárias", na barra de cima, para recuperar receita.` })
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
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>('semana')

  const queryClient = useQueryClient()
  const { canEdit: canEditAgenda } = usePermissions('agenda')

  const { data, isLoading: loading } = useDashboardData(clinic?.id)
  const { data: procedures = [] } = useProcedures(clinic?.id)
  const { data: waState } = useWhatsAppState(clinic?.id)
  // confirmação automática ligada, mas o WhatsApp caiu: nenhum aviso está saindo
  const whatsappDown = !!waState?.confirmEnabled && waState.status !== 'conectado'
  const isClinicAdmin = user?.role === 'admin' || !!user?.isSuperAdmin

  // Fire-and-forget in background — does not block dashboard queries
  useEffect(() => {
    if (clinic && hasWhatsAppAI(clinic.plan)) syncLeadAppointments(clinic.id, clinic.slug)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic?.id])

  const stats: Stats = data?.stats ?? {
    totalPatients: 0, appointmentsToday: 0, monthRevenue: 0, monthExpense: 0,
    pendingAppointments: 0, newPatientsMonth: 0, treatmentsCompleted: 0, treatmentsOpen: 0, avgTicket: 0,
  }
  const todayAppts: Appointment[] = data?.todayAppts ?? []
  const needsConfirm = todayAppts.filter(a => a.status === 'agendado').length
  const confirmedToday = todayAppts.filter(a => a.status === 'confirmado').length
  const todayCash = data?.todayCash ?? { recebido: 0, aReceber: 0, aReceberRecords: [], previsto: 0 }
  const monthlyData: MonthlyData[] = data?.monthlyData ?? []
  const revenueByCategory = data?.revenueByCategory ?? []
  // as pendências em si ficam na barra de cima; aqui só entram nas conclusões e dicas
  const alerts: DashboardAlert[] = data?.alerts ?? []
  const ins = data?.insights

  const insights = data ? buildInsights({ stats, monthlyData, revenueByCategory, alerts, monthlyRevenueGoal: clinic?.monthlyRevenueGoal ?? null }) : []

  const monthProfit = stats.monthRevenue - stats.monthExpense
  const goal = clinic?.monthlyRevenueGoal ?? null
  const pace = getGoalPace(stats.monthRevenue, goal)
  const next = nextAppointment(todayAppts, new Date())
  const att = ins?.attendance
  const attMax = att ? Math.max(1, ...att.perDay.done, ...att.perDay.noShow, ...att.perDay.cancelled) : 1
  const trend = trendData(period, ins, monthlyData)
  const catTotal = revenueByCategory.reduce((s, c) => s + c.value, 0)
  const mtdPct = ins?.monthToDate.pct ?? null

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

  const money = (v: number) => (hideValues ? '••••' : formatCurrency(v))
  const moneyCompact = (v: number) => (hideValues ? '••••' : statMoney(v))
  const trendEmpty = trend.data.every(d => !d.value && !d.compare)

  async function handleConfirm(apptId: string) {
    if (!canEditAgenda || confirmingId || !clinic) return
    setConfirmingId(apptId)
    try {
      const { data: updated, error } = await supabase
        .from('appointments')
        .update({ status: 'confirmado' })
        .eq('id', apptId)
        .eq('clinic_id', clinic.id)
        .select('id')
      if (error || !updated?.length) throw error ?? new Error('no_rows')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard', clinic.id] }),
        queryClient.invalidateQueries({ queryKey: ['agenda', clinic.id] }),
      ])
    } catch {
      showToast('error', 'Não foi possível confirmar o agendamento. Tente novamente.', {
        href: '/agenda', actionLabel: 'Ir para Agenda',
      })
    } finally {
      setConfirmingId(null)
    }
  }

  async function handleConclude(apptId: string) {
    if (!canEditAgenda || confirmingId || !clinic) return
    const appt = todayAppts.find(a => a.id === apptId)
    if (!appt) return

    const linkedProc = procedures.find(p => p.id === appt.procedure_id)
    const priceIsPending = !(appt.procedure_price && appt.procedure_price > 0) && !linkedProc?.is_free
    if (priceIsPending) {
      const confirmed = await confirmDialog({
        message: 'Este procedimento está sem preço definido — nenhuma receita será lançada no Financeiro ao concluir. Deseja continuar mesmo assim?',
        confirmText: 'Concluir mesmo assim',
      })
      if (!confirmed) return
    }

    setConfirmingId(apptId)
    try {
      const { data: updated, error } = await supabase
        .from('appointments')
        .update({ status: 'concluido' })
        .eq('id', apptId)
        .eq('clinic_id', clinic.id)
        .select('id')
      if (error || !updated?.length) throw error ?? new Error('no_rows')
      const concludedAppt = { ...appt, status: 'concluido' as const }
      const creditUsage = await promptCreditUsage(clinic.id, concludedAppt.patient_id)
      const result = await ensureRevenueForAppointment(clinic.id, concludedAppt, creditUsage)
      notifyRevenuePending(result, concludedAppt)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard', clinic.id] }),
        queryClient.invalidateQueries({ queryKey: ['agenda', clinic.id] }),
        ...(creditUsage.useCredit ? [queryClient.invalidateQueries({ queryKey: ['patient-credits', clinic.id] })] : []),
      ])
    } catch {
      showToast('error', 'Não foi possível concluir o agendamento. Tente novamente.', {
        href: '/agenda', actionLabel: 'Ir para Agenda',
      })
    } finally {
      setConfirmingId(null)
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title={`${greeting}, ${user?.displayName?.split(' ')[0] ?? ''}`.replace(/,\s*$/, '')}
        subtitle={new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, ch => ch.toUpperCase())}
        actions={
          <Button
            variant="icon"
            icon={hideValues ? 'eyeOff' : 'eye'}
            className={styles.btnHide}
            onClick={() => setHideValues((v) => !v)}
            aria-pressed={hideValues}
            aria-label={hideValues ? 'Mostrar valores' : 'Ocultar valores'}
            title={hideValues ? 'Mostrar valores' : 'Ocultar valores'}
          />
        }
      />
      {whatsappDown && (
        <div className={styles.waDown} role="alert">
          <Icon name="alert" size={16} />
          <span className={styles.waDownText}><strong>O WhatsApp da clínica está desconectado.</strong> As confirmações automáticas de consulta pararam de sair.</span>
          {isClinicAdmin
            ? <Link className={styles.waDownLink} href="/configuracoes?tab=whatsapp">Reconectar</Link>
            : <span>Peça ao administrador para reconectar em Configurações.</span>}
        </div>
      )}
      <OnboardingModal procedures={procedures} patientsCount={stats.totalPatients} />
      {!loading && <OnboardingChecklist procedures={procedures} patientsCount={stats.totalPatients} />}
      <WelcomeModal />

      <div className={styles.grid} aria-busy={loading}>
        <section className={styles.hero}>
          <div className={styles.gauges}>
            <div className={styles.gaugeBox}>
              <h2 className={styles.gaugeTitle}>Meta do mês</h2>
              <Gauge value={goal && !hideValues ? stats.monthRevenue / goal : 0} label={goal ? `Meta do mês: ${Math.round((stats.monthRevenue / goal) * 100)}% atingido` : 'Meta do mês não definida'}>
                <span className={styles.gaugeNum}><Pct value={goal && !hideValues ? stats.monthRevenue / goal : null} /></span>
              </Gauge>
              {goal ? (
                <p className={styles.gaugeHint}>
                  {pace?.status === 'done' ? 'Meta batida' : `${hideValues ? '••••' : formatCurrencyCompact(pace?.remaining ?? 0)} para a meta em ${pace?.daysLeft ?? 0} dia(s)`}
                  <Link href="/metas" className={styles.gaugeLink}>Editar</Link>
                </p>
              ) : (
                <p className={styles.gaugeHint}><Link href="/metas" className={styles.gaugeLink}>Definir meta</Link></p>
              )}
            </div>
            <div className={styles.gaugeBox}>
              <h2 className={styles.gaugeTitle}>Confirmação da semana</h2>
              <Gauge value={ins?.confirmation.rate ?? 0} label={ins?.confirmation.rate != null ? `Confirmação da semana: ${pct(ins.confirmation.rate)}%` : 'Sem consultas nesta semana'}>
                <span className={styles.gaugeNum}><Pct value={ins?.confirmation.rate ?? null} /></span>
              </Gauge>
              <p className={styles.gaugeHint}>
                {ins && ins.confirmation.total > 0 ? `${ins.confirmation.confirmed} de ${ins.confirmation.total} consultas confirmadas` : 'Nenhuma consulta nesta semana'}
              </p>
            </div>
          </div>

          <div className={styles.next}>
            {next ? (
              <>
                <span className={styles.nextTime}>{fmtTime(next.scheduled_at)}</span>
                <div className={styles.nextWho}>
                  <small>Próximo atendimento</small>
                  <b>{next.patients?.name ?? '-'}</b>
                  {next.procedure_name && <span>{next.procedure_name}</span>}
                </div>
                {next.patient_id && <Link className={styles.nextGo} href={`/pacientes?patient=${next.patient_id}`}>Abrir</Link>}
              </>
            ) : (
              <div className={styles.nextWho}>
                <small>Próximo atendimento</small>
                <b>{todayAppts.length ? 'Nenhum outro atendimento hoje' : 'Nenhum atendimento hoje'}</b>
              </div>
            )}
          </div>

          <div className={styles.attend}>
            <div className={styles.attendHead}>
              <h2>Comparecimento</h2>
              <span>últimos 7 dias</span>
            </div>
            <div className={styles.attendBig}>
              <span className={styles.num}><Pct value={att?.rate ?? null} /></span>
              <small>{att && att.done + att.noShow > 0 ? `${att.done} de ${att.done + att.noShow} pacientes vieram` : 'Sem atendimentos passados'}</small>
            </div>
            <div className={styles.segs}>
              <div className={styles.seg}>
                <p>Compareceram <b>{att?.done ?? 0}</b></p>
                <DayBars values={att?.perDay.done ?? []} max={attMax} />
              </div>
              <div className={`${styles.seg} ${styles.segWarn}`}>
                <p>Faltaram <b>{att?.noShow ?? 0}</b></p>
                <DayBars values={att?.perDay.noShow ?? []} max={attMax} />
              </div>
              <div className={`${styles.seg} ${styles.segDim}`}>
                <p>Cancelaram <b>{att?.cancelled ?? 0}</b></p>
                <DayBars values={att?.perDay.cancelled ?? []} max={attMax} />
              </div>
            </div>
          </div>
        </section>

        <div className={styles.minis}>
          <StatCard
            title="Pacientes ativos"
            value={stats.totalPatients}
            delta={stats.newPatientsMonth > 0 ? { label: `+${stats.newPatientsMonth}` } : undefined}
            hint={stats.newPatientsMonth === 1 ? '1 novo neste mês' : `${stats.newPatientsMonth} novos neste mês`}
            spark={ins ? { values: ins.sparks.patients, label: `Pacientes ativos nos últimos 7 dias: de ${ins.sparks.patients[0]} para ${stats.totalPatients}` } : undefined}
          />
          <StatCard
            title="Consultas hoje"
            value={stats.appointmentsToday}
            hint={needsConfirm > 0 ? `${needsConfirm} para confirmar` : `${confirmedToday} confirmada(s)`}
            spark={ins ? { values: ins.sparks.appointments, label: `Consultas por dia nos últimos 7 dias: ${ins.sparks.appointments.join(', ')}` } : undefined}
          />
          <StatCard
            title="Receita do mês"
            value={moneyCompact(stats.monthRevenue)}
            compact
            delta={mtdPct != null && !hideValues ? { label: `${mtdPct > 0 ? '+' : ''}${mtdPct}%`, bad: mtdPct < 0 } : undefined}
            hint={mtdPct != null ? 'comparado ao mês passado' : `lucro de ${moneyCompact(monthProfit)}`}
          />
          <StatCard
            title="Ticket médio"
            value={moneyCompact(stats.avgTicket)}
            compact
            hint={stats.treatmentsCompleted === 1 ? '1 atendimento concluído' : `${stats.treatmentsCompleted} atendimentos concluídos`}
          />
        </div>

        <Card
          className={styles.chartCard}
          title={trend.title}
          actions={<PillTabs label="Período do gráfico" value={period} onChange={setPeriod} options={PERIODS} />}
        >
          {hideValues || trendEmpty ? (
            hideValues
              ? <div className={styles.chartHidden}>Valores ocultos</div>
              : <EmptyState compact icon="reports" title="Nenhuma receita neste período" description="Escolha outro período ou registre uma receita no Financeiro." className={styles.chartEmpty} />
          ) : (
            <AreaTrendChart
              data={trend.data}
              highlightIndex={trend.highlight}
              valueName={trend.valueName}
              compareName={trend.compareName}
              formatValue={moneyShort}
              formatAxis={axisMoney}
              height={236}
              label={`${trend.title}: ${trend.valueName.toLowerCase()} comparada com ${trend.compareName.toLowerCase()}`}
            />
          )}
        </Card>

        <div className={styles.bottom}>
          <Card
            title="Agenda de hoje"
            actions={<Link href="/agenda" className={styles.cardLink}>Ver agenda <Icon name="chevronRight" size={13} /></Link>}
          >
            {todayAppts.length === 0 ? (
              <EmptyState compact icon="calendar" title="Nenhum agendamento para hoje" description="Os atendimentos marcados para hoje aparecem aqui." />
            ) : (
              <ul className={styles.apptList}>
                {todayAppts.map((a) => (
                  <li key={a.id} className={styles.appt}>
                    <time className={styles.apptTime}>{fmtTime(a.scheduled_at)}</time>
                    <div className={styles.apptWho}>
                      <b>{a.patients?.name ?? '-'}</b>
                      <span>{a.procedure_name ?? '-'}</span>
                    </div>
                    <div className={styles.apptEnd}>
                      <StatusDot tone={next?.id === a.id ? 'now' : STATUS_TONE[a.status]}>{STATUS_LABELS[a.status]}</StatusDot>
                      {canEditAgenda && a.status === 'agendado' && (
                        <button type="button" className={styles.apptBtn} disabled={confirmingId === a.id} onClick={() => handleConfirm(a.id)}>
                          {confirmingId === a.id ? 'Confirmando...' : 'Confirmar'}
                        </button>
                      )}
                      {canEditAgenda && a.status === 'confirmado' && (
                        <button type="button" className={styles.apptBtn} disabled={confirmingId === a.id} onClick={() => handleConclude(a.id)}>
                          {confirmingId === a.id ? 'Concluindo...' : 'Concluir'}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Caixa de hoje">
            <div className={styles.cash}>
              <div className={styles.cashRow}>
                <span>Recebido</span>
                <span className={styles.cashNum}>{money(todayCash.recebido)}</span>
              </div>
              <div className={styles.cashRow}>
                <span>A receber</span>
                <span className={styles.cashNum}>{money(todayCash.aReceber)}</span>
              </div>
              {todayCash.aReceberRecords.length > 0 && (
                <div className={styles.cashPendingList}>
                  {todayCash.aReceberRecords.map((r) => (
                    <Link key={r.id} href={`/financeiro?record=${r.id}`} className={styles.cashPendingChip}>{money(r.total_amount)}</Link>
                  ))}
                </div>
              )}
              <div className={`${styles.cashRow} ${styles.cashTotal}`}>
                <span>Previsto</span>
                <span className={styles.cashNum}>{money(todayCash.previsto)}</span>
              </div>
            </div>
          </Card>
        </div>

        {(revenueByCategory.length > 0 || insights.length > 0) && (
          <div className={styles.bottom}>
            <Card title="Receita por categoria" actions={<span className={styles.cardMeta}>mês atual</span>}>
              {revenueByCategory.length === 0 ? (
                <EmptyState compact icon="finance" title="Nenhuma receita neste mês" description="Quando houver lançamentos, a divisão por categoria aparece aqui." />
              ) : (
                <ul className={styles.cats}>
                  {revenueByCategory.slice(0, 5).map(c => (
                    <li key={c.category}>
                      <div className={styles.catRow}><span>{c.category}</span><b>{money(c.value)}</b></div>
                      <div className={styles.catTrack}><i style={{ width: `${catTotal > 0 ? Math.max(2, (c.value / catTotal) * 100) : 0}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {insights.length > 0 && (
              <Card title="Conclusões e dicas">
                <ul className={styles.insightsList}>
                  {insights.map((it, i) => (
                    <li key={i} className={styles.insightItem}>
                      <span className={styles.insightIcon} style={{ color: it.color }}><Icon name={it.icon} size={14} /></span>
                      <p className={styles.insightText}>{it.text}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return <PermissionGuard module="dashboard"><DashboardContent /></PermissionGuard>
}
