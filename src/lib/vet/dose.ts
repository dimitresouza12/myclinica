// Calculadora de dose por peso (mg/kg). Função pura: NÃO traz banco de medicamentos nem sugere dose;
// o veterinário informa a dose em mg/kg e a concentração do produto que tem em mãos, a conta é só aritmética.
// A tela sempre mostra "conferir a dose antes de prescrever".

import { fmt, lerNumero } from './numeros'

export type TipoConcentracao = 'mg_ml' | 'mg_comprimido' | 'percentual'

export const TIPOS_CONCENTRACAO: { value: TipoConcentracao; label: string; unidade: string }[] = [
  { value: 'mg_ml', label: 'mg por mL (líquido, injetável)', unidade: 'mg/mL' },
  { value: 'mg_comprimido', label: 'mg por comprimido', unidade: 'mg/comprimido' },
  { value: 'percentual', label: '% (g por 100 mL)', unidade: '%' },
]

export const AVISO_CONFERIR = 'Confira a dose antes de prescrever. Esta conta é só aritmética: não considera espécie, idade, função renal ou hepática, nem a bula do produto.'

/** Limites de entrada: fora disso o cálculo não roda (quase sempre é erro de digitação). */
export const LIMITES_DOSE = {
  pesoKg: { min: 0.005, max: 2000 },
  doseMgKg: { min: 0.0001, max: 1000 },
  mgPorMl: { min: 0.001, max: 5000 },
  mgPorComprimido: { min: 0.01, max: 10000 },
  percentual: { min: 0.0001, max: 100 },
} as const

/** Menor fração de comprimido considerada: um quarto. */
export const FRACAO_COMPRIMIDO = 0.25
/** Menor volume medido com folga numa seringa comum (mL); abaixo disso a tela avisa. */
export const VOLUME_MINIMO_ML = 0.1
/** A partir desta diferença (%) entre a dose pedida e a dose entregue depois de arredondar, a tela avisa. */
export const LIMITE_DIFERENCA_PCT = 5

export interface EntradaDose {
  /** mg por kg de peso, por administração */
  doseMgKg: unknown
  pesoKg: unknown
  tipo: TipoConcentracao
  /** valor na unidade do tipo escolhido (mg/mL, mg/comprimido ou %) */
  concentracao: unknown
}

export interface ResultadoDose {
  ok: true
  /** dose total pedida, em mg */
  doseMg: number
  /** concentração normalizada: mg/mL ou mg/comprimido */
  mgPorUnidade: number
  /** volume exato em mL (tipos líquidos) */
  volumeMl: number | null
  /** volume arredondado a 0,01 mL */
  volumeArredondadoMl: number | null
  /** comprimidos exatos (tipo comprimido) */
  comprimidos: number | null
  /** comprimidos arredondados ao quarto mais próximo */
  comprimidosArredondados: number | null
  /** dose realmente entregue com o arredondamento, em mg */
  doseEntregueMg: number
  /** dose entregue em mg/kg */
  doseEntregueMgKg: number
  /** diferença percentual entre a dose entregue e a pedida (com sinal) */
  diferencaPct: number
  avisos: string[]
}

export type CalculoDose = ResultadoDose | { ok: false; erros: string[] }

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

function validar(rotulo: string, n: number | null, lim: { min: number; max: number }, un: string): string | null {
  if (n === null) return `Informe ${rotulo}.`
  if (n < lim.min || n > lim.max) return `${rotulo[0].toUpperCase()}${rotulo.slice(1)} fora do esperado (${fmt(lim.min, 4)} a ${fmt(lim.max, 0)} ${un}).`
  return null
}

/** Calcula o volume (mL) ou os comprimidos para a dose por peso. Entrada inválida: lista de erros e nada calculado. */
export function calcularDose(e: EntradaDose): CalculoDose {
  const peso = lerNumero(e.pesoKg)
  const dose = lerNumero(e.doseMgKg)
  const conc = lerNumero(e.concentracao)
  const limConc = e.tipo === 'mg_ml' ? LIMITES_DOSE.mgPorMl : e.tipo === 'mg_comprimido' ? LIMITES_DOSE.mgPorComprimido : LIMITES_DOSE.percentual
  const unConc = e.tipo === 'mg_ml' ? 'mg/mL' : e.tipo === 'mg_comprimido' ? 'mg/comprimido' : '%'
  const erros = [
    validar('o peso', peso, LIMITES_DOSE.pesoKg, 'kg'),
    validar('a dose', dose, LIMITES_DOSE.doseMgKg, 'mg/kg'),
    validar('a concentração', conc, limConc, unConc),
  ].filter((x): x is string => x !== null)
  if (erros.length || peso === null || dose === null || conc === null) return { ok: false, erros }

  const doseMg = dose * peso
  const avisos: string[] = []
  // 1 % = 1 g / 100 mL = 10 mg/mL
  const mgPorUnidade = e.tipo === 'percentual' ? conc * 10 : conc

  let volumeMl: number | null = null
  let volumeArred: number | null = null
  let comp: number | null = null
  let compArred: number | null = null
  let entregue: number

  if (e.tipo === 'mg_comprimido') {
    comp = doseMg / mgPorUnidade
    compArred = Math.round(comp / FRACAO_COMPRIMIDO) * FRACAO_COMPRIMIDO
    if (compArred === 0) {
      avisos.push('A dose é menor que 1/4 de comprimido: não dá para fracionar com segurança. Considere outra apresentação, como solução ou manipulado.')
    }
    entregue = compArred * mgPorUnidade
  } else {
    volumeMl = doseMg / mgPorUnidade
    volumeArred = r2(volumeMl)
    if (volumeMl < VOLUME_MINIMO_ML) {
      avisos.push(`Volume muito pequeno (menos de ${fmt(VOLUME_MINIMO_ML, 1)} mL): a medida na seringa perde precisão. Considere diluir ou usar outra apresentação.`)
    }
    entregue = volumeArred * mgPorUnidade
  }

  const diferencaPct = doseMg > 0 ? ((entregue - doseMg) / doseMg) * 100 : 0
  if (Math.abs(diferencaPct) >= LIMITE_DIFERENCA_PCT && !(compArred === 0)) {
    avisos.push(`O arredondamento muda a dose em ${diferencaPct > 0 ? '+' : '-'}${fmt(Math.abs(diferencaPct), 1)}% em relação ao pedido.`)
  }
  if (e.tipo === 'mg_comprimido' && compArred !== null && compArred > 0 && comp !== null && Math.abs(comp - compArred) > 1e-9) {
    avisos.push('O comprimido foi arredondado para o quarto mais próximo (1/4, 1/2, 3/4...).')
  }
  if (volumeArred !== null && Math.abs(volumeMl! - volumeArred) > 1e-9 && volumeMl! >= VOLUME_MINIMO_ML) {
    avisos.push('O volume foi arredondado para 0,01 mL.')
  }

  return {
    ok: true,
    doseMg,
    mgPorUnidade,
    volumeMl,
    volumeArredondadoMl: volumeArred,
    comprimidos: comp,
    comprimidosArredondados: compArred,
    doseEntregueMg: entregue,
    doseEntregueMgKg: entregue / peso,
    diferencaPct,
    avisos,
  }
}

/** 0.25 -> "1/4", 1.5 -> "1 e 1/2", 2 -> "2", 0 -> "0". Só para múltiplos de 1/4. */
export function fracaoDeComprimido(n: number): string {
  const q = Math.round(n * 4)
  const inteiro = Math.floor(q / 4)
  const resto = q % 4
  const frac = resto === 1 ? '1/4' : resto === 2 ? '1/2' : resto === 3 ? '3/4' : ''
  if (!frac) return String(inteiro)
  return inteiro === 0 ? frac : `${inteiro} e ${frac}`
}
