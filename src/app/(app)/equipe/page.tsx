'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatDate } from '@/lib/utils'
import { useScrollLock } from '@/hooks/useScrollLock'
import { getSpecialtyConfig } from '@/lib/specialtyConfig'
import type { Professional } from '@/types'
import styles from './equipe.module.css'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { Portal } from '@/components/ui/Portal'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { Icon } from '@/components/ui/Icon'

interface NewProf { name: string; specialty: string }
const BLANK: NewProf = { name: '', specialty: '' }

function EquipeContent() {
  const { clinic } = useAuthStore()
  const specialtySuggestions = getSpecialtyConfig(clinic?.type).professionalSpecialties
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<NewProf>(BLANK)
  const [saving, setSaving] = useState(false)
  const [showSpecialtySuggestions, setShowSpecialtySuggestions] = useState(false)

  const filteredSpecialtySuggestions = specialtySuggestions.filter(s =>
    s.toLowerCase().includes(form.specialty.trim().toLowerCase())
  )

  useScrollLock(showModal)

  useEffect(() => {
    if (!clinic?.id) return
    // Reset estado ao trocar de clínica
    setProfessionals([])
    setLoading(true)
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic?.id])

  async function loadData() {
    if (!clinic) return
    // supabase singleton
    const { data } = await supabase
      .from('professionals')
      .select('*')
      .eq('clinic_id', clinic.id)
      .order('name')
    setProfessionals((data ?? []) as Professional[])
    setLoading(false)
  }

  async function handleSave() {
    if (!clinic || !form.name) return
    setSaving(true)
    // supabase singleton
    await supabase.from('professionals').insert([{
      clinic_id: clinic.id,
      name: form.name,
      specialty: form.specialty || null,
    }])
    setSaving(false)
    setShowModal(false)
    setForm(BLANK)
    setShowSpecialtySuggestions(false)
    loadData()
  }

  async function handleDelete(id: string) {
    if (!(await confirmDialog({ message: 'Remover profissional?', confirmText: 'Remover', danger: true }))) return
    // supabase singleton
    await supabase.from('professionals').delete().eq('id', id).eq('clinic_id', clinic!.id)
    loadData()
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Equipe</h1>
          <p className={styles.sub}>{professionals.length} profissionais</p>
        </div>
        <button className={styles.btnPrimary} onClick={() => setShowModal(true)}>+ Novo Profissional</button>
      </div>

      {loading ? <p className={styles.loading}>Carregando...</p> : (
        <div className={`${styles.tableWrap} resp-table-wrap`}>
          <table className={`${styles.table} resp-table`}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Especialidade</th>
                <th>Cadastrado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {professionals.length === 0 ? (
                <tr><td colSpan={4} className={styles.empty}>Nenhum profissional cadastrado.</td></tr>
              ) : professionals.map((p) => (
                <tr key={p.id}>
                  <td className={styles.bold}>{p.name}</td>
                  <td data-label="Especialidade">{p.specialty ?? '-'}</td>
                  <td data-label="Cadastrado em">{formatDate(p.created_at, true)}</td>
                  <td data-label="Ações">
                    <button className={styles.btnDelete} onClick={() => handleDelete(p.id)}>Remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Portal>
        <div className={styles.overlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Novo Profissional</h2>
              <button className={styles.btnClose} onClick={() => setShowModal(false)}><Icon name="close" size={18} /></button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.field}>
                <label>Nome *</label>
                <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
              </div>
              <div className={styles.field}>
                <label>Especialidade</label>
                <input
                  value={form.specialty}
                  onChange={(e) => { setForm((p) => ({ ...p, specialty: e.target.value })); setShowSpecialtySuggestions(true) }}
                  onFocus={() => setShowSpecialtySuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSpecialtySuggestions(false), 150)}
                  placeholder="Ex: Ortodontia, Clínico Geral..."
                  autoComplete="off"
                />
                {showSpecialtySuggestions && filteredSpecialtySuggestions.length > 0 && (
                  <div className={styles.suggestionsDropdown}>
                    {filteredSpecialtySuggestions.map(s => (
                      <button
                        key={s}
                        type="button"
                        className={styles.suggestionItem}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setForm(p => ({ ...p, specialty: s })); setShowSpecialtySuggestions(false) }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnCancel} onClick={() => setShowModal(false)}>Cancelar</button>
              <button className={styles.btnSave} onClick={handleSave} disabled={saving || !form.name}>
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

export default function EquipePage() {
  return <PermissionGuard module="equipe"><EquipeContent /></PermissionGuard>
}
