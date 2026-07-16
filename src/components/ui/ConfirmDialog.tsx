'use client'
import { useEffect, useState } from 'react'
import { Portal } from './Portal'
import styles from './confirmDialog.module.css'

export interface ConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

interface ConfirmState extends ConfirmOptions {
  id: string
  resolve: (value: boolean) => void
}

type Listener = (state: ConfirmState | null) => void
let current: ConfirmState | null = null
const listeners: Listener[] = []

function notify() { listeners.forEach(l => l(current)) }

export function confirmDialog(options: ConfirmOptions | string): Promise<boolean> {
  const opts: ConfirmOptions = typeof options === 'string' ? { message: options } : options
  return new Promise<boolean>((resolve) => {
    current = { id: Math.random().toString(36).slice(2), resolve, ...opts }
    notify()
  })
}

function close(value: boolean) {
  if (!current) return
  current.resolve(value)
  current = null
  notify()
}

export function ConfirmDialogContainer() {
  const [state, setState] = useState<ConfirmState | null>(null)

  useEffect(() => {
    listeners.push(setState)
    return () => {
      const i = listeners.indexOf(setState)
      if (i > -1) listeners.splice(i, 1)
    }
  }, [])

  useEffect(() => {
    if (!state) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close(false)
      if (e.key === 'Enter') close(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state])

  if (!state) return null

  return (
    <Portal>
      <div className={styles.overlay} onClick={() => close(false)}>
        <div
          className={styles.modal}
          onClick={(e) => e.stopPropagation()}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-message"
        >
          {state.title && <h2 className={styles.title}>{state.title}</h2>}
          <p id="confirm-dialog-message" className={styles.message}>{state.message}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={() => close(false)}>
              {state.cancelText ?? 'Cancelar'}
            </button>
            <button
              type="button"
              className={`${styles.confirmBtn} ${state.danger ? styles.confirmBtnDanger : ''}`}
              onClick={() => close(true)}
              autoFocus
            >
              {state.confirmText ?? 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
