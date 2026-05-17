'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import type { Patient } from '@/types'
import styles from './GlobalSearch.module.css'

export function GlobalSearch() {
  const { clinic } = useAuthStore()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Patient[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', down)
    return () => document.removeEventListener('mousedown', down)
  }, [])

  useEffect(() => {
    if (!query.trim() || !clinic?.id) { setResults([]); setOpen(false); return }
    const t = setTimeout(async () => {
      setLoading(true)
      const term = query.trim().toLowerCase()
      const { data } = await supabase
        .from('patients')
        .select('id, name, phone')
        .eq('clinic_id', clinic.id)
        .eq('is_active', true)
        .or(`name.ilike.%${term}%,phone.ilike.%${term}%`)
        .limit(6)
      setResults((data ?? []) as Patient[])
      setOpen(true)
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [query, clinic?.id])

  function handleSelect(p: Patient) {
    setQuery('')
    setOpen(false)
    router.push(`/pacientes?patient=${p.id}`)
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <div className={styles.inputWrap}>
        <span className={styles.icon}>🔍</span>
        <input
          className={styles.input}
          placeholder="Buscar paciente..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {loading && <span className={styles.spinner}>⟳</span>}
      </div>
      {open && results.length > 0 && (
        <div className={styles.dropdown}>
          {results.map((p) => (
            <button key={p.id} className={styles.item} onClick={() => handleSelect(p)}>
              <span className={styles.itemName}>{p.name}</span>
              {p.phone && <span className={styles.itemPhone}>{p.phone}</span>}
            </button>
          ))}
        </div>
      )}
      {open && results.length === 0 && !loading && query.trim() && (
        <div className={styles.dropdown}>
          <p className={styles.empty}>Nenhum paciente encontrado.</p>
        </div>
      )}
    </div>
  )
}
