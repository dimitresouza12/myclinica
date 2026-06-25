'use client'
import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { StockItem, StockMovement } from '@/types'
import { Portal } from '@/components/ui/Portal'
import { useScrollLock } from '@/hooks/useScrollLock'
import { useEstoqueData } from '@/hooks/useClinicData'
import styles from './estoque.module.css'
import { PermissionGuard } from '@/components/ui/PermissionGuard'

const EstoqueChart = dynamic(() => import('./EstoqueChart'), { ssr: false, loading: () => null })

const CATEGORIES = ['material', 'medicamento', 'descartavel', 'equipamento', 'outro']
const UNITS = ['un', 'caixa', 'ml', 'L', 'kg', 'g', 'par', 'rolo']

const BLANK_ITEM = { name: '', category: 'material', unit: 'un', quantity: 0, min_quantity: 5, cost_price: '', supplier: '', notes: '' }
const BLANK_MOV = { quantity: '', reason: '', type: 'entrada' as 'entrada' | 'saida' | 'ajuste' }

type Tab = 'produtos' | 'movimentacoes'
type ModalMode = 'item' | 'entrada' | 'saida' | null

function EstoqueContent() {
  const { clinic, user } = useAuthStore()
  const queryClient = useQueryClient()
  const { data: estoqueData, isLoading: loading } = useEstoqueData(clinic?.id)
  const items = estoqueData?.items ?? []
  const movements = estoqueData?.movements ?? []
  const [tab, setTab] = useState<Tab>('produtos')
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterLow, setFilterLow] = useState(false)
  const [filterMovType, setFilterMovType] = useState('')

  const [modal, setModal] = useState<ModalMode>(null)
  const [editingItem, setEditingItem] = useState<StockItem | null>(null)
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null)
  const [itemForm, setItemForm] = useState(BLANK_ITEM)
  const [movForm, setMovForm] = useState(BLANK_MOV)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useScrollLock(modal !== null)

  function loadData() {
    queryClient.invalidateQueries({ queryKey: ['estoque', clinic?.id] })
  }

  const stats = useMemo(() => {
    const low = items.filter(i => i.quantity <= i.min_quantity).length
    const totalValue = items.reduce((s, i) => s + i.quantity * (i.cost_price ?? 0), 0)
    return { total: items.length, low, totalValue }
  }, [items])

  // Movimentos mensais (últimos 6 meses) para o gráfico
  const monthlyMovements = useMemo(() => {
    const now = new Date()
    const monthMap: Record<string, { month: string; entrada: number; saida: number }> = {}
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
      monthMap[key] = { month: label, entrada: 0, saida: 0 }
    }
    for (const m of movements) {
      const key = (m.created_at ?? '').slice(0, 7)
      if (!monthMap[key]) continue
      if (m.type === 'entrada') monthMap[key].entrada += Math.abs(m.quantity ?? 0)
      else if (m.type === 'saida') monthMap[key].saida += Math.abs(m.quantity ?? 0)
    }
    return Object.values(monthMap)
  }, [movements])

  const filteredItems = useMemo(() => {
    const term = search.toLowerCase()
    return items.filter(i => {
      const matchSearch = !term || i.name.toLowerCase().includes(term) || (i.supplier ?? '').toLowerCase().includes(term)
      const matchCat = !filterCategory || i.category === filterCategory
      const matchLow = !filterLow || i.quantity <= i.min_quantity
      return matchSearch && matchCat && matchLow
    })
  }, [items, search, filterCategory, filterLow])

  const filteredMovements = useMemo(() => {
    return movements.filter(m => !filterMovType || m.type === filterMovType)
  }, [movements, filterMovType])

  function openNewItem() {
    setEditingItem(null)
    setItemForm(BLANK_ITEM)
    setError('')
    setModal('item')
  }

  function openEditItem(item: StockItem) {
    setEditingItem(item)
    setItemForm({
      name: item.name,
      category: item.category ?? 'material',
      unit: item.unit,
      quantity: item.quantity,
      min_quantity: item.min_quantity,
      cost_price: item.cost_price != null ? String(item.cost_price) : '',
      supplier: item.supplier ?? '',
      notes: item.notes ?? '',
    })
    setError('')
    setModal('item')
  }

  function openMovModal(item: StockItem, type: 'entrada' | 'saida') {
    setSelectedItem(item)
    setMovForm({ quantity: '', reason: '', type })
    setError('')
    setModal(type)
  }

  function closeModal() {
    setModal(null)
    setEditingItem(null)
    setSelectedItem(null)
    setError('')
  }

  async function handleSaveItem() {
    if (!clinic || !itemForm.name.trim()) { setError('Nome é obrigatório.'); return }
    setSaving(true)
    setError('')
    const payload = {
      clinic_id: clinic.id,
      name: itemForm.name.trim(),
      category: itemForm.category || null,
      unit: itemForm.unit,
      quantity: Number(itemForm.quantity) || 0,
      min_quantity: Number(itemForm.min_quantity) || 0,
      cost_price: itemForm.cost_price ? parseFloat(itemForm.cost_price) : null,
      supplier: itemForm.supplier.trim() || null,
      notes: itemForm.notes.trim() || null,
    }
    if (editingItem) {
      await supabase.from('stock_items').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingItem.id)
    } else {
      await supabase.from('stock_items').insert([payload])
    }
    setSaving(false)
    closeModal()
    loadData()
  }

  async function handleSaveMovement() {
    if (!clinic || !selectedItem) return
    const qty = parseInt(movForm.quantity)
    if (!qty || qty <= 0) { setError('Quantidade deve ser maior que zero.'); return }
    if (modal === 'saida' && qty > selectedItem.quantity) {
      setError(`Estoque insuficiente. Disponível: ${selectedItem.quantity} ${selectedItem.unit}.`)
      return
    }
    setSaving(true)
    setError('')
    const newQty = modal === 'entrada' ? selectedItem.quantity + qty : selectedItem.quantity - qty
    await Promise.all([
      supabase.from('stock_items').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', selectedItem.id),
      supabase.from('stock_movements').insert([{
        clinic_id: clinic.id,
        item_id: selectedItem.id,
        type: modal,
        quantity: qty,
        reason: movForm.reason.trim() || null,
        user_name: user?.displayName ?? null,
      }]),
    ])
    setSaving(false)
    closeModal()
    loadData()
  }

  async function handleDelete(item: StockItem) {
    if (!confirm(`Desativar "${item.name}"? O histórico de movimentações será mantido.`)) return
    await supabase.from('stock_items').update({ is_active: false }).eq('id', item.id)
    loadData()
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Estoque de Produtos</h1>
          <p className={styles.sub}>{filteredItems.length} produto{filteredItems.length !== 1 ? 's' : ''}</p>
        </div>
        <button className={styles.btnPrimary} onClick={openNewItem}>+ Novo Produto</button>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div>
            <span className={styles.statVal}>{stats.total}</span>
            <span className={styles.statLabel}>Total de produtos</span>
          </div>
        </div>
        <div className={`${styles.statCard} ${stats.low > 0 ? styles.statCardWarn : ''}`}>
          <div>
            <span className={styles.statVal} style={{ color: stats.low > 0 ? '#F59E0B' : undefined }}>{stats.low}</span>
            <span className={styles.statLabel}>Estoque baixo</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div>
            <span className={styles.statVal} style={{ color: '#059669' }}>{formatCurrency(stats.totalValue)}</span>
            <span className={styles.statLabel}>Valor em estoque</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      {!loading && <EstoqueChart data={monthlyMovements} />}

      {/* Tabs */}
      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === 'produtos' ? styles.tabActive : ''}`} onClick={() => setTab('produtos')}>Produtos</button>
          <button className={`${styles.tab} ${tab === 'movimentacoes' ? styles.tabActive : ''}`} onClick={() => setTab('movimentacoes')}>Movimentações</button>
        </div>

        {tab === 'produtos' && (
          <div className={styles.filters}>
            <input className={styles.search} placeholder="Buscar produto ou fornecedor..." value={search} onChange={e => setSearch(e.target.value)} />
            <select className={styles.select} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
              <option value="">Todas as categorias</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={filterLow} onChange={e => setFilterLow(e.target.checked)} />
              Estoque baixo
            </label>
          </div>
        )}
        {tab === 'movimentacoes' && (
          <div className={styles.filters}>
            <select className={styles.select} value={filterMovType} onChange={e => setFilterMovType(e.target.value)}>
              <option value="">Todos os tipos</option>
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
              <option value="ajuste">Ajuste</option>
            </select>
          </div>
        )}
      </div>

      {loading ? <p className={styles.loading}>Carregando...</p> : (
        <>
          {tab === 'produtos' && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Categoria</th>
                    <th>Qtd Atual</th>
                    <th>Qtd Mín.</th>
                    <th>Unidade</th>
                    <th>Preço Custo</th>
                    <th>Fornecedor</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr><td colSpan={8} className={styles.empty}>Nenhum produto encontrado.</td></tr>
                  ) : filteredItems.map(item => {
                    const isLow = item.quantity <= item.min_quantity
                    return (
                      <tr key={item.id} className={isLow ? styles.rowLow : ''}>
                        <td className={styles.bold}>{item.name}{isLow && <span className={styles.lowBadge}>Baixo</span>}</td>
                        <td className={styles.capitalize}>{item.category ?? '—'}</td>
                        <td className={styles.bold} style={{ color: isLow ? '#F59E0B' : undefined }}>{item.quantity}</td>
                        <td>{item.min_quantity}</td>
                        <td>{item.unit}</td>
                        <td>{item.cost_price != null ? formatCurrency(item.cost_price) : '—'}</td>
                        <td>{item.supplier ?? '—'}</td>
                        <td>
                          <div className={styles.rowActions}>
                            <button className={styles.btnEntrada} onClick={() => openMovModal(item, 'entrada')} title="Registrar entrada">+ Entrada</button>
                            <button className={styles.btnSaida} onClick={() => openMovModal(item, 'saida')} title="Registrar saída">− Saída</button>
                            <button className={styles.btnEdit} onClick={() => openEditItem(item)} title="Editar">✎</button>
                            <button className={styles.btnDelete} onClick={() => handleDelete(item)} title="Desativar">🗑</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'movimentacoes' && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Produto</th>
                    <th>Tipo</th>
                    <th>Quantidade</th>
                    <th>Motivo</th>
                    <th>Responsável</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMovements.length === 0 ? (
                    <tr><td colSpan={6} className={styles.empty}>Nenhuma movimentação encontrada.</td></tr>
                  ) : filteredMovements.map(m => (
                    <tr key={m.id}>
                      <td>{formatDate(m.created_at, true)}</td>
                      <td className={styles.bold}>{m.stock_items?.name ?? '—'}</td>
                      <td>
                        <span className={m.type === 'entrada' ? styles.badgeEntrada : m.type === 'saida' ? styles.badgeSaida : styles.badgeAjuste}>
                          {m.type === 'entrada' ? '↑ Entrada' : m.type === 'saida' ? '↓ Saída' : '⇄ Ajuste'}
                        </span>
                      </td>
                      <td>{m.quantity} {m.stock_items?.unit ?? ''}</td>
                      <td>{m.reason ?? '—'}</td>
                      <td>{m.user_name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Modal Produto */}
      {modal === 'item' && (
        <Portal>
        <div className={styles.overlay} onClick={closeModal}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{editingItem ? '✎ Editar Produto' : '📦 Novo Produto'}</h2>
              <button className={styles.btnClose} onClick={closeModal}>✕</button>
            </div>
            <div className={styles.modalBody}>
              {error && <p className={styles.error}>{error}</p>}
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label>Nome *</label>
                  <input value={itemForm.name} onChange={e => setItemForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Luva de procedimento" />
                </div>
                <div className={styles.field}>
                  <label>Categoria</label>
                  <select value={itemForm.category} onChange={e => setItemForm(p => ({ ...p, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label>Qtd {!editingItem && 'Inicial'} *</label>
                  <input type="number" min="0" value={itemForm.quantity} onChange={e => setItemForm(p => ({ ...p, quantity: parseInt(e.target.value) || 0 }))} />
                </div>
                <div className={styles.field}>
                  <label>Qtd Mínima</label>
                  <input type="number" min="0" value={itemForm.min_quantity} onChange={e => setItemForm(p => ({ ...p, min_quantity: parseInt(e.target.value) || 0 }))} />
                </div>
                <div className={styles.field}>
                  <label>Unidade</label>
                  <select value={itemForm.unit} onChange={e => setItemForm(p => ({ ...p, unit: e.target.value }))}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label>Preço de Custo (R$)</label>
                  <input type="number" min="0" step="0.01" value={itemForm.cost_price} onChange={e => setItemForm(p => ({ ...p, cost_price: e.target.value }))} placeholder="0,00" />
                </div>
                <div className={styles.field}>
                  <label>Fornecedor</label>
                  <input value={itemForm.supplier} onChange={e => setItemForm(p => ({ ...p, supplier: e.target.value }))} placeholder="Nome do fornecedor" />
                </div>
              </div>
              <div className={styles.field}>
                <label>Observações</label>
                <input value={itemForm.notes} onChange={e => setItemForm(p => ({ ...p, notes: e.target.value }))} placeholder="Informações adicionais..." />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnCancel} onClick={closeModal}>Cancelar</button>
              <button className={styles.btnSave} onClick={handleSaveItem} disabled={saving || !itemForm.name.trim()}>
                {saving ? 'Salvando...' : editingItem ? 'Salvar alterações' : 'Cadastrar produto'}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* Modal Entrada / Saída */}
      {(modal === 'entrada' || modal === 'saida') && selectedItem && (
        <Portal>
        <div className={styles.overlay} onClick={closeModal}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{modal === 'entrada' ? '↑ Entrada de Estoque' : '↓ Saída de Estoque'}</h2>
              <button className={styles.btnClose} onClick={closeModal}>✕</button>
            </div>
            <div className={styles.modalBody}>
              {error && <p className={styles.error}>{error}</p>}
              <div className={styles.field}>
                <label>Produto</label>
                <input value={`${selectedItem.name} (${selectedItem.quantity} ${selectedItem.unit} em estoque)`} disabled />
              </div>
              <div className={styles.field}>
                <label>Quantidade *</label>
                <input type="number" min="1" value={movForm.quantity} onChange={e => setMovForm(p => ({ ...p, quantity: e.target.value }))} placeholder="0" autoFocus />
              </div>
              <div className={styles.field}>
                <label>Motivo</label>
                <select value={movForm.reason} onChange={e => setMovForm(p => ({ ...p, reason: e.target.value }))}>
                  <option value="">Selecione...</option>
                  {modal === 'entrada'
                    ? ['compra', 'devolução', 'ajuste', 'outro'].map(r => <option key={r} value={r}>{r}</option>)
                    : ['uso em procedimento', 'vencimento', 'perda', 'ajuste', 'outro'].map(r => <option key={r} value={r}>{r}</option>)
                  }
                </select>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnCancel} onClick={closeModal}>Cancelar</button>
              <button
                className={modal === 'entrada' ? styles.btnSaveEntrada : styles.btnSaveSaida}
                onClick={handleSaveMovement}
                disabled={saving || !movForm.quantity}
              >
                {saving ? 'Salvando...' : modal === 'entrada' ? 'Registrar entrada' : 'Registrar saída'}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </div>
  )
}

export default function EstoquePage() {
  return <PermissionGuard module="estoque"><EstoqueContent /></PermissionGuard>
}
