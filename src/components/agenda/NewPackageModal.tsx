'use client'
import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { DatePicker } from '@/components/ui/DatePicker'
import { IntegerInput, MoneyInput } from '@/components/ui/NumericInput'
import { showToast } from '@/components/ui/Toast'
import { createPatientPackage } from '@/lib/agenda/packagesApi'
import { pricePerSession } from '@/lib/agenda/packages'
import { formatCurrency } from '@/lib/utils'
import type { Procedure } from '@/types'
import btn from '@/components/ui/button.module.css'
import f from '@/components/ui/modalForm.module.css'

interface Props {
  open: boolean
  onClose: () => void
  clinicId: string
  userId?: string | null
  patient: { id: string; name: string }
  procedures: Procedure[]
  /** procedimento já escolhido no agendamento */
  defaultProcedureId?: string
  onCreated: (packageId: string) => void
}

/** Venda de um pacote de N sessões de um procedimento para o paciente. */
export function NewPackageModal({ open, onClose, clinicId, userId, patient, procedures, defaultProcedureId, onCreated }: Props) {
  const [procedureId, setProcedureId] = useState(defaultProcedureId && defaultProcedureId !== 'outro' ? defaultProcedureId : '')
  const [sessions, setSessions] = useState(10)
  const [name, setName] = useState<string | null>(null)
  const [price, setPrice] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState('')
  const [notes, setNotes] = useState('')
  const [launchRevenue, setLaunchRevenue] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const proc = procedures.find(p => p.id === procedureId)
  // enquanto não digitou, nome e valor acompanham o procedimento e o número de sessões
  const shownName = name ?? (proc ? `Pacote de ${sessions} sessões de ${proc.name}` : `Pacote de ${sessions} sessões`)
  const shownPrice = price ?? (proc && proc.price > 0 ? String(Math.round(proc.price * sessions * 100) / 100) : '')
  const total = shownPrice ? parseFloat(shownPrice) : 0
  const perSession = pricePerSession(total, sessions)

  async function submit() {
    setError('')
    setSaving(true)
    const res = await createPatientPackage({
      clinicId, userId, patientId: patient.id,
      procedureId: procedureId || null,
      name: shownName, totalSessions: sessions, totalPrice: Number.isFinite(total) ? total : 0,
      expiresAt: expiresAt || null, notes, launchRevenue,
    })
    setSaving(false)
    if (!res.ok) { setError(res.error); return }
    if (res.revenueError) {
      showToast('error', `Pacote criado, mas a receita não foi lançada: ${res.revenueError}. Lance a venda em Financeiro.`, { href: '/financeiro', actionLabel: 'Ir para Financeiro' })
    } else if (res.recordId) {
      showToast('ok', 'Pacote criado. Receita lançada: defina a forma de pagamento em Financeiro.', { href: `/financeiro?record=${res.recordId}`, actionLabel: 'Definir pagamento' })
    } else {
      showToast('ok', 'Pacote criado.')
    }
    onCreated(res.id)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Novo pacote de sessões"
      subtitle={patient.name}
      footer={
        <>
          <button type="button" className={btn.secondary} onClick={onClose}>Cancelar</button>
          <button type="button" className={btn.primary} onClick={submit} disabled={saving || sessions < 1 || !shownName.trim()}>
            {saving ? 'Salvando...' : 'Criar pacote'}
          </button>
        </>
      }
    >
      <div className={f.field}>
        <label>Procedimento</label>
        <SelectMenu
          variant="field"
          ariaLabel="Procedimento do pacote"
          value={procedureId}
          onChange={setProcedureId}
          options={[{ value: '', label: 'Qualquer procedimento' }, ...procedures.filter(p => p.is_active).map(p => ({ value: p.id, label: p.name }))]}
        />
      </div>
      <div className={f.row2}>
        <div className={f.field}>
          <label>Número de sessões *</label>
          <IntegerInput value={sessions || ''} onChange={v => setSessions(v === '' ? 0 : Number(v))} min={1} max={500} placeholder="10" aria-label="Número de sessões" />
        </div>
        <div className={f.field}>
          <label>Valor do pacote (R$)</label>
          <MoneyInput value={shownPrice} onChange={setPrice} aria-label="Valor total do pacote" />
        </div>
      </div>
      {total > 0 && sessions > 0 && <p className={f.hint}>{formatCurrency(perSession)} por sessão.</p>}
      <div className={f.field}>
        <label>Nome do pacote</label>
        <input value={shownName} onChange={e => setName(e.target.value)} maxLength={120} />
      </div>
      <div className={f.field}>
        <label>Validade (opcional)</label>
        <DatePicker ariaLabel="Validade do pacote" value={expiresAt} onChange={setExpiresAt} />
      </div>
      <div className={f.field}>
        <label>Observações</label>
        <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Informações adicionais..." />
      </div>
      <div className={f.switches}>
        <label className={f.switchRow}>
          <span className={f.switchText}>
            <b>Lançar a venda no Financeiro</b>
            <small>Uma receita só, com a forma de pagamento pendente. As sessões não geram nova cobrança.</small>
          </span>
          <span className={f.toggle}>
            <input type="checkbox" checked={launchRevenue} onChange={e => setLaunchRevenue(e.target.checked)} disabled={total <= 0} />
            <span />
          </span>
        </label>
      </div>
      {error && <p className={f.error} role="alert">{error}</p>}
    </Modal>
  )
}
