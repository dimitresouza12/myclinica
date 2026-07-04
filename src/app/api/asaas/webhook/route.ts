import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { getAdminClient } from '@/lib/supabaseAdmin'

// Token configurado no painel Asaas (Webhooks → Token de autenticação) e
// enviado de volta no header `asaas-access-token` em toda chamada.
function isValidAsaasToken(req: Request): boolean {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN
  if (!expected) return false

  const received = req.headers.get('asaas-access-token') ?? ''
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

async function findClinicId(payment: Record<string, string | null>): Promise<string | null> {
  // 1. externalReference direto no pagamento (clinicId)
  if (payment.externalReference) return payment.externalReference

  // 2. Busca pelo ID do paymentLink salvo em asaas_customer_id
  if (payment.paymentLink) {
    const { data } = await getAdminClient()
      .from('clinics')
      .select('id')
      .eq('asaas_customer_id', payment.paymentLink)
      .single()
    if (data?.id) return data.id
  }

  return null
}

export async function POST(req: Request) {
  if (!isValidAsaasToken(req)) {
    console.warn('[asaas/webhook] Token de autenticação inválido ou ausente')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { event, payment } = body

    if (!payment) return NextResponse.json({ ok: true })

    const clinicId = await findClinicId(payment)
    if (!clinicId) {
      console.warn('[asaas/webhook] Clínica não encontrada para o evento', event, payment?.id)
      return NextResponse.json({ ok: true })
    }

    if (event === 'PAYMENT_CREATED') {
      if (payment.dueDate) {
        await getAdminClient()
          .from('clinics')
          .update({ next_billing_date: payment.dueDate })
          .eq('id', clinicId)
        console.log(`[asaas/webhook] PAYMENT_CREATED → next_billing_date=${payment.dueDate} para clínica ${clinicId}`)
      }
    }

    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
      const updates: Record<string, unknown> = { billing_paid: true, billing_overdue_since: null }
      if (payment.subscription) updates.asaas_subscription_id = payment.subscription
      await getAdminClient().from('clinics').update(updates).eq('id', clinicId)
      console.log(`[asaas/webhook] ${event} → billing_paid=true para clínica ${clinicId}`)
    }

    if (event === 'PAYMENT_OVERDUE') {
      await getAdminClient()
        .from('clinics')
        .update({ billing_overdue_since: new Date().toISOString() })
        .eq('id', clinicId)
      console.log(`[asaas/webhook] PAYMENT_OVERDUE → billing_overdue_since registrado para clínica ${clinicId}`)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[asaas/webhook]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
