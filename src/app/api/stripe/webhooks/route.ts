import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' })

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Stripe exige o body bruto para validar a assinatura
export const config = { api: { bodyParser: false } }

export async function POST(req: Request) {
  const body      = await req.text()
  const signature = req.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    console.error('[webhook] Assinatura inválida', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription') break
        // metadata do checkout tem precedência; fallback via customer lookup
        const clinicId      = session.metadata?.clinic_id
        const subscriptionId = session.subscription as string
        if (!clinicId) break
        await supabaseAdmin.from('clinics').update({
          billing_paid:          true,
          stripe_subscription_id: subscriptionId,
          stripe_customer_id:    session.customer as string,
        }).eq('id', clinicId)
        break
      }

      case 'customer.subscription.updated': {
        const sub     = event.data.object as Stripe.Subscription
        const clinicId = sub.metadata?.clinic_id
        if (!clinicId) break
        const active = sub.status === 'active' || sub.status === 'trialing'
        await supabaseAdmin.from('clinics').update({
          billing_paid:          active,
          stripe_price_id:       sub.items.data[0]?.price.id ?? null,
          stripe_subscription_id: sub.id,
        }).eq('id', clinicId)
        break
      }

      case 'customer.subscription.deleted': {
        const sub      = event.data.object as Stripe.Subscription
        const clinicId = sub.metadata?.clinic_id
        if (!clinicId) break
        await supabaseAdmin.from('clinics').update({
          billing_paid:          false,
          stripe_subscription_id: null,
        }).eq('id', clinicId)
        break
      }

      case 'invoice.payment_failed': {
        const invoice  = event.data.object as Stripe.Invoice
        // Smart Retries do Stripe cuida dos retries — apenas logamos aqui
        console.warn('[webhook] Pagamento falhou para customer', invoice.customer)
        break
      }

      default:
        break
    }
  } catch (err) {
    console.error('[webhook] Erro ao processar evento', event.type, err)
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
