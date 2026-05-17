'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Patient } from '@/types'
import { Portal } from '@/components/ui/Portal'
import styles from './PatientFormModal.module.css'

interface Props {
  patient: Patient | null
  clinicId: string
  onClose: () => void
  onSaved: () => void
}

export function PatientFormModal({ patient, clinicId, onClose, onSaved }: Props) {
  const isNew = !patient
  const [form, setForm] = useState({
    name: '', phone: '', email: '', cpf: '', rg: '',
    birth_date: '', gender: '', address: '', occupation: '',
    emergency_contact: '', referred_by: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (patient) {
      setForm({
        name: patient.name ?? '',
        phone: patient.phone ?? '',
        email: patient.email ?? '',
        cpf: patient.cpf ?? '',
        rg: patient.rg ?? '',
        birth_date: patient.birth_date ?? '',
        gender: patient.gender ?? '',
        address: patient.address ?? '',
        occupation: patient.occupation ?? '',
        emergency_contact: patient.emergency_contact ?? '',
        referred_by: patient.referred_by ?? '',
        notes: patient.notes ?? '',
      })
    }
  }, [patient])

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    // Input validation
    if (!form.name.trim() || form.name.trim().length < 2) return setError('Nome deve ter pelo menos 2 caracteres.')
    if (form.name.length > 120) return setError('Nome muito longo (máx. 120 caracteres).')
    if (form.email && form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setError('E-mail inválido.')
    if (form.phone && form.phone.replace(/\D/g, '').length > 15) return setError('Telefone inválido.')
    if (form.cpf && form.cpf.replace(/\D/g, '').length > 11) return setError('CPF inválido (máx. 11 dígitos).')

    setSaving(true)
    try {
      const payload = { ...form, clinic_id: clinicId }
      if (isNew) {
        const { error: err } = await supabase.from('patients').insert([payload])
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('patients').update(payload).eq('id', patient!.id)
        if (err) throw err
      }
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!patient) return
    setError('')
    setDeleting(true)
    try {
      const { error: err } = await supabase.from('patients').update({ is_active: false }).eq('id', patient.id)
      if (err) throw err
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Portal>
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2>{isNew ? 'Novo Paciente' : 'Editar Paciente'}</h2>
          <button className={styles.btnClose} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <p className={styles.requiredNote}><span className={styles.requiredStar}>*</span> Campo obrigatório</p>
          <div className={styles.grid2}>
            <Field label="Nome" required value={form.name} onChange={(v) => set('name', v)} />
            <Field label="Telefone" value={form.phone} onChange={(v) => set('phone', v)} placeholder="(11) 99999-9999" />
            <Field label="E-mail" type="email" value={form.email} onChange={(v) => set('email', v)} />
            <Field label="CPF" value={form.cpf} onChange={(v) => set('cpf', v)} />
            <Field label="RG" value={form.rg} onChange={(v) => set('rg', v)} />
            <Field label="Data de Nascimento" type="date" value={form.birth_date} onChange={(v) => set('birth_date', v)} />
            <div className={styles.fieldGroup}>
              <label>Gênero</label>
              <select value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                <option value="">Selecionar</option>
                <option value="Masculino">Masculino</option>
                <option value="Feminino">Feminino</option>
                <option value="Outro">Outro</option>
              </select>
            </div>
            <Field label="Ocupação" value={form.occupation} onChange={(v) => set('occupation', v)} />
          </div>
          <Field label="Endereço" value={form.address} onChange={(v) => set('address', v)} />
          <Field label="Contato de Emergência" value={form.emergency_contact} onChange={(v) => set('emergency_contact', v)} />
          <Field label="Indicado por" value={form.referred_by} onChange={(v) => set('referred_by', v)} />
          <div className={styles.fieldGroup}>
            <label>Observações</label>
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          {!isNew && confirmDelete && (
            <div className={styles.confirmDelete}>
              <p>Excluir <strong>{form.name}</strong>? O paciente sairá das listas mas o histórico (prontuário e agendamentos) será preservado.</p>
              <div className={styles.confirmActions}>
                <button type="button" className={styles.btnCancel} onClick={() => setConfirmDelete(false)} disabled={deleting}>
                  Cancelar
                </button>
                <button type="button" className={styles.btnDanger} onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'Excluindo...' : 'Sim, excluir'}
                </button>
              </div>
            </div>
          )}

          <div className={styles.formFooter}>
            {!isNew && !confirmDelete && (
              <button type="button" className={styles.btnDangerOutline} onClick={() => setConfirmDelete(true)} disabled={saving}>
                Excluir
              </button>
            )}
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.btnSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
    </Portal>
  )
}

function Field({
  label, value, onChange, type = 'text', placeholder = '', required = false,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean
}) {
  return (
    <div className={styles.fieldGroup}>
      <label>
        {label}
        {required && <span className={styles.requiredStar}> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </div>
  )
}
