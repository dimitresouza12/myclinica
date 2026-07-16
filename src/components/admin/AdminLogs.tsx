'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import type { AuditLog, Clinic } from '@/types'
import styles from './admin.module.css'

const ACTION_COLORS: Record<string, string> = {
  create: '#10B981',
  insert: '#10B981',
  update: '#0EA5E9',
  delete: '#EF4444',
  login:  '#A855F7',
  logout: '#6B7280',
}

function actionColor(action: string) {
  const lower = action.toLowerCase()
  for (const [key, color] of Object.entries(ACTION_COLORS)) {
    if (lower.includes(key)) return color
  }
  return '#6B7280'
}

interface LogWithClinic extends AuditLog {
  clinics?: { name: string } | null
}

export function AdminLogs({ clinics }: { clinics: Clinic[] }) {
  const [logs, setLogs] = useState<LogWithClinic[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [filterClinic, setFilterClinic] = useState('')
  const [filterModule, setFilterModule] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const PAGE_SIZE = 50

  useEffect(() => {
    setPage(0)
    setLogs([])
    loadLogs(0, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterClinic, filterModule, filterAction, filterFrom, filterTo])

  async function loadLogs(pageNum = page, reset = false) {
    setLoading(true)
    let q = supabase
      .from('audit_logs')
      .select('*, clinics(name)')
      .order('created_at', { ascending: false })
      .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1)

    if (filterClinic) q = q.eq('clinic_id', filterClinic)
    if (filterModule) q = q.ilike('module', `%${filterModule}%`)
    if (filterAction) q = q.ilike('action', `%${filterAction}%`)
    if (filterFrom) q = q.gte('created_at', filterFrom)
    if (filterTo) q = q.lte('created_at', filterTo + 'T23:59:59')

    const { data } = await q
    const rows = (data ?? []) as LogWithClinic[]
    setLogs((prev) => reset ? rows : [...prev, ...rows])
    setHasMore(rows.length === PAGE_SIZE)
    setLoading(false)
  }

  function loadMore() {
    const next = page + 1
    setPage(next)
    loadLogs(next)
  }

  const modules = [...new Set(logs.map((l) => l.module).filter(Boolean))]

  return (
    <div className={styles.logsWrap}>
      <div className={styles.logsFilters}>
        <select className={styles.selectFilter} value={filterClinic} onChange={(e) => setFilterClinic(e.target.value)}>
          <option value="">Todas as clínicas</option>
          {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className={styles.searchInput} placeholder="Filtrar módulo..." value={filterModule} onChange={(e) => setFilterModule(e.target.value)} />
        <input className={styles.searchInput} placeholder="Filtrar ação..." value={filterAction} onChange={(e) => setFilterAction(e.target.value)} />
        <input type="date" className={styles.selectFilter} value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
        <input type="date" className={styles.selectFilter} value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
        {(filterClinic || filterModule || filterAction || filterFrom || filterTo) && (
          <button className={styles.btnClear} onClick={() => { setFilterClinic(''); setFilterModule(''); setFilterAction(''); setFilterFrom(''); setFilterTo('') }}>
            Limpar
          </button>
        )}
      </div>

      <div className={`${styles.richTable} resp-table-wrap`}>
        <table className={`${styles.table} resp-table`}>
          <thead>
            <tr>
              <th>Data</th>
              <th>Clínica</th>
              <th>Módulo</th>
              <th>Ação</th>
              <th>IP</th>
              <th>Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && !loading ? (
              <tr><td colSpan={6} className={styles.empty}>Nenhum log encontrado.</td></tr>
            ) : logs.map((l) => {
              const color = actionColor(l.action)
              return (
                <tr key={l.id} className={styles.logRow}>
                  <td className={styles.dateCell}>{formatDate(l.created_at)}</td>
                  <td data-label="Clínica">{l.clinics?.name ?? <span className={styles.dimText}>—</span>}</td>
                  <td data-label="Módulo"><span className={styles.moduleChip}>{l.module}</span></td>
                  <td data-label="Ação">
                    <span className={styles.actionBadge} style={{ background: `${color}22`, color, borderColor: `${color}44` }}>
                      {l.action}
                    </span>
                  </td>
                  <td data-label="IP" className={styles.dimText}>{l.ip_address ?? '—'}</td>
                  <td data-label="Detalhes">
                    {l.details && Object.keys(l.details).length > 0 ? (
                      <details className={styles.detailsEl}>
                        <summary className={styles.detailsSummary}>Ver</summary>
                        <pre className={styles.detailsPre}>{JSON.stringify(l.details, null, 2)}</pre>
                      </details>
                    ) : <span className={styles.dimText}>—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {loading && <p className={styles.loading}>Carregando...</p>}
      {hasMore && !loading && (
        <button className={styles.btnLoadMore} onClick={loadMore}>Carregar mais</button>
      )}
    </div>
  )
}
