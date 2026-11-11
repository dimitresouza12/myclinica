'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { MoneyInput } from '@/components/ui/NumericInput'
import f from '@/components/ui/modalForm.module.css'
import btn from '@/components/ui/button.module.css'
import { audit } from '@/lib/audit'
import { useAuthStore } from '@/store/auth'
import { planSaveErrorMessage } from '@/lib/convenios/api'
import { maskAnsRegistry, planDraftToColumns, planToDraft, validatePlanDraft, type PlanDraft } from '@/lib/convenios/plans'
import type { InsurancePlan } from '@/lib/convenios/types'
import styles from './convenios.module.css'

interface Props {
  clinicId: string
  /** null = convênio novo */
  plan: InsurancePlan | null
  procedures: Array<{ id: string; name: string; price: number | null }>
  onClose: () => void
  onSaved: () => void
}

export function PlanModal({ clinicId, plan, procedures, onClose, onSaved }: Props) {
  const { user } = useAuthStore()
  const [draft, setDraft] = useState<PlanDraft>(() => planToDraft(plan))
  const [active, setActive] = useState(plan?.is_active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const invalid = validatePlanDraft(draft)
    if (invalid) return setError(invalid)
    setSaving(true)
    try {
      const cols = { ...planDraftToColumns(draft), is_active: active, updated_at: new Date().toISOString() }
      if (plan) {
        const { error: err } = await supabase.from('insurance_plans').update(cols).eq('id', plan.id).eq('clinic_id', clinicId)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('insurance_plans').insert([{ ...cols, clinic_id: clinicId }])
        if (err) throw err
      }
      if (user?.id) await audit({ action: 'financial.update', user_id: user.id, clinic_id: clinicId, module: 'financeiro', resource_id: plan?.id, details: { convenio: cols.name, acao: plan ? 'editar' : 'criar' } })
      onSaved()
    } catch (err: unknown) {
      setError(planSaveErrorMessage(err as { code?: string; message?: string }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={plan ? 'Editar convênio' : 'Novo convênio'}
      footer={
        <>
          <button type="button" className={btn.secondary} onClick={onClose}>Cancelar</button>
          <button type="submit" form="plan-form" className={btn.primary} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </>
      }
    >
      <form id="plan-form" onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className={f.row2}>
          <div className={f.field}>
            <label htmlFor="plan-name">Nome do convênio</label>
            <input id="plan-name" value={draft.name} maxLength={80} autoComplete="off" onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Ex: Unimed Fortaleza" />
          </div>
          <div className={f.field}>
            <label htmlFor="plan-ans">Registro ANS</label>
            <input id="plan-ans" value={draft.ans_registry} inputMode="numeric" autoComplete="off" placeholder="6 números" onChange={e => setDraft(d => ({ ...d, ans_registry: maskAnsRegistry(e.target.value) }))} />
            <span className={f.hint}>Sai na guia TISS. Opcional.</span>
          </div>
        </div>
        <div className={f.field}>
          <label htmlFor="plan-notes">Observações</label>
          <textarea id="plan-notes" rows={2} value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} />
        </div>
        <label className={f.switchRow} style={{ border: '1px solid var(--surface-line)', borderRadius: 'var(--radius-field)' }}>
          <span>Convênio ativo</span>
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--brand-primary)' }} />
        </label>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Tabela de valores por procedimento</h3>
          <p className={styles.sectionHint}>Opcional. Onde ficar em branco, a produção e as guias usam o valor do agendamento ou o preço do procedimento.</p>
          {procedures.length === 0 ? (
            <p className={styles.sectionHint}>Cadastre procedimentos para definir valores deste convênio.</p>
          ) : (
            <div className={styles.priceList}>
              {procedures.map(p => (
                <div key={p.id} className={styles.priceRow}>
                  <label htmlFor={`price-${p.id}`} className={styles.priceName}>{p.name}</label>
                  <MoneyInput
                    id={`price-${p.id}`}
                    aria-label={`Valor de ${p.name} neste convênio`}
                    value={draft.prices[p.id] ?? ''}
                    onChange={v => setDraft(d => ({ ...d, prices: { ...d.prices, [p.id]: v } }))}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        {error && <p className={f.error} role="alert">{error}</p>}
      </form>
    </Modal>
  )
}
