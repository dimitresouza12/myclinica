'use client'
import { usePageSearch } from '@/store/pageSearch'
import { useState, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { StockItem, StockMovement } from '@/types'
import { Modal } from '@/components/ui/Modal'
import f from '@/components/ui/modalForm.module.css'
import { useEstoqueData } from '@/hooks/useClinicData'
import { mergeSpecialtyConfigs, stockCategoryLabel } from '@/lib/specialtyConfig'
import { audit } from '@/lib/audit'
import styles from './estoque.module.css'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { Icon } from '@/components/ui/Icon'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { IntegerInput, MoneyInput } from '@/components/ui/NumericInput'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { PillTabs } from '@/components/ui/PillTabs'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusDot } from '@/components/ui/StatusDot'
import { MoreMenu, type MoreMenuItem } from '@/components/ui/MoreMenu'
import btn from '@/components/ui/button.module.css'
import t from '@/components/ui/table.module.css'

const AreaTrendChart = dynamic(() => import('@/components/ui/AreaTrendChart').then(m => m.AreaTrendChart), { ssr: false, loading: () => <div className={styles.chartLoading} /> })

const UNITS = ['un', 'caixa', 'ml', 'L', 'kg', 'g', 'par', 'rolo']

const BLANK_MOV = { quantity: '', reason: '', type: 'entrada' as 'entrada' | 'saida' | 'ajuste' }

type Tab = 'produtos' | 'movimentacoes'
type ModalMode = 'item' | 'entrada' | 'saida' | null

function EstoqueContent() {
  const { clinic, user } = useAuthStore()
  // Clínica multi-área usa a união de categorias das áreas que ela já tem
  // (ex: material odonto + ração vet), não só a área principal do cadastro.
  const CATEGORIES = mergeSpecialtyConfigs(clinic?.specialties?.length ? clinic.specialties : [clinic?.type ?? 'odonto']).stockCategories
  const blankItem = { name: '', category: CATEGORIES[0], unit: 'un', quantity: 0, min_quantity: 5, cost_price: '', supplier: '', notes: '' }
  const queryClient = useQueryClient()
  const { data: estoqueData, isLoading: loading } = useEstoqueData(clinic?.id)
  const items = estoqueData?.items ?? []
  const movements = estoqueData?.movements ?? []
  const [tab, setTab] = useState<Tab>('produtos')
  const [search, setSearch] = usePageSearch()
  const [filterCategory, setFilterCategory] = useState('')
  const [filterLow, setFilterLow] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const [filterMovType, setFilterMovType] = useState('')

  const [modal, setModal] = useState<ModalMode>(null)
  const [editingItem, setEditingItem] = useState<StockItem | null>(null)
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null)
  const [itemForm, setItemForm] = useState(blankItem)
  const [movForm, setMovForm] = useState(BLANK_MOV)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
    setItemForm(blankItem)
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
    if (user) audit({ action: 'stock.movement', user_id: user.id, clinic_id: clinic.id, module: 'estoque', resource_id: selectedItem.id, details: { type: String(modal), quantity: qty } })
    setSaving(false)
    closeModal()
    loadData()
  }

  async function handleDelete(item: StockItem) {
    if (!(await confirmDialog({ message: `Desativar "${item.name}"? O histórico de movimentações será mantido.`, confirmText: 'Desativar', danger: true }))) return
    await supabase.from('stock_items').update({ is_active: false }).eq('id', item.id)
    loadData()
  }

  const trendData = monthlyMovements.map(m => ({ label: m.month, value: m.entrada, compare: m.saida }))
  const hasTrend = monthlyMovements.some(m => m.entrada > 0 || m.saida > 0)
  const lowCount = stats.low
  // os mais urgentes primeiro: zerados, depois os mais perto de acabar
  const lowItems = useMemo(() => items.filter(i => i.quantity <= i.min_quantity).sort((a, b) => a.quantity - b.quantity), [items])
  const lowHint = (() => {
    if (lowItems.length === 0) return 'nenhum produto em falta'
    const zeroed = lowItems.filter(i => i.quantity <= 0).length
    const running = lowItems.length - zeroed
    return [
      zeroed > 0 && `${zeroed} ${zeroed === 1 ? 'zerado' : 'zerados'}`,
      running > 0 && `${running} acabando`,
    ].filter(Boolean).join(', ')
  })()
  const lowTitle = lowItems.map(i => `${i.name}: ${i.quantity} ${i.unit} (mínimo ${i.min_quantity})`).join('\n')
  function showLowStock() {
    setTab('produtos')
    setFilterLow(true)
    // espera a lista filtrar para rolar até ela
    setTimeout(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }
  const monthKey = new Date().toISOString().slice(0, 7)
  const movementsThisMonth = movements.filter(m => (m.created_at ?? '').startsWith(monthKey)).length

  function itemMenu(item: StockItem): MoreMenuItem[] {
    return [
      { label: 'Registrar entrada', icon: 'plus', onClick: () => openMovModal(item, 'entrada') },
      { label: 'Registrar saída', icon: 'arrowUp', onClick: () => openMovModal(item, 'saida') },
      { label: 'Editar produto', icon: 'edit', onClick: () => openEditItem(item) },
      { label: 'Desativar', icon: 'trash', danger: true, onClick: () => handleDelete(item) },
    ]
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Estoque"
        subtitle={`${filteredItems.length} produto${filteredItems.length !== 1 ? 's' : ''}`}
        actions={<button type="button" className={btn.primary} onClick={openNewItem}><Icon name="plus" size={15} /> Novo produto</button>}
      />

      <div className={styles.stats}>
        <StatCard title="Total de produtos" value={stats.total} hint="ativos no cadastro" />
        <StatCard
          title="Estoque baixo"
          value={lowCount}
          hint={<span title={lowTitle}>{lowHint}</span>}
          delta={lowCount > 0 ? { label: 'Ver produtos', bad: true, onClick: showLowStock } : undefined}
        />
        <StatCard title="Valor em estoque" value={formatCurrency(stats.totalValue)} compact hint="quantidade x preço de custo" />
        <StatCard title="Movimentações no mês" value={movementsThisMonth} hint="entradas, saídas e ajustes" />
      </div>

      {!loading && (
        <Card title="Entradas e saídas" actions={<span className={styles.cardMeta}>últimos 6 meses, em unidades</span>}>
          {hasTrend ? (
            <AreaTrendChart
              data={trendData}
              highlightIndex={trendData.length - 1}
              valueName="Entradas"
              compareName="Saídas"
              formatValue={n => String(Math.round(n))}
              height={220}
              label="Entradas e saídas de estoque nos últimos 6 meses"
            />
          ) : (
            <p className={styles.chartEmpty}>Nenhuma movimentação nos últimos 6 meses.</p>
          )}
        </Card>
      )}

      <Card
        flush
        title="Estoque"
        actions={
          <PillTabs
            label="Visão do estoque"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'produtos', label: 'Produtos', count: items.length },
              { value: 'movimentacoes', label: 'Movimentações', count: movements.length },
            ]}
          />
        }
      >
        <div className={styles.filters} ref={listRef}>
          {tab === 'produtos' && (
            <>
              {/* no desktop a busca fica na barra de cima; este campo só aparece no celular */}
              <input type="search" className={`${styles.search} ${styles.localSearch}`} placeholder="Buscar produto ou fornecedor" aria-label="Buscar produto ou fornecedor" value={search} onChange={e => setSearch(e.target.value)} />
              <SelectMenu
                value={filterCategory}
                onChange={setFilterCategory}
                options={[{ value: '', label: 'Todas as categorias' }, ...CATEGORIES.map(c => ({ value: c, label: stockCategoryLabel(c) }))]}
              />
              <PillTabs
                label="Filtrar por nível"
                value={filterLow ? 'baixo' : 'todos'}
                onChange={v => setFilterLow(v === 'baixo')}
                options={[{ value: 'todos', label: 'Todos' }, { value: 'baixo', label: 'Estoque baixo', count: lowCount }]}
              />
            </>
          )}
          {tab === 'movimentacoes' && (
            <PillTabs
              label="Filtrar por tipo"
              value={(filterMovType || 'todos') as 'todos' | 'entrada' | 'saida' | 'ajuste'}
              onChange={v => setFilterMovType(v === 'todos' ? '' : v)}
              options={[
                { value: 'todos', label: 'Todos' },
                { value: 'entrada', label: 'Entrada' },
                { value: 'saida', label: 'Saída' },
                { value: 'ajuste', label: 'Ajuste' },
              ]}
            />
          )}
        </div>

        {loading ? <p className={styles.loading}>Carregando...</p> : (
          <>
            {tab === 'produtos' && (
              <div className={`${t.wrap} ${styles.wrap} resp-table-wrap`}>
                <table className={`${t.table} resp-table`}>
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Categoria</th>
                      <th className={t.num}>Quantidade</th>
                      <th className={t.num}>Mínimo</th>
                      <th className={t.num}>Preço de custo</th>
                      <th>Situação</th>
                      <th aria-label="Ações" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.length === 0 ? (
                      <tr><td colSpan={7} className={t.empty}>Nenhum produto encontrado.</td></tr>
                    ) : filteredItems.map(item => {
                      const isLow = item.quantity <= item.min_quantity
                      return (
                        <tr key={item.id} className={styles.row}>
                          <td>
                            <div className={styles.who}>
                              <span className={styles.name}>{item.name}</span>
                              {item.supplier && <span className={styles.sub}>{item.supplier}</span>}
                            </div>
                          </td>
                          <td data-label="Categoria" className={t.muted}>{item.category ? stockCategoryLabel(item.category) : '-'}</td>
                          <td data-label="Quantidade" className={`${t.num} ${styles.qty}`}>{item.quantity} {item.unit}</td>
                          <td data-label="Mínimo" className={`${t.num} ${t.muted}`}>{item.min_quantity}</td>
                          <td data-label="Preço de custo" className={`${t.num} ${t.muted}`}>{item.cost_price != null ? formatCurrency(item.cost_price) : '-'}</td>
                          <td data-label="Situação"><StatusDot tone={isLow ? 'warn' : 'ok'}>{isLow ? 'Estoque baixo' : 'Em dia'}</StatusDot></td>
                          <td className={styles.actionsCell}>
                            <div className={t.rowActions}>
                              <span className={`${t.hoverOnly} ${styles.shortcuts}`}>
                                <button type="button" className={styles.shortcut} onClick={() => openMovModal(item, 'entrada')}>Entrada</button>
                                <button type="button" className={styles.shortcut} onClick={() => openMovModal(item, 'saida')}>Saída</button>
                              </span>
                              <MoreMenu label={`Mais ações de ${item.name}`} items={itemMenu(item)} />
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
              <div className={`${t.wrap} ${styles.wrap} resp-table-wrap`}>
                <table className={`${t.table} resp-table`}>
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Data</th>
                      <th>Tipo</th>
                      <th className={t.num}>Quantidade</th>
                      <th>Motivo</th>
                      <th>Responsável</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMovements.length === 0 ? (
                      <tr><td colSpan={6} className={t.empty}>Nenhuma movimentação encontrada.</td></tr>
                    ) : filteredMovements.map(m => (
                      <tr key={m.id}>
                        <td className={t.strong}>{m.stock_items?.name ?? '-'}</td>
                        <td data-label="Data" className={t.muted}>{formatDate(m.created_at, true)}</td>
                        <td data-label="Tipo">
                          <StatusDot tone={m.type === 'entrada' ? 'ok' : m.type === 'saida' ? 'warn' : 'idle'}>
                            {m.type === 'entrada' ? 'Entrada' : m.type === 'saida' ? 'Saída' : 'Ajuste'}
                          </StatusDot>
                        </td>
                        <td data-label="Quantidade" className={t.num}>{m.quantity} {m.stock_items?.unit ?? ''}</td>
                        <td data-label="Motivo" className={`${t.muted} ${styles.capitalize}`}>{m.reason ?? '-'}</td>
                        <td data-label="Responsável" className={t.muted}>{m.user_name ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Modal Produto */}
      <Modal
        open={modal === 'item'}
        onClose={closeModal}
        title={editingItem ? 'Editar Produto' : 'Novo Produto'}
        footer={
          <>
            <button type="button" className={btn.secondary} onClick={closeModal}>Cancelar</button>
            <button type="button" className={btn.primary} onClick={handleSaveItem} disabled={saving || !itemForm.name.trim()}>
              {saving ? 'Salvando...' : editingItem ? 'Salvar alterações' : 'Cadastrar produto'}
            </button>
          </>
        }
      >
        {error && <p className={f.error}>{error}</p>}
        <div className={f.row2}>
          <div className={f.field}>
            <label>Nome *</label>
            <input value={itemForm.name} onChange={e => setItemForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Luva de procedimento" />
          </div>
          <div className={f.field}>
            <label>Categoria</label>
            <SelectMenu variant="field" ariaLabel="Categoria" value={itemForm.category}
              onChange={v => setItemForm(p => ({ ...p, category: v }))}
              options={CATEGORIES.map(c => ({ value: c, label: stockCategoryLabel(c) }))} />
          </div>
        </div>
        <div className={f.row2}>
          <div className={f.field}>
            <label>Qtd {!editingItem && 'Inicial'} *</label>
            <IntegerInput value={itemForm.quantity} max={999999} onChange={v => setItemForm(p => ({ ...p, quantity: v === '' ? 0 : Number(v) }))} />
          </div>
          <div className={f.field}>
            <label>Qtd Mínima</label>
            <IntegerInput value={itemForm.min_quantity} max={999999} onChange={v => setItemForm(p => ({ ...p, min_quantity: v === '' ? 0 : Number(v) }))} />
          </div>
          <div className={f.field}>
            <label>Unidade</label>
            <SelectMenu variant="field" ariaLabel="Unidade" value={itemForm.unit}
              onChange={v => setItemForm(p => ({ ...p, unit: v }))}
              options={UNITS.map(u => ({ value: u, label: u }))} />
          </div>
        </div>
        <div className={f.row2}>
          <div className={f.field}>
            <label>Preço de Custo (R$)</label>
            <MoneyInput value={itemForm.cost_price} onChange={v => setItemForm(p => ({ ...p, cost_price: v }))} />
          </div>
          <div className={f.field}>
            <label>Fornecedor</label>
            <input value={itemForm.supplier} onChange={e => setItemForm(p => ({ ...p, supplier: e.target.value }))} placeholder="Nome do fornecedor" />
          </div>
        </div>
        <div className={f.field}>
          <label>Observações</label>
          <input value={itemForm.notes} onChange={e => setItemForm(p => ({ ...p, notes: e.target.value }))} placeholder="Informações adicionais..." />
        </div>
      </Modal>

      {/* Modal Entrada / Saída */}
      <Modal
        open={(modal === 'entrada' || modal === 'saida') && !!selectedItem}
        onClose={closeModal}
        size="sm"
        title={modal === 'entrada' ? 'Entrada de Estoque' : 'Saída de Estoque'}
        subtitle={selectedItem ? `${selectedItem.name} · ${selectedItem.quantity} ${selectedItem.unit} em estoque` : undefined}
        footer={
          <>
            <button type="button" className={btn.secondary} onClick={closeModal}>Cancelar</button>
            <button type="button" className={btn.primary} onClick={handleSaveMovement} disabled={saving || !movForm.quantity}>
              {saving ? 'Salvando...' : modal === 'entrada' ? 'Registrar entrada' : 'Registrar saída'}
            </button>
          </>
        }
      >
        {error && <p className={f.error}>{error}</p>}
        <div className={f.field}>
          <label>Quantidade *</label>
          <IntegerInput min={1} max={999999} value={movForm.quantity} onChange={v => setMovForm(p => ({ ...p, quantity: v }))} placeholder="0" autoFocus />
        </div>
        <div className={f.field}>
          <label>Motivo</label>
          <SelectMenu variant="field" ariaLabel="Motivo" value={movForm.reason}
            onChange={v => setMovForm(p => ({ ...p, reason: v }))}
            options={[
              { value: '', label: 'Selecione...' },
              ...(modal === 'entrada'
                ? ['compra', 'devolução', 'ajuste', 'outro']
                : ['uso em procedimento', 'vencimento', 'perda', 'ajuste', 'outro']
              ).map(r => ({ value: r, label: r })),
            ]} />
        </div>
      </Modal>
    </div>
  )
}

export default function EstoquePage() {
  return <PermissionGuard module="estoque"><EstoqueContent /></PermissionGuard>
}
