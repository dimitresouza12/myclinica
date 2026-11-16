'use client'
// Detecta se o banco já tem a coluna patients.tutor_id (vínculo tutor-pet).
// Enquanto a migration 20261135_vet_internacao_exames.sql não for aplicada, o cadastro de pet segue como antes
// (contato copiado, sem vínculo) e a tela não envia nem pede a coluna.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

let cached: boolean | null = null
let inflight: Promise<boolean> | null = null

async function probe(): Promise<boolean> {
  if (cached !== null) return cached
  if (!inflight) {
    inflight = Promise.resolve(supabase.from('patients').select('tutor_id').limit(1))
      .then(({ error }) => {
        // 42703 = coluna inexistente (Postgres); PostgREST devolve PGRST204/400 com a mesma mensagem
        const missing = !!error && /column|schema cache|42703|PGRST204/i.test(`${error.code ?? ''} ${error.message ?? ''}`)
        // outro tipo de erro (rede, RLS): não conclui nada e tenta de novo na próxima abertura
        if (error && !missing) return false
        cached = !error
        return cached
      })
      .catch(() => false)
      .finally(() => { inflight = null })
  }
  return inflight
}

/** true quando a coluna do vínculo tutor-pet existe no banco. */
export function useTutorColumn(): boolean {
  const [ok, setOk] = useState<boolean>(cached ?? false)
  useEffect(() => {
    let live = true
    probe().then(v => { if (live) setOk(v) })
    return () => { live = false }
  }, [])
  return ok
}
