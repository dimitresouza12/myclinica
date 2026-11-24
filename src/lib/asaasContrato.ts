// Cobrança do contrato da clínica no Asaas: cliente, assinatura (mês a mês) e cobrança única/parcelada (à vista).
// Tudo recebe o cliente da API por parâmetro (AsaasApi), então os testes usam um mock e nada aqui chama o Asaas
// de produção sozinho. Sem acesso a banco: quem chama decide onde guardar os ids.
//
// externalReference é SEMPRE o id da clínica: o webhook (api/asaas/webhook) acha a clínica por ele, e as
// cobranças geradas por uma assinatura herdam o externalReference dela.

import type { AsaasApi } from '@/lib/asaas'
import type { ContractMonths, ContractPaymentMode } from '@/lib/contratoPrecos'

export interface AsaasCustomer { id: string; deleted?: boolean }
export interface AsaasSubscription { id: string; status?: string }
export interface AsaasPayment { id: string; invoiceUrl?: string; installment?: string | null; status?: string }
interface AsaasList<T> { data?: T[] }

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Soma meses a uma data AAAA-MM-DD mantendo o dia (ou o último dia do mês quando o dia não existe). */
export function addMonthsIso(day: string, months: number): string {
  if (!DAY_RE.test(day)) throw new Error(`Data inválida: ${day}`)
  const [y, m, d] = day.split('-').map(Number)
  const total = (y * 12 + (m - 1)) + months
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate()
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

export interface CustomerInput {
  /** Id já guardado em clinics.asaas_customer_real_id, se houver. */
  existingId?: string | null
  clinicId: string
  name: string
  cpfCnpj: string
  email?: string | null
  /** Telefone com DDD, só dígitos. */
  phone?: string | null
}

/** Reaproveita o cliente da clínica (id guardado ou externalReference) ou cria um. Nunca cria duplicado se achar. */
export async function ensureAsaasCustomer(api: AsaasApi, c: CustomerInput): Promise<string> {
  if (c.existingId) {
    try {
      const found = await api.get<AsaasCustomer>(`/customers/${encodeURIComponent(c.existingId)}`)
      if (found?.id && !found.deleted) return found.id
    } catch {
      // cliente apagado ou id inválido no Asaas: segue para buscar/criar
    }
  }
  const byRef = await api.get<AsaasList<AsaasCustomer>>(`/customers?externalReference=${encodeURIComponent(c.clinicId)}&limit=1`)
  const hit = byRef?.data?.find(x => x?.id && !x.deleted)
  if (hit) return hit.id

  const body: Record<string, unknown> = { name: c.name, cpfCnpj: c.cpfCnpj, externalReference: c.clinicId }
  if (c.email) body.email = c.email
  if (c.phone) body.mobilePhone = c.phone
  const created = await api.post<AsaasCustomer>('/customers', body)
  if (!created?.id) throw new Error('Asaas não devolveu o id do cliente')
  return created.id
}

export interface SubscriptionInput {
  customerId: string
  clinicId: string
  /** Mensalidade em reais (na promoção, o valor da primeira cobrança; o webhook restaura o cheio depois). */
  value: number
  /** AAAA-MM-DD da primeira cobrança. */
  firstDueDate: string
  months: ContractMonths
  description: string
}

/** Assinatura mensal que termina na última parcela do contrato (endDate = vencimento da parcela `months`). */
export async function createContractSubscription(api: AsaasApi, s: SubscriptionInput): Promise<AsaasSubscription> {
  const created = await api.post<AsaasSubscription>('/subscriptions', {
    customer: s.customerId,
    billingType: 'UNDEFINED',
    value: s.value,
    nextDueDate: s.firstDueDate,
    cycle: 'MONTHLY',
    endDate: addMonthsIso(s.firstDueDate, s.months - 1),
    description: s.description,
    externalReference: s.clinicId,
  })
  if (!created?.id) throw new Error('Asaas não devolveu o id da assinatura')
  return created
}

export interface UpfrontPaymentInput {
  customerId: string
  clinicId: string
  /** O que será cobrado no total (contrato + taxa de cartão, se parcelado). */
  totalValue: number
  installments: number
  firstDueDate: string
  description: string
}

/**
 * Cobrança do à vista. 1x: uma cobrança que aceita Pix, boleto ou cartão (UNDEFINED). Parcelado: só cartão,
 * com o total já incluindo a taxa repassada.
 */
export async function createContractPayment(api: AsaasApi, p: UpfrontPaymentInput): Promise<AsaasPayment> {
  const base = {
    customer: p.customerId,
    dueDate: p.firstDueDate,
    description: p.description,
    externalReference: p.clinicId,
  }
  const body = p.installments > 1
    ? { ...base, billingType: 'CREDIT_CARD', installmentCount: p.installments, totalValue: p.totalValue }
    : { ...base, billingType: 'UNDEFINED', value: p.totalValue }
  const created = await api.post<AsaasPayment>('/payments', body)
  if (!created?.id) throw new Error('Asaas não devolveu o id da cobrança')
  return created
}

export interface ContractBillingInput {
  existingCustomerId?: string | null
  clinicId: string
  customerName: string
  customerCpf: string
  customerEmail?: string | null
  customerPhone?: string | null
  paymentMode: ContractPaymentMode
  months: ContractMonths
  installments: number
  monthlyValue: number
  /** Primeira mensalidade com a promoção; nulo sem promoção. */
  firstValue?: number | null
  /** Total cobrado no à vista (já com a taxa de cartão). */
  totalValue: number
  firstDueDate: string
  description: string
}

export interface ContractBillingResult {
  customerId: string
  /** 'sub_...' (mês a mês) ou 'pay_...' (à vista). */
  ref: string
  kind: 'subscription' | 'payment'
  /** Link da fatura do Asaas, quando a cobrança já existe (à vista). */
  invoiceUrl: string | null
}

/** Cliente + (assinatura | cobrança), na ordem certa. Lança em qualquer falha do Asaas; não grava nada. */
export async function createContractBilling(api: AsaasApi, i: ContractBillingInput): Promise<ContractBillingResult> {
  const customerId = await ensureAsaasCustomer(api, {
    existingId: i.existingCustomerId, clinicId: i.clinicId, name: i.customerName, cpfCnpj: i.customerCpf,
    email: i.customerEmail, phone: i.customerPhone,
  })
  if (i.paymentMode === 'monthly') {
    const sub = await createContractSubscription(api, {
      customerId, clinicId: i.clinicId, value: i.firstValue ?? i.monthlyValue, firstDueDate: i.firstDueDate, months: i.months, description: i.description,
    })
    return { customerId, ref: sub.id, kind: 'subscription', invoiceUrl: null }
  }
  const pay = await createContractPayment(api, {
    customerId, clinicId: i.clinicId, totalValue: i.totalValue, installments: i.installments, firstDueDate: i.firstDueDate, description: i.description,
  })
  return { customerId, ref: pay.id, kind: 'payment', invoiceUrl: pay.invoiceUrl ?? null }
}
