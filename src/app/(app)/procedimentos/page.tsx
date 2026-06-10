'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatCurrency } from '@/lib/utils'
import { useScrollLock } from '@/hooks/useScrollLock'
import type { Procedure } from '@/types'
import styles from './procedimentos.module.css'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { Portal } from '@/components/ui/Portal'

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

interface FormData { name: string; price: string; category: string; is_active: boolean }
const BLANK: FormData = { name: '', price: '', category: '', is_active: true }

function ProcedimentosContent() {
  const { clinic } = useAuthStore()
  const categorias = clinic ? (CATEGORIAS_BY_TYPE[clinic.type] ?? CATEGORIAS_BY_TYPE.odonto) : []
  const [procedures, setProcedures] = useState<Procedure[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(BLANK)
  const [saving, setSaving] = useState(false)

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
    setForm({ name: p.name, price: String(p.price), category: p.category ?? '', is_active: p.is_active })
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
      price: parseFloat(form.price) || 0,
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
    if (!confirm(`Excluir o procedimento "${p.name}"? Esta ação não pode ser desfeita.`)) return
    await supabase.from('procedures').delete().eq('id', p.id).eq('clinic_id', clinic!.id)
    loadData()
  }

  const active = procedures.filter(p => p.is_active).length

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Procedimentos</h1>
          <p className={styles.sub}>{procedures.length} procedimentos · {active} ativos</p>
        </div>
        <button className={styles.btnPrimary} onClick={openNew}>+ Novo Procedimento</button>
      </div>

      {loading ? (
        <p className={styles.loading}>Carregando...</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
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
                  <td>{p.category ?? '—'}</td>
                  <td className={styles.price}>{formatCurrency(p.price)}</td>
                  <td>
                    {p.is_active
                      ? <span className={styles.tagActive}>Ativo</span>
                      : <span className={styles.tagInactive}>Inativo</span>}
                  </td>
                  <td>
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
              <button className={styles.btnClose} onClick={closeModal}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.field}>
                <label>Nome *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Ex: Limpeza, Extração, Clareamento..."
                  autoFocus
                />
              </div>
              <div className={styles.row2}>
                <div className={styles.field}>
                  <label>Valor (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm(p => ({ ...p, price: e.target.value }))}
                    placeholder="0,00"
                  />
                </div>
                <div className={styles.field}>
                  <label>Categoria</label>
                  <select value={form.category} onChange={(e) => setForm(p => ({ ...p, category: e.target.value }))}>
                    <option value="">Sem categoria</option>
                    {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
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
