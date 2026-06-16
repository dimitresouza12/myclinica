import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabaseAdmin'
import { asaasPost } from '@/lib/asaas'

interface AsaasPaymentLink { id: string; url: string }

export async function POST(req: Request) {
  try {
    const { clinicId, clinicName, plan: planOverride, couponCode } = await req.json()
    if (!clinicId) return NextResponse.json({ error: 'clinicId required' }, { status: 400 })

    // Busca dados da clínica (plano + link já salvo)
    const { data: clinic } = await getAdminClient()
      .from('clinics')
      .select('asaas_customer_id, name, plan')
      .eq('id', clinicId)
      .single()

    // asaas_customer_id aqui guarda o ID do paymentLink (reutilizamos a coluna)
    const linkId = clinic?.asaas_customer_id as string | undefined

    // Cupons válidos e seus descontos (percentual)
    const VALID_COUPONS: Record<string, number> = { 'COPA50': 50 }
    const discountPct = couponCode ? (VALID_COUPONS[String(couponCode).toUpperCase()] ?? 0) : 0

    // Se já tem um link salvo, sem troca de plano e sem cupom → reutiliza
    if (linkId && !planOverride && !discountPct) {
      return NextResponse.json({ url: `https://www.asaas.com/c/${linkId}` })
    }

    // Preço conforme plano (override do front tem prioridade sobre o do banco)
    const PLAN_PRICES: Record<string, number> = {
      essencial:     99,
      avancado:      119.90,
      completo:      129.90,
      completo_plus: 199,
    }
    const PLAN_LABELS: Record<string, string> = {
      essencial: 'Essencial', avancado: 'Avançado', completo: 'Completo', completo_plus: 'Completo+',
    }
    const effectivePlan = planOverride ?? clinic?.plan ?? 'essencial'
    const planValue = PLAN_PRICES[effectivePlan] ?? 99
    const planLabel = PLAN_LABELS[effectivePlan] ?? 'Essencial'

    const finalValue = discountPct > 0
      ? Math.round(planValue * (1 - discountPct / 100) * 100) / 100
      : planValue

    const promoNote = discountPct > 0
      ? ` [PROMO ${couponCode}: ${discountPct}% off 1ª mensalidade — valor normal: R$${planValue}/mês]`
      : ''

    // Cria novo link de pagamento recorrente para esta clínica
    const link = await asaasPost<AsaasPaymentLink>('/paymentLinks', {
      name: `MyClinica — Plano ${planLabel} (${clinicName ?? clinic?.name ?? 'Clínica'})`,
      billingType: 'UNDEFINED',
      chargeType: 'RECURRENT',
      value: finalValue,
      subscriptionCycle: 'MONTHLY',
      dueDateLimitDays: 3,
      description: `Acesso completo ao MyClinica — Plano ${planLabel} — R$${finalValue}/mês${promoNote}`,
      externalReference: clinicId,
    })

    // Só salva o link no banco se não houver cupom (link com desconto não deve ser reutilizado)
    if (!discountPct) {
      await getAdminClient()
        .from('clinics')
        .update({ asaas_customer_id: link.id })
        .eq('id', clinicId)
    }

    return NextResponse.json({ url: link.url })
  } catch (err) {
    console.error('[asaas/checkout]', err)
    return NextResponse.json({ error: 'Erro ao criar link de pagamento.' }, { status: 500 })
  }
}
