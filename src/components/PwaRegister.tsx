'use client'
import { useEffect } from 'react'

// Registra o service worker (public/sw.js) só em produção. Em dev o cache atrapalharia o hot reload.
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch(() => { /* sem service worker o app segue funcionando normalmente */ })
  }, [])

  return null
}
