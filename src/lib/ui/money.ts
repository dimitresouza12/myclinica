import { formatCurrencyCompact } from '@/lib/utils'

/** "R$ 1.234": inteiro, com separador de milhar, sem centavos (rótulos de gráfico e legendas). */
export const moneyShort = (v: number) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`

/** Rótulo de eixo: inteiro abaixo de mil, "1,5 mil" a partir daí (negativos incluídos). */
export const axisMoney = (v: number) =>
  Math.abs(v) >= 1000
    ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
    : String(Math.round(v))

/** Valor curto para os indicadores: inteiro abaixo de mil, "R$ 34,2 mil" acima. */
export const statMoney = (v: number) => (Math.abs(v) < 1000 ? moneyShort(v) : formatCurrencyCompact(v))
