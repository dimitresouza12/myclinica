import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabaseAdmin'
import { asaasGet, asaasPut } from '@/lib/asaas'

interface AsaasPayment { id: string; invoiceUrl?: string; bankSlipUrl?: string; dueDate: string; status: string }
interface AsaasPaymentList { data: AsaasPayment[] }
interface AsaasSubscription { id: string; nextDueDate: string; cycle: string; value: number }

export async function POST(req: Request) {
  try {
    const { clinicId, action, day } = await req.json()
    if (!clinicId || !action) return NextResponse.json({ error: 'clinicId e action obrigatórios' }, { status: 400 })

    const { data: clinic } = await getAdminClient()
      .from('clinics')
      .select('asaas_subscription_id, asaas_customer_id')
      .eq('id', clinicId)
      .single()

    const subscriptionId = clinic?.asaas_subscription_id as string | undefined

    // ── Antecipar pagamento ──────────────────────────────────────────────
    if (action === 'anticipate') {
      if (!subscriptionId) return NextResponse.json({ error: 'Assinatura não encontrada. Entre em contato com o suporte.' }, { status: 404 })

      // Busca o próximo pagamento pendente ou a vencer
      const list = await asaasGet<AsaasPaymentList>(`/subscriptions/${subscriptionId}/payments?limit=5`)
      const pending = list.data?.find(p => p.status === 'PENDING' || p.status === 'AWAITING_RISK_ANALYSIS')
        ?? list.data?.find(p => p.status === 'OVERDUE')

      if (!pending) return NextResponse.json({ error: 'Não há pagamento pendente para antecipar.' }, { status: 404 })

      const payUrl = pending.invoiceUrl ?? pending.bankSlipUrl
      if (!payUrl) return NextResponse.json({ error: 'URL de pagamento não disponível.' }, { status: 404 })

      return NextResponse.json({ url: payUrl })
    }

    // ── Mudar dia do vencimento ──────────────────────────────────────────
    if (action === 'change_due_day') {
      if (typeof day !== 'number' || day < 1 || day > 28) {
        return NextResponse.json({ error: 'Dia inválido. Escolha entre 1 e 28.' }, { status: 400 })
      }

      // Salva o dia preferido no banco (útil mesmo sem subscription ID)
      await getAdminClient().from('clinics').update({ billing_due_day: day }).eq('id', clinicId)

      if (!subscriptionId) {
        return NextResponse.json({ ok: true, message: 'Dia de preferência salvo. Será aplicado na próxima cobrança.' })
      }

      // Calcula próxima data de vencimento com o dia desejado
      const now = new Date()
      const nextMonth = now.getMonth() + 1 >= 12 ? 0 : now.getMonth() + 1
      const nextYear  = now.getMonth() + 1 >= 12 ? now.getFullYear() + 1 : now.getFullYear()
      const nextDueDate = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

      await asaasPut<AsaasSubscription>(`/subscriptions/${subscriptionId}`, { nextDueDate })

      return NextResponse.json({ ok: true, nextDueDate })
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
  } catch (err) {
    console.error('[asaas/billing-action]', err)
    return NextResponse.json({ error: 'Erro ao processar ação de cobrança.' }, { status: 500 })
  }
}
