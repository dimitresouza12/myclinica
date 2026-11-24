import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabaseAdmin'
import { requireSession } from '@/lib/sessionAuth'
import { realAsaas } from '@/lib/asaas'
import { cardSummaryFrom } from '@/lib/asaasCartao'
import { getPlanEntry } from '@/lib/planCatalog'
import { valorPrimeiraCobranca } from '@/lib/promoPrimeiraCobranca'
import { motivoDoErro } from '@/lib/nutri/erros'

export const dynamic = 'force-dynamic'

// Resumo da assinatura da clínica logada para a página "Plano & Faturamento": valores, cartão (bandeira e 4 últimos
// dígitos) e histórico de cobranças. A clínica vem SEMPRE da sessão. Só devolve campos seguros: nada de número de
// cartão, links de pagamento, ids do Asaas nem dados do titular.
//
// Tolerante ao Asaas: se ele estiver fora do ar (ou não for permitido neste ambiente), responde 200 com o que vem do
// banco e `asaas: 'indisponivel'`, para a página mostrar o que sabe em vez de quebrar.

const TAG = '[asaas/assinatura]'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Mesma regra de falha fechada da rota de cadastro: fora de produção só fala com o sandbox.
function ambienteAsaasPermitido(): boolean {
  return process.env.NODE_ENV === 'production' || (process.env.ASAAS_ENV ?? '').trim().toLowerCase() === 'sandbox'
}

interface AsaasSub { creditCard?: unknown; value?: number; nextDueDate?: string; status?: string; deleted?: boolean }
interface AsaasPay { dueDate?: string; paymentDate?: string | null; value?: number; status?: string; deleted?: boolean }

export interface CobrancaHistorico {
  dueDate: string
  paidAt: string | null
  value: number
  /** paga | pendente | atrasada | outra */
  situacao: 'paga' | 'pendente' | 'atrasada' | 'outra'
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}/

function situacaoDe(status: string | undefined): CobrancaHistorico['situacao'] {
  switch (status) {
    case 'RECEIVED': case 'CONFIRMED': case 'RECEIVED_IN_CASH': return 'paga'
    case 'PENDING': case 'AWAITING_RISK_ANALYSIS': return 'pendente'
    case 'OVERDUE': return 'atrasada'
    default: return 'outra'
  }
}

export async function GET(req: Request) {
  const session = await requireSession(req)
  if (session instanceof NextResponse) return session

  const db = getAdminClient()
  const { data: clinic, error } = await db
    .from('clinics')
    .select('id, plan, custom_monthly_price, billing_paid, billing_first_due, billing_promo_full_value, asaas_subscription_id, next_billing_date')
    .eq('id', session.clinicId)
    .maybeSingle()
  if (error) {
    console.error(TAG, 'clinics', session.clinicId, error.code ?? '', motivoDoErro(error))
    return NextResponse.json({ error: 'Não foi possível carregar a assinatura.' }, { status: 500 })
  }
  if (!clinic) return NextResponse.json({ error: 'Clínica não encontrada' }, { status: 404 })

  // Valor cheio: promoção guarda o cheio em billing_promo_full_value; senão vale o preço congelado (só no plano atual
  // dela, que aqui é sempre o plano da clínica) ou o da tabela.
  const planKey = (clinic.plan as string | null) ?? 'essencial'
  const promoFull = clinic.billing_promo_full_value != null ? Number(clinic.billing_promo_full_value) : null
  const promo = promoFull != null && Number.isFinite(promoFull) && promoFull > 0
  const custom = clinic.custom_monthly_price != null ? Number(clinic.custom_monthly_price) : null
  const fullValue = round2(promo
    ? promoFull
    : custom != null && Number.isFinite(custom) && custom > 0 ? custom : getPlanEntry(planKey).priceValue)
  const firstValue = valorPrimeiraCobranca(fullValue, promo)
  const subscriptionId = (clinic.asaas_subscription_id as string | null) ?? null

  const out = {
    hasSubscription: !!subscriptionId,
    plan: planKey,
    planLabel: getPlanEntry(planKey).label,
    fullValue,
    firstValue,
    promo,
    firstDue: DAY_RE.test(String(clinic.billing_first_due ?? '')) ? String(clinic.billing_first_due).slice(0, 10) : null,
    nextDueDate: DAY_RE.test(String(clinic.next_billing_date ?? '')) ? String(clinic.next_billing_date).slice(0, 10) : null,
    paid: clinic.billing_paid === true,
    card: null as { brand: string | null; last4: string | null } | null,
    payments: [] as CobrancaHistorico[],
    asaas: (subscriptionId ? 'ok' : 'sem_assinatura') as 'ok' | 'sem_assinatura' | 'indisponivel',
  }

  if (subscriptionId) {
    if (!ambienteAsaasPermitido()) {
      out.asaas = 'indisponivel'
    } else {
      try {
        const id = encodeURIComponent(subscriptionId)
        const [sub, pays] = await Promise.all([
          realAsaas.get<AsaasSub>(`/subscriptions/${id}`),
          realAsaas.get<{ data?: AsaasPay[] }>(`/subscriptions/${id}/payments?limit=24`),
        ])
        const c = cardSummaryFrom(sub?.creditCard)
        if (c.cardBrand || c.cardLast4) out.card = { brand: c.cardBrand, last4: c.cardLast4 }
        if (DAY_RE.test(String(sub?.nextDueDate ?? '')) && sub?.status !== 'INACTIVE') out.nextDueDate = String(sub.nextDueDate).slice(0, 10)
        out.payments = (pays?.data ?? [])
          .filter(p => !p.deleted && DAY_RE.test(String(p.dueDate ?? '')) && typeof p.value === 'number' && Number.isFinite(p.value))
          .map(p => ({
            dueDate: String(p.dueDate).slice(0, 10),
            paidAt: p.paymentDate && DAY_RE.test(p.paymentDate) ? p.paymentDate.slice(0, 10) : null,
            value: round2(p.value as number),
            situacao: situacaoDe(p.status),
          }))
          .sort((a, b) => (a.dueDate < b.dueDate ? 1 : a.dueDate > b.dueDate ? -1 : 0))
      } catch {
        // Sem corpo/URL no log: a mensagem do Asaas pode citar dados da assinatura.
        console.error(TAG, 'asaas indisponivel', session.clinicId)
        out.asaas = 'indisponivel'
      }
    }
  }

  return NextResponse.json(out)
}
