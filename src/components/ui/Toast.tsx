'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './toast.module.css'
import { Icon } from './Icon'

export interface ToastData {
  id: string
  type: 'ok' | 'error'
  text: string
  href?: string
  actionLabel?: string
}

// Store global simples sem zustand
type Listener = (toasts: ToastData[]) => void
let toasts: ToastData[] = []
const listeners: Listener[] = []

function notify() { listeners.forEach(l => l([...toasts])) }

export function showToast(type: 'ok' | 'error', text: string, options?: { href?: string; actionLabel?: string }) {
  const id = Math.random().toString(36).slice(2)
  toasts = [...toasts, { id, type, text, href: options?.href, actionLabel: options?.actionLabel }]
  notify()
  // Toasts clicáveis (com href) ficam mais tempo — o usuário precisa de
  // tempo pra ler e decidir clicar, não só constatar a mensagem.
  setTimeout(() => {
    toasts = toasts.filter(t => t.id !== id)
    notify()
  }, options?.href ? 6000 : 3500)
}

function dismiss(id: string) {
  toasts = toasts.filter(t => t.id !== id)
  notify()
}

export function ToastContainer() {
  const [items, setItems] = useState<ToastData[]>([])
  const router = useRouter()

  useEffect(() => {
    listeners.push(setItems)
    return () => {
      const i = listeners.indexOf(setItems)
      if (i > -1) listeners.splice(i, 1)
    }
  }, [])

  if (items.length === 0) return null

  return (
    <div className={styles.container}>
      {items.map(t => (
        <div
          key={t.id}
          className={`${styles.toast} ${t.type === 'ok' ? styles.toastOk : styles.toastError} ${t.href ? styles.toastClickable : ''}`}
          role={t.href ? 'button' : undefined}
          tabIndex={t.href ? 0 : undefined}
          onClick={t.href ? () => { dismiss(t.id); router.push(t.href!) } : undefined}
          onKeyDown={t.href ? (e) => { if (e.key === 'Enter') { dismiss(t.id); router.push(t.href!) } } : undefined}
        >
          <span className={styles.icon}>{t.type === 'ok' ? <Icon name="check" size={12} /> : <Icon name="alert" size={12} />}</span>
          <span className={styles.text}>{t.text}</span>
          {t.href && <span className={styles.action}>{t.actionLabel ?? 'Ver'} →</span>}
        </div>
      ))}
    </div>
  )
}
