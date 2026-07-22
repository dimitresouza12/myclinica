'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Clinic } from '@/types'
import { computeClinicStatus } from '@/lib/clinicStatus'
import { Portal } from '@/components/ui/Portal'
import { StatusBadge } from './StatusBadge'
import styles from './admin.module.css'
import { Icon } from '@/components/ui/Icon'

const PLANS: { value: string; label: string; hint: string }[] = [
  { value: 'essencial',     label: 'Essencial',  hint: 'R$99/mês — até 100 pacientes, 1 usuário' },
  { value: 'avancado',      label: 'Avançado',   hint: 'R$119,90/mês — ilimitados, até 3 usuários' },
  { value: 'completo',      label: 'Completo',   hint: 'R$129,90/mês — ilimitados + multi-clínica' },
  { value: 'completo_plus', label: 'Completo+',  hint: 'R$199/mês — Completo + IA e WhatsApp' },
]

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

function buildWhatsAppUrl(phone: string, clinicName: string, dueDay: number | null): string {
  const clean = phone.replace(/\D/g, '')
  const number = clean.startsWith('55') ? clean : `55${clean}`
  const dia = dueDay ? `dia ${dueDay}` : 'este mês'
  const msg = encodeURIComponent(
    `Olá! Passando para lembrar que a mensalidade do MyClinica referente ao ${dia} está em aberto. Qualquer dúvida estou à disposição! 😊`
  )
  return `https://wa.me/${number}?text=${msg}`
}

interface Props {
  clinic: Clinic
  onClose: () => void
  onSaved: () => void
}

export function ClinicEditModal({ clinic, onClose, onSaved }: Props) {
  const [plan, setPlan] = useState(clinic.plan ?? 'basico')
  const [maxPatients, setMaxPatients] = useState(clinic.max_patients ?? 200)
  const [trialMode, setTrialMode] = useState<'trial' | 'permanente'>(
    clinic.trial_ends_at ? 'trial' : 'permanente'
  )
  const [trialDate, setTrialDate] = useState(toDateInputValue(clinic.trial_ends_at))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Cobrança
  const [billingPhone, setBillingPhone] = useState(clinic.billing_phone ?? clinic.phone ?? '')
  const [billingDueDay, setBillingDueDay] = useState<string>(
    clinic.billing_due_day ? String(clinic.billing_due_day) : ''
  )
  const [billingPaid, setBillingPaid] = useState(clinic.billing_paid ?? false)

  async function handleSave() {
    setSaving(true)
    setError('')
    const trial_ends_at = trialMode === 'permanente'
      ? null
      : trialDate ? new Date(trialDate + 'T23:59:59').toISOString() : null
    // Marcar como paga também limpa o atraso — espelha o que o webhook do Asaas faz
    const billing_overdue_since = billingPaid ? null : clinic.billing_overdue_since
    const status = computeClinicStatus({ trial_ends_at, billing_paid: billingPaid, billing_overdue_since })
    const { error: err } = await supabase
      .from('clinics')
      .update({
        plan,
        max_patients: maxPatients,
        status,
        is_active: status !== 'suspended',
        trial_ends_at,
        billing_phone: billingPhone.trim() || null,
        billing_due_day: billingDueDay ? Number(billingDueDay) : null,
        billing_paid: billingPaid,
        billing_overdue_since,
      })
      .eq('id', clinic.id)
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
    onClose()
  }

  const canCharge = billingPhone.trim().length >= 10

  const previewTrialEndsAt = trialMode === 'permanente'
    ? null
    : trialDate ? new Date(trialDate + 'T23:59:59').toISOString() : null
  const previewClinic = {
    trial_ends_at: previewTrialEndsAt,
    billing_paid: billingPaid,
    billing_overdue_since: billingPaid ? null : clinic.billing_overdue_since,
  }

  return (
    <Portal>
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Editar clínica: {clinic.name}</h2>
          <button className={styles.btnClose} onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className={styles.modalBody}>

          {/* — Plano — */}
          <div className={styles.field}>
            <label>Plano</label>
            <div className={styles.planGrid}>
              {PLANS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={`${styles.planBtn} ${plan === p.value ? styles.planBtnActive : ''}`}
                  onClick={() => setPlan(p.value)}
                  title={p.hint}
                >
                  <span>{p.label}</span>
                  <span className={styles.planHint}>{p.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* — Limite de pacientes — */}
          <div className={styles.field}>
            <label>Limite de pacientes</label>
            <input
              type="number"
              min={10}
              step={50}
              value={maxPatients}
              onChange={(e) => setMaxPatients(Number(e.target.value))}
              className={styles.fieldInput}
            />
          </div>

          {/* — Trial — */}
          <div className={styles.field}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <label>Período de teste</label>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Status resultante: <StatusBadge clinic={previewClinic} />
              </span>
            </div>
            <div className={styles.statusBtnGroup}>
              <button
                type="button"
                className={`${styles.statusChoiceBtn} ${trialMode === 'trial' ? styles.statusChoiceBtnActive : ''}`}
                onClick={() => setTrialMode('trial')}
              >
                ⏳ Trial com data limite
              </button>
              <button
                type="button"
                className={`${styles.statusChoiceBtn} ${trialMode === 'permanente' ? styles.statusChoiceBtnActive : ''}`}
                onClick={() => setTrialMode('permanente')}
              >
                Acesso permanente
              </button>
            </div>
            {trialMode === 'trial' && (
              <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Data de expiração do trial</span>
                <input
                  type="date"
                  className={styles.fieldInput}
                  value={trialDate}
                  onChange={(e) => setTrialDate(e.target.value)}
                />
              </div>
            )}
            {trialMode === 'permanente' && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                A clínica não será bloqueada por expiração de trial.
              </p>
            )}
          </div>

          {/* — Cobrança — */}
          <div className={styles.billingSection}>
            <p className={styles.billingSectionTitle}>Cobrança de mensalidade</p>

            <div className={styles.billingRow}>
              <div className={styles.field} style={{ flex: 1 }}>
                <label>WhatsApp do responsável</label>
                <input
                  type="tel"
                  className={styles.fieldInput}
                  placeholder="11 99999-9999"
                  value={billingPhone}
                  onChange={(e) => setBillingPhone(e.target.value)}
                />
              </div>
              <div className={styles.field} style={{ width: '110px' }}>
                <label>Dia de vencimento</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  className={styles.fieldInput}
                  placeholder="Ex: 10"
                  value={billingDueDay}
                  onChange={(e) => setBillingDueDay(e.target.value)}
                />
              </div>
            </div>

            <div className={styles.billingPaidRow}>
              <label className={styles.billingPaidLabel}>
                <input
                  type="checkbox"
                  checked={billingPaid}
                  onChange={(e) => setBillingPaid(e.target.checked)}
                  className={styles.billingPaidCheck}
                />
                <span>Mensalidade paga</span>
                <span className={billingPaid ? styles.paidBadge : styles.unpaidBadge}>
                  {billingPaid ? <><Icon name="check" size={11} /> Pago</> : <><Icon name="alert" size={11} /> Pendente</>}
                </span>
              </label>

              {canCharge && (
                <a
                  href={buildWhatsAppUrl(billingPhone, clinic.name, billingDueDay ? Number(billingDueDay) : null)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.btnWhatsApp}
                >
                  <Icon name="phone" size={13} /> Cobrar via WhatsApp
                </a>
              )}
            </div>
          </div>

          {error && <p className={styles.fieldError}>{error}</p>}
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.btnCancel} onClick={onClose}>Cancelar</button>
          <button className={styles.btnSave} onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  )
}
