// Detecta se o banco já tem as colunas do fluxo de atendimento (migration 20261119_atendimento_fluxo.sql).
// Sem elas, o fluxo fica escondido: a Agenda e o Prontuário seguem exatamente como antes (padrão de extrasSchema.ts).
import { supabase } from '@/lib/supabase'
import { isMissingSchemaError } from '@/lib/agenda/extrasSchema'

let cached: boolean | null = null
let inflight: Promise<boolean> | null = null

/** true = colunas presentes. Falha de rede/RLS não conclui nada: devolve false sem guardar, e tenta de novo depois. */
export function probeAtendimentoSchema(): Promise<boolean> {
  if (cached !== null) return Promise.resolve(cached)
  if (!inflight) {
    inflight = Promise.resolve(
      supabase.from('appointments').select('called_at, started_at, finished_at, started_by, finished_by, arrived_at').limit(1),
    )
      .then(({ error }) => {
        if (!error) { cached = true; return true }
        if (isMissingSchemaError(error)) { cached = false; return false }
        return false
      })
      .catch(() => false)
      .finally(() => { inflight = null })
  }
  return inflight
}

/** Esquece o resultado (depois de aplicar a migration sem recarregar a página, ou em testes). */
export function resetAtendimentoSchemaCache() { cached = null }
