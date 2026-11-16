// Leitura do diário alimentar do paciente (nutri_diario) na ficha da nutricionista. Roda no navegador com o cliente
// autenticado; clínica, permissão do módulo prontuário e escopo por área são das policies
// (supabase/migrations/20261134_nutri_substituicoes_receitas_diario.sql). A tabela é só de leitura aqui: quem grava é
// a página do paciente, pelo servidor.
//
// Degradação limpa: tabela ausente ou sem permissão viram `indisponivel` com o motivo, nunca uma exceção.

import { supabase } from '@/lib/supabase'
import { motivoDoErro, type Indisponibilidade } from './erros'
import { BUCKET_DIARIO, type RegistroDiario } from './diario'

export type ResultadoDiario = { ok: true; linhas: RegistroDiario[] } | { ok: false; motivo: Indisponibilidade }

export const MENSAGEM_DIARIO: Record<Indisponibilidade, string> = {
  sem_tabela: 'O diário alimentar ainda não está ativo nesta conta.',
  sem_permissao: 'Não foi possível acessar o diário: falta permissão do prontuário ou a ativação do diário alimentar no banco de dados.',
  erro: 'Não foi possível carregar o diário agora. Tente de novo em instantes.',
}

/** Registros do paciente desde uma data (AAAA-MM-DD), do mais recente ao mais antigo. */
export async function listarDiario(clinicId: string, patientId: string, desde: string): Promise<ResultadoDiario> {
  try {
    const { data, error } = await supabase.from('nutri_diario').select('id, dia, refeicao, horario, descricao, foto_path, created_at')
      .eq('clinic_id', clinicId).eq('patient_id', patientId).gte('dia', desde)
      .order('dia', { ascending: false }).order('created_at', { ascending: false }).limit(500)
    if (error) return { ok: false, motivo: motivoDoErro(error) }
    return { ok: true, linhas: (data ?? []) as RegistroDiario[] }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

/** URLs assinadas (1 hora) das fotos, por caminho. Falha vira mapa parcial: o registro aparece sem foto. */
export async function urlsDasFotosDiario(paths: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const unicos = [...new Set(paths.filter(Boolean))]
  if (unicos.length === 0) return mapa
  try {
    const { data } = await supabase.storage.from(BUCKET_DIARIO).createSignedUrls(unicos, 3600)
    for (const s of data ?? []) if (s.path && s.signedUrl) mapa.set(s.path, s.signedUrl)
  } catch {
    // sem foto na tela
  }
  return mapa
}
