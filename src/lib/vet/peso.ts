// Curva de peso do pet: ordenação, peso atual, variação e leitura do campo digitado. Funções puras.

import { diasEntre, isoValido } from './datas'
import { fmt, lerNumero } from './numeros'

export interface Pesagem {
  id: string
  /** AAAA-MM-DD */
  weighed_on: string
  weight_kg: number
  note: string | null
  created_at: string
}

/** Faixa aceita no cadastro (kg): de aves e roedores pequenos até equinos. */
export const PESO_MIN_KG = 0.005
export const PESO_MAX_KG = 2000

/** Lê o peso digitado. Fora da faixa ou ilegível: valor null e a mensagem a mostrar (vazio não é erro). */
export function lerPeso(v: unknown): { valor: number | null; erro: string | null } {
  const n = lerNumero(v)
  if (n === null) return { valor: null, erro: v === null || v === undefined || v === '' ? null : 'Digite um número.' }
  if (n < PESO_MIN_KG || n > PESO_MAX_KG) return { valor: null, erro: `Peso fora do esperado (${fmt(PESO_MIN_KG, 3)} a ${fmt(PESO_MAX_KG, 0)} kg).` }
  return { valor: n, erro: null }
}

/** Da mais antiga para a mais recente (empate pela criação): a ordem do gráfico. */
export function emOrdemCronologica<T extends Pick<Pesagem, 'weighed_on' | 'created_at'>>(lista: T[]): T[] {
  return [...lista].sort((a, b) => a.weighed_on.localeCompare(b.weighed_on) || a.created_at.localeCompare(b.created_at))
}

/** A pesagem mais recente, ou null. */
export function pesoAtual<T extends Pick<Pesagem, 'weighed_on' | 'created_at'>>(lista: T[]): T | null {
  const o = emOrdemCronologica(lista)
  return o.length ? o[o.length - 1] : null
}

export interface VariacaoPeso {
  /** kg: último menos primeiro */
  deltaKg: number
  /** % sobre o primeiro peso; null quando o primeiro é zero */
  pct: number | null
  dias: number
  de: Pesagem
  ate: Pesagem
}

/** Variação entre a primeira e a última pesagem. Com menos de 2 pesagens: null. */
export function variacaoDoPeso(lista: Pesagem[]): VariacaoPeso | null {
  const o = emOrdemCronologica(lista)
  if (o.length < 2) return null
  const de = o[0], ate = o[o.length - 1]
  const deltaKg = ate.weight_kg - de.weight_kg
  return {
    deltaKg,
    pct: de.weight_kg > 0 ? (deltaKg / de.weight_kg) * 100 : null,
    dias: diasEntre(de.weighed_on, ate.weighed_on) ?? 0,
    de,
    ate,
  }
}

/** Variação da pesagem anterior até a seguinte, para cada ponto (a primeira não tem). Mesma ordem de `emOrdemCronologica`. */
export function variacoesEntrePesagens(lista: Pesagem[]): { pesagem: Pesagem; deltaKg: number | null; pct: number | null }[] {
  const o = emOrdemCronologica(lista)
  return o.map((p, i) => {
    if (i === 0) return { pesagem: p, deltaKg: null, pct: null }
    const ant = o[i - 1]
    const d = p.weight_kg - ant.weight_kg
    return { pesagem: p, deltaKg: d, pct: ant.weight_kg > 0 ? (d / ant.weight_kg) * 100 : null }
  })
}

/** "+0,40 kg (+8,0%)" / "-0,25 kg (-3,1%)" / "sem variação". */
export function textoDaVariacao(deltaKg: number, pct: number | null): string {
  if (Math.abs(deltaKg) < 0.0005) return 'sem variação'
  const sinal = deltaKg > 0 ? '+' : '-'
  const kg = `${sinal}${fmt(Math.abs(deltaKg), 3)} kg`
  return pct === null ? kg : `${kg} (${sinal}${fmt(Math.abs(pct), 1)}%)`
}

/** Valida o formulário de pesagem. */
export function validarPesagem(pesoTexto: string, data: string, hoje: string): string | null {
  const p = lerPeso(pesoTexto)
  if (p.erro) return p.erro
  if (p.valor === null) return 'Informe o peso.'
  if (!isoValido(data)) return 'Informe a data da pesagem.'
  if (data > hoje) return 'A data da pesagem não pode ser no futuro.'
  return null
}
