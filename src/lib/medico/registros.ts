// Leitura e gravação de medico_registros (histórico por paciente de pedidos de exames, receitas e medidas de
// crescimento da Medicina). Roda no navegador com o cliente autenticado; o isolamento por clínica, a permissão do
// módulo prontuário e a restrição por área do profissional são das policies da tabela
// (supabase/migrations/20261133_medicina_exames_receita.sql).
//
// Degradação limpa (mesmo padrão de src/lib/nutri/storage.ts): se a tabela ainda não existe, ou a gravação é negada,
// as funções devolvem `indisponivel` com o motivo em vez de lançar erro. A tela continua útil: montar o pedido ou a
// receita e imprimir funcionam; só não persiste.

import { supabase } from '@/lib/supabase'
import { motivoDoErro, type Indisponibilidade } from '@/lib/nutri/erros'

export type { Indisponibilidade }
export type TipoMedico = 'pedido_exames' | 'receita' | 'crescimento'

export interface LinhaMedico {
  id: string
  tipo: TipoMedico
  /** AAAA-MM-DD */
  data: string
  dados: unknown
  created_at: string
}

export type ResultadoLista = { ok: true; linhas: LinhaMedico[] } | { ok: false; motivo: Indisponibilidade }
export type ResultadoGravacao = { ok: true; id: string } | { ok: false; motivo: Indisponibilidade }

export async function listarMedico(patientId: string, tipo: TipoMedico): Promise<ResultadoLista> {
  try {
    const { data, error } = await supabase
      .from('medico_registros')
      .select('id, tipo, data, dados, created_at')
      .eq('patient_id', patientId)
      .eq('tipo', tipo)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) return { ok: false, motivo: motivoDoErro(error) }
    return { ok: true, linhas: (data ?? []) as LinhaMedico[] }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

/** Insere (sem `id`) ou atualiza (com `id`). Um registro novo nunca sobrescreve outro: cada pedido, receita ou medida é uma linha. */
export async function salvarMedico(args: {
  id?: string | null
  clinicId: string
  patientId: string
  tipo: TipoMedico
  data: string
  dados: unknown
}): Promise<ResultadoGravacao> {
  try {
    if (args.id) {
      const { error } = await supabase.from('medico_registros').update({ data: args.data, dados: args.dados }).eq('id', args.id)
      return error ? { ok: false, motivo: motivoDoErro(error) } : { ok: true, id: args.id }
    }
    const { data, error } = await supabase
      .from('medico_registros')
      .insert({ clinic_id: args.clinicId, patient_id: args.patientId, tipo: args.tipo, data: args.data, dados: args.dados })
      .select('id')
      .single()
    if (error || !data) return { ok: false, motivo: motivoDoErro(error) }
    return { ok: true, id: (data as { id: string }).id }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

export async function excluirMedico(id: string): Promise<{ ok: boolean }> {
  try {
    const { error } = await supabase.from('medico_registros').delete().eq('id', id)
    return { ok: !error }
  } catch {
    return { ok: false }
  }
}

export const MENSAGEM_INDISPONIVEL: Record<Indisponibilidade, string> = {
  sem_tabela: 'O histórico ainda não está disponível nesta clínica (falta atualizar o banco de dados). Você pode montar e imprimir normalmente; só não será guardado no prontuário.',
  sem_permissao: 'Você não tem permissão para guardar no prontuário. Peça a quem administra a clínica. Montar e imprimir continuam funcionando.',
  erro: 'Não foi possível acessar o histórico agora. Tente de novo em instantes.',
}
