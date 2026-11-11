'use client'
// Detecta se o banco já tem professionals.rqe (migration 20261111_vet_pet_fields_professional_rqe.sql).
// Enquanto ela não for aplicada, a tela esconde o campo RQE e não o envia no insert/update
// (mandar coluna inexistente faria o salvamento do profissional inteiro falhar).
// A leitura já é segura: as queries de professionals usam select('*').
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

let cached: boolean | null = null
let inflight: Promise<boolean> | null = null

async function probe(): Promise<boolean> {
  if (cached !== null) return cached
  if (!inflight) {
    inflight = Promise.resolve(supabase.from('professionals').select('rqe').limit(1))
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

/** true quando a coluna professionals.rqe existe no banco. */
export function useProfessionalRqeColumn(): boolean {
  const [ok, setOk] = useState<boolean>(cached ?? false)
  useEffect(() => {
    let live = true
    probe().then(v => { if (live) setOk(v) })
    return () => { live = false }
  }, [])
  return ok
}
