// Detecta se o banco já tem o cadastro de convênios (migration 20261116_convenios.sql): a tabela insurance_plans e as
// colunas novas de patients. Sem a migration o app segue como antes: convênio é só o texto livre do paciente, e a
// tela de convênios avisa que o cadastro ainda não está habilitado (as guias, a produção e o recibo funcionam
// mesmo assim, com os dados que já existem).
'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isMissingSchemaError } from '@/lib/agenda/extrasSchema'

export interface ConveniosSchema {
  /** tabela insurance_plans existe */
  plans: boolean
  /** patients.insurance_plan_id, convenio_validade, convenio_titular, payer_name, payer_cpf existem */
  patientColumns: boolean
}

export const PATIENT_EXTRA_COLUMNS = 'insurance_plan_id, convenio_validade, convenio_titular, payer_name, payer_cpf'

const NONE: ConveniosSchema = { plans: false, patientColumns: false }
let cached: ConveniosSchema | null = null
let negativeAt = 0
let inflight: Promise<ConveniosSchema> | null = null
// "ainda não existe" é relembrado por pouco tempo: depois de aplicar a migration a tela passa a ver sem recarregar
const NEGATIVE_TTL_MS = 2 * 60 * 1000

async function probeOne(query: PromiseLike<{ error: { code?: string | null; message?: string | null } | null }>): Promise<boolean | null> {
  const { error } = await query
  if (!error) return true
  // erro de outro tipo (rede, permissão): não conclui nada
  return isMissingSchemaError(error) ? false : null
}

export function probeConveniosSchema(): Promise<ConveniosSchema> {
  if (cached && (cached.plans && cached.patientColumns || Date.now() - negativeAt < NEGATIVE_TTL_MS)) return Promise.resolve(cached)
  if (!inflight) {
    inflight = Promise.all([
      probeOne(supabase.from('insurance_plans').select('id').limit(1)),
      probeOne(supabase.from('patients').select(PATIENT_EXTRA_COLUMNS).limit(1)),
    ])
      .then(([plans, cols]) => {
        // inconclusivo (rede, permissão): não guarda, tenta de novo na próxima abertura
        if (plans === null || cols === null) return NONE
        cached = { plans, patientColumns: cols }
        negativeAt = Date.now()
        return cached
      })
      .catch(() => NONE)
      .finally(() => { inflight = null })
  }
  return inflight
}

/** Esquece o resultado (testes, ou logo depois de aplicar a migration). */
export function resetConveniosSchemaCache() { cached = null; negativeAt = 0 }

/** Estado do banco para os componentes; `loaded` só vira true depois da checagem. */
export function useConveniosSchema(): ConveniosSchema & { loaded: boolean } {
  const [state, setState] = useState<ConveniosSchema & { loaded: boolean }>({ ...(cached ?? NONE), loaded: !!cached })
  useEffect(() => {
    let live = true
    probeConveniosSchema().then(v => { if (live) setState({ ...v, loaded: true }) })
    return () => { live = false }
  }, [])
  return state
}
