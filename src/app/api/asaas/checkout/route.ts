import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabaseAdmin'
import { asaasPost, asaasGet, daysUntilNextOccurrence } from '@/lib/asaas'
import { getPlanEntry } from '@/lib/planCatalog'

interface AsaasPaymentLink { id: string; url?: string; deleted?: boolean; active?: boolean }

function buildLinkUrl(id: string) {
  return `https://www.asaas.com/c/${id}`
}

export async function POST(req: Request) {
  try {
    const { clinicId, clinicName, plan: planOverride } = await req.json()
    if (!clinicId) return NextResponse.json({ error: 'clinicId required' }, { status: 400 })

    const { data: clinic } = await getAdminClient()
      .from('clinics')
      .select('asaas_customer_id, name, plan, billing_due_day, custom_monthly_price')
      .eq('id', clinicId)
      .single()

    // Se a clínica já tem um dia de vencimento preferido, a 1ª cobrança já
    // nasce vencendo nesse dia; senão mantém o padrão de 5 dias.
    const dueDateLimitDays = clinic?.billing_due_day
      ? daysUntilNextOccurrence(clinic.billing_due_day)
      : 5

    const linkId = clinic?.asaas_customer_id as string | undefined

    // Reutiliza link existente se ainda ativo no Asaas
    if (linkId && !planOverride) {
      try {
        const existing = await asaasGet<AsaasPaymentLink>(`/paymentLinks/${linkId}`)
        if (existing && !existing.deleted) {
          const url = existing.url ?? buildLinkUrl(linkId)
          return NextResponse.json({ url })
        }
      } catch {
        // link deletado ou inválido — cria novo
      }
    }

    const effectivePlan = planOverride ?? clinic?.plan ?? 'essencial'
    const planEntry      = getPlanEntry(effectivePlan)
    // custom_monthly_price (preço congelado por clínica, ex: cliente antigo
    // que mudou de plano mas não de preço) só vale pro preço do plano ATUAL
    // dela — se alguém pede explicitamente pra cobrar um plano diferente
    // (planOverride), usa o preço de tabela desse plano, não o congelado.
    const planValue = (!planOverride && clinic?.custom_monthly_price != null)
      ? Number(clinic.custom_monthly_price)
      : planEntry.priceValue
    const planLabel = planEntry.label

    let asaasError = ''
    let link: AsaasPaymentLink | null = null

    // Tenta com UNDEFINED (aceita qualquer método de pagamento)
    try {
      link = await asaasPost<AsaasPaymentLink>('/paymentLinks', {
        name: `MyClinica — Plano ${planLabel} (${clinicName ?? clinic?.name ?? 'Clínica'})`,
        billingType: 'UNDEFINED',
        chargeType: 'RECURRENT',
        value: planValue,
        subscriptionCycle: 'MONTHLY',
        dueDateLimitDays,
        description: `Acesso completo ao MyClinica — Plano ${planLabel} — R$${planValue}/mês`,
        externalReference: clinicId,
      })
    } catch (e) {
      asaasError = e instanceof Error ? e.message : String(e)
      console.error('[asaas/checkout] billingType UNDEFINED falhou:', asaasError)
    }

    // Fallback: tenta sem billingType
    if (!link) {
      try {
        link = await asaasPost<AsaasPaymentLink>('/paymentLinks', {
          name: `MyClinica — Plano ${planLabel} (${clinicName ?? clinic?.name ?? 'Clínica'})`,
          chargeType: 'RECURRENT',
          value: planValue,
          subscriptionCycle: 'MONTHLY',
          dueDateLimitDays,
          description: `Acesso completo ao MyClinica — Plano ${planLabel} — R$${planValue}/mês`,
          externalReference: clinicId,
        })
      } catch (e2) {
        const msg = e2 instanceof Error ? e2.message : String(e2)
        console.error('[asaas/checkout] fallback também falhou:', msg)
        return NextResponse.json({ error: asaasError || msg }, { status: 500 })
      }
    }

    if (link.id) {
      await getAdminClient()
        .from('clinics')
        .update({ asaas_customer_id: link.id })
        .eq('id', clinicId)
    }

    const url = link.url ?? buildLinkUrl(link.id)
    return NextResponse.json({ url })
  } catch (err) {
    console.error('[asaas/checkout]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro inesperado.' }, { status: 500 })
  }
}
