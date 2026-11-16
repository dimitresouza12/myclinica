// Goniometria seriada: catálogo de articulações e movimentos com o valor normal de referência, validação do
// registro, séries por articulação/movimento e evolução. Funções puras, testadas em goniometria.test.ts.
//
// Os valores de referência seguem as amplitudes de movimento normais mais citadas na literatura (tabelas da AAOS).
// Variam com idade, sexo e autor: servem de comparação, não de diagnóstico. O campo é editável a cada registro.

import { diasEntre, isoValido } from '@/lib/vet/datas'
import { lerNumero } from '@/lib/vet/numeros'

export type Lado = 'direito' | 'esquerdo' | 'nao_se_aplica'
export type Modo = 'ativo' | 'passivo'

export interface Movimento { key: string; label: string; ref: number }
export interface Articulacao {
  key: string
  label: string
  /** true: há lado direito e esquerdo; false (coluna): sem lado */
  lateral: boolean
  movimentos: Movimento[]
}

export const ARTICULACOES: Articulacao[] = [
  {
    key: 'ombro', label: 'Ombro', lateral: true,
    movimentos: [
      { key: 'flexao', label: 'Flexão', ref: 180 },
      { key: 'extensao', label: 'Extensão', ref: 60 },
      { key: 'abducao', label: 'Abdução', ref: 180 },
      { key: 'rotacao_externa', label: 'Rotação externa', ref: 90 },
      { key: 'rotacao_interna', label: 'Rotação interna', ref: 70 },
    ],
  },
  {
    key: 'cotovelo', label: 'Cotovelo', lateral: true,
    movimentos: [
      { key: 'flexao', label: 'Flexão', ref: 150 },
      { key: 'extensao', label: 'Extensão (déficit de extensão)', ref: 0 },
    ],
  },
  {
    key: 'antebraco', label: 'Antebraço', lateral: true,
    movimentos: [
      { key: 'pronacao', label: 'Pronação', ref: 80 },
      { key: 'supinacao', label: 'Supinação', ref: 80 },
    ],
  },
  {
    key: 'punho', label: 'Punho', lateral: true,
    movimentos: [
      { key: 'flexao', label: 'Flexão', ref: 80 },
      { key: 'extensao', label: 'Extensão', ref: 70 },
      { key: 'desvio_radial', label: 'Desvio radial', ref: 20 },
      { key: 'desvio_ulnar', label: 'Desvio ulnar', ref: 30 },
    ],
  },
  {
    key: 'quadril', label: 'Quadril', lateral: true,
    movimentos: [
      { key: 'flexao', label: 'Flexão', ref: 120 },
      { key: 'extensao', label: 'Extensão', ref: 30 },
      { key: 'abducao', label: 'Abdução', ref: 45 },
      { key: 'aducao', label: 'Adução', ref: 30 },
      { key: 'rotacao_interna', label: 'Rotação interna', ref: 45 },
      { key: 'rotacao_externa', label: 'Rotação externa', ref: 45 },
    ],
  },
  {
    key: 'joelho', label: 'Joelho', lateral: true,
    movimentos: [
      { key: 'flexao', label: 'Flexão', ref: 135 },
      { key: 'extensao', label: 'Extensão (déficit de extensão)', ref: 0 },
    ],
  },
  {
    key: 'tornozelo', label: 'Tornozelo e pé', lateral: true,
    movimentos: [
      { key: 'dorsiflexao', label: 'Dorsiflexão', ref: 20 },
      { key: 'flexao_plantar', label: 'Flexão plantar', ref: 50 },
      { key: 'inversao', label: 'Inversão', ref: 35 },
      { key: 'eversao', label: 'Eversão', ref: 15 },
    ],
  },
  {
    key: 'cervical', label: 'Coluna cervical', lateral: false,
    movimentos: [
      { key: 'flexao', label: 'Flexão', ref: 45 },
      { key: 'extensao', label: 'Extensão', ref: 45 },
      { key: 'inclinacao_lateral', label: 'Inclinação lateral', ref: 45 },
      { key: 'rotacao', label: 'Rotação', ref: 60 },
    ],
  },
  {
    key: 'lombar', label: 'Coluna toracolombar', lateral: false,
    movimentos: [
      { key: 'flexao', label: 'Flexão', ref: 60 },
      { key: 'extensao', label: 'Extensão', ref: 25 },
      { key: 'inclinacao_lateral', label: 'Inclinação lateral', ref: 25 },
      { key: 'rotacao', label: 'Rotação', ref: 30 },
    ],
  },
]

export const ROTULO_LADO: Record<Lado, string> = { direito: 'Direito', esquerdo: 'Esquerdo', nao_se_aplica: '' }
export const ROTULO_MODO: Record<Modo, string> = { ativo: 'Ativo', passivo: 'Passivo' }

export function articulacaoPorChave(joint: string): Articulacao | null {
  return ARTICULACOES.find(a => a.key === joint) ?? null
}

export function movimentoPorChave(joint: string, movement: string): Movimento | null {
  return articulacaoPorChave(joint)?.movimentos.find(m => m.key === movement) ?? null
}

/** Valor normal de referência (graus) do movimento; null quando a combinação não está no catálogo. */
export function referencia(joint: string, movement: string): number | null {
  return movimentoPorChave(joint, movement)?.ref ?? null
}

export function rotuloMovimento(joint: string, movement: string): string {
  const a = articulacaoPorChave(joint)
  const m = movimentoPorChave(joint, movement)
  return `${a?.label ?? joint} · ${m?.label ?? movement}`
}

// ── Registro ────────────────────────────────────────────────────────────────
export interface Medida {
  id: string
  measured_on: string
  joint: string
  movement: string
  side: Lado
  mode: Modo
  angle_deg: number
  reference_deg: number | null
  note: string | null
  created_at: string
}

export const ANGULO_MAX = 360
export const MAX_NOTA = 300

/** Lê o ângulo digitado (vírgula ou ponto), com uma casa decimal. Vazio ou ilegível: null. */
export function lerAngulo(v: unknown): number | null {
  const n = lerNumero(v)
  if (n === null) return null
  return Math.round(n * 10) / 10
}

export interface RascunhoMedida {
  data: string
  joint: string
  movement: string
  side: Lado
  mode: Modo
  angulo: string
  referencia: string
  nota: string
}

export interface DadosMedida {
  measured_on: string
  joint: string
  movement: string
  side: Lado
  mode: Modo
  angle_deg: number
  reference_deg: number | null
  note: string | null
}

export function validarMedida(r: RascunhoMedida, hoje: string): { ok: true; dados: DadosMedida } | { ok: false; erros: string[] } {
  const erros: string[] = []
  const art = articulacaoPorChave(r.joint)
  if (!art) erros.push('Escolha a articulação.')
  const mov = art ? movimentoPorChave(r.joint, r.movement) : null
  if (art && !mov) erros.push('Escolha o movimento.')
  if (art?.lateral && r.side === 'nao_se_aplica') erros.push('Escolha o lado (direito ou esquerdo).')
  if (!isoValido(r.data)) erros.push('Informe a data da medida.')
  else if (r.data > hoje) erros.push('A data da medida não pode ser no futuro.')
  const ang = lerAngulo(r.angulo)
  if (r.angulo.trim() === '') erros.push('Informe o ângulo medido.')
  else if (ang === null || ang < 0 || ang > ANGULO_MAX) erros.push(`O ângulo precisa estar entre 0 e ${ANGULO_MAX} graus.`)
  let ref: number | null = null
  if (r.referencia.trim() !== '') {
    ref = lerAngulo(r.referencia)
    if (ref === null || ref < 0 || ref > ANGULO_MAX) { erros.push(`A referência precisa estar entre 0 e ${ANGULO_MAX} graus.`); ref = null }
  }
  if (r.nota.trim().length > MAX_NOTA) erros.push(`A observação passa de ${MAX_NOTA} caracteres.`)
  if (erros.length || ang === null) return { ok: false, erros }
  return {
    ok: true,
    dados: {
      measured_on: r.data, joint: r.joint, movement: r.movement, side: art?.lateral ? r.side : 'nao_se_aplica', mode: r.mode,
      angle_deg: ang, reference_deg: ref, note: r.nota.trim() ? r.nota.trim() : null,
    },
  }
}

// ── Leitura do resultado ────────────────────────────────────────────────────
export type NivelAdm = 'esperado' | 'acima' | 'leve' | 'moderado' | 'importante'

export const ROTULO_NIVEL: Record<NivelAdm, string> = {
  esperado: 'Próximo do esperado',
  acima: 'Acima da referência',
  leve: 'Déficit leve',
  moderado: 'Déficit moderado',
  importante: 'Déficit importante',
}

export interface LeituraAdm {
  /** ângulo menos referência (positivo = acima da referência) */
  desvio: number
  /** ângulo sobre a referência, em %; null quando a referência é 0 */
  pct: number | null
  nivel: NivelAdm
}

/**
 * Compara o ângulo medido com a referência. Com referência acima de 0: razão (>= 90% próximo do esperado, >= 75% leve,
 * >= 50% moderado, abaixo disso importante). Com referência 0 (extensão completa), o ângulo é o déficit de extensão em
 * graus: até 5 esperado, até 15 leve, até 30 moderado, acima disso importante.
 */
export function lerAdm(angulo: number, ref: number | null): LeituraAdm | null {
  if (ref === null || !Number.isFinite(angulo) || !Number.isFinite(ref)) return null
  const desvio = Math.round((angulo - ref) * 10) / 10
  if (ref === 0) {
    const nivel: NivelAdm = angulo <= 5 ? 'esperado' : angulo <= 15 ? 'leve' : angulo <= 30 ? 'moderado' : 'importante'
    return { desvio, pct: null, nivel }
  }
  const razao = angulo / ref
  const nivel: NivelAdm = razao > 1.1 ? 'acima' : razao >= 0.9 ? 'esperado' : razao >= 0.75 ? 'leve' : razao >= 0.5 ? 'moderado' : 'importante'
  return { desvio, pct: Math.round(razao * 100), nivel }
}

// ── Séries ──────────────────────────────────────────────────────────────────
export interface Serie {
  chave: string
  joint: string
  movement: string
  side: Lado
  mode: Modo
  /** da mais antiga para a mais recente */
  pontos: Medida[]
  referencia: number | null
}

export const chaveDaSerie = (m: Pick<Medida, 'joint' | 'movement' | 'side' | 'mode'>) => `${m.joint}|${m.movement}|${m.side}|${m.mode}`

/** Rótulo curto da série: "Ombro · Flexão, direito, ativo". */
export function rotuloDaSerie(s: Pick<Serie, 'joint' | 'movement' | 'side' | 'mode'>): string {
  const lado = ROTULO_LADO[s.side]
  return `${rotuloMovimento(s.joint, s.movement)}, ${[lado.toLowerCase(), ROTULO_MODO[s.mode].toLowerCase()].filter(Boolean).join(', ')}`
}

const cronologico = (a: Medida, b: Medida) => a.measured_on.localeCompare(b.measured_on) || a.created_at.localeCompare(b.created_at)

/**
 * Agrupa as medidas em séries (mesma articulação, movimento, lado e modo). A série com medida mais recente vem primeiro.
 * A referência da série é a da última medida (ou a do catálogo, se a medida não guardou).
 */
export function agruparSeries(medidas: readonly Medida[]): Serie[] {
  const mapa = new Map<string, Medida[]>()
  for (const m of medidas) {
    const k = chaveDaSerie(m)
    const arr = mapa.get(k)
    if (arr) arr.push(m)
    else mapa.set(k, [m])
  }
  const series: Serie[] = []
  for (const [chave, lista] of mapa) {
    const pontos = [...lista].sort(cronologico)
    const ult = pontos[pontos.length - 1]
    series.push({
      chave, joint: ult.joint, movement: ult.movement, side: ult.side, mode: ult.mode, pontos,
      referencia: ult.reference_deg ?? referencia(ult.joint, ult.movement),
    })
  }
  return series.sort((a, b) => cronologico(b.pontos[b.pontos.length - 1], a.pontos[a.pontos.length - 1]))
}

export interface Evolucao {
  de: Medida
  ate: Medida
  /** graus: última menos primeira */
  deltaGraus: number
  dias: number
  tendencia: 'melhora' | 'piora' | 'estavel'
}

/** Mudança de até 3 graus conta como estável (erro de medida do goniômetro). */
export const TOLERANCIA_GRAUS = 3

/**
 * Evolução da primeira à última medida. "Melhora" = o ângulo se aproximou da referência. Sem referência, mais ângulo
 * conta como melhora. Com menos de 2 medidas: null.
 */
export function evolucaoDaSerie(s: Serie): Evolucao | null {
  if (s.pontos.length < 2) return null
  const de = s.pontos[0]
  const ate = s.pontos[s.pontos.length - 1]
  const deltaGraus = Math.round((ate.angle_deg - de.angle_deg) * 10) / 10
  const ref = s.referencia
  let tendencia: Evolucao['tendencia']
  if (Math.abs(deltaGraus) <= TOLERANCIA_GRAUS) tendencia = 'estavel'
  else if (ref === null) tendencia = deltaGraus > 0 ? 'melhora' : 'piora'
  else {
    const antes = Math.abs(de.angle_deg - ref)
    const depois = Math.abs(ate.angle_deg - ref)
    tendencia = depois < antes ? 'melhora' : depois > antes ? 'piora' : 'estavel'
  }
  return { de, ate, deltaGraus, dias: diasEntre(de.measured_on, ate.measured_on) ?? 0, tendencia }
}

export const ROTULO_TENDENCIA: Record<Evolucao['tendencia'], string> = {
  melhora: 'Melhora',
  piora: 'Piora',
  estavel: 'Estável',
}

/** "+25°" / "-10°" / "0°" (graus com vírgula decimal). */
export function textoGraus(n: number, sinal = false): string {
  const t = String(Math.round(n * 10) / 10).replace('.', ',')
  return `${sinal && n > 0 ? '+' : ''}${t}°`
}
