/**
 * Ficha de avaliação da fluência: contagem de disfluências de uma amostra de fala, porcentagens e velocidade de fala.
 * Tipos de disfluência segundo Yairi e Ambrose (2005): "gagas" (repetição de sílaba ou de parte da palavra, repetição de palavra
 * de uma sílaba, prolongamento e bloqueio) e "comuns" (interjeição, revisão, repetição de palavra com mais de uma sílaba e de frase).
 * Referência de 3% de disfluências gagas: Ambrose e Yairi (1999). É um sinal para investigar melhor, não um diagnóstico.
 */

import {
  escolha, inteiroEm, selecao, textoCurto,
  type DestaqueProtocolo, type IndicadorProtocolo, type ModuloProtocolo,
} from './protocolos'
import type { TomFaixa } from './escalas'

export const DISFLUENCIAS_GAGAS = [
  { id: 'rep_silaba', rotulo: 'Repetição de sílaba ou parte da palavra', exemplo: 'ca-ca-casa' },
  { id: 'rep_mono', rotulo: 'Repetição de palavra de uma sílaba', exemplo: 'eu eu eu quero' },
  { id: 'prolongamento', rotulo: 'Prolongamento de som', exemplo: 'sssapato' },
  { id: 'bloqueio', rotulo: 'Bloqueio', exemplo: 'tensão e pausa antes de sair o som' },
] as const

export const DISFLUENCIAS_COMUNS = [
  { id: 'interjeicao', rotulo: 'Interjeição', exemplo: 'é, então, né' },
  { id: 'revisao', rotulo: 'Revisão ou troca de palavra ou frase', exemplo: 'quero ir, vou ao parque' },
  { id: 'rep_poli', rotulo: 'Repetição de palavra com mais de uma sílaba', exemplo: 'bonito bonito' },
  { id: 'rep_frase', rotulo: 'Repetição de frase', exemplo: 'eu quero ir, eu quero ir' },
] as const

export type DisfluenciaId = typeof DISFLUENCIAS_GAGAS[number]['id'] | typeof DISFLUENCIAS_COMUNS[number]['id']
const TODAS_DISFLUENCIAS: DisfluenciaId[] = [...DISFLUENCIAS_GAGAS, ...DISFLUENCIAS_COMUNS].map(x => x.id)

export const TAREFAS = [
  { id: 'conversa', rotulo: 'Conversa' },
  { id: 'monologo', rotulo: 'Fala monologada' },
  { id: 'descricao', rotulo: 'Descrição de figura' },
  { id: 'leitura', rotulo: 'Leitura' },
] as const

export const UNIDADES = [{ id: 'palavras', rotulo: 'Palavras' }, { id: 'silabas', rotulo: 'Sílabas' }] as const

export const CONCOMITANTES = [
  { id: 'tensao_face', rotulo: 'Tensão no rosto ou na mandíbula' },
  { id: 'piscar', rotulo: 'Piscar ou fechar os olhos' },
  { id: 'cabeca', rotulo: 'Movimento de cabeça' },
  { id: 'membros', rotulo: 'Movimento de mãos ou pés' },
  { id: 'respiracao', rotulo: 'Alteração da respiração' },
  { id: 'desvia_olhar', rotulo: 'Desvia o olhar' },
  { id: 'troca_palavras', rotulo: 'Troca palavras para evitar travar' },
  { id: 'evita_falar', rotulo: 'Evita situações de fala' },
] as const

export interface FluenciaDados {
  tarefa: typeof TAREFAS[number]['id'] | null
  unidade: typeof UNIDADES[number]['id']
  /** Total de palavras ou sílabas faladas na amostra */
  total: number | null
  /** Duração da amostra, em segundos */
  segundos: number | null
  contagens: Record<DisfluenciaId, number>
  concomitantes: string[]
  /** Quanto a fala incomoda, segundo o paciente: 0 (nada) a 10 (muitíssimo) */
  autopercepcao: number | null
  obs: string
}

export function fluenciaVazia(): FluenciaDados {
  return {
    tarefa: null, unidade: 'palavras', total: null, segundos: null,
    contagens: Object.fromEntries(TODAS_DISFLUENCIAS.map(id => [id, 0])) as Record<DisfluenciaId, number>,
    concomitantes: [], autopercepcao: null, obs: '',
  }
}

export function normalizarFluencia(raw: unknown): FluenciaDados {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const c = (r.contagens && typeof r.contagens === 'object' ? r.contagens : {}) as Record<string, unknown>
  const base = fluenciaVazia()
  return {
    tarefa: escolha(r.tarefa, TAREFAS.map(x => x.id)),
    unidade: escolha(r.unidade, UNIDADES.map(x => x.id)) ?? base.unidade,
    total: inteiroEm(r.total, 1, 99999),
    segundos: inteiroEm(r.segundos, 1, 36000),
    contagens: Object.fromEntries(TODAS_DISFLUENCIAS.map(id => [id, inteiroEm(c[id], 0, 999) ?? 0])) as Record<DisfluenciaId, number>,
    concomitantes: selecao(r.concomitantes, CONCOMITANTES.map(x => x.id)),
    autopercepcao: inteiroEm(r.autopercepcao, 0, 10),
    obs: textoCurto(r.obs),
  }
}

export interface CalculoFluencia {
  gagas: number
  comuns: number
  totalDisfluencias: number
  /** % de disfluências gagas sobre o total da amostra, uma casa decimal; null sem o total */
  pctGagas: number | null
  pctComuns: number | null
  pctTotal: number | null
  /** Palavras ou sílabas por minuto; null sem a duração */
  velocidade: number | null
}

const arred1 = (n: number) => Math.round(n * 10) / 10

export function calcularFluencia(d: FluenciaDados): CalculoFluencia {
  const gagas = DISFLUENCIAS_GAGAS.reduce((s, x) => s + d.contagens[x.id], 0)
  const comuns = DISFLUENCIAS_COMUNS.reduce((s, x) => s + d.contagens[x.id], 0)
  const t = d.total
  const pct = (n: number) => (t && t > 0 ? arred1((n / t) * 100) : null)
  return {
    gagas, comuns, totalDisfluencias: gagas + comuns,
    pctGagas: pct(gagas), pctComuns: pct(comuns), pctTotal: pct(gagas + comuns),
    velocidade: t && d.segundos ? Math.round((t / d.segundos) * 60) : null,
  }
}

/** Referência clínica: 3% ou mais de disfluências gagas. */
export const LIMITE_GAGAS_PCT = 3

export function faixaFluencia(pctGagas: number): { rotulo: string; tom: TomFaixa } {
  return pctGagas >= LIMITE_GAGAS_PCT
    ? { rotulo: 'Disfluências gagas em 3% ou mais da amostra', tom: 'warn' }
    : { rotulo: 'Disfluências gagas abaixo de 3% da amostra', tom: 'ok' }
}

/** Amostra considerada curta: menos de 100 palavras ou de 200 sílabas. */
export function amostraCurta(d: FluenciaDados): boolean {
  return d.total !== null && d.total < (d.unidade === 'palavras' ? 100 : 200)
}

const fmt = (n: number) => String(n).replace('.', ',')

function resumo(d: FluenciaDados): string[] {
  const c = calcularFluencia(d)
  const linhas = ['Avaliação da fluência (contagem de disfluências por tipo, segundo Yairi e Ambrose, 2005).']
  const amostra = [
    d.tarefa && TAREFAS.find(x => x.id === d.tarefa)?.rotulo.toLowerCase(),
    d.total !== null && `${d.total} ${d.unidade === 'palavras' ? 'palavras' : 'sílabas'} faladas`,
    d.segundos !== null && `${d.segundos} s`,
  ].filter(Boolean)
  if (amostra.length) linhas.push(`Amostra: ${amostra.join('; ')}.`)
  const lista = (itens: readonly { id: DisfluenciaId; rotulo: string }[]) =>
    itens.filter(x => d.contagens[x.id] > 0).map(x => `${x.rotulo.toLowerCase()} ${d.contagens[x.id]}`).join('; ')
  const g = lista(DISFLUENCIAS_GAGAS)
  const o = lista(DISFLUENCIAS_COMUNS)
  linhas.push(`Disfluências gagas: ${c.gagas}${g ? ` (${g})` : ''}.`)
  linhas.push(`Disfluências comuns: ${c.comuns}${o ? ` (${o})` : ''}.`)
  if (c.pctTotal !== null) {
    linhas.push(`Porcentagem sobre a amostra: gagas ${fmt(c.pctGagas as number)}%, comuns ${fmt(c.pctComuns as number)}%, total ${fmt(c.pctTotal)}%.`)
    linhas.push(`${faixaFluencia(c.pctGagas as number).rotulo}.${amostraCurta(d) ? ' Amostra curta: interpretar com cautela.' : ''}`)
  }
  if (c.velocidade !== null) linhas.push(`Velocidade de fala: ${c.velocidade} ${d.unidade === 'palavras' ? 'palavras' : 'sílabas'} por minuto.`)
  if (d.concomitantes.length) linhas.push(`Comportamentos associados: ${d.concomitantes.map(id => CONCOMITANTES.find(x => x.id === id)?.rotulo.toLowerCase()).join(', ')}.`)
  if (d.autopercepcao !== null) linhas.push(`Incômodo com a fala segundo o paciente: ${d.autopercepcao} de 10.`)
  if (d.obs) linhas.push(`Observações: ${d.obs}`)
  return linhas
}

function destaque(d: FluenciaDados): DestaqueProtocolo | null {
  const { pctGagas } = calcularFluencia(d)
  if (pctGagas === null) return null
  return { rotulo: `${fmt(pctGagas)}% de disfluências gagas`, tom: faixaFluencia(pctGagas).tom }
}

const indicadores: IndicadorProtocolo<FluenciaDados>[] = [
  { id: 'pct-gagas', rotulo: 'Disfluências gagas (% da amostra)', unidade: '%', yMax: 30, yTicks: [0, 3, 10, 20, 30], valor: d => calcularFluencia(d).pctGagas },
  { id: 'pct-total', rotulo: 'Total de disfluências (% da amostra)', unidade: '%', yMax: 50, yTicks: [0, 10, 25, 50], valor: d => calcularFluencia(d).pctTotal },
]

export const MODULO_FLUENCIA: ModuloProtocolo<FluenciaDados> = {
  vazio: fluenciaVazia,
  normalizar: normalizarFluencia,
  // sem o total da amostra não há porcentagem: não vale salvar (zero disfluências é um resultado válido)
  pronto: d => normalizarFluencia(d).total !== null,
  resumo,
  destaque,
  indicadores,
}
