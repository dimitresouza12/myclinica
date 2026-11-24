// Processamento dos eventos do webhook do Asaas. SÓ NO SERVIDOR.
//
// Cada (payment.id, evento) é processado uma vez: a linha em asaas_payment_events é inserida ANTES dos efeitos
// (UNIQUE barra o reenvio) e apagada se um efeito falhar, para o Asaas poder reenviar. Enquanto a tabela
// (migração 20261150) não existe, processa sem deduplicar e avisa no log.
//
// O estado da clínica (billing_paid, billing_overdue_since, next_billing_date) é lido pelo layout do app, pelo admin
// e pelo Gestor; por isso um pagamento (parcela, mensalidade) não pode apagar a pendência de outro.

import type { SupabaseClient } from '@supabase/supabase-js'
import { motivoDoErro } from '@/lib/nutri/erros'
import { realAsaas, type AsaasApi } from '@/lib/asaas'
import { fixSubscriptionValue } from '@/lib/asaasCartao'

export type AsaasEventName =
  | 'PAYMENT_CREATED' | 'PAYMENT_CONFIRMED' | 'PAYMENT_RECEIVED' | 'PAYMENT_OVERDUE'
  | 'PAYMENT_DELETED' | 'PAYMENT_REFUNDED'

const HANDLED: ReadonlySet<string> = new Set<AsaasEventName>([
  'PAYMENT_CREATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE', 'PAYMENT_DELETED', 'PAYMENT_REFUNDED',
])

export interface AsaasPayment {
  id?: string | null
  externalReference?: string | null
  paymentLink?: string | null
  subscription?: string | null
  installment?: string | null
  customer?: string | null
  dueDate?: string | null
  value?: number | null
}

export interface RecordedEvent { payment_id: string; event: string }

export type PaymentState = 'paid' | 'overdue' | 'closed'

/**
 * Estado mais recente de cada pagamento a partir dos eventos gravados. A ordem de chegada não manda (o Asaas entrega
 * fora de ordem): encerrado (apagado/estornado) vale mais que pago, e pago vale mais que vencido.
 */
export function stateByPayment(events: RecordedEvent[]): Map<string, PaymentState> {
  const rank: Record<PaymentState, number> = { overdue: 1, paid: 2, closed: 3 }
  const out = new Map<string, PaymentState>()
  for (const e of events) {
    const s: PaymentState | null =
      e.event === 'PAYMENT_OVERDUE' ? 'overdue'
      : e.event === 'PAYMENT_CONFIRMED' || e.event === 'PAYMENT_RECEIVED' ? 'paid'
      : e.event === 'PAYMENT_DELETED' || e.event === 'PAYMENT_REFUNDED' ? 'closed'
      : null
    if (!s) continue
    const cur = out.get(e.payment_id)
    if (!cur || rank[s] > rank[cur]) out.set(e.payment_id, s)
  }
  return out
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

async function findClinicId(db: SupabaseClient, p: AsaasPayment): Promise<string | null> {
  // 1. externalReference no pagamento = id da clínica (cobranças criadas por nós)
  if (p.externalReference && UUID.test(p.externalReference)) return p.externalReference

  // 2. Ids que a clínica guarda: payment link (checkout antigo), assinatura, customer do contrato.
  const tries: [string, string | null | undefined][] = [
    ['asaas_customer_id', p.paymentLink],
    ['asaas_subscription_id', p.subscription],
    ['asaas_customer_real_id', p.customer],
  ]
  for (const [col, val] of tries) {
    if (!val) continue
    const { data, error } = await db.from('clinics').select('id').eq(col, val).limit(2)
    if (error) {
      if (motivoDoErro(error) === 'sem_tabela') continue
      throw new Error(`clinics.${col}: ${error.message}`)
    }
    if (data && data.length === 1) return data[0].id as string
  }
  return null
}

export interface WebhookResult {
  handled: boolean
  reason?: 'sem_pagamento' | 'evento_ignorado' | 'sem_clinica' | 'duplicado' | 'vencido_ja_pago'
  clinicId?: string
}

function must<T extends { error: { message?: string } | null }>(r: T, where: string): T {
  if (r.error) throw new Error(`${where}: ${r.error.message ?? 'erro'}`)
  return r
}

export async function processAsaasEvent(
  db: SupabaseClient, body: unknown, now: Date = new Date(), api: AsaasApi = realAsaas,
): Promise<WebhookResult> {
  const b = (body && typeof body === 'object' ? body : {}) as { event?: unknown; payment?: AsaasPayment | null }
  const event = typeof b.event === 'string' ? b.event : ''
  const payment = b.payment
  if (!payment || typeof payment !== 'object') return { handled: false, reason: 'sem_pagamento' }
  if (!HANDLED.has(event)) return { handled: false, reason: 'evento_ignorado' }

  const clinicId = await findClinicId(db, payment)
  if (!clinicId) {
    console.warn('[asaas/webhook] Clínica não encontrada para o evento', event, payment.id)
    return { handled: false, reason: 'sem_clinica' }
  }

  const paymentId = typeof payment.id === 'string' && payment.id ? payment.id : null
  let claimed = false
  let dedup = true

  if (paymentId) {
    const { error } = await db.from('asaas_payment_events').insert({
      payment_id: paymentId,
      event,
      clinic_id: clinicId,
      subscription_id: payment.subscription ?? null,
      installment_id: payment.installment ?? null,
      value: typeof payment.value === 'number' ? payment.value : null,
      due_date: payment.dueDate && DATE.test(payment.dueDate) ? payment.dueDate : null,
    })
    if (error) {
      if (error.code === '23505') return { handled: false, reason: 'duplicado', clinicId }
      if (motivoDoErro(error) === 'sem_tabela') {
        console.warn('[asaas/webhook] tabela asaas_payment_events ausente: processando sem idempotência')
        dedup = false
      } else {
        throw new Error(`asaas_payment_events insert: ${error.message}`)
      }
    } else {
      claimed = true
    }
  }

  try {
    return await applyEffects(db, event, payment, clinicId, paymentId, dedup, now, api)
  } catch (e) {
    if (claimed && paymentId) {
      const { error } = await db.from('asaas_payment_events').delete().eq('payment_id', paymentId).eq('event', event)
      if (error) console.error('[asaas/webhook] não liberou o evento após falha', paymentId, event, error.message)
    }
    throw e
  }
}

/**
 * Valor cheio a restaurar na assinatura (clinics.billing_promo_full_value) se a clínica ainda tem a promoção da 1ª
 * cobrança pendente E o pagamento é da assinatura gravada nela. Coluna ainda inexistente (migração não aplicada): null.
 */
async function pendingPromo(db: SupabaseClient, clinicId: string, subscriptionId: string): Promise<number | null> {
  const { data, error } = await db.from('clinics').select('billing_promo_full_value, asaas_subscription_id').eq('id', clinicId).maybeSingle()
  if (error) {
    if (motivoDoErro(error) === 'sem_tabela') return null
    throw new Error(`clinics promo select: ${error.message}`)
  }
  const full = data?.billing_promo_full_value
  if (full == null) return null
  if (data?.asaas_subscription_id && data.asaas_subscription_id !== subscriptionId) {
    console.warn(`[asaas/webhook] promo pendente, mas a assinatura do pagamento não é a da clínica ${clinicId}: ignorando`)
    return null
  }
  const n = Number(full)
  return Number.isFinite(n) && n > 0 ? n : null
}

async function eventsOfClinic(db: SupabaseClient, clinicId: string): Promise<RecordedEvent[]> {
  const { data, error } = await db.from('asaas_payment_events').select('payment_id, event').eq('clinic_id', clinicId)
  if (error) throw new Error(`asaas_payment_events select: ${error.message}`)
  return (data ?? []) as RecordedEvent[]
}

async function applyEffects(
  db: SupabaseClient, event: string, p: AsaasPayment, clinicId: string, paymentId: string | null, dedup: boolean, now: Date, api: AsaasApi,
): Promise<WebhookResult> {
  const clinics = () => db.from('clinics')

  if (event === 'PAYMENT_CREATED') {
    // Parcela de cartão (installment) não define o próximo vencimento: só pagamento avulso ou da assinatura.
    if (p.dueDate && DATE.test(p.dueDate) && !p.installment) {
      must(await clinics().update({ next_billing_date: p.dueDate }).eq('id', clinicId), 'clinics next_billing_date')
      console.log(`[asaas/webhook] PAYMENT_CREATED -> next_billing_date=${p.dueDate} para clínica ${clinicId}`)
    }
    return { handled: true, clinicId }
  }

  if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
    const updates: Record<string, unknown> = { billing_paid: true }
    // A pendência só sai se nenhum OUTRO pagamento da clínica continua vencido.
    let otherOverdue = false
    if (dedup && paymentId) {
      const states = stateByPayment(await eventsOfClinic(db, clinicId))
      for (const [id, s] of states) if (id !== paymentId && s === 'overdue') otherOverdue = true
    }
    if (!otherOverdue) updates.billing_overdue_since = null
    // Promoção da 1ª cobrança no cartão: lê ANTES do update de pagamento.
    const promo = p.subscription ? await pendingPromo(db, clinicId, p.subscription) : null
    must(await clinics().update(updates).eq('id', clinicId), 'clinics paid')
    // Só adota o id da assinatura se a clínica ainda não tem um: nunca sobrescreve o que já está gravado.
    if (p.subscription) {
      must(await clinics().update({ asaas_subscription_id: p.subscription }).eq('id', clinicId).is('asaas_subscription_id', null), 'clinics subscription')
    }
    console.log(`[asaas/webhook] ${event} -> billing_paid=true para clínica ${clinicId}`)
    if (promo != null && p.subscription) {
      // Se o PUT falhar, lança: o dedupe é liberado e o Asaas reenvia o evento (o billing_paid acima é idempotente).
      await fixSubscriptionValue(api, p.subscription, promo)
      // Só depois do PUT confirmado: zera para as próximas cobranças não repetirem a troca.
      must(await clinics().update({ billing_promo_full_value: null }).eq('id', clinicId), 'clinics promo')
      console.log(`[asaas/webhook] valor da assinatura voltou ao cheio para clínica ${clinicId}`)
    }
    return { handled: true, clinicId }
  }

  if (event === 'PAYMENT_OVERDUE') {
    // OVERDUE que chega depois de CONFIRMED/RECEIVED do mesmo pagamento é atraso de entrega: ignora.
    if (dedup && paymentId) {
      const own = (await eventsOfClinic(db, clinicId)).filter(e => e.payment_id === paymentId)
      const st = stateByPayment(own).get(paymentId)
      if (st === 'paid' || st === 'closed') return { handled: false, reason: 'vencido_ja_pago', clinicId }
    }
    // Guarda a data do primeiro atraso: não sobrescreve se já houver.
    must(await clinics().update({ billing_overdue_since: now.toISOString() }).eq('id', clinicId).is('billing_overdue_since', null), 'clinics overdue')
    console.log(`[asaas/webhook] PAYMENT_OVERDUE -> billing_overdue_since registrado para clínica ${clinicId}`)
    return { handled: true, clinicId }
  }

  // PAYMENT_DELETED / PAYMENT_REFUNDED
  let others = new Map<string, PaymentState>()
  if (dedup && paymentId) {
    others = stateByPayment(await eventsOfClinic(db, clinicId))
    others.delete(paymentId)
  }
  const anyOverdue = [...others.values()].includes('overdue')
  const anyPaid = [...others.values()].includes('paid')
  const updates: Record<string, unknown> = {}
  if (event === 'PAYMENT_DELETED' && !anyOverdue) updates.billing_overdue_since = null
  if (event === 'PAYMENT_REFUNDED') {
    if (!anyPaid) updates.billing_paid = false
    if (!anyOverdue) updates.billing_overdue_since = null
  }
  if (Object.keys(updates).length > 0) must(await clinics().update(updates).eq('id', clinicId), `clinics ${event}`)
  console.log(`[asaas/webhook] ${event} para clínica ${clinicId}`)
  return { handled: true, clinicId }
}
