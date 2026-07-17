'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { Portal } from '@/components/ui/Portal'
import type { Patient } from '@/types'
import styles from './GlobalSearch.module.css'

export function GlobalSearch() {
  const { clinic } = useAuthStore()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Patient[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 })
  const wrapRef = useRef<HTMLDivElement>(null)

  const updatePos = useCallback(() => {
    if (wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect()
      setDropPos({ top: r.bottom + 6, left: r.left, width: r.width })
    }
  }, [])

  useEffect(() => {
    if (open) updatePos()
  }, [open, updatePos])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!query.trim() || !clinic?.id) { setResults([]); setOpen(false); return }
    const t = setTimeout(async () => {
      setLoading(true)
      const term = query.trim().toLowerCase()
      const { data } = await supabase
        .from('patients')
        .select('id, name, phone, pet_name')
        .eq('clinic_id', clinic.id)
        .eq('is_active', true)
        .or(`name.ilike.%${term}%,phone.ilike.%${term}%,pet_name.ilike.%${term}%`)
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

  const showDropdown = open && (results.length > 0 || (!loading && query.trim().length > 0))

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <div className={styles.inputWrap}>
        <span className={styles.icon}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </span>
        <input
          className={styles.input}
          placeholder="Buscar paciente..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {loading && <span className={styles.spinner}>⟳</span>}
      </div>

      {showDropdown && (
        <Portal>
          <div
            className={styles.dropdown}
            style={{ top: dropPos.top, left: dropPos.left, width: dropPos.width }}
          >
            {results.length > 0 ? results.map(p => (
              <button key={p.id} className={styles.item} onClick={() => handleSelect(p)}>
                <span className={styles.itemName}>{p.name}{p.pet_name ? ` · ${p.pet_name}` : ''}</span>
                {p.phone && <span className={styles.itemPhone}>{p.phone}</span>}
              </button>
            )) : (
              <p className={styles.empty}>Nenhum paciente encontrado.</p>
            )}
          </div>
        </Portal>
      )}
    </div>
  )
}
