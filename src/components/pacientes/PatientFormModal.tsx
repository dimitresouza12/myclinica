'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { audit } from '@/lib/audit'
import { sanitizeString, sanitizeEmail } from '@/lib/sanitize'
import { phoneInputError, previousPhoneNote, toInputValue } from '@/lib/phoneFormat'
import { PhoneInput } from '@/components/ui/PhoneInput'
import { CpfInput, DateInput } from '@/components/ui/NumericInput'
import { cpfInputError, cpfToInputValue, previousCpfNote, dateBRToISO, dateInputError, isoToDateBR } from '@/lib/numericFormat'
import { COMMON_CONVENIOS } from '@/lib/convenios'
import type { Patient } from '@/types'
import { Modal } from '@/components/ui/Modal'
import f from '@/components/ui/modalForm.module.css'
import btn from '@/components/ui/button.module.css'
import styles from './PatientFormModal.module.css'
import { Icon } from '@/components/ui/Icon'
import { SelectMenu } from '@/components/ui/SelectMenu'

interface Props {
  patient: Patient | null
  clinicId: string
  onClose: () => void
  onSaved: () => void
  /** cadastro novo já com nome e telefone preenchidos (ex.: vindo de uma conversa do WhatsApp) */
  initial?: { name?: string; phone?: string }
}

export function PatientFormModal({ patient, clinicId, onClose, onSaved, initial }: Props) {
  const isNew = !patient
  const { user } = useAuthStore()
  const [form, setForm] = useState({
    name: initial?.name ?? '', phone: initial?.phone ?? '', email: '', cpf: '', rg: '',
    birth_date: '', gender: '', address: '', occupation: '',
    emergency_contact: '', referred_by: '', notes: '',
    convenio: '', convenio_carteirinha: '',
  })
  const [showConvenioSuggestions, setShowConvenioSuggestions] = useState(false)
  const [lgpdConsent, setLgpdConsent] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const errorRef = useRef<HTMLParagraphElement>(null)

  const filteredConvenioSuggestions = COMMON_CONVENIOS.filter(c =>
    c.toLowerCase().includes(form.convenio.trim().toLowerCase())
  )

  useEffect(() => {
    if (patient) {
      setForm({
        name: patient.name ?? '',
        phone: toInputValue(patient.phone),
        email: patient.email ?? '',
        cpf: cpfToInputValue(patient.cpf),
        rg: patient.rg ?? '',
        birth_date: isoToDateBR(patient.birth_date),
        gender: patient.gender ?? '',
        address: patient.address ?? '',
        occupation: patient.occupation ?? '',
        emergency_contact: patient.emergency_contact ?? '',
        referred_by: patient.referred_by ?? '',
        notes: patient.notes ?? '',
        convenio: patient.convenio ?? '',
        convenio_carteirinha: patient.convenio_carteirinha ?? '',
      })
      // quem já tem dados na seção recolhida a vê aberta
      setMoreOpen(!!(patient.occupation || patient.referred_by || patient.convenio || patient.notes))
    }
  }, [patient])

  // o erro aparece no fim do formulário: leva a vista até ele
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [error])

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    // Validação server-side com sanitização
    const name = sanitizeString(form.name)
    const email = form.email ? sanitizeEmail(form.email) : ''

    if (!name || name.length < 2) return setError('Nome deve ter pelo menos 2 caracteres.')
    if (name.length > 120) return setError('Nome muito longo (máx. 120 caracteres).')
    if (form.email && !email) return setError('E-mail inválido.')
    const phoneError = phoneInputError(form.phone)
    if (phoneError) return setError(phoneError)
    const cpfError = cpfInputError(form.cpf)
    if (cpfError) return setError(cpfError)
    const birthError = dateInputError(form.birth_date)
    if (birthError) return setError(birthError)
    if (isNew && !lgpdConsent) return setError('O consentimento LGPD é obrigatório para cadastrar o paciente.')

    setSaving(true)
    try {
      const now = new Date().toISOString()
      const clean = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v])
      )
      // telefone antigo que o campo não consegue mostrar (ex.: sem DDD) e que a pessoa não preencheu de novo: mantém, não apaga
      const keepOldPhone = !form.phone && !!patient?.phone?.trim() && toInputValue(patient.phone) === ''
      // idem para um CPF antigo que o campo não mostra (incompleto): mantém, não apaga
      const keepOldCpf = !form.cpf && !!patient?.cpf?.trim() && cpfToInputValue(patient.cpf) === ''
      const payload = {
        ...clean,
        ...(keepOldPhone && { phone: patient!.phone }),
        ...(keepOldCpf && { cpf: patient!.cpf }),
        // data de nascimento: digitada como DD/MM/AAAA; sem mexer, mantém o valor guardado (mesmo fora de 1900–2099)
        birth_date: form.birth_date === isoToDateBR(patient?.birth_date) ? (patient?.birth_date ?? null) : dateBRToISO(form.birth_date),
        clinic_id: clinicId,
        ...(isNew && {
          lgpd_consent: true,
          lgpd_consent_at: now,
        }),
      }

      if (isNew) {
        const { error: err } = await supabase.from('patients').insert([payload])
        if (err) throw err
        if (user?.id) {
          await audit({ action: 'patient.create', user_id: user.id, clinic_id: clinicId, module: 'pacientes' })
        }
      } else {
        const { error: err } = await supabase.from('patients').update(payload).eq('id', patient!.id)
        if (err) throw err
        if (user?.id) {
          await audit({ action: 'patient.update', user_id: user.id, clinic_id: clinicId, module: 'pacientes', resource_id: patient!.id })
        }
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
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={isNew ? 'Novo paciente' : 'Editar paciente'}
      subtitle={!isNew && form.name.trim() ? form.name.trim() : undefined}
      footer={
        <>
          {!isNew && !confirmDelete && (
            <button type="button" className={styles.btnDelete} onClick={() => setConfirmDelete(true)} disabled={saving}>
              Excluir
            </button>
          )}
          <button type="button" className={btn.secondary} onClick={onClose}>Cancelar</button>
          <button type="submit" form="patient-form" className={btn.primary} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <form id="patient-form" onSubmit={handleSubmit} className={styles.form}>
        <p className={styles.requiredNote}><span className={styles.requiredStar}>*</span> Campo obrigatório</p>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Dados pessoais</h3>
          <Field label="Nome" required value={form.name} onChange={(v) => set('name', v)} />
          <div className={f.row2}>
            <div className={f.field}>
              <label htmlFor="pf-birth">Data de nascimento</label>
              <DateInput id="pf-birth" value={form.birth_date} onChange={(v) => set('birth_date', v)} autoComplete="off" />
            </div>
            <div className={f.field}>
              <label>Gênero</label>
              <SelectMenu variant="field" ariaLabel="Gênero" value={form.gender}
                onChange={v => set('gender', v)}
                options={[
                  { value: '', label: 'Selecionar' },
                  { value: 'Masculino', label: 'Masculino' },
                  { value: 'Feminino', label: 'Feminino' },
                  { value: 'Outro', label: 'Outro' },
                ]} />
            </div>
          </div>
          <div className={f.row2}>
            <Field label="CPF" cpf previous={previousCpfNote(patient?.cpf)} value={form.cpf} onChange={(v) => set('cpf', v)} />
            <Field label="RG" value={form.rg} onChange={(v) => set('rg', v)} />
          </div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Contato</h3>
          <div className={f.row2}>
            <Field label="Telefone" phone previous={previousPhoneNote(patient?.phone)} value={form.phone} onChange={(v) => set('phone', v)} />
            <Field label="E-mail" type="email" value={form.email} onChange={(v) => set('email', v)} />
          </div>
          <Field label="Endereço" value={form.address} onChange={(v) => set('address', v)} />
          <Field label="Contato de emergência" value={form.emergency_contact} onChange={(v) => set('emergency_contact', v)} />
        </section>

        <details className={styles.more} open={moreOpen} onToggle={(e) => setMoreOpen(e.currentTarget.open)}>
          <summary className={styles.moreSummary}>
            <span className={styles.moreText}>
              <b>Mais informações</b>
              <small>Ocupação, indicação, convênio e observações</small>
            </span>
            <Icon name="chevronRight" size={16} />
          </summary>
          <div className={styles.moreBody}>
            <div className={f.row2}>
              <Field label="Ocupação" value={form.occupation} onChange={(v) => set('occupation', v)} />
              <Field label="Indicado por" value={form.referred_by} onChange={(v) => set('referred_by', v)} />
            </div>
            <div className={f.row2}>
              <div className={f.field} style={!form.convenio.trim() ? { gridColumn: '1 / -1' } : undefined}>
                <label>Convênio</label>
                <input
                  value={form.convenio}
                  onChange={(e) => { set('convenio', e.target.value); setShowConvenioSuggestions(true) }}
                  onClick={() => setShowConvenioSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowConvenioSuggestions(false), 150)}
                  placeholder="Ex: Unimed, Particular..."
                  autoComplete="off"
                />
                {showConvenioSuggestions && filteredConvenioSuggestions.length > 0 && (
                  <div className={styles.suggestionsDropdown}>
                    {filteredConvenioSuggestions.map(c => (
                      <button
                        key={c}
                        type="button"
                        tabIndex={-1}
                        className={styles.suggestionItem}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { set('convenio', c); setShowConvenioSuggestions(false) }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {form.convenio.trim() && (
                <Field label="Nº da carteirinha" value={form.convenio_carteirinha} onChange={(v) => set('convenio_carteirinha', v)} />
              )}
            </div>
            <div className={f.field}>
              <label>Observações</label>
              <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
            </div>
          </div>
        </details>

        {isNew && (
          <label className={styles.lgpdConsent}>
            <input
              type="checkbox"
              checked={lgpdConsent}
              onChange={(e) => setLgpdConsent(e.target.checked)}
              required
            />
            <span>
              O paciente autoriza o tratamento dos seus dados pessoais e de saúde conforme a{' '}
              <strong>LGPD (Lei 13.709/2018)</strong>, art. 7 e 11, para fins de atendimento clínico.
            </span>
          </label>
        )}

        {error && <p ref={errorRef} className={f.error} role="alert">{error}</p>}

        {!isNew && confirmDelete && (
          <div className={styles.confirmDelete}>
            <p>Excluir <strong>{form.name}</strong>? O paciente sairá das listas mas o histórico (prontuário e agendamentos) será preservado.</p>
            <div className={styles.confirmActions}>
              <button type="button" className={btn.secondary} onClick={() => setConfirmDelete(false)} disabled={deleting}>
                Cancelar
              </button>
              <button type="button" className={btn.danger} onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Excluindo...' : 'Sim, excluir'}
              </button>
            </div>
          </div>
        )}
      </form>
    </Modal>
  )
}

function Field({
  label, value, onChange, type = 'text', placeholder = '', required = false, phone = false, cpf = false, previous = null,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean
  /** campo de telefone: só aceita (85) 99999-8888 */
  phone?: boolean
  /** campo de CPF: só os 11 números */
  cpf?: boolean
  /** valor antigo guardado que o campo não mostra por inteiro */
  previous?: string | null
}) {
  return (
    <div className={f.field}>
      <label>
        {label}
        {required && <span className={styles.requiredStar}> *</span>}
      </label>
      {phone || cpf ? (
        <>
          {phone ? <PhoneInput value={value} onChange={onChange} /> : <CpfInput value={value} onChange={onChange} />}
          {previous && <small className={f.hint}>Valor anterior no cadastro: {previous}. Confira e digite {phone ? 'o número completo com DDD' : 'os 11 números'}.</small>}
        </>
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
        />
      )}
    </div>
  )
}
