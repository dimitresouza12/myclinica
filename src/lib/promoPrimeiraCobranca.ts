// Promoção da primeira cobrança: quem CADASTROU a clínica na janela abaixo paga metade na primeira mensalidade.
// Vale a data de cadastro da clínica (clinics.created_at), nunca a data da assinatura do cartão.
// A data da primeira cobrança não é decidida aqui: vem de firstDueDateFor (src/lib/campanha.ts).

import { hojeBrasil } from '@/lib/brasilDate'

/** Primeiro e último dia (inclusive, fuso de Brasília) de cadastro que dão direito à promoção. */
export const PROMO_CADASTRO_INICIO = '2026-11-23'
export const PROMO_CADASTRO_FIM = '2026-11-30'

/**
 * True se o dia de cadastro da clínica (fuso de Brasília) está entre INICIO e FIM, inclusive. Sem data válida: false.
 * O segundo parâmetro existe só pela assinatura combinada com o frontend e não influencia: a elegibilidade depende
 * apenas de created_at.
 */
export function elegivelPromoPrimeiraCobranca(createdAt: string | Date | null | undefined, hoje: Date = new Date()): boolean {
  void hoje
  if (!createdAt) return false
  const d = createdAt instanceof Date ? createdAt : new Date(createdAt)
  if (Number.isNaN(d.getTime())) return false
  const dia = hojeBrasil(d)
  return dia >= PROMO_CADASTRO_INICIO && dia <= PROMO_CADASTRO_FIM
}

/** Valor da primeira cobrança: metade (arredondada a 2 casas) se elegível, senão o valor cheio. */
export function valorPrimeiraCobranca(valorCheio: number, elegivel: boolean): number {
  if (!elegivel) return valorCheio
  // Em centavos inteiros: 129,90 -> 12990 -> 6495; 99,90 -> 9990 -> 4995; ímpar arredonda para cima (Math.round).
  return Math.round(Math.round(valorCheio * 100) / 2) / 100
}
