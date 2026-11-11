'use client'
// Procura cadastro parecido enquanto a recepção digita (RPC find_possible_duplicate_patients).
// Se o RPC não existe ainda ou der erro, não mostra nada e não bloqueia: o cadastro segue como antes.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  buildDuplicateQuery, duplicateQueryKey, hasCpfConflict, parseDuplicateRows, type DuplicateMatch,
} from './duplicados'

export const DUPLICATE_DEBOUNCE_MS = 400

export function usePossibleDuplicates(input: {
  enabled: boolean
  name?: string
  birthISO?: string | null
  phone?: string
  cpf?: string
}): { matches: DuplicateMatch[]; cpfConflict: boolean } {
  const { enabled, name, birthISO, phone, cpf } = input
  const query = useMemo(
    () => (enabled ? buildDuplicateQuery({ name, birthISO, phone, cpf }) : null),
    [enabled, name, birthISO, phone, cpf],
  )
  const key = duplicateQueryKey(query)
  const [result, setResult] = useState<{ key: string; matches: DuplicateMatch[] }>({ key: '', matches: [] })

  useEffect(() => {
    if (!query) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc('find_possible_duplicate_patients', query)
        if (cancelled) return
        setResult({ key, matches: error ? [] : parseDuplicateRows(data) })
      } catch {
        if (!cancelled) setResult({ key, matches: [] })
      }
    }, DUPLICATE_DEBOUNCE_MS)
    return () => { cancelled = true; clearTimeout(timer) }
    // `query` é derivado de `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // resultado de uma pergunta antiga não vale para o que está digitado agora
  const matches = key && result.key === key ? result.matches : []
  return { matches, cpfConflict: hasCpfConflict(matches) }
}
