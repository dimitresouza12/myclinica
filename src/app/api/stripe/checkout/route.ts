import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' })

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const PRICE_ID = 'price_1ThvI6Ghf6wxnDsdeLxmcgSF'

export async function POST(req: Request) {
  try {
    const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://myclinica.online'
    const { clinicId, clinicName, email } = await req.json()
    if (!clinicId) return NextResponse.json({ error: 'clinicId required' }, { status: 400 })

    // Busca ou cria o Stripe customer para a clínica
    const { data: clinic } = await supabaseAdmin
      .from('clinics')
      .select('stripe_customer_id, name, email')
      .eq('id', clinicId)
      .single()

    let customerId = clinic?.stripe_customer_id as string | undefined

    // Verifica se o customer existe no modo atual (live vs test podem divergir)
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId)
      } catch {
        customerId = undefined
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        name: clinicName ?? clinic?.name,
        email: email ?? clinic?.email ?? undefined,
        metadata: { clinic_id: clinicId },
      })
      customerId = customer.id
      await supabaseAdmin
        .from('clinics')
        .update({ stripe_customer_id: customerId })
        .eq('id', clinicId)
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      success_url: `${origin}/dashboard?subscribed=1`,
      cancel_url:  `${origin}/trial-expirado?canceled=1`,
      metadata: { clinic_id: clinicId },
      subscription_data: { metadata: { clinic_id: clinicId } },
      allow_promotion_codes: true,
      locale: 'pt-BR',
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[stripe/checkout]', err)
    return NextResponse.json({ error: 'Erro ao criar sessão de pagamento.' }, { status: 500 })
  }
}
