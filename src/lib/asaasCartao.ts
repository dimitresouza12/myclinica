// Assinatura mensal no cartão de crédito do Asaas. Sem acesso a banco: recebe a AsaasApi por parâmetro (os testes
// usam um mock) e quem chama decide onde guardar os ids. Cliente do Asaas: ensureAsaasCustomer (asaasContrato.ts).
//
// SEGURANÇA DO CARTÃO: número, validade e CVV só trafegam no corpo do POST /subscriptions. Nenhuma mensagem de erro,
// log ou retorno desta lib carrega esses dados nem o corpo cru da resposta do Asaas: o erro lançado (AsaasCardError)
// leva só uma categoria e os códigos de erro do Asaas (ex.: invalid_creditCard).
//
// externalReference é o id da clínica: o webhook acha a clínica por ele, e as cobranças da assinatura o herdam.
// A assinatura NÃO tem endDate (sem fim), ao contrário da do contrato.

import type { AsaasApi } from '@/lib/asaas'

export interface CardData {
  holderName: string
  /** Só dígitos. */
  number: string
  /** MM */
  expiryMonth: string
  /** AAAA */
  expiryYear: string
  ccv: string
}

export interface CardHolderInfo {
  name: string
  email: string
  /** CPF ou CNPJ, só dígitos. */
  cpfCnpj: string
  /** CEP, 8 dígitos. */
  postalCode: string
  addressNumber: string
  /** Telefone com DDD, só dígitos. */
  phone: string
}

export interface CardSubscriptionInput {
  customerId: string
  clinicId: string
  /** Valor da PRIMEIRA cobrança (já com a promoção, se houver). */
  value: number
  /** AAAA-MM-DD da primeira cobrança. */
  firstDueDate: string
  description: string
  card: CardData
  holder: CardHolderInfo
  /** IP real do pagador (exigência do Asaas para cobrança no cartão). */
  remoteIp: string
}

export type AsaasCardErrorKind = 'recusado' | 'invalido' | 'indisponivel'

/** Dado do titular que o Asaas apontou como inválido (lido da description do erro; a description em si nunca é guardada). */
export type AsaasHolderField = 'cep' | 'documento' | 'telefone'

/** Erro do Asaas na assinatura no cartão: categoria + códigos. A mensagem nunca tem dado de cartão nem corpo cru. */
export class AsaasCardError extends Error {
  readonly kind: AsaasCardErrorKind
  readonly codes: string[]
  /** Preenchido só em kind 'invalido' quando o erro é de um dado do titular (e não do cartão). */
  readonly field: AsaasHolderField | null
  constructor(kind: AsaasCardErrorKind, codes: string[], field: AsaasHolderField | null = null) {
    super(`Asaas: assinatura no cartão não criada (${kind}${codes.length ? `: ${codes.join(',')}` : ''})`)
    this.name = 'AsaasCardError'
    this.kind = kind
    this.codes = codes
    this.field = field
  }
}

const CODE_RE = /^[A-Za-z0-9_.-]{1,64}$/

interface ParsedAsaasError { code: string; field: AsaasHolderField | null }

/** Qual dado do titular a description do Asaas cita. Só classifica; o texto não sai daqui. */
function holderFieldOf(description: unknown): AsaasHolderField | null {
  if (typeof description !== 'string') return null
  const t = description.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/\bcep\b/.test(t)) return 'cep'
  if (/\b(cpf|cnpj)\b/.test(t)) return 'documento'
  if (/\b(telefone|celular|fone)\b/.test(t)) return 'telefone'
  return null
}

/** Itens ("code" + dado do titular citado) do corpo JSON que o asaasPost deixa na mensagem do Error. Ignora o resto. */
function errorsFrom(e: unknown): ParsedAsaasError[] {
  const msg = e instanceof Error ? e.message : ''
  const at = msg.indexOf('{')
  if (at < 0) return []
  try {
    const parsed = JSON.parse(msg.slice(at)) as { errors?: { code?: unknown; description?: unknown }[] }
    const out: ParsedAsaasError[] = []
    for (const it of parsed.errors ?? []) {
      if (typeof it?.code === 'string' && CODE_RE.test(it.code)) out.push({ code: it.code, field: holderFieldOf(it.description) })
    }
    return out
  } catch {
    return []
  }
}

function classify(e: unknown): AsaasCardError {
  const items = errorsFrom(e)
  const codes = items.map(i => i.code)
  if (codes.length === 0) return new AsaasCardError('indisponivel', [])
  // O Asaas usa invalid_creditCard também para CEP, CPF/CNPJ e telefone do titular: a description decide.
  const field = items.find(i => i.field)?.field ?? null
  if (field) return new AsaasCardError('invalido', codes, field)
  // invalid_creditCard sem dado do titular: a operadora não autoriza ou o cartão não passa na validação.
  if (codes.some(c => c === 'invalid_creditCard')) return new AsaasCardError('recusado', codes)
  return new AsaasCardError('invalido', codes)
}

export interface CardSummary {
  /** 4 últimos dígitos, como o Asaas devolveu; null se não vieram. */
  cardLast4: string | null
  /** Bandeira (ex.: VISA, MASTERCARD), como o Asaas devolveu; null se não veio. */
  cardBrand: string | null
}

/**
 * Resumo do cartão a partir do objeto `creditCard` que o Asaas devolve na assinatura. Só lê a resposta do Asaas, nunca o que
 * o cliente enviou, e só aceita o formato esperado (4 dígitos; bandeira curta e simples).
 */
export function cardSummaryFrom(creditCard: unknown): CardSummary {
  const c = (creditCard && typeof creditCard === 'object' ? creditCard : {}) as { creditCardNumber?: unknown; creditCardBrand?: unknown }
  const last4 = typeof c.creditCardNumber === 'string' && /^\d{4}$/.test(c.creditCardNumber) ? c.creditCardNumber : null
  const brand = typeof c.creditCardBrand === 'string' && /^[A-Za-z0-9_ -]{1,30}$/.test(c.creditCardBrand.trim()) ? c.creditCardBrand.trim() : null
  return { cardLast4: last4, cardBrand: brand }
}

/** Cria a assinatura mensal no cartão. Lança AsaasCardError em falha do Asaas (sem dado de cartão na mensagem). */
export async function createCardSubscription(api: AsaasApi, i: CardSubscriptionInput): Promise<{ id: string } & CardSummary> {
  const holder: Record<string, string> = {
    name: i.holder.name,
    email: i.holder.email,
    cpfCnpj: i.holder.cpfCnpj,
    postalCode: i.holder.postalCode,
    addressNumber: i.holder.addressNumber,
  }
  // Celular (11 dígitos) vai em mobilePhone; fixo (10) em phone.
  if (i.holder.phone.length === 11) holder.mobilePhone = i.holder.phone
  else holder.phone = i.holder.phone

  let created: { id?: string; creditCard?: unknown } | undefined
  try {
    created = await api.post<{ id?: string; creditCard?: unknown }>('/subscriptions', {
      customer: i.customerId,
      billingType: 'CREDIT_CARD',
      value: i.value,
      nextDueDate: i.firstDueDate,
      cycle: 'MONTHLY',
      description: i.description,
      externalReference: i.clinicId,
      creditCard: {
        holderName: i.card.holderName,
        number: i.card.number,
        expiryMonth: i.card.expiryMonth,
        expiryYear: i.card.expiryYear,
        ccv: i.card.ccv,
      },
      creditCardHolderInfo: holder,
      remoteIp: i.remoteIp,
    })
  } catch (e) {
    throw classify(e)
  }
  if (!created?.id) throw new AsaasCardError('indisponivel', [])
  return { id: created.id, ...cardSummaryFrom(created.creditCard) }
}

/**
 * Troca o valor da assinatura (volta ao valor cheio depois da primeira cobrança com desconto). Com updatePendingPayments
 * true, a cobrança pendente passa para o valor novo; a cobrança já confirmada não muda (validado no sandbox).
 */
export async function fixSubscriptionValue(api: AsaasApi, subscriptionId: string, value: number): Promise<void> {
  await api.put(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { value, updatePendingPayments: true })
}

function holderBody(h: CardHolderInfo): Record<string, string> {
  const out: Record<string, string> = {
    name: h.name, email: h.email, cpfCnpj: h.cpfCnpj, postalCode: h.postalCode, addressNumber: h.addressNumber,
  }
  if (h.phone.length === 11) out.mobilePhone = h.phone
  else out.phone = h.phone
  return out
}

/**
 * Troca o cartão de uma assinatura que já existe (PUT /subscriptions/{id}/creditCard). Devolve o resumo do cartão novo e o
 * token dele, que serve para cobrar uma fatura em aberto sem reenviar os dados do cartão. O token nunca vai para o cliente.
 */
export async function updateSubscriptionCard(
  api: AsaasApi, subscriptionId: string, i: { card: CardData; holder: CardHolderInfo; remoteIp: string },
): Promise<CardSummary & { token: string | null }> {
  let res: { creditCard?: unknown } | undefined
  try {
    res = await api.put<{ creditCard?: unknown }>(`/subscriptions/${encodeURIComponent(subscriptionId)}/creditCard`, {
      creditCard: {
        holderName: i.card.holderName, number: i.card.number, expiryMonth: i.card.expiryMonth,
        expiryYear: i.card.expiryYear, ccv: i.card.ccv,
      },
      creditCardHolderInfo: holderBody(i.holder),
      remoteIp: i.remoteIp,
    })
  } catch (e) {
    throw classify(e)
  }
  const tok = (res?.creditCard as { creditCardToken?: unknown } | undefined)?.creditCardToken
  return { ...cardSummaryFrom(res?.creditCard), token: typeof tok === 'string' && tok ? tok : null }
}

/** Cobra uma fatura em aberto no cartão já registrado (token). Lança AsaasCardError em recusa. */
export async function payWithCardToken(api: AsaasApi, paymentId: string, token: string, remoteIp: string): Promise<void> {
  try {
    await api.post(`/payments/${encodeURIComponent(paymentId)}/payWithCreditCard`, { creditCardToken: token, remoteIp })
  } catch (e) {
    throw classify(e)
  }
}
