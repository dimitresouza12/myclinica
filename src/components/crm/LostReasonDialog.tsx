'use client'
import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import f from '@/components/ui/modalForm.module.css'
import { Button } from '@/components/ui/Button'
import { LOST_REASONS, leadTitle, type Lead } from '@/lib/crm/model'
import styles from './Crm.module.css'

interface Props {
  lead: Lead
  saving: boolean
  onConfirm: (reason: string | null) => void
  onCancel: () => void
}

/** Pergunta por que o lead foi perdido. O motivo é opcional: dá para marcar como perdido sem escolher. */
export function LostReasonDialog({ lead, saving, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState<string>('')

  return (
    <Modal
      open
      onClose={() => { if (!saving) onCancel() }}
      size="sm"
      title={`Por que ${leadTitle(lead)} foi perdido?`}
      footer={
        <>
          <Button onClick={onCancel} disabled={saving}>Cancelar</Button>
          <Button variant="primary" loading={saving} onClick={() => onConfirm(reason || null)}>
            {saving ? 'Salvando…' : 'Marcar como perdido'}
          </Button>
        </>
      }
    >
      <p className={f.note}>O motivo ajuda a entender onde o funil perde pacientes. Se preferir, marque sem motivo.</p>
      <div className={styles.reasons} role="radiogroup" aria-label="Motivo da perda">
        {LOST_REASONS.map(r => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={reason === r}
            className={`${styles.reason} ${reason === r ? styles.reasonOn : ''}`}
            onClick={() => setReason(reason === r ? '' : r)}
          >{r}</button>
        ))}
      </div>
    </Modal>
  )
}
