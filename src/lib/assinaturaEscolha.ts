// Lógica pura da tela "escolher prazo e assinar". Nada de cálculo próprio de preço: tudo vem de
// contratoPrecos.ts (o servidor recalcula com a mesma fonte). Prazo 1 = mensal sem fidelidade.

import {
  CONTRACT_MONTHS, MAX_INSTALLMENTS, MIN_INSTALLMENT_CENTS, cardChargeCents, contractSavings, contractTotalCents,
  monthlyContractPrice, monthlyPriceNoContract, quoteContract, type ContractMonths, type ContractPaymentMode, type ContractPlan,
} from '@/lib/contratoPrecos'

export type Prazo = 1 | ContractMonths
export const PRAZOS: readonly Prazo[] = [1, ...CONTRACT_MONTHS]

export interface OpcaoPrazo {
  prazo: Prazo
  rotulo: string
  /** Valor por mês, em reais (no mês a mês). */
  valorMensal: number
  /** Percentual de desconto mês a mês frente ao sem fidelidade (0 no mensal). */
  descontoMensalPct: number
  /** Percentual de desconto à vista (0 no mensal). */
  descontoAvistaPct: number
  /** Economia em reais, mês a mês e à vista (0 no mensal). */
  economiaMensal: number
  economiaAvista: number
}

const pct = (full: number, price: number) => Math.round((1 - price / full) * 100)

export function opcoesDePrazo(plan: ContractPlan): OpcaoPrazo[] {
  const cheio = monthlyPriceNoContract(plan)
  return PRAZOS.map((prazo): OpcaoPrazo => {
    if (prazo === 1) {
      return { prazo, rotulo: 'Mensal, sem fidelidade', valorMensal: cheio, descontoMensalPct: 0, descontoAvistaPct: 0, economiaMensal: 0, economiaAvista: 0 }
    }
    const mensal = monthlyContractPrice(plan, prazo)
    const avista = contractTotalCents(plan, prazo, 'upfront') / 100
    return {
      prazo, rotulo: `${prazo} meses`, valorMensal: mensal,
      descontoMensalPct: pct(cheio, mensal),
      descontoAvistaPct: pct(cheio * prazo, avista),
      economiaMensal: contractSavings(plan, prazo, 'monthly'),
      economiaAvista: contractSavings(plan, prazo, 'upfront'),
    }
  })
}

export function fluxoDaEscolha(prazo: Prazo): 'cartao' | 'contrato' {
  return prazo === 1 ? 'cartao' : 'contrato'
}

/** Parcelas possíveis no à vista: de 1 até o máximo em que cada parcela fica em R$ 5,00 ou mais. */
export function parcelasPossiveis(plan: ContractPlan, months: ContractMonths): number[] {
  const net = contractTotalCents(plan, months, 'upfront')
  const r: number[] = []
  for (let n = 1; n <= MAX_INSTALLMENTS; n++) {
    if (n > 1 && cardChargeCents(net, n) / n < MIN_INSTALLMENT_CENTS) break
    r.push(n)
  }
  return r
}

export interface Resumo {
  prazo: Prazo
  fluxo: 'cartao' | 'contrato'
  /** Texto da cobrança, ex.: "R$ 89,90 por mês" ou "R$ 253,90 à vista". */
  valorMensal: number
  total: number
  taxaCartao: number
  /** O que é cobrado de uma vez (à vista) ou o total do contrato (mês a mês). */
  totalCobrado: number
  valorParcela: number
  parcelas: number
  economia: number
  /** Promoção Black Friday (50% na 1ª mensalidade) aplicada no contrato mês a mês. */
  promo: boolean
  /** Valor da primeira mensalidade (igual a valorMensal sem promoção). */
  primeiraMensalidade: number
  erro: string | null
}

export function resumoDaEscolha(input: { plan: ContractPlan; prazo: Prazo; mode: ContractPaymentMode; installments?: number; promoPrimeira?: boolean }): Resumo {
  const { plan, prazo } = input
  if (prazo === 1) {
    const v = monthlyPriceNoContract(plan)
    return { prazo, fluxo: 'cartao', valorMensal: v, total: v, taxaCartao: 0, totalCobrado: v, valorParcela: v, parcelas: 1, economia: 0, promo: false, primeiraMensalidade: v, erro: null }
  }
  const q = quoteContract({ plan, months: prazo, paymentMode: input.mode, installments: input.mode === 'upfront' ? input.installments ?? 1 : undefined, promoPrimeira: input.promoPrimeira })
  if (!q.ok) {
    return { prazo, fluxo: 'contrato', valorMensal: 0, total: 0, taxaCartao: 0, totalCobrado: 0, valorParcela: 0, parcelas: 1, economia: 0, promo: false, primeiraMensalidade: 0, erro: q.error }
  }
  const x = q.quote
  return {
    prazo, fluxo: 'contrato', valorMensal: x.monthlyValue, total: x.contractTotal, taxaCartao: x.cardFeeValue,
    totalCobrado: x.totalValue, valorParcela: x.installmentValue, parcelas: x.installments, economia: x.savings, promo: x.promo, primeiraMensalidade: x.firstValue, erro: null,
  }
}
