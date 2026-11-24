// Tabela de preços do contrato da MyClinica. Fonte única: o servidor recalcula tudo aqui e nunca confia
// em valor vindo do navegador. Cálculo em centavos (inteiros) para não acumular erro de ponto flutuante;
// a API pública devolve reais com 2 casas (o banco guarda numeric(10,2)).
//
// Três formas de pagar:
//   - mensal sem contrato (preço de tabela, cancela quando quiser);
//   - contrato de 3/6/12 meses pago mês a mês (assinatura no Asaas, preço mensal reduzido);
//   - contrato de 3/6/12 meses à vista (cobrança única; se parcelar no cartão, a taxa do parcelamento
//     é repassada ao cliente).

import type { PublicPlan } from '@/lib/planCatalog'
import { valorPrimeiraCobranca } from '@/lib/promoPrimeiraCobranca'

export const CONTRACT_MONTHS = [3, 6, 12] as const
export type ContractMonths = (typeof CONTRACT_MONTHS)[number]
export type ContractPaymentMode = 'monthly' | 'upfront'

export function isContractMonths(n: unknown): n is ContractMonths {
  return typeof n === 'number' && (CONTRACT_MONTHS as readonly number[]).includes(n)
}

export function isContractPaymentMode(v: unknown): v is ContractPaymentMode {
  return v === 'monthly' || v === 'upfront'
}

/** Planos que entram em contrato: os oferecidos ao público. */
export type ContractPlan = PublicPlan

// ── Tabela (centavos) ───────────────────────────────────────────────────────

/** Mensal sem contrato. */
const MONTHLY_NO_CONTRACT: Record<ContractPlan, number> = {
  essencial: 9990,
  completo: 12990,
  equipe: 16990,
}

/** Contrato pago mês a mês: valor POR MÊS. */
const MONTHLY_CONTRACT: Record<ContractPlan, Record<ContractMonths, number>> = {
  essencial: { 3: 8990, 6: 8490, 12: 7990 },
  completo: { 3: 11690, 6: 10990, 12: 10390 },
  equipe: { 3: 15290, 6: 14390, 12: 13590 },
}

/** Contrato à vista: valor TOTAL do contrato. */
const UPFRONT_TOTAL: Record<ContractPlan, Record<ContractMonths, number>> = {
  essencial: { 3: 25390, 6: 47890, 12: 89890 },
  completo: { 3: 33090, 6: 62290, 12: 116890 },
  equipe: { 3: 43290, 6: 81490, 12: 152890 },
}

const toReais = (cents: number): number => Math.round(cents) / 100

// ── Taxa de parcelamento no cartão (repassada ao cliente) ───────────────────

/**
 * Tabela do Asaas contratado (conferida em 2026-11-24): 1x 2,99% + R$ 0,49; 2 a 6x 3,49% + R$ 0,49;
 * 7 a 12x 3,99% + R$ 0,49. Se o Asaas mudar a tabela, atualizar aqui.
 *
 * Cada faixa de parcelas tem um percentual sobre o valor cobrado e uma tarifa fixa por cobrança (centavos).
 * 1x no cartão fica sem acréscimo (a taxa à vista é absorvida pela MyClinica). A taxa é calculada "por dentro":
 * o cliente paga o valor líquido do contrato mais o que o Asaas vai reter, de modo que a MyClinica receba
 * o valor do contrato inteiro.
 */
export const CARD_INSTALLMENT_FEES: { from: number; to: number; percent: number; fixedCents: number }[] = [
  { from: 1, to: 1, percent: 0, fixedCents: 0 },
  { from: 2, to: 6, percent: 3.49, fixedCents: 49 },  { from: 7, to: 12, percent: 3.99, fixedCents: 49 },]

export const MAX_INSTALLMENTS = 12
/** Menor parcela aceita no cartão pelo Asaas. */
export const MIN_INSTALLMENT_CENTS = 500

function feeTierFor(installments: number) {
  return CARD_INSTALLMENT_FEES.find(t => installments >= t.from && installments <= t.to) ?? null
}

// ── Preços ──────────────────────────────────────────────────────────────────

/** Mensal sem contrato (preço de tabela), em reais. */
export function monthlyPriceNoContract(plan: ContractPlan): number {
  return toReais(MONTHLY_NO_CONTRACT[plan])
}

/** Valor por mês do contrato pago mês a mês, em reais. */
export function monthlyContractPrice(plan: ContractPlan, months: ContractMonths): number {
  return toReais(MONTHLY_CONTRACT[plan][months])
}

/** Total do contrato à vista, em reais (sem taxa de cartão). */
export function upfrontContractTotal(plan: ContractPlan, months: ContractMonths): number {
  return toReais(UPFRONT_TOTAL[plan][months])
}

/** Total do contrato (sem taxa de cartão), em centavos. */
export function contractTotalCents(plan: ContractPlan, months: ContractMonths, mode: ContractPaymentMode): number {
  return mode === 'monthly' ? MONTHLY_CONTRACT[plan][months] * months : UPFRONT_TOTAL[plan][months]
}

/** Total do contrato (sem taxa de cartão), em reais. */
export function contractTotal(plan: ContractPlan, months: ContractMonths, mode: ContractPaymentMode): number {
  return toReais(contractTotalCents(plan, months, mode))
}

/**
 * Valor mensal equivalente: no mês a mês é o valor da mensalidade; no à vista é o total dividido pelos meses
 * (informativo, não é cobrado assim).
 */
export function contractMonthlyValue(plan: ContractPlan, months: ContractMonths, mode: ContractPaymentMode): number {
  return mode === 'monthly' ? monthlyContractPrice(plan, months) : toReais(Math.round(UPFRONT_TOTAL[plan][months] / months))
}

/** Economia do contrato frente a pagar `months` mensalidades sem contrato, em reais (nunca negativa). */
export function contractSavings(plan: ContractPlan, months: ContractMonths, mode: ContractPaymentMode): number {
  const semContrato = MONTHLY_NO_CONTRACT[plan] * months
  return toReais(Math.max(semContrato - contractTotalCents(plan, months, mode), 0))
}

// ── Cartão ──────────────────────────────────────────────────────────────────

/** Taxa de parcelamento repassada ao cliente (centavos) para cobrar `netCents` em `installments` parcelas. */
export function cardFeeCents(netCents: number, installments: number): number {
  return cardChargeCents(netCents, installments) - netCents
}

/**
 * Total cobrado no cartão (centavos), já com a taxa repassada. Arredondado para cima até um múltiplo de
 * `installments` centavos, para as parcelas terem o mesmo valor.
 */
export function cardChargeCents(netCents: number, installments: number): number {
  const tier = feeTierFor(installments)
  if (!tier) throw new RangeError(`Parcelamento inválido: ${installments}x`)
  if (tier.percent === 0 && tier.fixedCents === 0) return netCents
  const raw = (netCents + tier.fixedCents) / (1 - tier.percent / 100)
  return Math.ceil(raw / installments - 1e-9) * installments
}

/** Total cobrado no cartão em reais, com a taxa repassada. */
export function cardChargeTotal(netTotal: number, installments: number): number {
  return toReais(cardChargeCents(Math.round(netTotal * 100), installments))
}

// ── Orçamento do contrato (o que o servidor grava) ──────────────────────────

export interface ContractQuote {
  plan: ContractPlan
  months: ContractMonths
  paymentMode: ContractPaymentMode
  installments: number
  /** Valor da mensalidade (mês a mês) ou total/meses (à vista; informativo). */
  monthlyValue: number
  /** Total do contrato sem taxa de cartão. */
  contractTotal: number
  /** Taxa de parcelamento repassada ao cliente (0 sem parcelamento). */
  cardFeeValue: number
  /** O que é de fato cobrado de uma vez no à vista (contractTotal + cardFeeValue); no mês a mês, o total do contrato. */
  totalValue: number
  /** Valor de cada parcela do cartão (à vista parcelado); igual a totalValue em 1x. */
  installmentValue: number
  /** Economia frente ao mensal sem contrato. */
  savings: number
  /** Promoção de 50% na primeira mensalidade aplicada (só no mês a mês). */
  promo: boolean
  /** Valor da primeira mensalidade (igual a monthlyValue sem promoção). No à vista: igual ao totalValue. */
  firstValue: number
}

export type QuoteResult = { ok: true; quote: ContractQuote } | { ok: false; error: string }

/**
 * Valida e calcula o orçamento. `installments` só vale no à vista (>= 2 significa cartão parcelado, com a taxa
 * repassada); no mês a mês é sempre 1.
 */
export function quoteContract(input: {
  plan: unknown
  months: unknown
  paymentMode: unknown
  installments?: unknown
  /** Clínica elegível à promoção da primeira mensalidade (decidido por quem chama). Só vale no mês a mês. */
  promoPrimeira?: boolean
}): QuoteResult {
  const plan = input.plan
  if (plan !== 'essencial' && plan !== 'completo' && plan !== 'equipe') return { ok: false, error: 'Plano inválido.' }
  if (!isContractMonths(input.months)) return { ok: false, error: 'Prazo inválido. Escolha 3, 6 ou 12 meses.' }
  if (!isContractPaymentMode(input.paymentMode)) return { ok: false, error: 'Forma de pagamento inválida.' }
  const months = input.months
  const paymentMode = input.paymentMode

  let installments = 1
  if (paymentMode === 'upfront' && input.installments !== undefined && input.installments !== null) {
    const n = input.installments
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > MAX_INSTALLMENTS) {
      return { ok: false, error: `Parcelamento inválido. Use de 1 a ${MAX_INSTALLMENTS} parcelas.` }
    }
    installments = n
  } else if (paymentMode === 'monthly' && input.installments !== undefined && input.installments !== null && input.installments !== 1) {
    return { ok: false, error: 'Parcelamento só vale no pagamento à vista.' }
  }

  const promo = paymentMode === 'monthly' && input.promoPrimeira === true
  const mensalCents = MONTHLY_CONTRACT[plan][months]
  const firstCents = promo ? Math.round(valorPrimeiraCobranca(mensalCents / 100, true) * 100) : mensalCents
  // Promoção: só a primeira mensalidade é reduzida; o total do contrato cai na diferença.
  const net = contractTotalCents(plan, months, paymentMode) - (mensalCents - firstCents) * (paymentMode === 'monthly' ? 1 : 0)
  const charge = paymentMode === 'upfront' ? cardChargeCents(net, installments) : net
  if (installments > 1 && charge / installments < MIN_INSTALLMENT_CENTS) {
    return { ok: false, error: 'Parcela abaixo do mínimo de R$ 5,00. Use menos parcelas.' }
  }

  return {
    ok: true,
    quote: {
      plan,
      months,
      paymentMode,
      installments,
      monthlyValue: contractMonthlyValue(plan, months, paymentMode),
      contractTotal: toReais(net),
      cardFeeValue: toReais(charge - net),
      totalValue: toReais(charge),
      installmentValue: toReais(Math.round(charge / installments)),
      savings: toReais(Math.max(MONTHLY_NO_CONTRACT[plan] * months - net, 0)),
      promo,
      firstValue: paymentMode === 'monthly' ? toReais(firstCents) : toReais(charge),
    },
  }
}
