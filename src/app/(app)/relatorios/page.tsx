'use client'
import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatCurrency, formatDate } from '@/lib/utils'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { useProfessionals, useProcedures, useRelatoriosRawData, useCommissionsData } from '@/hooks/useClinicData'
import styles from './relatorios.module.css'
import { Icon } from '@/components/ui/Icon'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { PillTabs } from '@/components/ui/PillTabs'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusDot } from '@/components/ui/StatusDot'
import { BarList } from '@/components/ui/BarList'
import btn from '@/components/ui/button.module.css'
import t from '@/components/ui/table.module.css'
import { moneyShort, axisMoney, statMoney } from '@/lib/ui/money'

const AreaTrendChart = dynamic(() => import('@/components/ui/AreaTrendChart').then(m => m.AreaTrendChart), { ssr: false, loading: () => <div className={styles.chartLoading} /> })


type ReportTab = 'financeiro' | 'clinico' | 'pacientes' | 'equipe' | 'comissoes'

interface MonthlyFin  { month: string; receita: number; despesa: number; lucro: number }
interface ProcRank    { name: string; count: number }
interface ProcRevenue { name: string; count: number; revenue: number }
interface ProfRow     { name: string; concluded: number; revenue: number; cancelRate: number }

function RelatoriosContent() {
  const { clinic } = useAuthStore()
  const { data: cachedProfessionals = [] } = useProfessionals(clinic?.id)
  const { data: cachedProcedures = [] }    = useProcedures(clinic?.id)
  const [tab, setTab]           = useState<ReportTab>('financeiro')
  const [period, setPeriod]     = useState('6m')
  const [month, setMonth]       = useState(() => new Date().toISOString().slice(0, 7))
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportPeriodChoice, setExportPeriodChoice] = useState<'3m'|'6m'|'12m'>('6m')
  const [exporting, setExporting] = useState(false)

  const { data: rawData, isLoading: loading } = useRelatoriosRawData(clinic?.id, period)
  const { data: commissionsData, isLoading: loadingCommissions } = useCommissionsData(clinic?.id, period)

  const commissionsComputed = useMemo(() => {
    const entries = commissionsData?.entries ?? []
    const totalPaid = entries.reduce((s, e) => s + e.amount, 0)
    const byRecipient = new Map<string, { name: string; total: number; count: number }>()
    for (const e of entries) {
      const cur = byRecipient.get(e.recipient_id) ?? { name: e.recipient_name, total: 0, count: 0 }
      cur.total += e.amount
      cur.count += 1
      byRecipient.set(e.recipient_id, cur)
    }
    const recipientRows = Array.from(byRecipient.values()).sort((a, b) => b.total - a.total)
    return { totalPaid, recipientRows, entries }
  }, [commissionsData])

  const computed = useMemo(() => {
    const fins = rawData?.fins ?? []
    const appts = rawData?.appts ?? []
    const pats = rawData?.pats ?? []
    const profs = cachedProfessionals
    const procNameMap: Record<string, string> = {}
    for (const p of cachedProcedures) procNameMap[p.id] = p.name

    const now = new Date()
    const months = period === '3m' ? 3 : period === '6m' ? 6 : 12
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const monthMap: Record<string, MonthlyFin> = {}
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('. de ', '/')
      monthMap[key] = { month: label, receita: 0, despesa: 0, lucro: 0 }
    }
    for (const r of fins) {
      const key = (r.created_at as string).slice(0, 7)
      if (!monthMap[key]) continue
      if (r.type === 'receita') monthMap[key].receita += Number(r.total_amount)
      else monthMap[key].despesa += Number(r.total_amount)
    }
    const monthly = Object.values(monthMap).map(m => ({ ...m, lucro: m.receita - m.despesa }))

    const totalRec = fins.filter(r => r.type === 'receita').reduce((s, r) => s + Number(r.total_amount), 0)
    const totalDesp = fins.filter(r => r.type === 'despesa').reduce((s, r) => s + Number(r.total_amount), 0)
    const concluded = appts.filter((a: { status: string }) => a.status === 'concluido')
    const ticketMedio = concluded.length > 0 ? totalRec / concluded.length : 0
    const finTotals = { receita: totalRec, despesa: totalDesp, lucro: totalRec - totalDesp, ticketMedio }

    const procRevMap: Record<string, ProcRevenue> = {}
    for (const r of fins) {
      if (r.type !== 'receita' || !(r as { procedure_id?: string }).procedure_id) continue
      const pid = (r as { procedure_id: string }).procedure_id
      if (!procRevMap[pid]) procRevMap[pid] = { name: procNameMap[pid] ?? 'Desconhecido', count: 0, revenue: 0 }
      procRevMap[pid].count++
      procRevMap[pid].revenue += Number(r.total_amount)
    }
    const procRevenue = Object.values(procRevMap).sort((a, b) => b.revenue - a.revenue)

    const procMap: Record<string, number> = {}
    for (const a of concluded) {
      const name = (a as { procedure_name?: string }).procedure_name || 'Não informado'
      procMap[name] = (procMap[name] ?? 0) + 1
    }
    const procRank = Object.entries(procMap).sort(([, a], [, b]) => b - a).slice(0, 8).map(([name, count]) => ({ name, count }))

    const total = appts.length
    const canceled = appts.filter((a: { status: string }) => a.status === 'cancelado' || a.status === 'faltou').length
    // "Taxa de retorno" = % de pacientes com 2+ consultas concluídas. Antes
    // agrupava por `a.patients` (o objeto do join) — um Set de referências de
    // objeto distintas sempre tem o mesmo tamanho da lista filtrada, então
    // sempre contava como se cada consulta fosse de um paciente diferente
    // (podendo passar de 100%, já que concluídas podem superar o total de
    // pacientes ativos). Contar por patient_id dá o número real de consultas
    // por pessoa.
    const concludedPerPatient: Record<string, number> = {}
    for (const a of appts as { status: string; patient_id?: string }[]) {
      if (a.status !== 'concluido' || !a.patient_id) continue
      concludedPerPatient[a.patient_id] = (concludedPerPatient[a.patient_id] ?? 0) + 1
    }
    const returnPatients = Object.values(concludedPerPatient).filter(count => count >= 2).length
    const clinicStats = {
      totalAppts: total,
      cancelRate: total > 0 ? Math.round((canceled / total) * 100) : 0,
      convRate: total > 0 ? Math.round((concluded.length / total) * 100) : 0,
      returnRate: pats.length > 0 ? Math.round((returnPatients / pats.length) * 100) : 0,
    }

    const newMonth = pats.filter((p: { created_at: string }) => p.created_at >= startOfMonth).length
    const withConsent = pats.filter((p: { lgpd_consent: boolean }) => p.lgpd_consent).length
    const patStats = { total: pats.length, newMonth, withConsent }

    const newMap: Record<string, number> = {}
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      newMap[key] = 0
    }
    for (const p of pats) {
      const key = (p.created_at as string).slice(0, 7)
      if (key in newMap) newMap[key]++
    }
    const newByMonth = Object.entries(newMap).map(([key, count]) => ({
      // new Date(key + '-01') parseia como UTC meia-noite — em fuso horário
      // atrás de UTC isso "volta" um dia ao formatar em horário local,
      // rotulando o mês errado no eixo do gráfico. Construir com
      // componentes locais evita o bug.
      month: (() => {
        const [y, m] = key.split('-').map(Number)
        return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('. de ', '/')
      })(),
      count,
    }))

    const profRows: ProfRow[] = profs.map(prof => {
      const mine = appts.filter((a: { professional_id?: string }) => a.professional_id === prof.id)
      const myConc = mine.filter((a: { status: string }) => a.status === 'concluido').length
      const myCanceled = mine.filter((a: { status: string }) => a.status === 'cancelado' || a.status === 'faltou').length
      const myRev = fins.filter((f: { type: string }) => f.type === 'receita').reduce((s: number, f: { total_amount: number }) => s + Number(f.total_amount), 0)
      return {
        name: prof.name,
        concluded: myConc,
        revenue: myRev / (profs.length || 1),
        cancelRate: mine.length > 0 ? Math.round((myCanceled / mine.length) * 100) : 0,
      }
    }).sort((a, b) => b.concluded - a.concluded)

    return { monthly, finTotals, procRevenue, procRank, clinicStats, patStats, newByMonth, profRows }
  }, [rawData, period, cachedProfessionals, cachedProcedures])

  const { monthly, finTotals, procRevenue, procRank, clinicStats, patStats, newByMonth, profRows } = computed

  async function exportXLSX() {
    if (!clinic?.id) return
    setExporting(true)

    const { utils, writeFile } = await import('xlsx')
    const now = new Date()
    const months = exportPeriodChoice === '3m' ? 3 : exportPeriodChoice === '6m' ? 6 : 12
    const startDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1).toISOString()

    const [finRes, apptRes, patRes, profRes, procNamesRes] = await Promise.all([
      supabase.from('financial_records').select('total_amount,type,created_at,procedure_id').eq('clinic_id', clinic.id).gte('created_at', startDate),
      supabase.from('appointments').select('status,procedure_name,professional_id,scheduled_at').eq('clinic_id', clinic.id).gte('scheduled_at', startDate),
      supabase.from('patients').select('id,created_at,lgpd_consent').eq('clinic_id', clinic.id).eq('is_active', true),
      supabase.from('professionals').select('id,name').eq('clinic_id', clinic.id),
      supabase.from('procedures').select('id,name').eq('clinic_id', clinic.id),
    ])

    const fins = finRes.data ?? []
    const appts = apptRes.data ?? []
    const pats = patRes.data ?? []
    const profs = profRes.data ?? []
    const expProcNameMap: Record<string, string> = {}
    for (const p of procNamesRes.data ?? []) expProcNameMap[p.id] = p.name

    let sheetData: (string | number)[][] = []
    let filename = 'relatorio.xlsx'
    let sheetName = 'Relatório'

    if (tab === 'financeiro') {
      const monthMap: Record<string, { month: string; receita: number; despesa: number; lucro: number }> = {}
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('. de ', '/')
        monthMap[key] = { month: label, receita: 0, despesa: 0, lucro: 0 }
      }
      for (const r of fins) {
        const key = r.created_at!.slice(0, 7)
        if (!monthMap[key]) continue
        if (r.type === 'receita') monthMap[key].receita += Number(r.total_amount)
        else monthMap[key].despesa += Number(r.total_amount)
      }
      const monthlyExport = Object.values(monthMap).map(m => ({ ...m, lucro: m.receita - m.despesa }))
      const totalRec = fins.filter(r => r.type === 'receita').reduce((s, r) => s + Number(r.total_amount), 0)
      const totalDesp = fins.filter(r => r.type === 'despesa').reduce((s, r) => s + Number(r.total_amount), 0)
      const concluded = appts.filter(a => a.status === 'concluido')
      const ticketMedio = concluded.length > 0 ? totalRec / concluded.length : 0

      const procRevExport: Record<string, { name: string; count: number; revenue: number }> = {}
      for (const r of fins) {
        if (r.type !== 'receita' || !(r as { procedure_id?: string }).procedure_id) continue
        const pid = (r as { procedure_id: string }).procedure_id
        if (!procRevExport[pid]) procRevExport[pid] = { name: expProcNameMap[pid] ?? 'Desconhecido', count: 0, revenue: 0 }
        procRevExport[pid].count++
        procRevExport[pid].revenue += Number(r.total_amount)
      }
      const procRevRows = Object.values(procRevExport).sort((a, b) => b.revenue - a.revenue)

      sheetName = 'Financeiro'
      filename = `financeiro_${exportPeriodChoice}.xlsx`
      sheetData = [
        ['Mês', 'Receita (R$)', 'Despesa (R$)', 'Lucro (R$)'],
        ...monthlyExport.map(m => [m.month, m.receita, m.despesa, m.lucro]),
        [],
        ['TOTAIS', totalRec, totalDesp, totalRec - totalDesp],
        ['Ticket Médio', ticketMedio, '', ''],
        [],
        ['Faturamento por Procedimento', '', '', ''],
        ['Procedimento', 'Atendimentos', 'Faturamento (R$)', 'Ticket Médio (R$)'],
        ...procRevRows.map(p => [p.name, p.count, p.revenue, p.count > 0 ? p.revenue / p.count : 0]),
      ]
    } else if (tab === 'clinico') {
      const concluded = appts.filter(a => a.status === 'concluido')
      const total = appts.length
      const canceled = appts.filter(a => a.status === 'cancelado' || a.status === 'faltou').length
      const procMap: Record<string, number> = {}
      for (const a of concluded) {
        const name = a.procedure_name || 'Não informado'
        procMap[name] = (procMap[name] ?? 0) + 1
      }
      const procRankExport = Object.entries(procMap).sort(([, a], [, b]) => b - a).slice(0, 8).map(([name, count]) => ({ name, count }))

      sheetName = 'Clínico'
      filename = `clinico_${exportPeriodChoice}.xlsx`
      sheetData = [
        ['Procedimento', 'Quantidade'],
        ...procRankExport.map(p => [p.name, p.count]),
        [],
        ['Total de Atendimentos', total],
        ['Concluídos', concluded.length],
        ['Taxa de Conversão', `${total > 0 ? Math.round((concluded.length / total) * 100) : 0}%`],
        ['Taxa de Cancelamento', `${total > 0 ? Math.round((canceled / total) * 100) : 0}%`],
      ]
    } else if (tab === 'pacientes') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const newMonth = pats.filter(p => p.created_at >= startOfMonth).length
      const withConsent = pats.filter(p => p.lgpd_consent).length
      const newMap: Record<string, number> = {}
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        newMap[key] = 0
      }
      for (const p of pats) {
        const key = p.created_at!.slice(0, 7)
        if (key in newMap) newMap[key]++
      }
      const newByMonthExport = Object.entries(newMap).map(([key, count]) => ({
        // new Date(key + '-01') parseia como UTC meia-noite — em fuso horário
      // atrás de UTC isso "volta" um dia ao formatar em horário local,
      // rotulando o mês errado no eixo do gráfico. Construir com
      // componentes locais evita o bug.
      month: (() => {
        const [y, m] = key.split('-').map(Number)
        return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('. de ', '/')
      })(),
        count,
      }))

      sheetName = 'Pacientes'
      filename = `pacientes_${exportPeriodChoice}.xlsx`
      sheetData = [
        ['Mês', 'Novos Pacientes'],
        ...newByMonthExport.map(m => [m.month, m.count]),
        [],
        ['Total de Pacientes', pats.length],
        ['Novos este mês', newMonth],
        ['Com Consentimento LGPD', withConsent],
      ]
    } else if (tab === 'equipe') {
      const rows = profs.map(prof => {
        const mine = appts.filter((a: { professional_id?: string }) => a.professional_id === prof.id)
        const myConc = mine.filter(a => a.status === 'concluido').length
        const myCanceled = mine.filter(a => a.status === 'cancelado' || a.status === 'faltou').length
        return {
          name: prof.name,
          concluded: myConc,
          cancelRate: mine.length > 0 ? Math.round((myCanceled / mine.length) * 100) : 0,
        }
      }).sort((a, b) => b.concluded - a.concluded)

      sheetName = 'Equipe'
      filename = `equipe_${exportPeriodChoice}.xlsx`
      sheetData = [
        ['Profissional', 'Consultas Concluídas', 'Taxa de Cancelamento'],
        ...rows.map(p => [p.name, p.concluded, `${p.cancelRate}%`]),
      ]
    }

    const ws = utils.aoa_to_sheet(sheetData)
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, sheetName)
    writeFile(wb, filename)

    setExporting(false)
    setShowExportModal(false)
  }

  const maxProc = useMemo(() => procRank[0]?.count ?? 1, [procRank])

  const TABS: { value: ReportTab; label: string }[] = [
    { value: 'financeiro', label: 'Financeiro' },
    { value: 'clinico',    label: 'Clínico'    },
    { value: 'pacientes',  label: 'Pacientes'  },
    { value: 'equipe',     label: 'Equipe'     },
    { value: 'comissoes',  label: 'Comissões'  },
  ]
  const PERIODS: { value: '3m' | '6m' | '12m'; label: string }[] = [
    { value: '3m', label: '3 meses' },
    { value: '6m', label: '6 meses' },
    { value: '12m', label: '12 meses' },
  ]

  const trendFin = monthly.map(m => ({ label: m.month, value: m.receita, compare: m.lucro }))
  const trendPat = newByMonth.map(m => ({ label: m.month, value: m.count }))
  const hasFin = monthly.some(m => m.receita > 0 || m.despesa > 0)
  const hasPat = newByMonth.some(m => m.count > 0)
  const clip = (n: number) => Math.min(100, Math.max(0, n))

  return (
    <div className={styles.page}>
      <PageHeader
        title="Relatórios"
        subtitle="Análise completa de desempenho da clínica"
        actions={
          <>
            <PillTabs label="Período do relatório" value={period as '3m' | '6m' | '12m'} onChange={setPeriod} options={PERIODS} />
            <button type="button" className={btn.secondary} onClick={() => setShowExportModal(true)}>
              <Icon name="download" size={15} /> Exportar planilha
            </button>
          </>
        }
      />

      <PillTabs label="Relatório" value={tab} onChange={setTab} options={TABS} className={styles.tabs} />

      {loading ? (
        <p className={styles.loading}>Carregando dados...</p>
      ) : (
        <>
          {/* ── FINANCEIRO ── */}
          {tab === 'financeiro' && (
            <>
              <div className={styles.kpis}>
                <StatCard title="Receita total" value={statMoney(finTotals.receita)} compact hint={`no período de ${PERIODS.find(p => p.value === period)?.label}`} />
                <StatCard title="Despesa total" value={statMoney(finTotals.despesa)} compact hint={`no período de ${PERIODS.find(p => p.value === period)?.label}`} />
                <StatCard
                  title="Lucro líquido"
                  value={statMoney(finTotals.lucro)}
                  compact
                  hint={finTotals.receita > 0 ? `margem de ${Math.round((finTotals.lucro / finTotals.receita) * 100)}%` : 'sem receita no período'}
                />
                <StatCard title="Ticket médio" value={statMoney(finTotals.ticketMedio)} compact hint="receita por atendimento concluído" />
              </div>

              <div className={styles.split}>
                <Card title="Receita e lucro por mês" actions={<span className={styles.cardMeta}>{PERIODS.find(p => p.value === period)?.label}</span>}>
                  {hasFin ? (
                    <AreaTrendChart
                      data={trendFin}
                      highlightIndex={trendFin.length - 1}
                      valueName="Receita"
                      compareName="Lucro"
                      formatValue={moneyShort}
                      formatAxis={axisMoney}
                      height={260}
                      label="Receita e lucro por mês no período"
                    />
                  ) : (
                    <p className={styles.cardEmpty}>Sem dados no período</p>
                  )}
                </Card>
                <Card title="Faturamento por procedimento">
                  <BarList
                    items={procRevenue.slice(0, 7).map(p => ({ label: `${p.name} (${p.count})`, value: p.revenue }))}
                    format={moneyShort}
                    empty="Nenhuma receita ligada a procedimento no período."
                  />
                </Card>
              </div>

              <Card flush title="Resultado mensal">
                <div className={`${t.wrap} ${styles.wrap} resp-table-wrap`}>
                  <table className={`${t.table} resp-table`}>
                    <thead>
                      <tr>
                        <th>Mês</th>
                        <th className={t.num}>Receita</th>
                        <th className={t.num}>Despesa</th>
                        <th className={t.num}>Lucro</th>
                        <th>Margem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthly.map(m => {
                        const pct = m.receita > 0 ? Math.round((m.lucro / m.receita) * 100) : 0
                        return (
                          <tr key={m.month}>
                            <td className={t.strong}>{m.month}</td>
                            <td data-label="Receita" className={t.num}>{formatCurrency(m.receita)}</td>
                            <td data-label="Despesa" className={`${t.num} ${t.muted}`}>{formatCurrency(m.despesa)}</td>
                            <td data-label="Lucro" className={`${t.num} ${m.lucro < 0 ? styles.neg : styles.strongNum}`}>{formatCurrency(m.lucro)}</td>
                            <td data-label="Margem">
                              <div className={styles.margin}>
                                <span className={pct < 0 ? styles.neg : undefined}>{pct}%</span>
                                <span className={styles.marginTrack} aria-hidden="true"><i style={{ width: `${clip(pct)}%` }} /></span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {/* ── CLÍNICO ── */}
          {tab === 'clinico' && (
            <>
              <div className={styles.kpis}>
                <StatCard title="Total de atendimentos" value={clinicStats.totalAppts} hint="agendados no período" />
                <StatCard title="Taxa de conversão" value={`${clinicStats.convRate}%`} hint="agendados que viraram concluídos" />
                <StatCard title="Taxa de cancelamento" value={`${clinicStats.cancelRate}%`} hint={clinicStats.cancelRate > 20 ? 'acima de 20%, vale rever os lembretes' : 'cancelamentos e faltas'} delta={clinicStats.cancelRate > 20 ? { label: 'alta', bad: true } : undefined} />
                <StatCard title="Taxa de retorno" value={`${clinicStats.returnRate}%`} hint="pacientes com 2 ou mais consultas" />
              </div>

              <Card title="Procedimentos mais realizados">
                <BarList
                  items={procRank.map(p => ({ label: p.name, value: p.count }))}
                  format={n => `${n} atend.`}
                  total={maxProc}
                  empty="Nenhum procedimento registrado"
                />
              </Card>
            </>
          )}

          {/* ── PACIENTES ── */}
          {tab === 'pacientes' && (
            <>
              <div className={styles.kpis3}>
                <StatCard title="Total de pacientes" value={patStats.total} hint="ativos no cadastro" />
                <StatCard title="Novos este mês" value={patStats.newMonth} hint="cadastros desde o dia 1" />
                <StatCard
                  title="Com consentimento LGPD"
                  value={patStats.withConsent}
                  hint={`${patStats.total > 0 ? Math.round((patStats.withConsent / patStats.total) * 100) : 0}% do total`}
                />
              </div>

              <Card title="Novos pacientes por mês" actions={<span className={styles.cardMeta}>{PERIODS.find(p => p.value === period)?.label}</span>}>
                {hasPat ? (
                  <AreaTrendChart
                    data={trendPat}
                    highlightIndex={trendPat.length - 1}
                    valueName="Novos pacientes"
                    formatValue={n => String(Math.round(n))}
                    height={240}
                    label="Novos pacientes por mês no período"
                  />
                ) : (
                  <p className={styles.cardEmpty}>Sem dados no período</p>
                )}
              </Card>
            </>
          )}

          {/* ── EQUIPE ── */}
          {tab === 'equipe' && (
            <Card flush title="Produção por profissional">
              {profRows.length === 0 ? (
                <p className={styles.cardEmpty}>Nenhum profissional cadastrado</p>
              ) : (
                <div className={`${t.wrap} ${styles.wrap} resp-table-wrap`}>
                  <table className={`${t.table} resp-table`}>
                    <thead>
                      <tr>
                        <th>Profissional</th>
                        <th className={t.num}>Consultas concluídas</th>
                        <th>Cancelamentos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profRows.map(p => (
                        <tr key={p.name}>
                          <td className={t.strong}>{p.name}</td>
                          <td data-label="Consultas concluídas" className={t.num}>{p.concluded}</td>
                          <td data-label="Cancelamentos">
                            <StatusDot tone={p.cancelRate > 20 ? 'bad' : 'ok'}>{p.cancelRate}%</StatusDot>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {/* ── COMISSÕES ── */}
          {tab === 'comissoes' && (
            loadingCommissions ? (
              <p className={styles.loading}>Carregando comissões...</p>
            ) : (
              <>
                <div className={styles.kpis2}>
                  <StatCard title="Total pago em comissões" value={statMoney(commissionsComputed.totalPaid)} compact />
                  <StatCard title="Beneficiários com lançamento" value={commissionsComputed.recipientRows.length} />
                </div>

                {commissionsComputed.recipientRows.length === 0 ? (
                  <Card>
                    <p className={styles.cardEmpty}>Nenhuma comissão calculada no período. Configure beneficiários e % na aba Comissões do menu.</p>
                  </Card>
                ) : (
                  <>
                    <Card flush title="Total por beneficiário">
                      <div className={`${t.wrap} ${styles.wrap} resp-table-wrap`}>
                        <table className={`${t.table} resp-table`}>
                          <thead>
                            <tr>
                              <th>Beneficiário</th>
                              <th className={t.num}>Lançamentos</th>
                              <th className={t.num}>Total recebido</th>
                            </tr>
                          </thead>
                          <tbody>
                            {commissionsComputed.recipientRows.map(r => (
                              <tr key={r.name}>
                                <td className={t.strong}>{r.name}</td>
                                <td data-label="Lançamentos" className={t.num}>{r.count}</td>
                                <td data-label="Total recebido" className={`${t.num} ${styles.strongNum}`}>{formatCurrency(r.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>

                    <Card flush title="Detalhamento dos lançamentos">
                      <div className={`${t.wrap} ${styles.wrap} resp-table-wrap`}>
                        <table className={`${t.table} resp-table`}>
                          <thead>
                            <tr>
                              <th>Data</th>
                              <th>Beneficiário</th>
                              <th>Procedimento</th>
                              <th>Paciente</th>
                              <th className={t.num}>%</th>
                              <th className={t.num}>Valor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {commissionsComputed.entries.map(e => (
                              <tr key={e.id}>
                                <td className={t.muted}>{formatDate(e.created_at, true)}</td>
                                <td data-label="Beneficiário" className={t.strong}>{e.recipient_name}</td>
                                <td data-label="Procedimento" className={t.muted}>{e.financial_records?.procedures?.name ?? '-'}</td>
                                <td data-label="Paciente" className={t.muted}>{e.financial_records?.patients?.name ?? '-'}</td>
                                <td data-label="%" className={t.num}>{e.percent}%</td>
                                <td data-label="Valor" className={`${t.num} ${styles.strongNum}`}>{formatCurrency(e.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  </>
                )}
              </>
            )
          )}
        </>
      )}
      {/* Export period modal — portal garante position:fixed relativo ao viewport */}
      {showExportModal && typeof document !== 'undefined' && createPortal(
        <div className={styles.exportOverlay} onClick={() => setShowExportModal(false)}>
          <div className={styles.exportModal} onClick={e => e.stopPropagation()}>
            <div className={styles.exportModalHeader}>
              <h3>Exportar planilha</h3>
              <button className={styles.exportBtnClose} onClick={() => setShowExportModal(false)}><Icon name="close" size={16} /></button>
            </div>
            <div className={styles.exportModalBody}>
              <p style={{ fontSize: '.82rem', color: 'var(--text-secondary)', margin: 0 }}>Escolha o período para exportar:</p>
              <div className={styles.exportOptions}>
                {([
                  ['3m', 'Últimos 3 meses'],
                  ['6m', 'Últimos 6 meses'],
                  ['12m', 'Últimos 12 meses'],
                ] as const).map(([value, label]) => (
                  <label key={value} className={`${styles.exportOption} ${exportPeriodChoice === value ? styles.exportOptionActive : ''}`}>
                    <input type="radio" name="exportPeriod" value={value} checked={exportPeriodChoice === value} onChange={() => setExportPeriodChoice(value)} style={{ accentColor: '#4DD9C0' }} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div className={styles.exportModalFooter}>
              <button type="button" className={btn.secondary} onClick={() => setShowExportModal(false)}>Cancelar</button>
              <button type="button" className={btn.primary} onClick={exportXLSX} disabled={exporting}>
                {exporting ? 'Exportando...' : <><Icon name="download" size={15} /> Exportar</>}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default function RelatoriosPage() {
  return (
    <PermissionGuard module="relatorios">
      <RelatoriosContent />
    </PermissionGuard>
  )
}
