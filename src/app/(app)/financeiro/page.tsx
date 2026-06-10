'use client'
import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatDate, formatCurrency } from '@/lib/utils'
import { useScrollLock } from '@/hooks/useScrollLock'
import type { FinancialRecord, Patient } from '@/types'
import styles from './financeiro.module.css'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { usePermissions } from '@/hooks/usePermissions'
import { motion } from 'framer-motion'

// Recharts – dynamic import to avoid SSR issues
const Charts = dynamic(() => import('./FinanceiroCharts'), { ssr: false, loading: () => <div className={styles.chartLoading}>Carregando gráficos...</div> })

const CATEGORIAS_RECEITA = ['Consulta', 'Procedimento', 'Exame', 'Plano', 'Outros']
const CATEGORIAS_DESPESA = ['Material', 'Salário', 'Aluguel', 'Equipamento', 'Marketing', 'Outros']

interface NewRecord {
  type: 'receita' | 'despesa'
  patient_id: string
  total_amount: string
  payment_method: string
  category: string
  notes: string
}
const BLANK: NewRecord = { type: 'receita', patient_id: '', total_amount: '', payment_method: 'pix', category: '', notes: '' }

function FinanceiroContent() {
  const { clinic } = useAuthStore()
  const { isAdmin, canEdit, metadata } = usePermissions('financeiro')
  // Admin sempre vê totais; outros usuários dependem da permissão configurada (padrão: true)
  const showTotals = isAdmin || (metadata.show_totals !== false)
  const [records, setRecords] = useState<FinancialRecord[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState<'receita' | 'despesa'>('receita')
  const [editingId, setEditingId] = useState<string | null>(null)

  useScrollLock(showModal)
  const [form, setForm] = useState<NewRecord>(BLANK)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<'todos' | 'receita' | 'despesa'>('todos')
  const [filterPeriod, setFilterPeriod] = useState<'diario' | 'semanal' | 'mensal' | 'geral'>('mensal')
  const [filterMonth, setFilterMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportPreset, setExportPreset] = useState<'this_month'|'last_month'|'3m'|'6m'|'all'|'custom'>('this_month')
  const [exportStartMonth, setExportStartMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [exportEndMonth, setExportEndMonth] = useState(() => new Date().toISOString().slice(0, 7))

  useEffect(() => {
    if (!clinic?.id) return
    // Reset estado ao trocar de clínica
    setRecords([])
    setPatients([])
    setLoading(true)
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic?.id])

  async function loadData() {
    if (!clinic) return
    const [recRes, patRes] = await Promise.all([
      supabase.from('financial_records').select('*, patients(id, name)')
        .eq('clinic_id', clinic.id).order('created_at', { ascending: false }),
      supabase.from('patients').select('id, name').eq('clinic_id', clinic.id).eq('is_active', true).order('name'),
    ])
    setRecords((recRes.data ?? []) as FinancialRecord[])
    setPatients((patRes.data ?? []) as Patient[])
    setLoading(false)
  }

  const periodRecords = useMemo(() => {
    const now = new Date()
    if (filterPeriod === 'geral') return records
    if (filterPeriod === 'mensal') {
      const monthStr = filterMonth
      return records.filter(r => r.created_at?.startsWith(monthStr))
    }
    if (filterPeriod === 'semanal') {
      const startOfWeek = new Date(now)
      startOfWeek.setDate(now.getDate() - now.getDay())
      startOfWeek.setHours(0, 0, 0, 0)
      return records.filter(r => {
        const d = new Date(r.created_at)
        return d >= startOfWeek
      })
    }
    // diario
    const todayStr = now.toISOString().slice(0, 10)
    return records.filter(r => r.created_at?.startsWith(todayStr))
  }, [records, filterPeriod, filterMonth])

  const stats = useMemo(() => {
    const receitas = periodRecords.filter(r => r.type === 'receita').reduce((s, r) => s + (r.total_amount ?? 0), 0)
    const despesas = periodRecords.filter(r => r.type === 'despesa').reduce((s, r) => s + (r.total_amount ?? 0), 0)
    const saldo = receitas - despesas
    const total = receitas + despesas
    return {
      receitas,
      despesas,
      saldo,
      count: periodRecords.length,
      receitasPct: total > 0 ? Math.round(receitas / total * 100) : 0,
      despesasPct: total > 0 ? Math.round(despesas / total * 100) : 0,
      saldoPct:   receitas > 0 ? Math.min(Math.round(Math.abs(saldo) / receitas * 100), 100) : 0,
    }
  }, [periodRecords])

  // Build monthly data for last 6 months
  const monthlyData = useMemo(() => {
    const months: { month: string; receita: number; despesa: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
      const monthRecords = records.filter(r => r.created_at?.startsWith(key))
      months.push({
        month: label,
        receita: monthRecords.filter(r => r.type === 'receita').reduce((s, r) => s + (r.total_amount ?? 0), 0),
        despesa: monthRecords.filter(r => r.type === 'despesa').reduce((s, r) => s + (r.total_amount ?? 0), 0),
      })
    }
    return months
  }, [records])

  // Category breakdown for selected period
  const categoryData = useMemo(() => {
    const map: Record<string, number> = {}
    periodRecords.filter(r => r.type === 'receita').forEach(r => {
      const k = r.category ?? 'Outros'
      map[k] = (map[k] ?? 0) + (r.total_amount ?? 0)
    })
    return Object.entries(map).map(([name, value]) => ({ name, value }))
  }, [periodRecords])

  const filtered = periodRecords.filter(r => filterType === 'todos' || r.type === filterType)

  function openModal(type: 'receita' | 'despesa') {
    setModalType(type)
    setEditingId(null)
    setForm({ ...BLANK, type, category: type === 'receita' ? 'Consulta' : 'Material' })
    setShowModal(true)
  }

  function openEdit(record: FinancialRecord) {
    setModalType(record.type)
    setEditingId(record.id)
    setForm({
      type: record.type,
      patient_id: record.patient_id ?? '',
      total_amount: String(record.total_amount ?? ''),
      payment_method: record.payment_method ?? 'pix',
      category: record.category ?? '',
      notes: record.notes ?? '',
    })
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingId(null)
    setForm(BLANK)
  }

  async function handleSave() {
    if (!clinic) return
    setSaving(true)
    const payload = {
      clinic_id: clinic.id,
      patient_id: form.patient_id || null,
      total_amount: parseFloat(form.total_amount) || 0,
      payment_method: form.payment_method,
      category: form.category,
      notes: form.notes,
      type: form.type,
    }
    if (editingId) {
      await supabase.from('financial_records').update(payload).eq('id', editingId)
    } else {
      await supabase.from('financial_records').insert([payload])
    }
    setSaving(false)
    closeModal()
    loadData()
  }

  async function handleDelete(record: FinancialRecord) {
    if (!confirm(`Excluir este lançamento de ${formatCurrency(record.total_amount ?? 0)}? Esta ação não pode ser desfeita.`)) return
    setDeletingId(record.id)
    await supabase.from('financial_records').delete().eq('id', record.id)
    setDeletingId(null)
    loadData()
  }

  const categorias = form.type === 'receita' ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA

  const periodLabel =
    filterPeriod === 'diario' ? 'hoje' :
    filterPeriod === 'semanal' ? 'esta semana' :
    filterPeriod === 'mensal' ? 'do mês' :
    'geral'

  function getExportRecords() {
    const now = new Date()
    switch (exportPreset) {
      case 'this_month': {
        const key = now.toISOString().slice(0, 7)
        return records.filter(r => r.created_at?.startsWith(key))
      }
      case 'last_month': {
        const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        return records.filter(r => r.created_at?.startsWith(key))
      }
      case '3m': {
        const start = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 7)
        return records.filter(r => (r.created_at?.slice(0, 7) ?? '') >= start)
      }
      case '6m': {
        const start = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().slice(0, 7)
        return records.filter(r => (r.created_at?.slice(0, 7) ?? '') >= start)
      }
      case 'custom':
        return records.filter(r => {
          const m = r.created_at?.slice(0, 7) ?? ''
          return m >= exportStartMonth && m <= exportEndMonth
        })
      default:
        return records
    }
  }

  async function exportXLSX() {
    const { utils, writeFile } = await import('xlsx')
    const recordsToExport = getExportRecords()
    const now = new Date()
    const yyyy = now.getFullYear()
    const presetLabel: Record<string, string> = {
      this_month: now.toISOString().slice(0, 7),
      last_month: (() => { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` })(),
      '3m': 'ultimos-3m',
      '6m': 'ultimos-6m',
      all: `historico-${yyyy}`,
      custom: `${exportStartMonth}_${exportEndMonth}`,
    }
    const periodName = presetLabel[exportPreset] ?? exportPreset

    const data = [
      ['Tipo', 'Data', 'Paciente', 'Categoria', 'Descrição', 'Método de Pagamento', 'Valor (R$)'],
      ...recordsToExport.map(r => [
        r.type === 'receita' ? 'Receita' : 'Despesa',
        new Date(r.created_at).toLocaleDateString('pt-BR'),
        r.patients?.name ?? '',
        r.category ?? '',
        r.notes ?? '',
        r.payment_method ?? '',
        r.total_amount ?? 0,
      ]),
    ]

    const ws = utils.aoa_to_sheet(data)
    ws['!cols'] = [10, 12, 24, 16, 30, 20, 14].map(wch => ({ wch }))
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'Financeiro')
    writeFile(wb, `financeiro-${periodName}.xlsx`)
    setShowExportModal(false)
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Financeiro</h1>
          <p className={styles.sub}>{filtered.length} lançamentos — {
            filterPeriod === 'diario' ? 'hoje' :
            filterPeriod === 'semanal' ? 'esta semana' :
            filterPeriod === 'mensal' ? new Date(filterMonth + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) :
            'todos os períodos'
          }</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.btnExport} onClick={() => setShowExportModal(true)} disabled={records.length === 0} title="Exportar planilha Excel">
            ⬇ Exportar
          </button>
          {canEdit && <button className={styles.btnDespesa} onClick={() => openModal('despesa')}>− Despesa</button>}
          {canEdit && <button className={styles.btnReceita} onClick={() => openModal('receita')}>+ Receita</button>}
        </div>
      </div>

      {/* Metric cards — controlado pela permissão "Ver totais" */}
      {showTotals && (
        <div className={styles.cards}>
          {([
            {
              value: formatCurrency(stats.receitas),
              label: `Receitas ${periodLabel}`,
              pct: stats.receitasPct,
              iconBg: '#E8FBF7',
              iconColor: '#0B9B85',
              bar: 'linear-gradient(to right, #4DD9C0, #0B9B85)',
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" strokeLinecap="round" />
                </svg>
              ),
            },
            {
              value: formatCurrency(stats.despesas),
              label: `Despesas ${periodLabel}`,
              pct: stats.despesasPct,
              iconBg: '#FEF2F2',
              iconColor: '#DC2626',
              bar: 'linear-gradient(to right, #FCA5A5, #EF4444)',
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
                  <path d="M3 3h18M3 9h18M3 15h18M3 21h18" strokeLinecap="round" />
                </svg>
              ),
            },
            {
              value: formatCurrency(stats.saldo),
              label: `Saldo ${periodLabel}`,
              pct: stats.saldoPct,
              iconBg: stats.saldo >= 0 ? '#E8FBF7' : '#FFFBEB',
              iconColor: stats.saldo >= 0 ? '#0B9B85' : '#D97706',
              bar: stats.saldo >= 0
                ? 'linear-gradient(to right, #4DD9C0, #0B9B85)'
                : 'linear-gradient(to right, #FCD34D, #F59E0B)',
              valueColor: stats.saldo >= 0 ? '#059669' : '#DC2626',
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
                  <path d="M12 22V2M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" strokeLinecap="round" />
                </svg>
              ),
            },
            {
              value: String(stats.count),
              label: 'Lançamentos',
              pct: Math.min(stats.count * 5, 100),
              iconBg: '#EFF6FF',
              iconColor: '#2563EB',
              bar: 'linear-gradient(to right, #60A5FA, #2563EB)',
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" />
                </svg>
              ),
            },
          ] as const).map((m, i) => (
            <motion.div
              key={i}
              className={styles.card}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 90, damping: 18, delay: i * 0.08 }}
              whileHover={{ y: -4, transition: { type: 'spring', stiffness: 300, damping: 22 } }}
            >
              <div className={styles.cardIcon} style={{ background: m.iconBg, color: m.iconColor }}>
                {m.icon}
              </div>
              <div className={styles.cardBody}>
                <span className={styles.cardValue} style={'valueColor' in m ? { color: m.valueColor } : undefined}>
                  {m.value}
                </span>
                <span className={styles.cardLabel}>{m.label}</span>
                <div style={{ marginTop: 8, height: 3, background: 'var(--border-subtle)', borderRadius: 99, overflow: 'hidden' }}>
                  <motion.div
                    style={{ height: '100%', borderRadius: 99, background: m.bar }}
                    initial={{ width: '0%' }}
                    animate={{ width: `${m.pct}%` }}
                    transition={{ delay: 0.4 + i * 0.1, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Charts — controlado pela permissão "Ver totais" */}
      {!loading && showTotals && <Charts monthlyData={monthlyData} categoryData={categoryData} />}

      {/* Filters + Table */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.filterRow}>
            <div className={styles.filterTabs}>
              {(['todos', 'receita', 'despesa'] as const).map(t => (
                <button key={t} className={`${styles.filterTab} ${filterType === t ? styles.filterTabActive : ''}`} onClick={() => setFilterType(t)}>
                  {t === 'todos' ? 'Todos' : t === 'receita' ? '📈 Receitas' : '📉 Despesas'}
                </button>
              ))}
            </div>
            <div className={styles.periodTabs}>
              {(['diario', 'semanal', 'mensal', 'geral'] as const).map(p => (
                <button key={p} className={`${styles.periodTab} ${filterPeriod === p ? styles.periodTabActive : ''}`} onClick={() => setFilterPeriod(p)}>
                  {p === 'diario' ? 'Diário' : p === 'semanal' ? 'Semanal' : p === 'mensal' ? 'Mensal' : 'Geral'}
                </button>
              ))}
            </div>
          </div>
          {filterPeriod === 'mensal' && (
            <input
              type="month"
              value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)}
              className={styles.monthInput}
            />
          )}
        </div>
        {loading ? <p className={styles.loading}>Carregando...</p> : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Data</th>
                  <th>Paciente</th>
                  <th>Categoria</th>
                  <th>Descrição</th>
                  <th>Método</th>
                  <th>Valor</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className={styles.empty}>Nenhum lançamento encontrado.</td></tr>
                ) : filtered.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className={r.type === 'receita' ? styles.tagReceita : styles.tagDespesa}>
                        {r.type === 'receita' ? '↑ Receita' : '↓ Despesa'}
                      </span>
                    </td>
                    <td>{formatDate(r.created_at, true)}</td>
                    <td>{r.patients?.name ?? '—'}</td>
                    <td>{r.category ?? '—'}</td>
                    <td>{r.notes ?? '—'}</td>
                    <td className={styles.method}>{r.payment_method ?? '—'}</td>
                    <td className={r.type === 'receita' ? styles.valuePos : styles.valueNeg}>
                      {r.type === 'despesa' ? '−' : '+'}{formatCurrency(r.total_amount ?? 0)}
                    </td>
                    <td>
                      <div className={styles.rowActions}>
                        {canEdit && <button className={styles.btnEdit} onClick={() => openEdit(r)} title="Editar lançamento">
                          ✎
                        </button>}
                        {canEdit && <button
                          className={styles.btnDelete}
                          onClick={() => handleDelete(r)}
                          disabled={deletingId === r.id}
                          title="Excluir lançamento"
                        >
                          {deletingId === r.id ? '...' : '🗑'}
                        </button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Export period modal — portal garante position:fixed relativo ao viewport */}
      {showExportModal && typeof document !== 'undefined' && createPortal(
        <div className={styles.exportOverlay} onClick={() => setShowExportModal(false)}>
          <div className={styles.exportModal} onClick={e => e.stopPropagation()}>
            <div className={styles.exportModalHeader}>
              <h3>Exportar planilha</h3>
              <button className={styles.exportBtnClose} onClick={() => setShowExportModal(false)}>✕</button>
            </div>
            <div className={styles.exportModalBody}>
              <p style={{ fontSize: '.82rem', color: 'var(--text-secondary)', margin: 0 }}>Escolha o período para exportar:</p>
              <div className={styles.exportOptions}>
                {([
                  ['this_month', 'Este mês'],
                  ['last_month', 'Mês passado'],
                  ['3m', 'Últimos 3 meses'],
                  ['6m', 'Últimos 6 meses'],
                  ['all', 'Todo o histórico'],
                  ['custom', 'Personalizado'],
                ] as const).map(([value, label]) => (
                  <label key={value} className={`${styles.exportOption} ${exportPreset === value ? styles.exportOptionActive : ''}`}>
                    <input type="radio" name="exportPreset" value={value} checked={exportPreset === value} onChange={() => setExportPreset(value)} style={{ accentColor: '#4DD9C0' }} />
                    {label}
                  </label>
                ))}
              </div>
              {exportPreset === 'custom' && (
                <div className={styles.exportCustomFields}>
                  <div>
                    <label>De</label>
                    <input type="month" value={exportStartMonth} onChange={e => setExportStartMonth(e.target.value)} />
                  </div>
                  <div>
                    <label>Até</label>
                    <input type="month" value={exportEndMonth} onChange={e => setExportEndMonth(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
            <div className={styles.exportModalFooter}>
              <button className={styles.exportBtnCancel} onClick={() => setShowExportModal(false)}>Cancelar</button>
              <button className={styles.exportBtnConfirm} onClick={exportXLSX}>⬇ Exportar</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal */}
      {showModal && (
        <div className={styles.overlay} onClick={closeModal}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>
                {editingId
                  ? `${form.type === 'receita' ? '📈 Editar Receita' : '📉 Editar Despesa'}`
                  : `${form.type === 'receita' ? '📈 Nova Receita' : '📉 Nova Despesa'}`}
              </h2>
              <button className={styles.btnClose} onClick={closeModal}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.field}>
                <label>Valor (R$) *</label>
                <input type="number" step="0.01" min="0" value={form.total_amount}
                  onChange={e => setForm(p => ({ ...p, total_amount: e.target.value }))} placeholder="0,00" />
              </div>
              <div className={styles.field}>
                <label>Categoria</label>
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                  {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {form.type === 'receita' && (
                <div className={styles.field}>
                  <label>Paciente</label>
                  <select value={form.patient_id} onChange={e => setForm(p => ({ ...p, patient_id: e.target.value }))}>
                    <option value="">Sem paciente</option>
                    {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
              <div className={styles.field}>
                <label>Método de Pagamento</label>
                <select value={form.payment_method} onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))}>
                  <option value="pix">PIX</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="cartao_credito">Cartão de Crédito</option>
                  <option value="cartao_debito">Cartão de Débito</option>
                  <option value="convenio">Convênio</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <div className={styles.field}>
                <label>Descrição</label>
                <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Detalhe o lançamento..." />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnCancel} onClick={closeModal}>Cancelar</button>
              <button className={form.type === 'receita' ? styles.btnSaveReceita : styles.btnSaveDespesa}
                onClick={handleSave} disabled={saving || !form.total_amount}>
                {saving ? 'Salvando...' : (editingId ? 'Salvar alterações' : 'Salvar')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function FinanceiroPage() {
  return <PermissionGuard module="financeiro"><FinanceiroContent /></PermissionGuard>
}
