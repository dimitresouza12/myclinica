/**
 * Audiograma: limiares tonais por frequência, orelha direita e esquerda, via aérea e via óssea, com média tonal e
 * classificação do grau da perda. Só definição e conta; o gráfico está em src/components/prontuario/escalas/AudiogramaChart.tsx.
 *
 * Classificação: Lloyd LL, Kaplan H. Audiometric interpretation: a manual of basic audiometry. Baltimore: University Park Press, 1978,
 * pela média tonal de 500, 1000 e 2000 Hz (a mais usada na prática brasileira). A OMS e outros autores usam critérios diferentes
 * (por exemplo média de 500 a 4000 Hz e 20 dB como limite da normalidade): quem laudar informa qual adotou.
 * O tipo da perda é uma sugestão pela diferença entre via aérea e via óssea (gap de 15 dB ou mais).
 */

import {
  inteiroEm, mesmoConteudo, piorTom, textoCurto,
  type DestaqueProtocolo, type IndicadorProtocolo, type ModuloProtocolo,
} from './protocolos'
import type { TomFaixa } from './escalas'

/** Frequências da via aérea, em Hz. */
export const FREQ_VA = [250, 500, 1000, 2000, 3000, 4000, 6000, 8000] as const
/** Frequências da via óssea, em Hz (não se testa acima de 4000 Hz). */
export const FREQ_VO = [250, 500, 1000, 2000, 3000, 4000] as const
/** Frequências da média tonal. */
export const FREQ_MEDIA_TONAL = [500, 1000, 2000] as const

export const LIMIAR_MIN = -10
export const LIMIAR_MAX = 120

export type Limiar = number | null

export interface OrelhaAudiograma {
  /** Um limiar por posição de FREQ_VA, em dB NA */
  va: Limiar[]
  /** Um limiar por posição de FREQ_VO, em dB NA */
  vo: Limiar[]
  /** Limiar de recepção de fala, dB NA */
  lrf: number | null
  /** Índice percentual de reconhecimento de fala, 0 a 100 */
  iprf: number | null
}

export interface AudiogramaDados {
  od: OrelhaAudiograma
  oe: OrelhaAudiograma
  obs: string
}

export type LadoAudiograma = 'od' | 'oe'
export const LADOS: { id: LadoAudiograma; nome: string; sigla: string }[] = [
  { id: 'od', nome: 'Orelha direita', sigla: 'OD' },
  { id: 'oe', nome: 'Orelha esquerda', sigla: 'OE' },
]

function orelhaVazia(): OrelhaAudiograma {
  return { va: FREQ_VA.map(() => null), vo: FREQ_VO.map(() => null), lrf: null, iprf: null }
}

export function audiogramaVazio(): AudiogramaDados {
  return { od: orelhaVazia(), oe: orelhaVazia(), obs: '' }
}

function normalizarOrelha(raw: unknown): OrelhaAudiograma {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const lista = (v: unknown, n: number): Limiar[] =>
    Array.from({ length: n }, (_, i) => inteiroEm(Array.isArray(v) ? v[i] : null, LIMIAR_MIN, LIMIAR_MAX))
  return {
    va: lista(r.va, FREQ_VA.length),
    vo: lista(r.vo, FREQ_VO.length),
    lrf: inteiroEm(r.lrf, LIMIAR_MIN, LIMIAR_MAX),
    iprf: inteiroEm(r.iprf, 0, 100),
  }
}

export function normalizarAudiograma(raw: unknown): AudiogramaDados {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return { od: normalizarOrelha(r.od), oe: normalizarOrelha(r.oe), obs: textoCurto(r.obs) }
}

/** Média dos limiares nas frequências pedidas; null se faltar algum. Sem arredondar. */
export function mediaEm(limiares: Limiar[], freqs: readonly number[], todas: readonly number[]): number | null {
  const valores: number[] = []
  for (const f of freqs) {
    const v = limiares[todas.indexOf(f)]
    if (typeof v !== 'number') return null
    valores.push(v)
  }
  return valores.reduce((a, b) => a + b, 0) / valores.length
}

/** Média tonal da via aérea (500, 1000 e 2000 Hz), em dB, arredondada; null se faltar alguma das três. */
export function mediaTonal(orelha: OrelhaAudiograma): number | null {
  const m = mediaEm(orelha.va, FREQ_MEDIA_TONAL, FREQ_VA)
  return m === null ? null : Math.round(m)
}

export interface GrauPerda { rotulo: string; tom: TomFaixa }

/** Grau da perda pela média tonal (Lloyd e Kaplan, 1978). */
export function classificarMedia(media: number): GrauPerda {
  const m = Math.round(media)
  if (m <= 25) return { rotulo: 'Audição normal', tom: 'ok' }
  if (m <= 40) return { rotulo: 'Perda auditiva de grau leve', tom: 'info' }
  if (m <= 55) return { rotulo: 'Perda auditiva de grau moderado', tom: 'wait' }
  if (m <= 70) return { rotulo: 'Perda auditiva de grau moderadamente severo', tom: 'warn' }
  if (m <= 90) return { rotulo: 'Perda auditiva de grau severo', tom: 'bad' }
  return { rotulo: 'Perda auditiva de grau profundo', tom: 'bad' }
}

export type TipoPerda = 'condutiva' | 'neurossensorial' | 'mista'

export const GAP_AEREO_OSSEO = 15

/**
 * Tipo da perda sugerido pelo gap (média de via aérea menos média de via óssea em 500, 1000 e 2000 Hz).
 * null quando a audição é normal ou faltam limiares (precisa dos três nas duas vias).
 */
export function tipoDaPerda(orelha: OrelhaAudiograma): TipoPerda | null {
  const va = mediaEm(orelha.va, FREQ_MEDIA_TONAL, FREQ_VA)
  const vo = mediaEm(orelha.vo, FREQ_MEDIA_TONAL, FREQ_VO)
  if (va === null || vo === null) return null
  if (Math.round(va) <= 25) return null
  const gap = va - vo
  if (gap < GAP_AEREO_OSSEO) return 'neurossensorial'
  return Math.round(vo) <= 25 ? 'condutiva' : 'mista'
}

export const ROTULO_TIPO: Record<TipoPerda, string> = {
  condutiva: 'tipo condutivo',
  neurossensorial: 'tipo neurossensorial',
  mista: 'tipo misto',
}

export function orelhaTemDado(o: OrelhaAudiograma): boolean {
  return o.va.some(v => v !== null) || o.vo.some(v => v !== null) || o.lrf !== null || o.iprf !== null
}

/** Posição horizontal de uma frequência no gráfico, de 0 (250 Hz) a 1 (8000 Hz), em escala logarítmica. */
export function posicaoFrequencia(freq: number): number {
  return Math.log2(freq / 250) / Math.log2(8000 / 250)
}

/** Posição vertical de um limiar, de 0 (-10 dB, topo) a 1 (120 dB, base). */
export function posicaoLimiar(db: number): number {
  return (Math.min(LIMIAR_MAX, Math.max(LIMIAR_MIN, db)) - LIMIAR_MIN) / (LIMIAR_MAX - LIMIAR_MIN)
}

function listaLimiares(limiares: Limiar[], freqs: readonly number[]): string {
  return freqs.flatMap((f, i) => (typeof limiares[i] === 'number' ? [`${f} Hz ${limiares[i]} dB`] : [])).join('; ')
}

function resumoOrelha(sigla: string, o: OrelhaAudiograma): string[] {
  const linhas: string[] = []
  const va = listaLimiares(o.va, FREQ_VA)
  const vo = listaLimiares(o.vo, FREQ_VO)
  if (va) linhas.push(`${sigla} via aérea: ${va}.`)
  if (vo) linhas.push(`${sigla} via óssea: ${vo}.`)
  const media = mediaTonal(o)
  if (media !== null) {
    const tipo = tipoDaPerda(o)
    linhas.push(`${sigla}: média tonal de ${media} dB NA (500, 1000 e 2000 Hz), ${classificarMedia(media).rotulo.toLowerCase()}${tipo ? `, ${ROTULO_TIPO[tipo]} sugerido pelo gap aéreo-ósseo` : ''}.`)
  } else if (o.va.some(v => v !== null)) {
    linhas.push(`${sigla}: média tonal não calculada (faltam limiares de via aérea em 500, 1000 ou 2000 Hz).`)
  }
  const fala = [o.lrf !== null ? `LRF ${o.lrf} dB NA` : '', o.iprf !== null ? `IPRF ${o.iprf}%` : ''].filter(Boolean).join('; ')
  if (fala) linhas.push(`${sigla} logoaudiometria: ${fala}.`)
  return linhas
}

function resumo(d: AudiogramaDados): string[] {
  const linhas = ['Audiometria tonal liminar (limiares em dB NA; grau da perda pela média tonal de 500, 1000 e 2000 Hz, Lloyd e Kaplan, 1978).']
  if (orelhaTemDado(d.od)) linhas.push(...resumoOrelha('OD', d.od))
  if (orelhaTemDado(d.oe)) linhas.push(...resumoOrelha('OE', d.oe))
  if (d.obs) linhas.push(`Observações: ${d.obs}`)
  return linhas
}

function destaque(d: AudiogramaDados): DestaqueProtocolo | null {
  const partes: { sigla: string; grau: GrauPerda }[] = []
  for (const l of LADOS) {
    const m = mediaTonal(d[l.id])
    if (m !== null) partes.push({ sigla: l.sigla, grau: classificarMedia(m) })
  }
  if (partes.length === 0) return null
  return {
    rotulo: partes.map(p => `${p.sigla}: ${p.grau.rotulo.replace('Perda auditiva de grau ', 'perda de grau ').replace('Audição normal', 'normal')}`).join(' | '),
    tom: piorTom(...partes.map(p => p.grau.tom)),
  }
}

const indicador = (lado: LadoAudiograma, rotulo: string): IndicadorProtocolo<AudiogramaDados> => ({
  id: `media-${lado}`, rotulo, unidade: 'dB', yMax: 120, yTicks: [0, 20, 40, 60, 80, 100, 120],
  valor: d => mediaTonal(d[lado]),
})

export const MODULO_AUDIOGRAMA: ModuloProtocolo<AudiogramaDados> = {
  vazio: audiogramaVazio,
  normalizar: normalizarAudiograma,
  pronto: d => orelhaTemDado(d.od) || orelhaTemDado(d.oe),
  resumo,
  destaque,
  indicadores: [indicador('od', 'Média tonal da orelha direita (dB NA)'), indicador('oe', 'Média tonal da orelha esquerda (dB NA)')],
}

export function audiogramaEstaVazio(d: AudiogramaDados): boolean {
  return mesmoConteudo(d, audiogramaVazio())
}
