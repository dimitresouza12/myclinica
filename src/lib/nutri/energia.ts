// Gasto energético: TMB (4 equações + variante), fator de atividade, GET e divisão de macronutrientes.
// Funções puras. Peso em kg, altura em cm, idade em anos, TMB e GET em kcal/dia.
//
// FONTES:
//  - Mifflin-St Jeor: Mifflin MD et al., Am J Clin Nutr 51:241-247, 1990.
//  - Harris-Benedict original: Harris JA, Benedict FG, 1919. Revisada: Roza AM, Shizgal HM, Am J Clin Nutr 40:168-182, 1984.
//  - FAO/OMS: FAO/WHO/UNU, Energy and protein requirements, WHO TRS 724, 1985 (equações por faixa etária e sexo, só com o peso).
//  - Cunningham: Cunningham JJ, Am J Clin Nutr 33:2372-2374, 1980 (usa massa livre de gordura).
//  - Fatores de atividade (1,2 a 1,9): multiplicadores clássicos de Harris-Benedict/McArdle, usados na prática do GET.
//  - Energia dos macronutrientes: fatores de Atwater (4 kcal/g de proteína e carboidrato, 9 kcal/g de lipídio).

import type { Sexo } from './antropometria'
import { arredondar } from './validacao'

export type EquacaoTmb = 'mifflin' | 'harris_benedict' | 'harris_benedict_1984' | 'fao_oms' | 'cunningham'

export interface InfoEquacao { id: EquacaoTmb; rotulo: string; fonte: string; precisaMassaMagra?: boolean }

export const EQUACOES_TMB: InfoEquacao[] = [
  { id: 'mifflin',              rotulo: 'Mifflin-St Jeor',                  fonte: 'Mifflin et al. 1990' },
  { id: 'harris_benedict',      rotulo: 'Harris-Benedict (1919)',           fonte: 'Harris e Benedict 1919' },
  { id: 'harris_benedict_1984', rotulo: 'Harris-Benedict revisada (1984)',  fonte: 'Roza e Shizgal 1984' },
  { id: 'fao_oms',              rotulo: 'FAO/OMS',                          fonte: 'FAO/WHO/UNU 1985' },
  { id: 'cunningham',           rotulo: 'Cunningham (massa livre de gordura)', fonte: 'Cunningham 1980', precisaMassaMagra: true },
]
export const EQUACAO_INFO: Record<EquacaoTmb, InfoEquacao> = Object.fromEntries(EQUACOES_TMB.map(e => [e.id, e])) as Record<EquacaoTmb, InfoEquacao>

export interface EntradaTmb {
  equacao: EquacaoTmb
  sexo: Sexo | null
  pesoKg: number | null
  alturaCm: number | null
  idade: number | null
  massaMagraKg?: number | null
}

// FAO/WHO/UNU 1985: [idade até (exclusivo), coeficiente do peso, constante]
const FAO: Record<Sexo, [number, number, number][]> = {
  M: [[3, 60.9, -54], [10, 22.7, 495], [18, 17.5, 651], [30, 15.3, 679], [60, 11.6, 879], [Infinity, 13.5, 487]],
  F: [[3, 61.0, -51], [10, 22.5, 499], [18, 12.2, 746], [30, 14.7, 496], [60, 8.7, 829], [Infinity, 10.5, 596]],
}

/** Taxa metabólica basal em kcal/dia; null quando faltar um dado que a equação exige. */
export function calcularTmb(e: EntradaTmb): number | null {
  const { equacao, sexo, pesoKg: P, alturaCm: A, idade: I, massaMagraKg: MM } = e
  switch (equacao) {
    case 'cunningham':
      // 1980: TMB = 500 + 22 x MLG (kg). Não depende do sexo.
      return MM && MM > 0 ? 500 + 22 * MM : null
    case 'fao_oms': {
      if (!sexo || !P || P <= 0 || I === null || I < 0) return null
      const faixa = FAO[sexo].find(([ate]) => I < ate)
      return faixa ? faixa[1] * P + faixa[2] : null
    }
    case 'mifflin':
      if (!sexo || !P || P <= 0 || !A || A <= 0 || I === null || I < 0) return null
      // H: +5; M: -161
      return 10 * P + 6.25 * A - 5 * I + (sexo === 'M' ? 5 : -161)
    case 'harris_benedict':
      if (!sexo || !P || P <= 0 || !A || A <= 0 || I === null || I < 0) return null
      return sexo === 'M'
        ? 66.473 + 13.7516 * P + 5.0033 * A - 6.755 * I
        : 655.0955 + 9.5634 * P + 1.8496 * A - 4.6756 * I
    case 'harris_benedict_1984':
      if (!sexo || !P || P <= 0 || !A || A <= 0 || I === null || I < 0) return null
      return sexo === 'M'
        ? 88.362 + 13.397 * P + 4.799 * A - 5.677 * I
        : 447.593 + 9.247 * P + 3.098 * A - 4.33 * I
  }
}

export interface NivelAtividade { id: string; rotulo: string; fator: number }
export const NIVEIS_ATIVIDADE: NivelAtividade[] = [
  { id: 'sedentario',  rotulo: 'Sedentário (pouco ou nenhum exercício)',        fator: 1.2 },
  { id: 'leve',        rotulo: 'Levemente ativo (1 a 3 dias por semana)',        fator: 1.375 },
  { id: 'moderado',    rotulo: 'Moderadamente ativo (3 a 5 dias por semana)',    fator: 1.55 },
  { id: 'intenso',     rotulo: 'Muito ativo (6 a 7 dias por semana)',            fator: 1.725 },
  { id: 'muito_intenso', rotulo: 'Extremamente ativo (atleta, treino em dobro)', fator: 1.9 },
]

/** GET = TMB x fator de atividade. */
export function calcularGet(tmb: number | null, fator: number | null): number | null {
  if (tmb === null || !fator || fator <= 0) return null
  return tmb * fator
}

export const KCAL_POR_G = { proteina: 4, carboidrato: 4, lipidio: 9 } as const

export interface Macros {
  kcal: number
  proteinaG: number
  carboidratoG: number
  lipidioG: number
  proteinaGkg: number
  carboidratoGkg: number
  lipidioGkg: number
  /** % do VET de cada macro (soma 100 quando o carboidrato não ficou negativo). */
  proteinaPct: number
  carboidratoPct: number
  lipidioPct: number
  /** Proteína e lipídio sozinhos já passam da meta calórica: sobra negativa de carboidrato. */
  estouro: boolean
}

/**
 * Divide a meta calórica em macros a partir de proteína e lipídio em g/kg; o carboidrato fica com o que sobra:
 * CHO (g) = (kcal - 4 x proteína - 9 x lipídio) / 4.
 */
export function dividirMacros(args: { kcal: number | null; pesoKg: number | null; proteinaGkg: number | null; lipidioGkg: number | null }): Macros | null {
  const { kcal, pesoKg, proteinaGkg, lipidioGkg } = args
  if (!kcal || kcal <= 0 || !pesoKg || pesoKg <= 0 || proteinaGkg === null || lipidioGkg === null) return null
  const pG = proteinaGkg * pesoKg
  const lG = lipidioGkg * pesoKg
  const sobra = kcal - pG * KCAL_POR_G.proteina - lG * KCAL_POR_G.lipidio
  const estouro = sobra < 0
  const cG = Math.max(0, sobra / KCAL_POR_G.carboidrato)
  const pct = (g: number, f: number) => arredondar((g * f / kcal) * 100, 1)
  return {
    kcal: arredondar(kcal, 0),
    proteinaG: arredondar(pG, 1),
    carboidratoG: arredondar(cG, 1),
    lipidioG: arredondar(lG, 1),
    proteinaGkg: arredondar(proteinaGkg, 2),
    carboidratoGkg: arredondar(cG / pesoKg, 2),
    lipidioGkg: arredondar(lipidioGkg, 2),
    proteinaPct: pct(pG, KCAL_POR_G.proteina),
    carboidratoPct: pct(cG, KCAL_POR_G.carboidrato),
    lipidioPct: pct(lG, KCAL_POR_G.lipidio),
    estouro,
  }
}
