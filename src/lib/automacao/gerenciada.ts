// Quais clínicas têm a automação do n8n cuidando das mensagens (clinic_whatsapp.automacao_gerenciada).
// Só no servidor (service role).
//
// Falha aberta SÓ quando a coluna ainda não existe (migração 20261139 não aplicada: Postgres 42703 /
// PostgREST PGRST204): nesse caso nenhuma clínica pode estar gerenciada e a rotina antiga segue como estava.
// Qualquer outro erro (tempo esgotado, rede, permissão) LANÇA: seguir sem saber quais clínicas são gerenciadas
// mandaria a confirmação em dobro. Quem chama deixa a rodada falhar e tenta na próxima.

import { getAdminClient } from '@/lib/supabaseAdmin'

const COLUMN_MISSING = new Set(['42703', 'PGRST204'])

export async function automacaoGerenciadaIds(clinicIds: string[]): Promise<Set<string>> {
  if (clinicIds.length === 0) return new Set()
  const { data, error } = await getAdminClient()
    .from('clinic_whatsapp')
    .select('clinic_id, automacao_gerenciada')
    .in('clinic_id', clinicIds)
    .eq('automacao_gerenciada', true)
  if (error) {
    if (error.code && COLUMN_MISSING.has(error.code)) {
      console.warn('[automacao] coluna automacao_gerenciada ainda não existe; seguindo sem pular clínicas')
      return new Set()
    }
    throw new Error(`não foi possível ler automacao_gerenciada (erro ${error.code ?? 'desconhecido'})`)
  }
  return new Set(
    ((data ?? []) as { clinic_id: string; automacao_gerenciada?: unknown }[])
      .filter(r => r.automacao_gerenciada === true)
      .map(r => r.clinic_id),
  )
}
