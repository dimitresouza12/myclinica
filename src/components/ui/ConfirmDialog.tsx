'use client'
import { useEffect, useState } from 'react'
import { Portal } from './Portal'
import { Icon } from './Icon'
import btn from './button.module.css'
import styles from './confirmDialog.module.css'

export interface ConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

export interface ChoiceOption { value: string; label: string }

interface ConfirmState extends ConfirmOptions {
  id: string
  resolve: (value: boolean) => void
  choices?: ChoiceOption[]
  resolveChoice?: (value: string | null) => void
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

// Pergunta com várias respostas (ex.: forma de pagamento). Devolve o valor escolhido ou null se fechar.
export function choiceDialog(options: ConfirmOptions & { choices: ChoiceOption[] }): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    current = { id: Math.random().toString(36).slice(2), resolve: () => {}, resolveChoice: resolve, ...options }
    notify()
  })
}

function pick(value: string) {
  if (!current) return
  current.resolveChoice?.(value)
  current = null
  notify()
}

function close(value: boolean) {
  if (!current) return
  current.resolve(value)
  current.resolveChoice?.(null)
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
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state])

  if (!state) return null

  return (
    <Portal>
      <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) close(false) }}>
        <div
          className={styles.modal}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby={state.title ? 'confirm-dialog-message' : undefined}
        >
          <span className={`${styles.icon} ${state.danger ? styles.iconDanger : ''}`} aria-hidden>
            <Icon name={state.danger ? 'alert' : 'info'} size={20} />
          </span>
          {/* Sem título, a própria pergunta vira o título */}
          <h2 id="confirm-dialog-title" className={styles.title}>{state.title ?? state.message}</h2>
          {state.title && <p id="confirm-dialog-message" className={styles.message}>{state.message}</p>}
          {state.choices ? (
            <div className={styles.actions} style={{ flexWrap: 'wrap' }}>
              {state.choices.map((c, i) => (
                <button key={c.value} type="button" className={i === 0 ? btn.primary : btn.secondary} onClick={() => pick(c.value)} autoFocus={i === 0}>
                  {c.label}
                </button>
              ))}
              <button type="button" className={btn.secondary} onClick={() => close(false)}>{state.cancelText ?? 'Depois'}</button>
            </div>
          ) : (
          <div className={styles.actions}>
            <button type="button" className={btn.secondary} onClick={() => close(false)}>
              {state.cancelText ?? 'Cancelar'}
            </button>
            <button
              type="button"
              className={state.danger ? btn.danger : btn.primary}
              onClick={() => close(true)}
              autoFocus
            >
              {state.confirmText ?? 'Confirmar'}
            </button>
          </div>
          )}
        </div>
      </div>
    </Portal>
  )
}
