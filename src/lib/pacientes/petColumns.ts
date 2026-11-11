'use client'
// Detecta se o banco já tem as colunas extras do pet (sexo, nascimento, microchip).
// Enquanto a migration 20261111_vet_pet_fields_professional_rqe.sql não for aplicada, a tela esconde esses campos e não os envia.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

let cached: boolean | null = null
let inflight: Promise<boolean> | null = null

async function probe(): Promise<boolean> {
  if (cached !== null) return cached
  if (!inflight) {
    inflight = Promise.resolve(supabase.from('patients').select('pet_sex, pet_birth_date, pet_microchip').limit(1))
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

/** true quando as colunas extras do pet existem no banco. */
export function usePetExtraColumns(): boolean {
  const [ok, setOk] = useState<boolean>(cached ?? false)
  useEffect(() => {
    let live = true
    probe().then(v => { if (live) setOk(v) })
    return () => { live = false }
  }, [])
  return ok
}
