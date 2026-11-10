'use client'
import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useProcedures } from '@/hooks/useClinicData'
import { Modal } from '@/components/ui/Modal'
import { MoneyInput } from '@/components/ui/NumericInput'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { showToast } from '@/components/ui/Toast'
import btn from '@/components/ui/button.module.css'
import { budgetDescription, suggestProcedure, statusColor, type ToothMark } from '@/lib/odontograma'
import type { MedicalRecord, Patient, TreatmentPlanItem } from '@/types'
import styles from './orcamentoOdonto.module.css'

interface Props {
  marks: ToothMark[]
  record: MedicalRecord | null
  patient: Patient
  clinicId: string
  /** o odontograma tem alterações ainda não salvas */
  dirty: boolean
  onClose: () => void
  onSaved: () => void
}

interface Row { key: string; description: string; status: string; include: boolean; procedureId: string; value: number | null }

const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Transforma o que está "a realizar" no odontograma em itens do plano de tratamento (o orçamento da Ficha Clínica). */
export function OrcamentoOdontoModal({ marks, record, patient, clinicId, dirty, onClose, onSaved }: Props) {
  const { data: procedures = [] } = useProcedures(clinicId)
  const active = useMemo(() => procedures.filter(p => p.is_active), [procedures])
  const existing = record?.treatment_plan_items ?? []
  const already = useMemo(() => new Set(existing.map(i => i.description)), [existing])

  const [edits, setEdits] = useState<Record<string, Partial<Row>>>({})
  const [saving, setSaving] = useState(false)

  // a sugestão de procedimento e preço vem do cadastro da clínica; o que o usuário mexer fica em `edits`
  const rows: Row[] = marks.map(m => {
    const key = `${m.tooth}-${m.key}`
    const description = budgetDescription(m)
    const sug = suggestProcedure(m.status, active)
    const base: Row = {
      key, description, status: m.status, include: !already.has(description),
      procedureId: sug?.id ?? '', value: sug && !sug.is_free ? sug.price : null,
    }
    return { ...base, ...edits[key] }
  })
  const chosen = rows.filter(r => r.include)
  const total = chosen.reduce((sum, r) => sum + (r.value ?? 0), 0)
  const patch = (key: string, p: Partial<Row>) => setEdits(e => ({ ...e, [key]: { ...e[key], ...p } }))

  async function confirm() {
    setSaving(true)
    const add: TreatmentPlanItem[] = chosen.map(r => ({ id: crypto.randomUUID(), description: r.description, value: r.value }))
    const payload = {
      clinic_id: clinicId, patient_id: patient.id,
      treatment_plan_items: [...existing, ...add],
      updated_at: new Date().toISOString(),
    }
    const { error } = record?.id
      ? await supabase.from('medical_records').update(payload).eq('id', record.id)
      : await supabase.from('medical_records').insert([payload])
    setSaving(false)
    if (error) { showToast('error', 'Não consegui adicionar ao plano. Tente de novo.'); return }
    showToast('ok', `${add.length} ${add.length === 1 ? 'item adicionado' : 'itens adicionados'} ao Plano de Tratamento, na Ficha Clínica.`)
    onSaved()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Orçamento do plano"
      subtitle={`${marks.length} ${marks.length === 1 ? 'procedimento a realizar' : 'procedimentos a realizar'}`}
      footer={
        <>
          <span className={styles.total}>Total <b>{money(total)}</b></span>
          <button type="button" className={btn.secondary} onClick={onClose}>Cancelar</button>
          <button type="button" className={btn.primary} onClick={confirm} disabled={saving || chosen.length === 0}>
            {saving ? 'Adicionando...' : 'Adicionar ao plano'}
          </button>
        </>
      }
    >
      <p className={styles.intro}>
        Cada procedimento marcado como &ldquo;a realizar&rdquo; no odontograma vira um item do Plano de Tratamento da Ficha Clínica.
        O preço vem do cadastro de procedimentos da clínica e pode ser ajustado aqui.
      </p>
      {dirty && <p className={styles.warn}>O odontograma tem alterações ainda não salvas. Salve também para elas ficarem no prontuário.</p>}
      <ul className={styles.list}>
        {rows.map(r => (
          <li key={r.key} className={styles.row} data-off={!r.include}>
            <label className={styles.check}>
              <input type="checkbox" checked={r.include} onChange={e => patch(r.key, { include: e.target.checked })} />
              <span className={styles.dot} style={{ background: statusColor(r.status) }} aria-hidden="true" />
              <span className={styles.desc}>{r.description}</span>
            </label>
            {already.has(r.description) && <span className={styles.already}>Já está no plano</span>}
            <div className={styles.fields}>
              <SelectMenu
                variant="field"
                ariaLabel={`Procedimento para ${r.description}`}
                value={r.procedureId}
                placeholder="Sem procedimento do cadastro"
                options={[{ value: '', label: 'Sem procedimento do cadastro' }, ...active.map(p => ({ value: p.id, label: p.name }))]}
                onChange={id => {
                  const proc = active.find(p => p.id === id)
                  patch(r.key, { procedureId: id, value: proc ? (proc.is_free ? null : proc.price) : r.value })
                }}
              />
              <MoneyInput
                className={styles.price}
                aria-label={`Valor de ${r.description}`}
                value={r.value}
                placeholder="R$"
                onChange={v => patch(r.key, { value: v === '' ? null : Number(v) })}
              />
            </div>
          </li>
        ))}
      </ul>
      {active.length === 0 && <p className={styles.warn}>A clínica ainda não tem procedimentos cadastrados. Digite os valores à mão ou cadastre em Procedimentos.</p>}
    </Modal>
  )
}
