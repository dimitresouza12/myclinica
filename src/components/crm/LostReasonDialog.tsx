'use client'
import { useEffect, useRef, useState } from 'react'
import { Portal } from '@/components/ui/Portal'
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
  const firstRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { firstRef.current?.focus() }, [])
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <Portal>
      <div className={styles.dialogOverlay} onClick={e => e.target === e.currentTarget && onCancel()}>
        <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="lost-title">
          <h2 id="lost-title" className={styles.dialogTitle}>Por que {leadTitle(lead)} foi perdido?</h2>
          <p className={styles.dialogText}>O motivo ajuda a entender onde o funil perde pacientes. Se preferir, marque sem motivo.</p>
          <div className={styles.reasons} role="radiogroup" aria-label="Motivo da perda">
            {LOST_REASONS.map((r, i) => (
              <button
                key={r}
                ref={i === 0 ? firstRef : undefined}
                type="button"
                role="radio"
                aria-checked={reason === r}
                className={`${styles.reason} ${reason === r ? styles.reasonOn : ''}`}
                onClick={() => setReason(reason === r ? '' : r)}
              >{r}</button>
            ))}
          </div>
          <div className={styles.dialogActs}>
            <button type="button" className={styles.btn} onClick={onCancel} disabled={saving}>Cancelar</button>
            <button type="button" className={styles.btnPrimary} onClick={() => onConfirm(reason || null)} disabled={saving}>
              {saving ? 'Salvando…' : 'Marcar como perdido'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
