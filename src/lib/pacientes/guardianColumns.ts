'use client'
// Detecta se o banco já tem as colunas do responsável legal (migration 20261120_patients_responsavel_legal.sql).
// Enquanto ela não for aplicada, a tela esconde os campos e não os envia: o cadastro continua gravando como antes.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isMissingSchemaError } from '@/lib/agenda/extrasSchema'
import { GUARDIAN_COLUMNS } from './responsavel'

let cached: boolean | null = null
let negativeAt = 0
let inflight: Promise<boolean> | null = null
// "ainda não existe" é relembrado por pouco tempo: depois de colar o SQL a tela passa a ver sem recarregar
const NEGATIVE_TTL_MS = 2 * 60 * 1000

export function probeGuardianColumns(): Promise<boolean> {
  if (cached === true || (cached === false && Date.now() - negativeAt < NEGATIVE_TTL_MS)) return Promise.resolve(cached)
  if (!inflight) {
    inflight = Promise.resolve(supabase.from('patients').select(GUARDIAN_COLUMNS.join(', ')).limit(1))
      .then(({ error }) => {
        if (!error) { cached = true; return true }
        // erro de outro tipo (rede, permissão): não conclui nada e tenta de novo na próxima abertura
        if (!isMissingSchemaError(error)) return false
        cached = false
        negativeAt = Date.now()
        return false
      })
      .catch(() => false)
      .finally(() => { inflight = null })
  }
  return inflight
}

/** Esquece o resultado (depois de uma gravação que provou que as colunas não existem, por exemplo). */
export function markGuardianColumnsMissing() { cached = false; negativeAt = Date.now() }

/** true quando as colunas guardian_* existem no banco. */
export function useGuardianColumns(): boolean {
  const [ok, setOk] = useState<boolean>(cached ?? false)
  useEffect(() => {
    let live = true
    probeGuardianColumns().then(v => { if (live) setOk(v) })
    return () => { live = false }
  }, [])
  return ok
}
