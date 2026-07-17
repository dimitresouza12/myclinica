'use client'
import { useEffect, useState } from 'react'
import styles from './toast.module.css'
import { Icon } from './Icon'

export interface ToastData {
  id: string
  type: 'ok' | 'error'
  text: string
}

// Store global simples sem zustand
type Listener = (toasts: ToastData[]) => void
let toasts: ToastData[] = []
const listeners: Listener[] = []

function notify() { listeners.forEach(l => l([...toasts])) }

export function showToast(type: 'ok' | 'error', text: string) {
  const id = Math.random().toString(36).slice(2)
  toasts = [...toasts, { id, type, text }]
  notify()
  setTimeout(() => {
    toasts = toasts.filter(t => t.id !== id)
    notify()
  }, 3500)
}

export function ToastContainer() {
  const [items, setItems] = useState<ToastData[]>([])

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
        <div key={t.id} className={`${styles.toast} ${t.type === 'ok' ? styles.toastOk : styles.toastError}`}>
          <span className={styles.icon}>{t.type === 'ok' ? <Icon name="check" size={12} /> : <Icon name="alert" size={12} />}</span>
          <span className={styles.text}>{t.text}</span>
        </div>
      ))}
    </div>
  )
}
