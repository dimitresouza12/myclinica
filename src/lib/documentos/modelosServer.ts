// Acesso ao banco dos modelos de texto da clínica (document_text_models). SÓ NO SERVIDOR.
//
// Cliente de serviço (a tabela tem RLS ligado e nenhuma policy de escrita para o navegador), por isso TODA consulta
// é escopada à clínica vinda do usuário logado (nunca do corpo da requisição). Sem a tabela (migração ainda não
// aplicada) devolve motivo 'sem_tabela' e o app segue com o modelo padrão do sistema.

import { getAdminClient } from '@/lib/supabaseAdmin'
import { motivoDoErro, type Indisponibilidade } from '@/lib/nutri/erros'
import type { ModeloTextos } from './atestado'

export type ModeloFalha = { ok: false; motivo: Indisponibilidade }

export const MENSAGEM_MODELO_FALHA: Record<Indisponibilidade, string> = {
  sem_tabela: 'Os modelos próprios da clínica ainda não estão ativos nesta conta.',
  sem_permissao: 'Sem permissão para concluir. Tente de novo.',
  erro: 'Não foi possível concluir agora. Tente de novo em instantes.',
}

function falha(e: { code?: string; message?: string } | null | undefined, rota: string): ModeloFalha {
  const motivo = motivoDoErro(e)
  // só o código: nunca o texto do modelo
  if (motivo !== 'sem_tabela') console.error(`[documentos:modelos:${rota}]`, e?.code ?? '')
  return { ok: false, motivo }
}

export interface ModeloClinica { key: string; name: string; body: string; source: 'foto_ia' | 'manual'; updatedAt: string }

export async function listarModelos(clinicId: string): Promise<{ ok: true; modelos: ModeloClinica[] } | ModeloFalha> {
  const { data, error } = await getAdminClient().from('document_text_models').select('model_key, name, body, source, updated_at')
    .eq('clinic_id', clinicId).limit(20)
  if (error) return falha(error, 'list')
  return {
    ok: true,
    modelos: (data ?? []).map(r => ({
      key: r.model_key as string, name: r.name as string, body: r.body as string,
      source: r.source === 'manual' ? 'manual' : 'foto_ia', updatedAt: r.updated_at as string,
    })),
  }
}

/** Mapa `chave -> texto` no formato que buildDocText aceita. */
export function modelosComoMapa(modelos: ModeloClinica[]): ModeloTextos {
  return Object.fromEntries(modelos.map(m => [m.key, m.body]))
}

export async function salvarModelo(
  clinicId: string, userId: string, input: { key: string; name: string; body: string; source: 'foto_ia' | 'manual' },
): Promise<{ ok: true; modelo: ModeloClinica } | ModeloFalha> {
  const { data, error } = await getAdminClient().from('document_text_models')
    .upsert({ clinic_id: clinicId, model_key: input.key, name: input.name, body: input.body, source: input.source, created_by: userId }, { onConflict: 'clinic_id,model_key' })
    .select('model_key, name, body, source, updated_at').single()
  if (error || !data) return falha(error, 'save')
  return { ok: true, modelo: { key: data.model_key as string, name: data.name as string, body: data.body as string, source: data.source === 'manual' ? 'manual' : 'foto_ia', updatedAt: data.updated_at as string } }
}

/** Volta ao modelo padrão do sistema para a chave (apaga o modelo da clínica). */
export async function removerModelo(clinicId: string, key: string): Promise<{ ok: true } | ModeloFalha> {
  const { error } = await getAdminClient().from('document_text_models').delete().eq('clinic_id', clinicId).eq('model_key', key)
  if (error) return falha(error, 'delete')
  return { ok: true }
}
