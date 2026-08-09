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
import { SelectMenu } from '@/components/ui/SelectMenu'

const { FinanceiroBarChart, PacientesBarChart } = {
  FinanceiroBarChart: dynamic(() => import('./RelatoriosCharts').then(m => m.FinanceiroBarChart), { ssr: false, loading: () => <div className={styles.loading}>Carregando gráfico...</div> }),
  PacientesBarChart:  dynamic(() => import('./RelatoriosCharts').then(m => m.PacientesBarChart),  { ssr: false, loading: () => <div className={styles.loading}>Carregando gráfico...</div> }),
}

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
    const returnPatients = new Set(appts.filter((a: { status: string }) => a.status === 'concluido').map((a: { patients?: unknown }) => a.patients)).size
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

  const TABS: { key: ReportTab; label: string }[] = [
    { key: 'financeiro', label: 'Financeiro' },
    { key: 'clinico',    label: 'Clínico'    },
    { key: 'pacientes',  label: 'Pacientes'  },
    { key: 'equipe',     label: 'Equipe'     },
    { key: 'comissoes',  label: 'Comissões'  },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Relatórios</h1>
          <p className={styles.sub}>Análise completa de desempenho da clínica</p>
        </div>
        <div className={styles.headerActions}>
          <SelectMenu
            value={period}
            onChange={setPeriod}
            options={[
              { value: '3m', label: 'Últimos 3 meses' },
              { value: '6m', label: 'Últimos 6 meses' },
              { value: '12m', label: 'Últimos 12 meses' },
            ]}
          />
          <button className={styles.btnExport} onClick={() => setShowExportModal(true)}>
            <Icon name="download" size={14} /> Exportar planilha
          </button>
        </div>
      </div>

      <div className={styles.tabs} data-hscroll>
        {TABS.map(t => (
          <button
            key={t.key}
            className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
            onClick={() => setTab(t.key)}
          >{t.label}</button>
        ))}
      </div>

      {loading ? (
        <p className={styles.loading}>Carregando dados...</p>
      ) : (
        <>
          {/* ── FINANCEIRO ── */}
          {tab === 'financeiro' && (
            <>
              <div className={styles.kpis}>
                <div className={styles.kpi}>
                  <div className={styles.kpiLabel}>Receita total</div>
                  <div className={`${styles.kpiValue} ${styles.kpiGreen}`}>{formatCurrency(finTotals.receita)}</div>
                </div>
                <div className={styles.kpi}>
                  <div className={styles.kpiLabel}>Despesa total</div>
                  <div className={`${styles.kpiValue} ${styles.kpiRed}`}>{formatCurrency(finTotals.despesa)}</div>
                </div>
                <div className={styles.kpi}>
                  <div className={styles.kpiLabel}>Lucro líquido</div>
                  <div className={`${styles.kpiValue} ${finTotals.lucro >= 0 ? styles.kpiGreen : styles.kpiRed}`}>
                    {formatCurrency(finTotals.lucro)}
                  </div>
                </div>
                <div className={styles.kpi}>
                  <div className={styles.kpiLabel}>Ticket médio</div>
                  <div className={`${styles.kpiValue} ${styles.kpiBlue}`}>{formatCurrency(finTotals.ticketMedio)}</div>
                </div>
              </div>

              <div className={styles.card}>
                <div className={styles.cardTitle}>Receita vs Despesa por mês</div>
                {monthly.length === 0 ? (
                  <p className={styles.cardEmpty}>Sem dados no período</p>
                ) : (
                  <FinanceiroBarChart data={monthly} />
                )}
              </div>

              <div className={styles.card}>
                <div className={styles.cardTitle}>Lucro líquido mensal</div>
                <div className={`${styles.tableWrap} resp-table-wrap`}>
                  <table className={`${styles.table} resp-table`}>
                    <thead>
                      <tr>
                        <th>Mês</th><th>Receita</th><th>Despesa</th><th>Lucro</th><th>Margem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthly.map(m => (
                        <tr key={m.month}>
                          <td>{m.month}</td>
                          <td data-label="Receita" className={styles.kpiGreen}>{formatCurrency(m.receita)}</td>
                          <td data-label="Despesa" className={styles.kpiRed}>{formatCurrency(m.despesa)}</td>
                          <td data-label="Lucro" className={m.lucro >= 0 ? styles.kpiGreen : styles.kpiRed}>{formatCurrency(m.lucro)}</td>
                          <td data-label="Margem">
                            <span className={m.lucro >= 0 ? styles.tagGreen : styles.tagRed}>
                              {m.receita > 0 ? Math.round((m.lucro / m.receita) * 100) : 0}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {procRevenue.length > 0 && (
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Faturamento por procedimento</div>
                  <div className={`${styles.tableWrap} resp-table-wrap`}>
                    <table className={`${styles.table} resp-table`}>
                      <thead>
                        <tr>
                          <th>Procedimento</th><th>Atendimentos</th><th>Faturamento</th><th>Ticket médio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {procRevenue.map(p => (
                          <tr key={p.name}>
                            <td>{p.name}</td>
                            <td data-label="Atendimentos">{p.count}</td>
                            <td data-label="Faturamento" className={styles.kpiGreen}>{formatCurrency(p.revenue)}</td>
                            <td data-label="Ticket médio">{formatCurrency(p.count > 0 ? p.revenue / p.count : 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── CLÍNICO ── */}
          {tab === 'clinico' && (
            <>
              <div className={styles.kpis}>
                <div className={styles.kpi}>
                  <div className={styles.kpiLabel}>Total de atendimentos</div>
                  <div className={styles.kpiValue}>{clinicStats.totalAppts}</div>
                </div>
                <div className={styles.kpi}>
                  <div className={styles.kpiLabel}>Taxa de conversão</div>
                  <div className={`${styles.kpiValue} ${styles.kpiGreen}`}>{clinicStats.convRate}%</div>
                  <div className={styles.kpiSub}>Agendados → Concluídos</div>
                </div>
                <div className={styles.kpi}>
                  <div className={styles.kpiLabel}>Taxa de cancelamento</div>
                  <div className={`${styles.kpiValue} ${clinicStats.cancelRate > 20 ? styles.kpiRed : styles.kpiGreen}`}>
                    {clinicStats.cancelRate}%
                  </div>
                </div>
                <div className={styles.kpi}>
                  <div className={styles.kpiLabel}>Taxa de retorno</div>
                  <div className={`${styles.kpiValue} ${styles.kpiBlue}`}>{clinicStats.returnRate}%</div>
                  <div className={styles.kpiSub}>Pacientes com ≥2 consultas</div>
                </div>
              </div>

              <div className={styles.card}>
                <div className={styles.cardTitle}>Procedimentos mais realizados</div>
                {procRank.length === 0 ? (
                  <p className={styles.cardEmpty}>Nenhum procedimento registrado</p>
                ) : (
                  <div className={styles.rankList}>
                    {procRank.map(p => (
                      <div key={p.name} className={styles.rankItem}>
                        <div className={styles.rankHeader}>
                          <span className={styles.rankName}>{p.name}</span>
                          <span className={styles.rankCount}>{p.count} atend.</span>
                        </div>
                        <div className={styles.rankBar}>
                          <div className={styles.rankFill} style={{ width: `${Math.round((p.count / maxProc) * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── PACIENTES ── */}
          {tab === 'pacientes' && (
            <>
              <div className={styles.kpis}>
                <div className={styles.kpi}>
                  <div className={styles.kpiLabel}>Total de pacientes</div>
                  <div className={styles.kpiValue}>{patStats.total}</div>
                </div>
                <div className={styles.kpi}>
                  <div className={styles.kpiLabel}>Novos este mês</div>
                  <div className={`${styles.kpiValue} ${styles.kpiGreen}`}>{patStats.newMonth}</div>
                </div>
                <div className={styles.kpi}>
                  <div className={styles.kpiLabel}>Com consentimento LGPD</div>
                  <div className={`${styles.kpiValue} ${styles.kpiBlue}`}>{patStats.withConsent}</div>
                  <div className={styles.kpiSub}>
                    {patStats.total > 0 ? Math.round((patStats.withConsent / patStats.total) * 100) : 0}% do total
                  </div>
                </div>
              </div>

              <div className={styles.card}>
                <div className={styles.cardTitle}>Novos pacientes por mês</div>
                {newByMonth.length === 0 ? (
                  <p className={styles.cardEmpty}>Sem dados no período</p>
                ) : (
                  <PacientesBarChart data={newByMonth} />
                )}
              </div>
            </>
          )}

          {/* ── EQUIPE ── */}
          {tab === 'equipe' && (
            <>
              {profRows.length === 0 ? (
                <div className={styles.card}>
                  <p className={styles.cardEmpty}>Nenhum profissional cadastrado</p>
                </div>
              ) : (
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Produção por profissional</div>
                  <div className={`${styles.tableWrap} resp-table-wrap`}>
                    <table className={`${styles.table} resp-table`}>
                      <thead>
                        <tr>
                          <th>Profissional</th>
                          <th>Consultas concluídas</th>
                          <th>Cancelamentos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profRows.map(p => (
                          <tr key={p.name}>
                            <td>{p.name}</td>
                            <td data-label="Consultas concluídas"><span className={styles.tagGreen}>{p.concluded}</span></td>
                            <td data-label="Cancelamentos">
                              <span className={p.cancelRate > 20 ? styles.tagRed : styles.tagBlue}>
                                {p.cancelRate}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── COMISSÕES ── */}
          {tab === 'comissoes' && (
            loadingCommissions ? (
              <p className={styles.loading}>Carregando comissões...</p>
            ) : (
              <>
                <div className={styles.kpis}>
                  <div className={styles.kpi}>
                    <div className={styles.kpiLabel}>Total pago em comissões</div>
                    <div className={`${styles.kpiValue} ${styles.kpiGreen}`}>{formatCurrency(commissionsComputed.totalPaid)}</div>
                  </div>
                  <div className={styles.kpi}>
                    <div className={styles.kpiLabel}>Beneficiários com lançamento</div>
                    <div className={`${styles.kpiValue} ${styles.kpiBlue}`}>{commissionsComputed.recipientRows.length}</div>
                  </div>
                </div>

                {commissionsComputed.recipientRows.length === 0 ? (
                  <div className={styles.card}>
                    <p className={styles.cardEmpty}>Nenhuma comissão calculada no período. Configure beneficiários e % na aba Comissões do menu.</p>
                  </div>
                ) : (
                  <>
                    <div className={styles.card}>
                      <div className={styles.cardTitle}>Total por beneficiário</div>
                      <div className={`${styles.tableWrap} resp-table-wrap`}>
                        <table className={`${styles.table} resp-table`}>
                          <thead>
                            <tr>
                              <th>Beneficiário</th>
                              <th>Lançamentos</th>
                              <th>Total recebido</th>
                            </tr>
                          </thead>
                          <tbody>
                            {commissionsComputed.recipientRows.map(r => (
                              <tr key={r.name}>
                                <td>{r.name}</td>
                                <td data-label="Lançamentos"><span className={styles.tagBlue}>{r.count}</span></td>
                                <td data-label="Total recebido"><span className={styles.tagGreen}>{formatCurrency(r.total)}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className={styles.card}>
                      <div className={styles.cardTitle}>Detalhamento dos lançamentos</div>
                      <div className={`${styles.tableWrap} resp-table-wrap`}>
                        <table className={`${styles.table} resp-table`}>
                          <thead>
                            <tr>
                              <th>Data</th>
                              <th>Beneficiário</th>
                              <th>Procedimento</th>
                              <th>Paciente</th>
                              <th>%</th>
                              <th>Valor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {commissionsComputed.entries.map(e => (
                              <tr key={e.id}>
                                <td data-label="Data">{formatDate(e.created_at, true)}</td>
                                <td data-label="Beneficiário">{e.recipient_name}</td>
                                <td data-label="Procedimento">{e.financial_records?.procedures?.name ?? '—'}</td>
                                <td data-label="Paciente">{e.financial_records?.patients?.name ?? '—'}</td>
                                <td data-label="%">{e.percent}%</td>
                                <td data-label="Valor">{formatCurrency(e.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
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
              <button className={styles.exportBtnCancel} onClick={() => setShowExportModal(false)}>Cancelar</button>
              <button className={styles.exportBtnConfirm} onClick={exportXLSX} disabled={exporting}>
                {exporting ? 'Exportando...' : <><Icon name="download" size={14} /> Exportar</>}
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
