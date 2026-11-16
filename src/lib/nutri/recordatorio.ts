// Recordatório alimentar de 24 horas: o que o paciente comeu e bebeu no dia anterior, refeição por refeição, com
// horário, alimento (TACO ou personalizado) e quantidade. Guardado em nutri_avaliacoes.dados (tipo 'recordatorio').
// Reaproveita os tipos de refeição e item do plano alimentar (plano.ts) e os totais pela TACO. Funções puras.

import { arredondar } from './validacao'
import {
  META_VAZIA, REFEICOES_PADRAO, normalizarPlano, novoId, totaisDoPlano,
  type Refeicao, type TotaisRefeicao,
} from './plano'
import type { Alimento, AlimentoPersonalizado, Nutrientes } from './alimentos'

export interface RecordatorioDados {
  v: 1
  refeicoes: Refeicao[]
  /** Alimentos criados pela clínica durante este recordatório (produto de rótulo, receita da casa). */
  personalizados: AlimentoPersonalizado[]
  /** Contexto do dia: dia atípico, jejum, evento, suplementos... */
  observacoes?: string
}

/** Refeições oferecidas em branco; as sem alimento ficam no registro como "sem consumo informado". */
export const REFEICOES_RECORDATORIO = REFEICOES_PADRAO

export function recordatorioVazio(): RecordatorioDados {
  return {
    v: 1, personalizados: [],
    refeicoes: REFEICOES_RECORDATORIO.map(nome => ({ id: novoId(), nome, horario: '', itens: [] })),
  }
}

/** Lê o JSON salvo e devolve um recordatório utilizável mesmo se faltar campo (versão antiga ou dado corrompido). */
export function normalizarRecordatorio(raw: unknown): RecordatorioDados {
  // mesma estrutura de refeições e itens do plano: a normalização é compartilhada
  const p = normalizarPlano(raw)
  return { v: 1, refeicoes: p.refeicoes, personalizados: p.personalizados, observacoes: p.observacoes }
}

export function recordatorioTemConteudo(r: RecordatorioDados): boolean {
  return r.refeicoes.some(x => x.itens.length > 0) || !!r.observacoes?.trim()
}

/** Totais por refeição e do dia, pelos mesmos valores da TACO do plano alimentar. Alimento fora do catálogo conta zero. */
export function totaisDoRecordatorio(r: RecordatorioDados, catalogo: Alimento[]): { refeicoes: TotaisRefeicao[]; dia: Nutrientes } {
  return totaisDoPlano({ v: 1, titulo: 'Recordatório 24h', meta: { ...META_VAZIA }, refeicoes: r.refeicoes, personalizados: r.personalizados }, catalogo)
}

export interface ResumoRecordatorio {
  refeicoesComConsumo: number
  alimentos: number
  /** Alimentos do registro que sumiram do catálogo e por isso não entram nos totais. */
  semCalculo: number
  dia: Nutrientes
}

export function resumirRecordatorio(r: RecordatorioDados, catalogo: Alimento[]): ResumoRecordatorio {
  const t = totaisDoRecordatorio(r, catalogo)
  return {
    refeicoesComConsumo: r.refeicoes.filter(x => x.itens.length > 0).length,
    alimentos: r.refeicoes.reduce((n, x) => n + x.itens.length, 0),
    semCalculo: t.refeicoes.reduce((n, x) => n + x.itens.filter(i => i.alimento === null).length, 0),
    dia: t.dia,
  }
}

/** Quanto do consumo informado representa a meta de energia (em %, arredondado); null sem meta. */
export function percentualDaMeta(kcalConsumidas: number, metaKcal: number | null): number | null {
  if (metaKcal === null || !(metaKcal > 0)) return null
  return arredondar((kcalConsumidas / metaKcal) * 100, 0)
}
