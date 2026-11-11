// Leitura e gravação de nutri_avaliacoes (histórico de avaliações e planos alimentares por paciente).
// Roda no navegador com o cliente autenticado; o isolamento por clínica e a permissão do módulo prontuário
// são das policies da tabela (supabase/migrations/20261113_nutri_avaliacoes.sql).
//
// Degradação limpa: se a tabela ainda não existe, ou as policies ainda não foram aplicadas (a gravação é
// negada), as funções devolvem `indisponivel` com o motivo em vez de lançar erro; a tela continua útil
// (cálculos, plano e impressão funcionam; só não persiste).

import { supabase } from '@/lib/supabase'
import { motivoDoErro, type Indisponibilidade } from './erros'

export type TipoNutri = 'avaliacao' | 'plano'

export interface LinhaNutri {
  id: string
  tipo: TipoNutri
  /** AAAA-MM-DD */
  data: string
  dados: unknown
  created_at: string
}

export type ResultadoLista = { ok: true; linhas: LinhaNutri[] } | { ok: false; motivo: Indisponibilidade }
export type ResultadoGravacao = { ok: true; id: string } | { ok: false; motivo: Indisponibilidade }

export async function listarNutri(patientId: string, tipo: TipoNutri): Promise<ResultadoLista> {
  try {
    const { data, error } = await supabase
      .from('nutri_avaliacoes')
      .select('id, tipo, data, dados, created_at')
      .eq('patient_id', patientId)
      .eq('tipo', tipo)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) return { ok: false, motivo: motivoDoErro(error) }
    return { ok: true, linhas: (data ?? []) as LinhaNutri[] }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

/** Insere (sem `id`) ou atualiza (com `id`). Nova avaliação nunca sobrescreve outra: cada consulta é uma linha. */
export async function salvarNutri(args: {
  id?: string | null
  clinicId: string
  patientId: string
  tipo: TipoNutri
  data: string
  dados: unknown
}): Promise<ResultadoGravacao> {
  try {
    if (args.id) {
      const { error } = await supabase
        .from('nutri_avaliacoes')
        .update({ data: args.data, dados: args.dados })
        .eq('id', args.id)
      return error ? { ok: false, motivo: motivoDoErro(error) } : { ok: true, id: args.id }
    }
    const { data, error } = await supabase
      .from('nutri_avaliacoes')
      .insert({ clinic_id: args.clinicId, patient_id: args.patientId, tipo: args.tipo, data: args.data, dados: args.dados })
      .select('id')
      .single()
    if (error || !data) return { ok: false, motivo: motivoDoErro(error) }
    return { ok: true, id: (data as { id: string }).id }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

export async function excluirNutri(id: string): Promise<{ ok: boolean }> {
  try {
    const { error } = await supabase.from('nutri_avaliacoes').delete().eq('id', id)
    return { ok: !error }
  } catch {
    return { ok: false }
  }
}

export const MENSAGEM_INDISPONIVEL: Record<Indisponibilidade, string> = {
  sem_tabela: 'O histórico de Nutrição ainda não está ativo nesta conta. Os cálculos funcionam, mas não é possível salvar.',
  sem_permissao: 'Não foi possível salvar: falta permissão de edição do prontuário ou a ativação do histórico de Nutrição no banco.',
  erro: 'Não foi possível salvar agora. Seus dados continuam na tela; tente de novo.',
}
