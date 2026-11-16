// Leitura e gravação da fisioterapia (biblioteca de exercícios, prescrição, execução e goniometria).
// Roda no navegador com o cliente autenticado; clínica e permissão do módulo prontuário são das policies
// (supabase/migrations/20261130_fisio_exercicios_goniometria.sql).
//
// Degradação limpa: tabela ausente, policy ainda não aplicada ou falha de rede viram `indisponivel` com o motivo,
// nunca uma exceção. A tela mostra um aviso neutro e o resto do prontuário segue normal.

import { supabase } from '@/lib/supabase'
import { motivoDoErro, type Indisponibilidade } from '@/lib/nutri/erros'
import { compressImage } from '@/lib/teamChat/compress'
import { hojeBrasil } from '@/lib/brasilDate'
import { BUCKET_FOTOS, caminhoDaFoto, type DadosExercicio, type DadosItem, type Exercicio, type Execucao, type ItemPrescricao, type Prescricao } from './exercicios'
import type { DadosMedida, Medida } from './goniometria'

export type { Indisponibilidade }

export type ResultadoLista<T> = { ok: true; linhas: T[] } | { ok: false; motivo: Indisponibilidade }
export type ResultadoGravacao = { ok: true; id: string } | { ok: false; motivo: Indisponibilidade }

export const MENSAGEM_INDISPONIVEL: Record<Indisponibilidade, string> = {
  sem_tabela: 'Os exercícios e a goniometria ainda não estão ativos nesta conta.',
  sem_permissao: 'Não foi possível acessar: falta permissão do prontuário ou a ativação dos exercícios e da goniometria no banco.',
  erro: 'Não foi possível concluir agora. Tente de novo em instantes.',
}

const COLUNAS_EXERCICIO = 'id, name, description, region, default_sets, default_reps, video_url, image_path, active, created_at'
const COLUNAS_PRESCRICAO = 'id, title, notes, status, started_on, ended_on, professional_id, created_at'
const COLUNAS_ITEM = 'id, prescricao_id, exercicio_id, name, description, region, video_url, image_path, sets, reps, times_per_week, notes, sort_order'
const COLUNAS_MEDIDA = 'id, measured_on, joint, movement, side, mode, angle_deg, reference_deg, note, created_at'

// ── Biblioteca ──────────────────────────────────────────────────────────────

export async function listarExercicios(clinicId: string): Promise<ResultadoLista<Exercicio>> {
  try {
    const { data, error } = await supabase.from('fisio_exercicios').select(COLUNAS_EXERCICIO).eq('clinic_id', clinicId).order('name', { ascending: true })
    if (error) return { ok: false, motivo: motivoDoErro(error) }
    return { ok: true, linhas: (data ?? []) as Exercicio[] }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

/** Insere (sem `id`) ou atualiza (com `id`). `imagePath: undefined` mantém a foto atual; null remove. */
export async function salvarExercicio(args: { id?: string | null; clinicId: string; dados: DadosExercicio; imagePath?: string | null }): Promise<ResultadoGravacao> {
  try {
    const colunas = {
      name: args.dados.name, description: args.dados.description, region: args.dados.region, default_sets: args.dados.default_sets,
      default_reps: args.dados.default_reps, video_url: args.dados.video_url,
      ...(args.imagePath !== undefined ? { image_path: args.imagePath } : {}),
    }
    if (args.id) {
      const { error } = await supabase.from('fisio_exercicios').update({ ...colunas, updated_at: new Date().toISOString() }).eq('id', args.id).eq('clinic_id', args.clinicId)
      return error ? { ok: false, motivo: motivoDoErro(error) } : { ok: true, id: args.id }
    }
    const { data, error } = await supabase.from('fisio_exercicios').insert({ clinic_id: args.clinicId, ...colunas }).select('id').single()
    if (error || !data) return { ok: false, motivo: motivoDoErro(error) }
    return { ok: true, id: (data as { id: string }).id }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

export async function ativarExercicio(args: { id: string; clinicId: string; ativo: boolean }): Promise<{ ok: boolean }> {
  try {
    const { error } = await supabase.from('fisio_exercicios').update({ active: args.ativo, updated_at: new Date().toISOString() }).eq('id', args.id).eq('clinic_id', args.clinicId)
    return { ok: !error }
  } catch {
    return { ok: false }
  }
}

/** Comprime e envia a foto do exercício para o bucket privado, na pasta da clínica. Devolve o caminho ou a mensagem do erro. */
export async function enviarFoto(args: { clinicId: string; exercicioId: string; arquivo: File }): Promise<{ ok: true; path: string } | { ok: false; mensagem: string }> {
  let comprimida
  try {
    comprimida = await compressImage(args.arquivo)
  } catch (e) {
    return { ok: false, mensagem: e instanceof Error && e.message ? e.message : 'Não foi possível preparar a foto. Tente outra imagem.' }
  }
  const path = caminhoDaFoto(args.clinicId, args.exercicioId, comprimida.mime)
  try {
    const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(path, comprimida.blob, { upsert: false, contentType: comprimida.mime })
    if (error) return { ok: false, mensagem: 'Não foi possível enviar a foto. Verifique a conexão e tente de novo.' }
    return { ok: true, path }
  } catch {
    return { ok: false, mensagem: 'Não foi possível enviar a foto. Verifique a conexão e tente de novo.' }
  }
}

/** URLs assinadas (1 hora) das fotos, por caminho. Falha vira mapa parcial: a lista aparece sem foto. */
export async function urlsDasFotos(paths: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const unicos = [...new Set(paths.filter(Boolean))]
  if (unicos.length === 0) return mapa
  try {
    const { data } = await supabase.storage.from(BUCKET_FOTOS).createSignedUrls(unicos, 3600)
    for (const s of data ?? []) if (s.path && s.signedUrl) mapa.set(s.path, s.signedUrl)
  } catch {
    // sem foto na tela
  }
  return mapa
}

/** Apaga a foto do Storage só se nenhum programa já prescrito a usa (a prescrição guarda o próprio caminho). Melhor esforço. */
export async function removerFotoSeOrfa(path: string | null | undefined, clinicId: string): Promise<void> {
  if (!path) return
  try {
    const { count, error } = await supabase.from('fisio_prescricao_itens').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId).eq('image_path', path)
    if (error || (count ?? 1) > 0) return
    const { count: naBiblioteca, error: e2 } = await supabase.from('fisio_exercicios').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId).eq('image_path', path)
    if (e2 || (naBiblioteca ?? 1) > 0) return
    await supabase.storage.from(BUCKET_FOTOS).remove([path])
  } catch {
    // o arquivo fica; não atrapalha nada
  }
}

// ── Prescrição ──────────────────────────────────────────────────────────────

export interface ProgramaCompleto { prescricao: Prescricao; itens: ItemPrescricao[] }

export async function listarProgramas(clinicId: string, patientId: string): Promise<{ ok: true; programas: ProgramaCompleto[] } | { ok: false; motivo: Indisponibilidade }> {
  try {
    const { data: presc, error } = await supabase.from('fisio_prescricoes').select(COLUNAS_PRESCRICAO)
      .eq('clinic_id', clinicId).eq('patient_id', patientId).order('created_at', { ascending: false })
    if (error) return { ok: false, motivo: motivoDoErro(error) }
    const prescricoes = (presc ?? []) as Prescricao[]
    if (prescricoes.length === 0) return { ok: true, programas: [] }
    const { data: it, error: iErr } = await supabase.from('fisio_prescricao_itens').select(COLUNAS_ITEM)
      .eq('clinic_id', clinicId).eq('patient_id', patientId).in('prescricao_id', prescricoes.map(p => p.id)).order('sort_order', { ascending: true })
    if (iErr) return { ok: false, motivo: motivoDoErro(iErr) }
    const itens = (it ?? []) as ItemPrescricao[]
    return { ok: true, programas: prescricoes.map(p => ({ prescricao: p, itens: itens.filter(i => i.prescricao_id === p.id) })) }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

/**
 * Cria (sem `id`) ou atualiza (com `id`) um programa e sincroniza os itens: os que já existem são atualizados no lugar
 * (a marcação do paciente não se perde), os novos entram e os que saíram da lista são removidos.
 */
export async function salvarPrograma(args: {
  id?: string | null
  clinicId: string
  patientId: string
  titulo: string
  orientacoes: string | null
  professionalId: string | null
  itens: DadosItem[]
  /** ids dos itens que existiam e saíram da lista */
  removidos: string[]
}): Promise<ResultadoGravacao> {
  try {
    let id = args.id ?? null
    const novo = !id
    if (id) {
      const { error } = await supabase.from('fisio_prescricoes')
        .update({ title: args.titulo, notes: args.orientacoes, professional_id: args.professionalId, updated_at: new Date().toISOString() })
        .eq('id', id).eq('clinic_id', args.clinicId)
      if (error) return { ok: false, motivo: motivoDoErro(error) }
    } else {
      const { data, error } = await supabase.from('fisio_prescricoes')
        .insert({ clinic_id: args.clinicId, patient_id: args.patientId, title: args.titulo, notes: args.orientacoes, professional_id: args.professionalId })
        .select('id').single()
      if (error || !data) return { ok: false, motivo: motivoDoErro(error) }
      id = (data as { id: string }).id
    }

    const linhas = args.itens.map(i => ({ ...i, clinic_id: args.clinicId, patient_id: args.patientId, prescricao_id: id }))
    const { error: iErr } = await supabase.from('fisio_prescricao_itens').upsert(linhas, { onConflict: 'id' })
    if (iErr) {
      // programa novo sem os exercícios não serve: encerra para não ir ao ar vazio (não há DELETE de programa)
      if (novo && id) await supabase.from('fisio_prescricoes').update({ status: 'encerrada', ended_on: hojeBrasil() }).eq('id', id).eq('clinic_id', args.clinicId)
      return { ok: false, motivo: motivoDoErro(iErr) }
    }
    if (args.removidos.length > 0) {
      const { error: dErr } = await supabase.from('fisio_prescricao_itens').delete().in('id', args.removidos).eq('prescricao_id', id as string).eq('clinic_id', args.clinicId)
      if (dErr) return { ok: false, motivo: motivoDoErro(dErr) }
    }
    return { ok: true, id: id as string }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

export async function mudarStatusPrograma(args: { id: string; clinicId: string; status: 'ativa' | 'encerrada'; hoje: string }): Promise<{ ok: boolean }> {
  try {
    const { error } = await supabase.from('fisio_prescricoes')
      .update({ status: args.status, ended_on: args.status === 'encerrada' ? args.hoje : null, updated_at: new Date().toISOString() })
      .eq('id', args.id).eq('clinic_id', args.clinicId)
    return { ok: !error }
  } catch {
    return { ok: false }
  }
}

/** Marcações do paciente desde uma data (histórico de execução, visível ao fisio). */
export async function listarExecucoes(clinicId: string, patientId: string, desde: string): Promise<ResultadoLista<Execucao>> {
  try {
    const { data, error } = await supabase.from('fisio_execucoes').select('item_id, done_on')
      .eq('clinic_id', clinicId).eq('patient_id', patientId).gte('done_on', desde).order('done_on', { ascending: false }).limit(2000)
    if (error) return { ok: false, motivo: motivoDoErro(error) }
    return { ok: true, linhas: (data ?? []) as Execucao[] }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

// ── Goniometria ─────────────────────────────────────────────────────────────

export async function listarMedidas(clinicId: string, patientId: string): Promise<ResultadoLista<Medida>> {
  try {
    const { data, error } = await supabase.from('fisio_goniometrias').select(COLUNAS_MEDIDA)
      .eq('clinic_id', clinicId).eq('patient_id', patientId).order('measured_on', { ascending: true }).order('created_at', { ascending: true })
    if (error) return { ok: false, motivo: motivoDoErro(error) }
    const linhas = ((data ?? []) as Array<Medida & { angle_deg: number | string; reference_deg: number | string | null }>).map(l => ({
      ...l, angle_deg: Number(l.angle_deg), reference_deg: l.reference_deg === null ? null : Number(l.reference_deg),
    }))
    return { ok: true, linhas }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

export async function salvarMedida(args: { clinicId: string; patientId: string; professionalId: string | null; dados: DadosMedida }): Promise<ResultadoGravacao> {
  try {
    const { data, error } = await supabase.from('fisio_goniometrias')
      .insert({ clinic_id: args.clinicId, patient_id: args.patientId, professional_id: args.professionalId, ...args.dados })
      .select('id').single()
    if (error || !data) return { ok: false, motivo: motivoDoErro(error) }
    return { ok: true, id: (data as { id: string }).id }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

export async function excluirMedida(args: { id: string; clinicId: string }): Promise<{ ok: boolean }> {
  try {
    const { error } = await supabase.from('fisio_goniometrias').delete().eq('id', args.id).eq('clinic_id', args.clinicId)
    return { ok: !error }
  } catch {
    return { ok: false }
  }
}
