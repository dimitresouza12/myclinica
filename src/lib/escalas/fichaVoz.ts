/**
 * Ficha de avaliação da voz: perceptivo-auditiva pela escala GRBAS (Hirano, 1981), tempos máximos de fonação, relação s/z,
 * frequência fundamental, pitch, loudness, ressonância, queixas e hábitos vocais. Campos e textos em redação própria.
 * Não classifica os tempos máximos de fonação (variam com idade, sexo e esforço): só acompanha.
 */

import {
  decimalEm, escolha, inteiroEm, mesmoConteudo, selecao, textoCurto,
  type DestaqueProtocolo, type IndicadorProtocolo, type ModuloProtocolo,
} from './protocolos'
import type { TomFaixa } from './escalas'

export const GRBAS_ITENS = [
  { id: 'g', sigla: 'G', nome: 'Grau geral', dica: 'Impressão global de alteração da voz' },
  { id: 'r', sigla: 'R', nome: 'Rugosidade', dica: 'Voz áspera, irregular' },
  { id: 'b', sigla: 'B', nome: 'Soprosidade', dica: 'Voz com ar, escape de ar na emissão' },
  { id: 'a', sigla: 'A', nome: 'Astenia', dica: 'Voz fraca, sem força' },
  { id: 's', sigla: 'S', nome: 'Tensão', dica: 'Voz forçada, esforço para emitir' },
] as const
export type GrbasId = typeof GRBAS_ITENS[number]['id']

export const GRBAS_GRAUS = ['Sem alteração', 'Leve', 'Moderada', 'Intensa'] as const

export const TMF_SONS = [
  { id: 'a', rotulo: '/a/' },
  { id: 'i', rotulo: '/i/' },
  { id: 'u', rotulo: '/u/' },
  { id: 's', rotulo: '/s/' },
  { id: 'z', rotulo: '/z/' },
] as const
export type TmfId = typeof TMF_SONS[number]['id']

export const PITCH = [{ id: 'grave', rotulo: 'Grave' }, { id: 'adequado', rotulo: 'Adequado' }, { id: 'agudo', rotulo: 'Agudo' }] as const
export const LOUDNESS = [{ id: 'fraca', rotulo: 'Fraca' }, { id: 'adequada', rotulo: 'Adequada' }, { id: 'forte', rotulo: 'Forte' }] as const
export const RESSONANCIA = [
  { id: 'equilibrada', rotulo: 'Equilibrada' },
  { id: 'hipernasal', rotulo: 'Hipernasal' },
  { id: 'hiponasal', rotulo: 'Hiponasal' },
  { id: 'laringofaringea', rotulo: 'Laringofaríngea' },
] as const
export const ATAQUE = [{ id: 'isoforico', rotulo: 'Isofônico' }, { id: 'brusco', rotulo: 'Brusco' }, { id: 'soproso', rotulo: 'Soproso' }] as const
export const COORDENACAO = [{ id: 'adequada', rotulo: 'Adequada' }, { id: 'alterada', rotulo: 'Alterada' }] as const

export const VOZ_SINTOMAS = [
  { id: 'rouquidao', rotulo: 'Rouquidão' },
  { id: 'fadiga', rotulo: 'Cansaço ao falar' },
  { id: 'pigarro', rotulo: 'Pigarro frequente' },
  { id: 'falhas', rotulo: 'Falhas na voz' },
  { id: 'secura', rotulo: 'Garganta seca' },
  { id: 'dor', rotulo: 'Dor ou ardor ao falar' },
  { id: 'esforco', rotulo: 'Esforço para falar' },
  { id: 'afonia', rotulo: 'Perda da voz' },
] as const

export const VOZ_HABITOS = [
  { id: 'volume_alto', rotulo: 'Fala em volume alto' },
  { id: 'grito', rotulo: 'Grita com frequência' },
  { id: 'ruido', rotulo: 'Fala em ambiente ruidoso' },
  { id: 'uso_profissional', rotulo: 'Usa muito a voz no trabalho' },
  { id: 'fumo', rotulo: 'Fuma' },
  { id: 'alcool', rotulo: 'Consome bebida alcoólica' },
  { id: 'pouca_agua', rotulo: 'Bebe pouca água' },
  { id: 'refluxo', rotulo: 'Refluxo ou queimação' },
] as const

type Grau = number | null
export interface VozDados {
  grbas: Record<GrbasId, Grau>
  /** Tempos máximos de fonação, em segundos (uma casa decimal) */
  tmf: Record<TmfId, number | null>
  /** Frequência fundamental, em Hz */
  f0: number | null
  pitch: typeof PITCH[number]['id'] | null
  loudness: typeof LOUDNESS[number]['id'] | null
  ressonancia: typeof RESSONANCIA[number]['id'] | null
  ataque: typeof ATAQUE[number]['id'] | null
  coordenacao: typeof COORDENACAO[number]['id'] | null
  sintomas: string[]
  habitos: string[]
  /** Quanto a voz incomoda hoje, segundo o paciente: 0 (nada) a 10 (muitíssimo) */
  autoavaliacao: number | null
  obs: string
}

export function vozVazia(): VozDados {
  return {
    grbas: { g: null, r: null, b: null, a: null, s: null },
    tmf: { a: null, i: null, u: null, s: null, z: null },
    f0: null, pitch: null, loudness: null, ressonancia: null, ataque: null, coordenacao: null,
    sintomas: [], habitos: [], autoavaliacao: null, obs: '',
  }
}

export function normalizarVoz(raw: unknown): VozDados {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const g = (r.grbas && typeof r.grbas === 'object' ? r.grbas : {}) as Record<string, unknown>
  const t = (r.tmf && typeof r.tmf === 'object' ? r.tmf : {}) as Record<string, unknown>
  return {
    grbas: { g: inteiroEm(g.g, 0, 3), r: inteiroEm(g.r, 0, 3), b: inteiroEm(g.b, 0, 3), a: inteiroEm(g.a, 0, 3), s: inteiroEm(g.s, 0, 3) },
    tmf: { a: decimalEm(t.a, 0.1, 99.9), i: decimalEm(t.i, 0.1, 99.9), u: decimalEm(t.u, 0.1, 99.9), s: decimalEm(t.s, 0.1, 99.9), z: decimalEm(t.z, 0.1, 99.9) },
    f0: inteiroEm(r.f0, 40, 1500),
    pitch: escolha(r.pitch, PITCH.map(x => x.id)),
    loudness: escolha(r.loudness, LOUDNESS.map(x => x.id)),
    ressonancia: escolha(r.ressonancia, RESSONANCIA.map(x => x.id)),
    ataque: escolha(r.ataque, ATAQUE.map(x => x.id)),
    coordenacao: escolha(r.coordenacao, COORDENACAO.map(x => x.id)),
    sintomas: selecao(r.sintomas, VOZ_SINTOMAS.map(x => x.id)),
    habitos: selecao(r.habitos, VOZ_HABITOS.map(x => x.id)),
    autoavaliacao: inteiroEm(r.autoavaliacao, 0, 10),
    obs: textoCurto(r.obs),
  }
}

/** Relação s/z (Eckel e Boone, 1981), duas casas; null sem os dois tempos. */
export function relacaoSZ(d: VozDados): number | null {
  const { s, z } = d.tmf
  if (s === null || z === null || z <= 0) return null
  return Math.round((s / z) * 100) / 100
}

/** Acima deste valor a relação s/z sugere avaliar a função laríngea. */
export const LIMITE_SZ = 1.4

function rotuloDe<T extends { id: string; rotulo: string }>(lista: readonly T[], id: string | null): string {
  return lista.find(x => x.id === id)?.rotulo.toLowerCase() ?? ''
}

function fmt(n: number): string {
  return String(n).replace('.', ',')
}

function resumo(d: VozDados): string[] {
  const linhas = ['Avaliação da voz (perceptivo-auditiva pela escala GRBAS, Hirano, 1981; graus de 0 a 3).']
  const g = GRBAS_ITENS.flatMap(i => (d.grbas[i.id] === null ? [] : [`${i.sigla} ${d.grbas[i.id]} (${GRBAS_GRAUS[d.grbas[i.id] as number].toLowerCase()})`]))
  if (g.length) linhas.push(`GRBAS: ${g.join('; ')}.`)
  const t = TMF_SONS.flatMap(s => (d.tmf[s.id] === null ? [] : [`${s.rotulo} ${fmt(d.tmf[s.id] as number)} s`]))
  if (t.length) linhas.push(`Tempos máximos de fonação: ${t.join('; ')}.`)
  const sz = relacaoSZ(d)
  if (sz !== null) linhas.push(`Relação s/z: ${fmt(sz)}${sz > LIMITE_SZ ? ` (acima de ${fmt(LIMITE_SZ)}: avaliar a função laríngea)` : ''}.`)
  if (d.f0 !== null) linhas.push(`Frequência fundamental: ${d.f0} Hz.`)
  const outros = [
    d.pitch && `pitch ${rotuloDe(PITCH, d.pitch)}`,
    d.loudness && `loudness ${rotuloDe(LOUDNESS, d.loudness)}`,
    d.ressonancia && `ressonância ${rotuloDe(RESSONANCIA, d.ressonancia)}`,
    d.ataque && `ataque vocal ${rotuloDe(ATAQUE, d.ataque)}`,
    d.coordenacao && `coordenação pneumofonoarticulatória ${rotuloDe(COORDENACAO, d.coordenacao)}`,
  ].filter(Boolean)
  if (outros.length) linhas.push(`Parâmetros: ${outros.join('; ')}.`)
  if (d.sintomas.length) linhas.push(`Queixas: ${d.sintomas.map(id => rotuloDe(VOZ_SINTOMAS, id)).join(', ')}.`)
  if (d.habitos.length) linhas.push(`Hábitos e fatores: ${d.habitos.map(id => rotuloDe(VOZ_HABITOS, id)).join(', ')}.`)
  if (d.autoavaliacao !== null) linhas.push(`Incômodo com a voz segundo o paciente: ${d.autoavaliacao} de 10.`)
  if (d.obs) linhas.push(`Observações: ${d.obs}`)
  return linhas
}

const TOM_GRAU: TomFaixa[] = ['ok', 'info', 'wait', 'bad']

function destaque(d: VozDados): DestaqueProtocolo | null {
  const g = d.grbas.g
  if (g === null) return null
  return { rotulo: `Grau geral: ${GRBAS_GRAUS[g].toLowerCase()}`, tom: TOM_GRAU[g] }
}

const indicadores: IndicadorProtocolo<VozDados>[] = [
  { id: 'grau-geral', rotulo: 'Grau geral da alteração vocal (G, de 0 a 3)', unidade: '', yMax: 3, yTicks: [0, 1, 2, 3], valor: d => d.grbas.g },
  { id: 'tmf-a', rotulo: 'Tempo máximo de fonação da vogal /a/ (segundos)', unidade: 's', yMax: 40, yTicks: [0, 10, 20, 30, 40], valor: d => d.tmf.a },
  { id: 'autoavaliacao', rotulo: 'Incômodo com a voz segundo o paciente (de 0 a 10)', unidade: '', yMax: 10, yTicks: [0, 5, 10], valor: d => d.autoavaliacao },
]

export const MODULO_VOZ: ModuloProtocolo<VozDados> = {
  vazio: vozVazia,
  normalizar: normalizarVoz,
  // só a observação não basta
  pronto: d => !mesmoConteudo({ ...normalizarVoz(d), obs: '' }, vozVazia()),
  resumo,
  destaque,
  indicadores,
}
