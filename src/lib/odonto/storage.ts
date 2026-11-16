// Leitura e gravação do periograma (odonto_periogramas) e da ficha de ortodontia (odonto_ortodontia), mais as fotos da
// ortodontia no bucket `pacientes`. Roda no navegador com o cliente autenticado; o isolamento por clínica e a permissão do
// prontuário são das policies (supabase/migrations/20261131_odonto_periograma_orto.sql).
//
// Degradação limpa, como a Nutrição: se a tabela ainda não existe ou a gravação é negada, as funções devolvem
// `indisponivel` com o motivo em vez de lançar erro; a tela continua útil (cálculos e impressão), só não persiste.

import { supabase } from '@/lib/supabase'
import { motivoDoErro, type Indisponibilidade } from '@/lib/nutri/erros'

export type TabelaOdonto = 'odonto_periogramas' | 'odonto_ortodontia'

export interface LinhaOdonto {
  id: string
  /** AAAA-MM-DD */
  data: string
  dados: unknown
  created_at: string
}

export type ResultadoLista = { ok: true; linhas: LinhaOdonto[] } | { ok: false; motivo: Indisponibilidade }
export type ResultadoGravacao = { ok: true; id: string } | { ok: false; motivo: Indisponibilidade }

export async function listarOdonto(tabela: TabelaOdonto, patientId: string): Promise<ResultadoLista> {
  try {
    const { data, error } = await supabase
      .from(tabela)
      .select('id, data, dados, created_at')
      .eq('patient_id', patientId)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) return { ok: false, motivo: motivoDoErro(error) }
    return { ok: true, linhas: (data ?? []) as LinhaOdonto[] }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

/** Insere (sem `id`) ou atualiza (com `id`). Um exame ou tratamento novo nunca sobrescreve outro. */
export async function salvarOdonto(args: {
  tabela: TabelaOdonto
  id?: string | null
  clinicId: string
  patientId: string
  data: string
  dados: unknown
}): Promise<ResultadoGravacao> {
  try {
    if (args.id) {
      const { error } = await supabase.from(args.tabela).update({ data: args.data, dados: args.dados }).eq('id', args.id)
      return error ? { ok: false, motivo: motivoDoErro(error) } : { ok: true, id: args.id }
    }
    const { data, error } = await supabase
      .from(args.tabela)
      .insert({ clinic_id: args.clinicId, patient_id: args.patientId, data: args.data, dados: args.dados })
      .select('id')
      .single()
    if (error || !data) return { ok: false, motivo: motivoDoErro(error) }
    return { ok: true, id: (data as { id: string }).id }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

export async function excluirOdonto(tabela: TabelaOdonto, id: string): Promise<{ ok: boolean }> {
  try {
    const { error } = await supabase.from(tabela).delete().eq('id', id)
    return { ok: !error }
  } catch {
    return { ok: false }
  }
}

export const MENSAGEM_PERIOGRAMA: Record<Indisponibilidade, string> = {
  sem_tabela: 'O histórico do periograma ainda não está ativo nesta conta. Dá para preencher e imprimir, mas não é possível salvar.',
  sem_permissao: 'Não foi possível salvar: falta permissão de edição do prontuário ou a ativação do periograma no banco.',
  erro: 'Não foi possível salvar agora. Seus dados continuam na tela; tente de novo.',
}
export const MENSAGEM_ORTODONTIA: Record<Indisponibilidade, string> = {
  sem_tabela: 'A ficha de ortodontia ainda não está ativa nesta conta. Dá para preencher e imprimir, mas não é possível salvar.',
  sem_permissao: 'Não foi possível salvar: falta permissão de edição do prontuário ou a ativação da ortodontia no banco.',
  erro: 'Não foi possível salvar agora. Seus dados continuam na tela; tente de novo.',
}

// ── Fotos da ortodontia (bucket `pacientes`, pasta ortodontia/<clínica>/<paciente>/) ──

const BUCKET = 'pacientes'
export const VALIDADE_URL_FOTO = 3600

/** Sobe uma foto e devolve o caminho gravado. Lança com mensagem legível se falhar. */
export async function subirFotoOrto(path: string, file: File, mime: string): Promise<string> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: mime || file.type })
  if (error) throw new Error(`Erro ao enviar ${file.name}: ${error.message}`)
  return path
}

/** Apaga fotos que ninguém mais usa. Falha silenciosa: sobra de arquivo no armazenamento não pode travar a tela. */
export async function removerFotosOrto(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  try { await supabase.storage.from(BUCKET).remove(paths) } catch { /* melhor esforço */ }
}

/** Endereços temporários para mostrar as fotos (o bucket é privado). Caminho que falhar fica de fora. */
export async function urlsDasFotos(paths: string[]): Promise<Record<string, string>> {
  const unicos = [...new Set(paths)]
  if (unicos.length === 0) return {}
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(unicos, VALIDADE_URL_FOTO)
    if (error || !data) return {}
    const out: Record<string, string> = {}
    for (const r of data) if (r.path && r.signedUrl) out[r.path] = r.signedUrl
    return out
  } catch {
    return {}
  }
}
