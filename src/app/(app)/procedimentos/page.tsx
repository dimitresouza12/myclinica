'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatCurrency } from '@/lib/utils'
import { useScrollLock } from '@/hooks/useScrollLock'
import type { Procedure } from '@/types'
import { getSpecialtyConfig } from '@/lib/specialtyConfig'
import styles from './procedimentos.module.css'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { Portal } from '@/components/ui/Portal'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { Icon } from '@/components/ui/Icon'

interface FormData { name: string; price: string; is_free: boolean; category: string; is_active: boolean }
const BLANK: FormData = { name: '', price: '', is_free: false, category: '', is_active: true }

function ProcedimentosContent() {
  const { clinic } = useAuthStore()
  // Clínica multi-área soma as sugestões de todas as áreas que ela já tem
  // (clinic.specialties), não só a área principal do cadastro.
  const clinicSpecialties = clinic?.specialties?.length ? clinic.specialties : (clinic ? [clinic.type] : [])
  const nameSuggestions = clinicSpecialties.flatMap(t => getSpecialtyConfig(t).procedureSuggestions)
  const [procedures, setProcedures] = useState<Procedure[]>([])
  // Categorias sugeridas da especialidade + as que a clínica já usa de fato
  // (podem ter sido cadastradas fora da lista padrão) — sem isso, editar um
  // procedimento com categoria "avulsa" mostrava o campo em branco e podia
  // apagar a categoria real ao salvar sem querer.
  const categorias = clinic
    ? Array.from(new Set([
        ...clinicSpecialties.flatMap(t => getSpecialtyConfig(t).procedureCategories),
        ...procedures.map(p => p.category).filter((c): c is string => !!c),
      ]))
    : []
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(BLANK)
  const [saving, setSaving] = useState(false)
  const [showNameSuggestions, setShowNameSuggestions] = useState(false)
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false)

  useScrollLock(showModal)

  useEffect(() => {
    if (!clinic?.id) return
    setProcedures([])
    setLoading(true)
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic?.id])

  async function loadData() {
    if (!clinic) return
    const { data } = await supabase
      .from('procedures')
      .select('*')
      .eq('clinic_id', clinic.id)
      .order('name')
    setProcedures((data ?? []) as Procedure[])
    setLoading(false)
  }

  function openNew() {
    setEditingId(null)
    setForm(BLANK)
    setShowModal(true)
    setShowNameSuggestions(false)
    setShowCategorySuggestions(false)
  }

  function openEdit(p: Procedure) {
    setEditingId(p.id)
    setForm({ name: p.name, price: String(p.price), is_free: p.is_free, category: p.category ?? '', is_active: p.is_active })
    setShowModal(true)
    setShowNameSuggestions(false)
    setShowCategorySuggestions(false)
  }

  function closeModal() {
    setShowModal(false)
    setEditingId(null)
    setForm(BLANK)
  }

  async function handleSave() {
    if (!clinic || !form.name) return
    setSaving(true)
    const payload = {
      clinic_id: clinic.id,
      name: form.name.trim(),
      // Gratuito força o preço a zero — evita um valor "esquecido" no campo
      // caso a pessoa marque o checkbox depois de já ter digitado algo.
      price: form.is_free ? 0 : (parseFloat(form.price) || 0),
      is_free: form.is_free,
      category: form.category || null,
      is_active: form.is_active,
    }
    if (editingId) {
      await supabase.from('procedures').update(payload).eq('id', editingId)
    } else {
      await supabase.from('procedures').insert([payload])
    }
    setSaving(false)
    closeModal()
    loadData()
  }

  async function handleDelete(p: Procedure) {
    if (!(await confirmDialog({ message: `Excluir o procedimento "${p.name}"? Esta ação não pode ser desfeita.`, confirmText: 'Excluir', danger: true }))) return
    await supabase.from('procedures').delete().eq('id', p.id).eq('clinic_id', clinic!.id)
    loadData()
  }

  const active = procedures.filter(p => p.is_active).length
  const pendingPrice = procedures.filter(p => p.is_active && p.price === 0 && !p.is_free).length

  const filteredNameSuggestions = nameSuggestions.filter(s =>
    s.name.toLowerCase().includes(form.name.trim().toLowerCase())
  )
  const filteredCategorySuggestions = categorias.filter(c =>
    c.toLowerCase().includes(form.category.trim().toLowerCase())
  )

  function selectNameSuggestion(s: { name: string; category: string }) {
    setForm(p => ({ ...p, name: s.name, category: p.category || s.category }))
    setShowNameSuggestions(false)
  }

  function selectCategorySuggestion(c: string) {
    setForm(p => ({ ...p, category: c }))
    setShowCategorySuggestions(false)
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Procedimentos</h1>
          <p className={styles.sub}>
            {procedures.length} procedimentos · {active} ativos
            {pendingPrice > 0 && <> · <span className={styles.warnText}>{pendingPrice} sem preço definido</span></>}
          </p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.btnPrimary} onClick={openNew}>+ Novo Procedimento</button>
        </div>
      </div>

      {loading ? (
        <p className={styles.loading}>Carregando...</p>
      ) : (
        <div className={`${styles.tableWrap} resp-table-wrap`}>
          <table className={`${styles.table} resp-table`}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Categoria</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {procedures.length === 0 ? (
                <tr><td colSpan={5} className={styles.empty}>Nenhum procedimento cadastrado. Clique em "+ Novo Procedimento" para começar.</td></tr>
              ) : procedures.map((p) => (
                <tr key={p.id}>
                  <td className={styles.bold}>{p.name}</td>
                  <td data-label="Categoria">{p.category ?? '—'}</td>
                  <td data-label="Valor">
                    {p.price > 0
                      ? <span className={styles.price}>{formatCurrency(p.price)}</span>
                      : p.is_free
                        ? <span className={styles.tagFree}>Gratuito</span>
                        : <span className={styles.tagInactive}>A definir</span>}
                  </td>
                  <td data-label="Status">
                    {p.is_active
                      ? <span className={styles.tagActive}>Ativo</span>
                      : <span className={styles.tagInactive}>Inativo</span>}
                  </td>
                  <td data-label="Ações">
                    <div className={styles.actions}>
                      <button className={styles.btnEdit} onClick={() => openEdit(p)}>Editar</button>
                      <button className={styles.btnDelete} onClick={() => handleDelete(p)}>Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Portal>
        <div className={styles.overlay} onClick={closeModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{editingId ? 'Editar Procedimento' : 'Novo Procedimento'}</h2>
              <button className={styles.btnClose} onClick={closeModal}><Icon name="close" size={18} /></button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.field}>
                <label>Nome *</label>
                <input
                  value={form.name}
                  onChange={(e) => { setForm(p => ({ ...p, name: e.target.value })); setShowNameSuggestions(true) }}
                  onFocus={() => setShowNameSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowNameSuggestions(false), 150)}
                  placeholder="Ex: Limpeza, Extração, Clareamento..."
                  autoComplete="off"
                  autoFocus
                />
                {showNameSuggestions && filteredNameSuggestions.length > 0 && (
                  <div className={styles.suggestionsDropdown}>
                    {filteredNameSuggestions.map(s => (
                      <button
                        key={s.name}
                        type="button"
                        className={styles.suggestionItem}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectNameSuggestion(s)}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className={styles.row2}>
                <div className={styles.field}>
                  <label>Valor (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.is_free ? '0' : form.price}
                    onChange={(e) => setForm(p => ({ ...p, price: e.target.value }))}
                    placeholder="0,00"
                    disabled={form.is_free}
                  />
                </div>
                <div className={styles.field}>
                  <label>Categoria</label>
                  <input
                    value={form.category}
                    onChange={(e) => { setForm(p => ({ ...p, category: e.target.value })); setShowCategorySuggestions(true) }}
                    onFocus={() => setShowCategorySuggestions(true)}
                    onBlur={() => setTimeout(() => setShowCategorySuggestions(false), 150)}
                    placeholder="Sem categoria"
                    autoComplete="off"
                  />
                  {showCategorySuggestions && filteredCategorySuggestions.length > 0 && (
                    <div className={styles.suggestionsDropdown}>
                      {filteredCategorySuggestions.map(c => (
                        <button
                          key={c}
                          type="button"
                          className={styles.suggestionItem}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectCategorySuggestion(c)}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className={styles.toggleRow}>
                <span className={styles.toggleLabel}>Procedimento gratuito (ex: avaliação)</span>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={form.is_free}
                    onChange={(e) => setForm(p => ({ ...p, is_free: e.target.checked }))}
                  />
                  <span className={styles.toggleSlider} />
                </label>
              </div>
              <div className={styles.toggleRow}>
                <span className={styles.toggleLabel}>Procedimento ativo</span>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm(p => ({ ...p, is_active: e.target.checked }))}
                  />
                  <span className={styles.toggleSlider} />
                </label>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnCancel} onClick={closeModal}>Cancelar</button>
              <button className={styles.btnSave} onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </div>
  )
}

export default function ProcedimentosPage() {
  return <PermissionGuard module="procedimentos"><ProcedimentosContent /></PermissionGuard>
}
