// Leitura e gravação da internação (vet_internacoes, vet_internacao_itens), dos exames do pet (vet_exames) e dos anexos
// dos exames, e as consultas do vínculo tutor-pet (patients.tutor_id). Roda no navegador com o cliente autenticado;
// clínica, permissão do módulo prontuário e restrição por área são das policies
// (supabase/migrations/20261135_vet_internacao_exames.sql).
//
// Degradação limpa (mesmo padrão de storage.ts e de medico/registros.ts): tabela ausente, policy ainda não aplicada ou
// falha de rede viram `indisponivel` com o motivo, nunca uma exceção. A tela mostra um aviso neutro.

import { supabase } from '@/lib/supabase'
import { motivoDoErro, type Indisponibilidade } from '@/lib/nutri/erros'
import type { ExameVetDados, ExameVetLinha, StatusExame } from './exames'
import type { Internacao, InternacaoDados, ItemInternacao, StatusInternacao, TipoItem, Turno } from './internacao'
import { raizDoTutor, uuidValido, type PetLinha } from './tutor'

export type { Indisponibilidade }

export type ResultadoLista<T> = { ok: true; linhas: T[] } | { ok: false; motivo: Indisponibilidade }
export type ResultadoGravacao = { ok: true; id: string } | { ok: false; motivo: Indisponibilidade; mensagem?: string }

export const MENSAGEM_INDISPONIVEL: Record<Indisponibilidade, string> = {
  sem_tabela: 'A internação e os exames do pet ainda não estão ativos nesta conta (falta atualizar o banco de dados). Você pode preencher e imprimir normalmente; só não será guardado no prontuário.',
  sem_permissao: 'Você não tem permissão para guardar no prontuário. Peça a quem administra a clínica. Preencher e imprimir continuam funcionando.',
  erro: 'Não foi possível concluir agora. Tente de novo em instantes.',
}

interface ErroPg { code?: string; message?: string }

/** Erro de "já existe uma internação aberta" (índice único parcial): vira mensagem própria em vez do aviso genérico. */
function mensagemDoErro(e: ErroPg | null | undefined): string | undefined {
  if (e?.code === '23505' && /uma_aberta_por_pet/.test(e.message ?? '')) {
    return 'Este pet já tem uma internação aberta. Dê alta nela antes de abrir outra.'
  }
  return undefined
}

function falha(e: ErroPg | null | undefined): { ok: false; motivo: Indisponibilidade; mensagem?: string } {
  return { ok: false, motivo: motivoDoErro(e), mensagem: mensagemDoErro(e) }
}

// ── Internações ──────────────────────────────────────────────────

const COLUNAS_INTERNACAO = 'id, status, entrada_em, saida_em, leito, motivo, dados, created_at'
const COLUNAS_ITEM = 'id, internacao_id, tipo, registrado_em, turno, dados, created_at'

export async function listarInternacoes(patientId: string): Promise<ResultadoLista<Internacao>> {
  try {
    const { data, error } = await supabase
      .from('vet_internacoes')
      .select(COLUNAS_INTERNACAO)
      .eq('patient_id', patientId)
      .order('entrada_em', { ascending: false })
    if (error) return { ok: false, motivo: motivoDoErro(error) }
    return { ok: true, linhas: (data ?? []) as Internacao[] }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

export async function listarItensDeInternacao(patientId: string): Promise<ResultadoLista<ItemInternacao>> {
  try {
    const { data, error } = await supabase
      .from('vet_internacao_itens')
      .select(COLUNAS_ITEM)
      .eq('patient_id', patientId)
      .order('registrado_em', { ascending: true })
    if (error) return { ok: false, motivo: motivoDoErro(error) }
    return { ok: true, linhas: (data ?? []) as ItemInternacao[] }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

export interface GravarInternacao {
  id?: string | null
  clinicId: string
  patientId: string
  status: StatusInternacao
  entradaEm: string
  saidaEm: string | null
  leito: string
  motivo: string
  dados: InternacaoDados
}

/** Insere (sem `id`) ou atualiza (com `id`): a alta é um UPDATE da mesma linha, com status, saída e o resumo em `dados`. */
export async function salvarInternacao(a: GravarInternacao): Promise<ResultadoGravacao> {
  const colunas = {
    status: a.status,
    entrada_em: a.entradaEm,
    saida_em: a.saidaEm,
    leito: a.leito.trim() ? a.leito.trim() : null,
    motivo: a.motivo.trim(),
    dados: a.dados,
  }
  try {
    if (a.id) {
      const { error } = await supabase.from('vet_internacoes').update(colunas).eq('id', a.id)
      return error ? falha(error) : { ok: true, id: a.id }
    }
    const { data, error } = await supabase
      .from('vet_internacoes')
      .insert({ clinic_id: a.clinicId, patient_id: a.patientId, ...colunas })
      .select('id')
      .single()
    if (error || !data) return falha(error)
    return { ok: true, id: (data as { id: string }).id }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

export async function excluirInternacao(id: string): Promise<{ ok: boolean }> {
  try {
    const { error } = await supabase.from('vet_internacoes').delete().eq('id', id)
    return { ok: !error }
  } catch {
    return { ok: false }
  }
}

export interface GravarItem {
  id?: string | null
  clinicId: string
  patientId: string
  internacaoId: string
  tipo: TipoItem
  registradoEm: string
  turno: Turno
  dados: unknown
}

export async function salvarItemDeInternacao(a: GravarItem): Promise<ResultadoGravacao> {
  try {
    if (a.id) {
      const { error } = await supabase.from('vet_internacao_itens').update({ registrado_em: a.registradoEm, turno: a.turno, dados: a.dados }).eq('id', a.id)
      return error ? falha(error) : { ok: true, id: a.id }
    }
    const { data, error } = await supabase
      .from('vet_internacao_itens')
      .insert({
        clinic_id: a.clinicId, patient_id: a.patientId, internacao_id: a.internacaoId,
        tipo: a.tipo, registrado_em: a.registradoEm, turno: a.turno, dados: a.dados,
      })
      .select('id')
      .single()
    if (error || !data) return falha(error)
    return { ok: true, id: (data as { id: string }).id }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

export async function excluirItemDeInternacao(id: string): Promise<{ ok: boolean }> {
  try {
    const { error } = await supabase.from('vet_internacao_itens').delete().eq('id', id)
    return { ok: !error }
  } catch {
    return { ok: false }
  }
}

// ── Exames ───────────────────────────────────────────────────────

export async function listarExamesVet(patientId: string): Promise<ResultadoLista<ExameVetLinha>> {
  try {
    const { data, error } = await supabase
      .from('vet_exames')
      .select('id, status, data, dados, created_at')
      .eq('patient_id', patientId)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) return { ok: false, motivo: motivoDoErro(error) }
    return { ok: true, linhas: (data ?? []) as ExameVetLinha[] }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

export async function salvarExameVet(a: {
  id?: string | null
  clinicId: string
  patientId: string
  data: string
  status: StatusExame
  dados: ExameVetDados
}): Promise<ResultadoGravacao> {
  try {
    if (a.id) {
      const { error } = await supabase.from('vet_exames').update({ data: a.data, status: a.status, dados: a.dados }).eq('id', a.id)
      return error ? falha(error) : { ok: true, id: a.id }
    }
    const { data, error } = await supabase
      .from('vet_exames')
      .insert({ clinic_id: a.clinicId, patient_id: a.patientId, data: a.data, status: a.status, dados: a.dados })
      .select('id')
      .single()
    if (error || !data) return falha(error)
    return { ok: true, id: (data as { id: string }).id }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

export async function excluirExameVet(id: string): Promise<{ ok: boolean }> {
  try {
    const { error } = await supabase.from('vet_exames').delete().eq('id', id)
    return { ok: !error }
  } catch {
    return { ok: false }
  }
}

// ── Anexos dos exames (bucket `pacientes`, pasta vet-exames/<clínica>/<paciente>/) ──

const BUCKET = 'pacientes'
export const VALIDADE_URL_ANEXO = 3600

/** Sobe um anexo e devolve o caminho gravado. Lança com mensagem legível se falhar. */
export async function subirAnexoExame(path: string, file: File): Promise<string> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined })
  if (error) throw new Error(`Erro ao enviar ${file.name}: ${error.message}`)
  return path
}

/** Apaga anexos que ninguém mais usa. Falha silenciosa: sobra de arquivo não pode travar a tela. */
export async function removerAnexosExame(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  try { await supabase.storage.from(BUCKET).remove(paths) } catch { /* melhor esforço */ }
}

/** Endereços temporários para abrir os anexos (o bucket é privado). Caminho que falhar fica de fora. */
export async function urlsDosAnexos(paths: string[]): Promise<Record<string, string>> {
  const unicos = [...new Set(paths)]
  if (unicos.length === 0) return {}
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(unicos, VALIDADE_URL_ANEXO)
    if (error || !data) return {}
    const out: Record<string, string> = {}
    for (const r of data) if (r.path && r.signedUrl) out[r.path] = r.signedUrl
    return out
  } catch {
    return {}
  }
}

// ── Vínculo tutor-pet ────────────────────────────────────────────

const COLUNAS_PET = 'id, name, phone, cpf, pet_name, pet_species'
const colunaAusente = (e: ErroPg | null | undefined) => !!e && /column|schema cache|42703|PGRST204/i.test(`${e.code ?? ''} ${e.message ?? ''}`)

export interface PetsDoTutor {
  /** false = coluna tutor_id ainda não existe no banco: a lista vem por telefone/CPF e não dá para vincular */
  vinculo: boolean
  /** linhas do grupo do tutor (e, sem vínculo, as de mesmo contato) */
  grupo: PetLinha[]
  /** cadastros parecidos que ainda não estão vinculados (só com a coluna) */
  candidatos: PetLinha[]
}

const ultimos8 = (s: string | null | undefined) => {
  const d = (s ?? '').replace(/\D/g, '')
  return d.length >= 8 ? d.slice(-8) : ''
}

/**
 * Pets do mesmo tutor do pet aberto, mais cadastros parecidos (mesmo telefone) que ainda podem ser vinculados.
 * Tudo escopado à clínica da sessão. Falha de rede: null (a tela some com a barra, o prontuário segue normal).
 */
export async function buscarPetsDoTutor(clinicId: string, atual: PetLinha): Promise<PetsDoTutor | null> {
  try {
    const raiz = raizDoTutor(atual)
    const cauda = ultimos8(atual.phone)
    const porContato = (colunas: string) => cauda
      ? supabase.from('patients').select(colunas).eq('clinic_id', clinicId).eq('is_active', true)
          .ilike('phone', `%${cauda}%`).not('pet_name', 'is', null).limit(40)
      : Promise.resolve({ data: [] as unknown[], error: null })

    if (uuidValido(raiz)) {
      const doGrupo = await supabase.from('patients').select(`${COLUNAS_PET}, tutor_id`)
        .eq('clinic_id', clinicId).eq('is_active', true).or(`id.eq.${raiz},tutor_id.eq.${raiz}`)
      if (!doGrupo.error) {
        // tutor_id dos candidatos: a tela precisa saber quem já está vinculado a outro tutor
        const contato = await porContato(`${COLUNAS_PET}, tutor_id`)
        return {
          vinculo: true,
          grupo: (doGrupo.data ?? []) as unknown as PetLinha[],
          candidatos: contato.error ? [] : ((contato.data ?? []) as unknown as PetLinha[]),
        }
      }
      if (!colunaAusente(doGrupo.error)) return null
    }
    // sem a coluna: agrupa por contato (só leitura)
    const contato = await porContato(COLUNAS_PET)
    return { vinculo: false, grupo: contato.error ? [atual] : ((contato.data ?? []) as unknown as PetLinha[]), candidatos: [] }
  } catch {
    return null
  }
}

/**
 * Junta o cadastro `candidatoId` (e os pets que já apontam para ele) ao tutor `raizId`. Um único UPDATE: nenhum
 * cadastro é criado nem apagado, só ganha o vínculo. O banco confere clínica e que o tutor é um cadastro principal.
 */
export async function vincularAoTutor(clinicId: string, raizId: string, candidatoId: string): Promise<{ ok: boolean }> {
  if (!uuidValido(raizId) || !uuidValido(candidatoId) || raizId === candidatoId) return { ok: false }
  try {
    const { error } = await supabase.from('patients')
      .update({ tutor_id: raizId })
      .eq('clinic_id', clinicId)
      .or(`id.eq.${candidatoId},tutor_id.eq.${candidatoId}`)
    return { ok: !error }
  } catch {
    return { ok: false }
  }
}
