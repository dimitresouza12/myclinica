// Classificação dos erros do Supabase na gravação da Nutrição (pura, testável).

export type Indisponibilidade = 'sem_tabela' | 'sem_permissao' | 'erro'

export interface ErroSupabase { code?: string; message?: string }

/** Traduz o erro do Supabase/PostgREST no motivo que a tela explica. */
export function motivoDoErro(e: ErroSupabase | null | undefined): Indisponibilidade {
  const code = e?.code ?? ''
  const msg = (e?.message ?? '').toLowerCase()
  // 42P01: relation does not exist; PGRST205/PGRST204: tabela ou coluna fora do cache do schema
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST204' || msg.includes('schema cache') || msg.includes('does not exist')) return 'sem_tabela'
  // 42501: negado pela RLS (sem policy ainda, ou sem permissão de edição do prontuário)
  if (code === '42501' || msg.includes('row-level security') || msg.includes('permission denied')) return 'sem_permissao'
  return 'erro'
}

