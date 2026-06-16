import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAdminClient } from '@/lib/supabaseAdmin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' })

export async function POST(req: Request) {
  try {
    const { clinicId } = await req.json()
    if (!clinicId) return NextResponse.json({ error: 'clinicId required' }, { status: 400 })

    const { data: clinic } = await getAdminClient()
      .from('clinics')
      .select('stripe_customer_id')
      .eq('id', clinicId)
      .single()

    if (!clinic?.stripe_customer_id) {
      return NextResponse.json({ error: 'Nenhuma assinatura encontrada.' }, { status: 404 })
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: clinic.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/configuracoes`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[stripe/portal]', err)
    return NextResponse.json({ error: 'Erro ao abrir portal.' }, { status: 500 })
  }
}
