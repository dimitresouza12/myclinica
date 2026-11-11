// Leitura e gravação da carteira de vacinas (pet_vaccinations) e do histórico de peso (pet_weights).
// Roda no navegador com o cliente autenticado; clínica e permissão do módulo prontuário são das policies
// (supabase/migrations/20261114_vet_vacinas_pesos.sql).
//
// Degradação limpa: tabela ausente, policy ainda não aplicada ou falha de rede viram `indisponivel` com o motivo,
// nunca uma exceção. A tela mostra um aviso neutro e o resto do prontuário segue normal.

import { supabase } from '@/lib/supabase'
import { motivoDoErro, type Indisponibilidade } from '@/lib/nutri/erros'
import type { Pesagem } from './peso'
import type { RegistroCarteira, TipoRegistro } from './vacinas'

export type { Indisponibilidade }

export type ResultadoLista<T> = { ok: true; linhas: T[] } | { ok: false; motivo: Indisponibilidade }
export type ResultadoGravacao = { ok: true; id: string } | { ok: false; motivo: Indisponibilidade }

export const MENSAGEM_INDISPONIVEL: Record<Indisponibilidade, string> = {
  sem_tabela: 'A carteira de vacinas e o histórico de peso ainda não estão ativos nesta conta. A calculadora de dose funciona normalmente.',
  sem_permissao: 'Não foi possível acessar: falta permissão do prontuário ou a ativação da carteira de vacinas e do histórico de peso no banco.',
  erro: 'Não foi possível concluir agora. Tente de novo em instantes.',
}

const COLUNAS_VACINA = 'id, kind, name, batch, manufacturer, applied_on, next_due_on, professional_id, professional_name, professional_registration, notes, created_at'
const COLUNAS_PESO = 'id, weighed_on, weight_kg, note, created_at'

export async function listarCarteira(patientId: string): Promise<ResultadoLista<RegistroCarteira>> {
  try {
    const { data, error } = await supabase
      .from('pet_vaccinations')
      .select(COLUNAS_VACINA)
      .eq('patient_id', patientId)
      .order('applied_on', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) return { ok: false, motivo: motivoDoErro(error) }
    return { ok: true, linhas: (data ?? []) as RegistroCarteira[] }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

export interface DadosRegistro {
  kind: TipoRegistro
  name: string
  batch: string
  manufacturer: string
  applied_on: string
  next_due_on: string
  notes: string
  professional_id: string | null
  professional_name: string
  professional_registration: string
}

const orNull = (v: string) => (v.trim() ? v.trim() : null)

function colunasRegistro(d: DadosRegistro) {
  return {
    kind: d.kind,
    name: d.name.trim(),
    batch: orNull(d.batch),
    manufacturer: orNull(d.manufacturer),
    applied_on: d.applied_on,
    next_due_on: d.next_due_on || null,
    notes: orNull(d.notes),
    professional_id: d.professional_id,
    professional_name: orNull(d.professional_name),
    professional_registration: orNull(d.professional_registration),
  }
}

/** Insere (sem `id`) ou atualiza (com `id`). */
export async function salvarRegistro(args: { id?: string | null; clinicId: string; patientId: string; dados: DadosRegistro }): Promise<ResultadoGravacao> {
  try {
    if (args.id) {
      const { error } = await supabase
        .from('pet_vaccinations')
        .update({ ...colunasRegistro(args.dados), updated_at: new Date().toISOString() })
        .eq('id', args.id)
      return error ? { ok: false, motivo: motivoDoErro(error) } : { ok: true, id: args.id }
    }
    const { data, error } = await supabase
      .from('pet_vaccinations')
      .insert({ clinic_id: args.clinicId, patient_id: args.patientId, ...colunasRegistro(args.dados) })
      .select('id')
      .single()
    if (error || !data) return { ok: false, motivo: motivoDoErro(error) }
    return { ok: true, id: (data as { id: string }).id }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

export async function excluirRegistro(id: string): Promise<{ ok: boolean }> {
  try {
    const { error } = await supabase.from('pet_vaccinations').delete().eq('id', id)
    return { ok: !error }
  } catch {
    return { ok: false }
  }
}

export async function listarPesos(patientId: string): Promise<ResultadoLista<Pesagem>> {
  try {
    const { data, error } = await supabase
      .from('pet_weights')
      .select(COLUNAS_PESO)
      .eq('patient_id', patientId)
      .order('weighed_on', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) return { ok: false, motivo: motivoDoErro(error) }
    const linhas = ((data ?? []) as Array<Pesagem & { weight_kg: number | string }>).map(l => ({ ...l, weight_kg: Number(l.weight_kg) }))
    return { ok: true, linhas }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

export async function salvarPesagem(args: { clinicId: string; patientId: string; data: string; kg: number; nota: string }): Promise<ResultadoGravacao> {
  try {
    const { data, error } = await supabase
      .from('pet_weights')
      .insert({ clinic_id: args.clinicId, patient_id: args.patientId, weighed_on: args.data, weight_kg: args.kg, note: orNull(args.nota) })
      .select('id')
      .single()
    if (error || !data) return { ok: false, motivo: motivoDoErro(error) }
    return { ok: true, id: (data as { id: string }).id }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

export async function excluirPesagem(id: string): Promise<{ ok: boolean }> {
  try {
    const { error } = await supabase.from('pet_weights').delete().eq('id', id)
    return { ok: !error }
  } catch {
    return { ok: false }
  }
}

/**
 * Mantém patients.pet_weight (o "peso atual" da Ficha e da lista) igual à pesagem mais recente.
 * Melhor esforço: falha silenciosa, o histórico já está salvo.
 */
export async function sincronizarPesoNoCadastro(patientId: string, kg: number | null): Promise<void> {
  try {
    await supabase.from('patients').update({ pet_weight: kg }).eq('id', patientId)
  } catch {
    // sem efeito: a pesagem continua no histórico
  }
}

/**
 * Chamado quando a Ficha grava um peso diferente do cadastro: guarda também como pesagem de hoje, para a curva
 * não perder o valor sobrescrito. Não duplica se a última pesagem já tem esse mesmo peso. Melhor esforço.
 */
export async function registrarPesoDaFicha(args: { clinicId: string; patientId: string; kg: number; hoje: string }): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('pet_weights')
      .select('weight_kg')
      .eq('patient_id', args.patientId)
      .order('weighed_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) return // tabela ausente ou sem permissão: nada a fazer
    const ultimo = data?.[0] ? Number((data[0] as { weight_kg: number | string }).weight_kg) : null
    if (ultimo !== null && Math.abs(ultimo - args.kg) < 0.0005) return
    await supabase.from('pet_weights').insert({ clinic_id: args.clinicId, patient_id: args.patientId, weighed_on: args.hoje, weight_kg: args.kg })
  } catch {
    // melhor esforço
  }
}
