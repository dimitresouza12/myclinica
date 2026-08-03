'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatCurrency } from '@/lib/utils'
import { useScrollLock } from '@/hooks/useScrollLock'
import type { Procedure } from '@/types'
import { PROCEDURE_SUGGESTIONS } from '@/lib/procedureSuggestions'
import styles from './procedimentos.module.css'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { Portal } from '@/components/ui/Portal'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import { Icon } from '@/components/ui/Icon'

import type { ClinicType } from '@/types'

const CATEGORIAS_BY_TYPE: Record<ClinicType, string[]> = {
  odonto:   ['Consulta', 'Cirurgia', 'Exame', 'Estética', 'Ortodontia', 'Endodontia', 'Periodontia', 'Prótese', 'Radiologia', 'Outros'],
  medico:   ['Consulta', 'Exame', 'Cirurgia', 'Procedimento', 'Vacinação', 'Radiologia', 'Outros'],
  estetica: ['Consulta', 'Limpeza de Pele', 'Peeling', 'Botox', 'Preenchimento', 'Laser', 'Massagem', 'Corporal', 'Outros'],
  vet:      ['Consulta', 'Cirurgia', 'Vacinação', 'Exame', 'Banho & Tosa', 'Radiologia', 'Outros'],
  fisio:    ['Consulta', 'Avaliação', 'Eletroterapia', 'Massagem', 'Pilates', 'Hidroterapia', 'Outros'],
  psico:    ['Consulta', 'Avaliação Psicológica', 'Psicoterapia', 'Outros'],
  nutri:    ['Consulta', 'Avaliação Nutricional', 'Plano Alimentar', 'Outros'],
}

interface FormData { name: string; price: string; is_free: boolean; category: string; is_active: boolean }
const BLANK: FormData = { name: '', price: '', is_free: false, category: '', is_active: true }

function ProcedimentosContent() {
  const { clinic } = useAuthStore()
  const nameSuggestions = clinic ? (PROCEDURE_SUGGESTIONS[clinic.type] ?? []) : []
  const [procedures, setProcedures] = useState<Procedure[]>([])
  // Categorias sugeridas da especialidade + as que a clínica já usa de fato
  // (podem ter sido cadastradas fora da lista padrão) — sem isso, editar um
  // procedimento com categoria "avulsa" mostrava o campo em branco e podia
  // apagar a categoria real ao salvar sem querer.
  const categorias = clinic
    ? Array.from(new Set([
        ...(CATEGORIAS_BY_TYPE[clinic.type] ?? CATEGORIAS_BY_TYPE.odonto),
        ...procedures.map(p => p.category).filter((c): c is string => !!c),
      ]))
    : []
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(BLANK)
  const [saving, setSaving] = useState(false)
  const [addingSuggestions, setAddingSuggestions] = useState(false)

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
  }

  function openEdit(p: Procedure) {
    setEditingId(p.id)
    setForm({ name: p.name, price: String(p.price), is_free: p.is_free, category: p.category ?? '', is_active: p.is_active })
    setShowModal(true)
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

  async function handleAddSuggestions() {
    if (!clinic) return
    const existingNames = new Set(procedures.map(p => p.name.trim().toLowerCase()))
    const toAdd = nameSuggestions.filter(s => !existingNames.has(s.name.trim().toLowerCase()))
    if (toAdd.length === 0) {
      showToast('ok', 'Todos os procedimentos sugeridos já estão cadastrados.')
      return
    }
    setAddingSuggestions(true)
    await supabase.from('procedures').insert(
      toAdd.map(s => ({
        clinic_id: clinic.id,
        name: s.name,
        category: s.category,
        price: 0,
        is_free: false,
        is_active: true,
      }))
    )
    setAddingSuggestions(false)
    showToast('ok', `${toAdd.length} procedimento${toAdd.length > 1 ? 's' : ''} adicionado${toAdd.length > 1 ? 's' : ''}. Os preços ficam "A definir" até você editá-los.`)
    loadData()
  }

  const active = procedures.filter(p => p.is_active).length
  const pendingPrice = procedures.filter(p => p.is_active && p.price === 0 && !p.is_free).length

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
          {nameSuggestions.length > 0 && (
            <button className={styles.btnSecondary} onClick={handleAddSuggestions} disabled={addingSuggestions}>
              {addingSuggestions ? 'Adicionando...' : '+ Sugestões da especialidade'}
            </button>
          )}
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
                  onChange={(e) => {
                    const name = e.target.value
                    // Se o nome digitado/selecionado bate com uma sugestão e a
                    // categoria ainda não foi escolhida, preenche automaticamente.
                    const match = nameSuggestions.find(s => s.name === name)
                    setForm(p => ({ ...p, name, category: match && !p.category ? match.category : p.category }))
                  }}
                  placeholder="Ex: Limpeza, Extração, Clareamento..."
                  list="procedure-name-suggestions"
                  autoFocus
                />
                {nameSuggestions.length > 0 && (
                  <datalist id="procedure-name-suggestions">
                    {nameSuggestions.map(s => <option key={s.name} value={s.name} />)}
                  </datalist>
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
                    onChange={(e) => setForm(p => ({ ...p, category: e.target.value }))}
                    placeholder="Sem categoria"
                    list="procedure-category-suggestions"
                  />
                  {categorias.length > 0 && (
                    <datalist id="procedure-category-suggestions">
                      {categorias.map(c => <option key={c} value={c} />)}
                    </datalist>
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
