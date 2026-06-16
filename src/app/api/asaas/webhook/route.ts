import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function findClinicId(payment: Record<string, string | null>): Promise<string | null> {
  // 1. externalReference direto no pagamento (clinicId)
  if (payment.externalReference) return payment.externalReference

  // 2. Busca pelo ID do paymentLink salvo em asaas_customer_id
  if (payment.paymentLink) {
    const { data } = await supabaseAdmin
      .from('clinics')
      .select('id')
      .eq('asaas_customer_id', payment.paymentLink)
      .single()
    if (data?.id) return data.id
  }

  return null
}

export async function POST(req: Request) {
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
        await supabaseAdmin
          .from('clinics')
          .update({ next_billing_date: payment.dueDate })
          .eq('id', clinicId)
        console.log(`[asaas/webhook] PAYMENT_CREATED → next_billing_date=${payment.dueDate} para clínica ${clinicId}`)
      }
    }

    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
      await supabaseAdmin
        .from('clinics')
        .update({ billing_paid: true, billing_overdue_since: null })
        .eq('id', clinicId)
      console.log(`[asaas/webhook] ${event} → billing_paid=true para clínica ${clinicId}`)
    }

    if (event === 'PAYMENT_OVERDUE') {
      await supabaseAdmin
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
