// Detecta se o banco já tem lote e validade no estoque (migration 20261114_estoque_lotes.sql):
// a tabela stock_lots e as colunas lot_id, patient_id e appointment_id em stock_movements.
// Sem a migration o Estoque segue exatamente como antes (sem lote, sem validade, sem rastreio).
import { supabase } from '@/lib/supabase'
import { isMissingSchemaError } from '@/lib/agenda/extrasSchema'

let cached: boolean | null = null
let negativeAt = 0
let inflight: Promise<boolean> | null = null
// "ainda não existe" é relembrado por pouco tempo: depois de aplicar a migration, a tela passa a ver sem recarregar
const NEGATIVE_TTL_MS = 2 * 60 * 1000

async function probeOne(query: PromiseLike<{ error: { code?: string | null; message?: string | null } | null }>): Promise<boolean | null> {
  const { error } = await query
  if (!error) return true
  // erro de outro tipo (rede, permissão): não conclui nada
  return isMissingSchemaError(error) ? false : null
}

/** true quando tabela e colunas existem. Falha de rede ou permissão conta como "não disponível" e não é guardada. */
export function probeEstoqueLotes(): Promise<boolean> {
  if (cached === true) return Promise.resolve(true)
  if (cached === false && Date.now() - negativeAt < NEGATIVE_TTL_MS) return Promise.resolve(false)
  if (!inflight) {
    inflight = Promise.all([
      probeOne(supabase.from('stock_lots').select('id').limit(1)),
      probeOne(supabase.from('stock_movements').select('lot_id, patient_id, appointment_id').limit(1)),
    ])
      .then(([table, cols]) => {
        if (table === null || cols === null) return false
        cached = table && cols
        negativeAt = Date.now()
        return cached
      })
      .catch(() => false)
      .finally(() => { inflight = null })
  }
  return inflight
}

/** Esquece o resultado (testes, ou logo depois de aplicar a migration). */
export function resetEstoqueLotesCache() { cached = null; negativeAt = 0 }
