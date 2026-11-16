// Leitura e gravação das aplicações da Estética (estetica_aplicacoes) e dos lotes para escolher. Roda no navegador com o
// cliente autenticado; clínica, permissão e baixa de estoque são do banco (supabase/migrations/20261136_estetica_lotes_aplicacoes.sql).
//
// A aplicação só nasce pela função estetica_registrar_aplicacao (baixa o lote e o produto na mesma transação). Degradação limpa,
// como a Nutrição e a Odontologia: se a migração ainda não foi aplicada, as funções devolvem `indisponivel` com o motivo em
// vez de lançar erro.

import { supabase } from '@/lib/supabase'
import { motivoDoErro, type Indisponibilidade } from '@/lib/nutri/erros'
import {
  COLUNAS_APLICACAO, mapearLote, mensagemDoErro, normalizarAplicacao, ordenarAplicacoes,
  type Aplicacao, type LoteDisponivel, type RegiaoAplicada,
} from './aplicacoes'

export type ResultadoLista<T> = { ok: true; itens: T[] } | { ok: false; motivo: Indisponibilidade }
export type ResultadoAcao<T = undefined> = { ok: true; data: T } | { ok: false; erro: string }

export const MENSAGEM_APLICACOES: Record<Indisponibilidade, string> = {
  sem_tabela: 'O registro de aplicações com lote ainda não está ativo nesta conta. Quando for ativado, o lote usado passa a sair do estoque a cada aplicação.',
  sem_permissao: 'Você não tem permissão para ver ou registrar aplicações. Fale com quem administra a clínica.',
  erro: 'Não foi possível carregar agora. Tente de novo.',
}

export async function listarAplicacoes(patientId: string): Promise<ResultadoLista<Aplicacao>> {
  try {
    const { data, error } = await supabase
      .from('estetica_aplicacoes')
      .select(COLUNAS_APLICACAO)
      .eq('patient_id', patientId)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) return { ok: false, motivo: motivoDoErro(error) }
    const itens = (data ?? []).map(normalizarAplicacao).filter((a): a is Aplicacao => a !== null)
    return { ok: true, itens: ordenarAplicacoes(itens) }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

/** Lotes com saldo da clínica para escolher na aplicação (função do banco: não exige o módulo Estoque). */
export async function listarLotesDisponiveis(): Promise<ResultadoLista<LoteDisponivel>> {
  try {
    const { data, error } = await supabase.rpc('estetica_lotes_para_aplicacao')
    if (error) return { ok: false, motivo: motivoDoErro(error) }
    const itens = ((data ?? []) as unknown[]).map(mapearLote).filter((l): l is LoteDisponivel => l !== null)
    return { ok: true, itens }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

export interface NovaAplicacao {
  /** uuid gerado ao abrir o formulário: repetir o envio não baixa o estoque duas vezes */
  requestId: string
  patientId: string
  data: string
  tipo: string
  lote: LoteDisponivel
  dose: number
  doseUnidade: string
  baixa: number
  regioes: RegiaoAplicada[]
  observacoes: string
  contractId: string | null
  appointmentId?: string | null
  profissionalNome: string | null
  profissionalRegistro: string | null
}

export async function registrarAplicacao(a: NovaAplicacao): Promise<ResultadoAcao<{ id: string }>> {
  try {
    const { data, error } = await supabase.rpc('estetica_registrar_aplicacao', {
      p_request_id: a.requestId,
      p_patient_id: a.patientId,
      p_data: a.data,
      p_tipo: a.tipo,
      p_stock_item_id: a.lote.itemId,
      p_lot_id: a.lote.lotId,
      p_dose: a.dose,
      p_dose_unidade: a.doseUnidade,
      p_quantidade_baixa: a.baixa,
      p_regioes: a.regioes.map(r => ({ id: r.id, regiao: r.regiao.trim(), unidades: r.unidades, x: r.x, y: r.y })),
      p_observacoes: a.observacoes.trim() || null,
      p_contract_id: a.contractId,
      p_appointment_id: a.appointmentId ?? null,
      p_profissional_nome: a.profissionalNome,
      p_profissional_registro: a.profissionalRegistro,
    })
    if (error || !data) return { ok: false, erro: mensagemDoErro(error?.message) }
    return { ok: true, data: { id: String(data) } }
  } catch {
    return { ok: false, erro: mensagemDoErro(null) }
  }
}

export async function estornarAplicacao(id: string, motivo: string | null): Promise<ResultadoAcao> {
  try {
    const { error } = await supabase.rpc('estetica_estornar_aplicacao', { p_id: id, p_motivo: motivo })
    if (error) return { ok: false, erro: mensagemDoErro(error.message) }
    return { ok: true, data: undefined }
  } catch {
    return { ok: false, erro: mensagemDoErro(null) }
  }
}

/** Liga (ou desliga, com null) o termo de consentimento a uma aplicação já registrada. */
export async function vincularTermo(id: string, contractId: string | null): Promise<ResultadoAcao> {
  try {
    const { error } = await supabase.from('estetica_aplicacoes').update({ contract_id: contractId }).eq('id', id)
    if (error) return { ok: false, erro: mensagemDoErro(error.message) }
    return { ok: true, data: undefined }
  } catch {
    return { ok: false, erro: mensagemDoErro(null) }
  }
}
