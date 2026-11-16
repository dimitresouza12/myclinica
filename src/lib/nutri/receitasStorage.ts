// Leitura e gravação do banco de receitas da clínica (nutri_receitas). Roda no navegador com o cliente autenticado;
// clínica, permissão do módulo prontuário e escopo por área são das policies
// (supabase/migrations/20261134_nutri_substituicoes_receitas_diario.sql).
//
// Degradação limpa: tabela ausente, policy ainda não aplicada ou falha de rede viram `indisponivel` com o motivo,
// nunca uma exceção. O plano alimentar guarda uma cópia da receita anexada, então ele não depende desta tabela.

import { supabase } from '@/lib/supabase'
import { motivoDoErro, type Indisponibilidade } from './erros'
import { receitaDaLinha, type DadosReceita, type Receita } from './receitas'

export type ResultadoReceitas = { ok: true; linhas: Receita[] } | { ok: false; motivo: Indisponibilidade }
export type ResultadoGravacaoReceita = { ok: true; id: string } | { ok: false; motivo: Indisponibilidade }

export const MENSAGEM_RECEITAS: Record<Indisponibilidade, string> = {
  sem_tabela: 'O banco de receitas ainda não está ativo nesta conta. Os planos alimentares continuam funcionando.',
  sem_permissao: 'Não foi possível acessar as receitas: falta permissão do prontuário ou a ativação do banco de receitas no banco de dados.',
  erro: 'Não foi possível concluir agora. Tente de novo em instantes.',
}

const COLUNAS = 'id, titulo, porcoes, tempo_preparo_min, ingredientes, modo_preparo, observacoes, created_at'

export async function listarReceitas(clinicId: string): Promise<ResultadoReceitas> {
  try {
    const { data, error } = await supabase.from('nutri_receitas').select(COLUNAS).eq('clinic_id', clinicId).order('titulo', { ascending: true }).limit(1000)
    if (error) return { ok: false, motivo: motivoDoErro(error) }
    return { ok: true, linhas: ((data ?? []) as Record<string, unknown>[]).map(receitaDaLinha) }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

/** Insere (sem `id`) ou atualiza (com `id`). */
export async function salvarReceita(args: { id?: string | null; clinicId: string; dados: DadosReceita }): Promise<ResultadoGravacaoReceita> {
  try {
    if (args.id) {
      const { error } = await supabase.from('nutri_receitas').update({ ...args.dados }).eq('id', args.id).eq('clinic_id', args.clinicId)
      return error ? { ok: false, motivo: motivoDoErro(error) } : { ok: true, id: args.id }
    }
    const { data, error } = await supabase.from('nutri_receitas').insert({ clinic_id: args.clinicId, ...args.dados }).select('id').single()
    if (error || !data) return { ok: false, motivo: motivoDoErro(error) }
    return { ok: true, id: (data as { id: string }).id }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

export async function excluirReceita(args: { id: string; clinicId: string }): Promise<{ ok: boolean }> {
  try {
    const { error } = await supabase.from('nutri_receitas').delete().eq('id', args.id).eq('clinic_id', args.clinicId)
    return { ok: !error }
  } catch {
    return { ok: false }
  }
}
