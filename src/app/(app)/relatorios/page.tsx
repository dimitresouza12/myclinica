'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatCurrency } from '@/lib/utils'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import styles from './relatorios.module.css'

const BarChart   = dynamic(() => import('recharts').then(m => m.BarChart),   { ssr: false })
const Bar        = dynamic(() => import('recharts').then(m => m.Bar),        { ssr: false })
const XAxis      = dynamic(() => import('recharts').then(m => m.XAxis),      { ssr: false })
const YAxis      = dynamic(() => import('recharts').then(m => m.YAxis),      { ssr: false })
const Tooltip    = dynamic(() => import('recharts').then(m => m.Tooltip),    { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })

type ReportTab = 'financeiro' | 'clinico' | 'pacientes' | 'equipe'

interface MonthlyFin { month: string; receita: number; despesa: number; lucro: number }
interface ProcRank   { name: string; count: number }
interface ProfRow    { name: string; concluded: number; revenue: number; cancelRate: number }

function RelatoriosContent() {
  const { clinic } = useAuthStore()
  const [tab, setTab]           = useState<ReportTab>('financeiro')
  const [period, setPeriod]     = useState('6m')
  const [month, setMonth]       = useState(() => new Date().toISOString().slice(0, 7))
  const [loading, setLoading]   = useState(true)

  // Financeiro
  const [monthly, setMonthly]   = useState<MonthlyFin[]>([])
  const [finTotals, setFinTotals] = useState({ receita: 0, despesa: 0, lucro: 0, ticketMedio: 0 })

  // Clínico
  const [procRank, setProcRank]         = useState<ProcRank[]>([])
  const [clinicStats, setClinicStats]   = useState({ returnRate: 0, cancelRate: 0, convRate: 0, totalAppts: 0 })

  // Pacientes
  const [patStats, setPatStats] = useState({ total: 0, newMonth: 0, withConsent: 0 })
  const [newByMonth, setNewByMonth] = useState<{ month: string; count: number }[]>([])

  // Equipe
  const [profRows, setProfRows] = useState<ProfRow[]>([])

  const load = useCallback(async () => {
    if (!clinic?.id) return
    setLoading(true)

    const now = new Date()
    const months = period === '3m' ? 3 : period === '6m' ? 6 : 12
    const startDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1).toISOString()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const ninetyAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()

    const [finRes, apptRes, patRes, profRes] = await Promise.all([
      supabase.from('financial_records').select('total_amount,type,created_at').eq('clinic_id', clinic.id).gte('created_at', startDate),
      supabase.from('appointments').select('status,procedure_name,professional_id,scheduled_at,patients(name)').eq('clinic_id', clinic.id).gte('scheduled_at', startDate),
      supabase.from('patients').select('id,created_at,lgpd_consent').eq('clinic_id', clinic.id).eq('is_active', true),
      supabase.from('professionals').select('id,name').eq('clinic_id', clinic.id).eq('is_active', true),
    ])

    const fins = finRes.data ?? []
    const appts = apptRes.data ?? []
    const pats = patRes.data ?? []
    const profs = profRes.data ?? []

    // ── Financeiro ─────────────────────────────────────────────
    const monthMap: Record<string, MonthlyFin> = {}
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
    const monthlyData = Object.values(monthMap).map(m => ({ ...m, lucro: m.receita - m.despesa }))
    setMonthly(monthlyData)

    const totalRec = fins.filter(r => r.type === 'receita').reduce((s, r) => s + Number(r.total_amount), 0)
    const totalDesp = fins.filter(r => r.type === 'despesa').reduce((s, r) => s + Number(r.total_amount), 0)
    const concluded = appts.filter(a => a.status === 'concluido')
    const ticketMedio = concluded.length > 0 ? totalRec / concluded.length : 0
    setFinTotals({ receita: totalRec, despesa: totalDesp, lucro: totalRec - totalDesp, ticketMedio })

    // ── Clínico ─────────────────────────────────────────────────
    const procMap: Record<string, number> = {}
    for (const a of concluded) {
      const name = a.procedure_name || 'Não informado'
      procMap[name] = (procMap[name] ?? 0) + 1
    }
    setProcRank(Object.entries(procMap).sort(([, a], [, b]) => b - a).slice(0, 8).map(([name, count]) => ({ name, count })))

    const total = appts.length
    const canceled = appts.filter(a => a.status === 'cancelado' || a.status === 'faltou').length
    const returnPatients = new Set(appts.filter(a => a.status === 'concluido').map(a => (a as { patients?: { name: string } | { name: string }[] }).patients)).size
    setClinicStats({
      totalAppts: total,
      cancelRate: total > 0 ? Math.round((canceled / total) * 100) : 0,
      convRate: total > 0 ? Math.round((concluded.length / total) * 100) : 0,
      returnRate: pats.length > 0 ? Math.round((returnPatients / pats.length) * 100) : 0,
    })

    // ── Pacientes ────────────────────────────────────────────────
    const newMonth = pats.filter(p => p.created_at >= startOfMonth).length
    const withConsent = pats.filter(p => p.lgpd_consent).length
    setPatStats({ total: pats.length, newMonth, withConsent })

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
    setNewByMonth(Object.entries(newMap).map(([key, count]) => ({
      month: new Date(key + '-01').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('. de ', '/'),
      count,
    })))

    // ── Equipe ───────────────────────────────────────────────────
    const rows: ProfRow[] = profs.map(prof => {
      const mine = appts.filter((a: { professional_id?: string }) => a.professional_id === prof.id)
      const myConc = mine.filter(a => a.status === 'concluido').length
      const myCanceled = mine.filter(a => a.status === 'cancelado' || a.status === 'faltou').length
      const myRev = fins
        .filter(f => f.type === 'receita')
        .reduce((s, f) => s + Number(f.total_amount), 0)
      return {
        name: prof.name,
        concluded: myConc,
        revenue: myRev / (profs.length || 1),
        cancelRate: mine.length > 0 ? Math.round((myCanceled / mine.length) * 100) : 0,
      }
    }).sort((a, b) => b.concluded - a.concluded)
    setProfRows(rows)

    setLoading(false)
  }, [clinic?.id, period])

  useEffect(() => { load() }, [load])

  async function exportXLSX() {
    const XLSX = (await import('xlsx')).default

    let sheetData: (string | number)[][] = []
    let filename = 'relatorio.xlsx'
    let sheetName = 'Relatório'

    if (tab === 'financeiro') {
      sheetName = 'Financeiro'
      filename = `financeiro_${period}.xlsx`
      sheetData = [
        ['Mês', 'Receita (R$)', 'Despesa (R$)', 'Lucro (R$)'],
        ...monthly.map(m => [m.month, m.receita, m.despesa, m.lucro]),
        [],
        ['TOTAIS', finTotals.receita, finTotals.despesa, finTotals.lucro],
        ['Ticket Médio', finTotals.ticketMedio, '', ''],
      ]
    } else if (tab === 'clinico') {
      sheetName = 'Clínico'
      filename = `clinico_${period}.xlsx`
      sheetData = [
        ['Procedimento', 'Quantidade'],
        ...procRank.map(p => [p.name, p.count]),
        [],
        ['Taxa de Conversão', `${clinicStats.convRate}%`],
        ['Taxa de Cancelamento', `${clinicStats.cancelRate}%`],
        ['Taxa de Retorno', `${clinicStats.returnRate}%`],
      ]
    } else if (tab === 'pacientes') {
      sheetName = 'Pacientes'
      filename = `pacientes_${period}.xlsx`
      sheetData = [
        ['Mês', 'Novos Pacientes'],
        ...newByMonth.map(m => [m.month, m.count]),
        [],
        ['Total de Pacientes', patStats.total],
        ['Novos este mês', patStats.newMonth],
        ['Com Consentimento LGPD', `${patStats.withConsent}%`],
      ]
    } else if (tab === 'equipe') {
      sheetName = 'Equipe'
      filename = `equipe_${period}.xlsx`
      sheetData = [
        ['Profissional', 'Consultas Concluídas', 'Receita (R$)', 'Taxa de Cancelamento'],
        ...profRows.map(p => [p.name, p.concluded, p.revenue, `${p.cancelRate}%`]),
      ]
    }

    const ws = XLSX.utils.aoa_to_sheet(sheetData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    XLSX.writeFile(wb, filename)
  }

  const maxProc = useMemo(() => procRank[0]?.count ?? 1, [procRank])

  const TABS: { key: ReportTab; label: string }[] = [
    { key: 'financeiro', label: '💰 Financeiro' },
    { key: 'clinico',    label: '🩺 Clínico'    },
    { key: 'pacientes',  label: '👤 Pacientes'  },
    { key: 'equipe',     label: '👥 Equipe'     },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Relatórios</h1>
          <p className={styles.sub}>Análise completa de desempenho da clínica</p>
        </div>
        <div className={styles.headerActions}>
          <select className={styles.periodSelect} value={period} onChange={e => setPeriod(e.target.value)}>
            <option value="3m">Últimos 3 meses</option>
            <option value="6m">Últimos 6 meses</option>
            <option value="12m">Últimos 12 meses</option>
          </select>
          <button className={styles.btnExport} onClick={exportXLSX}>
            ↓ Exportar planilha
          </button>
        </div>
      </div>

      <div className={styles.tabs}>
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
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={monthly} barGap={4}>
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} width={52} />
                      <Tooltip formatter={(v: unknown) => typeof v === 'number' ? formatCurrency(v) : String(v ?? '')} />
                      <Bar dataKey="receita" fill="#10B981" radius={[4, 4, 0, 0]} name="Receita" />
                      <Bar dataKey="despesa" fill="#EF4444" radius={[4, 4, 0, 0]} name="Despesa" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className={styles.card}>
                <div className={styles.cardTitle}>Lucro líquido mensal</div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Mês</th><th>Receita</th><th>Despesa</th><th>Lucro</th><th>Margem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthly.map(m => (
                        <tr key={m.month}>
                          <td>{m.month}</td>
                          <td className={styles.kpiGreen}>{formatCurrency(m.receita)}</td>
                          <td className={styles.kpiRed}>{formatCurrency(m.despesa)}</td>
                          <td className={m.lucro >= 0 ? styles.kpiGreen : styles.kpiRed}>{formatCurrency(m.lucro)}</td>
                          <td>
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
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={newByMonth}>
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#0D9488" radius={[4, 4, 0, 0]} name="Novos pacientes" />
                    </BarChart>
                  </ResponsiveContainer>
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
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
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
                            <td><span className={styles.tagGreen}>{p.concluded}</span></td>
                            <td>
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
        </>
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
