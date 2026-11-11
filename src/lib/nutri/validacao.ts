// Leitura e limites dos números digitados na Avaliação nutricional. Funções puras.
//
// Os campos guardam texto com PONTO decimal ("72.5"); aqui o texto vira número e é conferido contra uma
// faixa plausível. Fora da faixa o valor NÃO entra nos cálculos e a tela mostra o motivo (nunca um cálculo
// silencioso com um peso de 720 kg digitado errado).

export interface Limite { min: number; max: number; un: string; rotulo: string }

export const LIMITES = {
  peso:        { min: 2,   max: 400, un: 'kg', rotulo: 'Peso' },
  altura:      { min: 40,  max: 250, un: 'cm', rotulo: 'Altura' },
  cintura:     { min: 20,  max: 250, un: 'cm', rotulo: 'Cintura' },
  quadril:     { min: 30,  max: 250, un: 'cm', rotulo: 'Quadril' },
  dobra:       { min: 1,   max: 80,  un: 'mm', rotulo: 'Dobra cutânea' },
  pctGordura:  { min: 2,   max: 70,  un: '%',  rotulo: '% de gordura' },
  massa:       { min: 0.5, max: 300, un: 'kg', rotulo: 'Massa' },
  idade:       { min: 1,   max: 120, un: 'anos', rotulo: 'Idade' },
  fatorAtividade: { min: 1, max: 2.6, un: '', rotulo: 'Fator de atividade' },
  gkg:         { min: 0,   max: 6,   un: 'g/kg', rotulo: 'Macronutriente' },
  ajusteKcal:  { min: -2500, max: 2500, un: 'kcal', rotulo: 'Ajuste calórico' },
} as const satisfies Record<string, Limite>

export type LimiteKey = keyof typeof LIMITES

/** "72,5" ou "72.5" ou 72.5 viram 72.5; vazio, texto ou não finito viram null. */
export function lerNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export type Leitura = { valor: number; erro?: undefined } | { valor: null; erro: string | null }

const fmt = (n: number) => String(n).replace('.', ',')

/**
 * Lê e valida um campo. Vazio = sem erro e sem valor (campo opcional não preenchido).
 * Fora da faixa = sem valor e com a mensagem a exibir.
 */
export function validar(v: unknown, chave: LimiteKey): Leitura {
  const n = lerNumero(v)
  if (n === null) return { valor: null, erro: v === null || v === undefined || v === '' ? null : 'Digite um número.' }
  const l: Limite = LIMITES[chave]
  if (n < l.min || n > l.max) {
    return { valor: null, erro: `${l.rotulo} fora do esperado (${fmt(l.min)} a ${fmt(l.max)}${l.un ? ' ' + l.un : ''}).` }
  }
  return { valor: n }
}

/** Atalho: só o número válido ou null. */
export const numeroValido = (v: unknown, chave: LimiteKey): number | null => validar(v, chave).valor

/** Arredonda para `casas` casas decimais (evita 0.1 + 0.2 aparecendo na tela). */
export function arredondar(n: number, casas = 1): number {
  const f = 10 ** casas
  return Math.round((n + Number.EPSILON) * f) / f
}

/** 72.5 -> "72,5"; null/NaN -> "—". */
export function formatarNumero(n: number | null | undefined, casas = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return arredondar(n, casas).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas })
}

/** Idade em anos completos na data `ate` (AAAA-MM-DD); null sem nascimento válido ou com data futura. */
export function idadeEm(nascimento: string | null | undefined, ate: string): number | null {
  if (!nascimento) return null
  const n = nascimento.slice(0, 10).split('-').map(Number)
  const a = ate.slice(0, 10).split('-').map(Number)
  if (n.length !== 3 || a.length !== 3 || [...n, ...a].some(x => !Number.isFinite(x))) return null
  let idade = a[0] - n[0]
  if (a[1] < n[1] || (a[1] === n[1] && a[2] < n[2])) idade--
  return idade >= 0 && idade <= 120 ? idade : null
}
