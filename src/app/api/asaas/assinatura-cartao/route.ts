import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { getAdminClient } from '@/lib/supabaseAdmin'
import { requireSession } from '@/lib/sessionAuth'
import { realAsaas } from '@/lib/asaas'
import { ensureAsaasCustomer } from '@/lib/asaasContrato'
import { AsaasCardError, cardSummaryFrom, createCardSubscription, type CardSummary } from '@/lib/asaasCartao'
import { campanhaAtiva, firstDueDateFor } from '@/lib/campanha'
import { elegivelPromoPrimeiraCobranca, valorPrimeiraCobranca } from '@/lib/promoPrimeiraCobranca'
import { getPlanEntry, isPublicPlan } from '@/lib/planCatalog'
import { validarAssinaturaCartao } from '@/lib/validarCartao'
import { motivoDoErro } from '@/lib/nutri/erros'
import { montarTermo } from '@/lib/termoAssinatura'
import { formatDiaBr } from '@/lib/cartaoCheckout'

export const dynamic = 'force-dynamic'

// Assinatura mensal no cartão, criada no Asaas a partir do modal do próprio MyClinica (sem Pix, sem checkout
// hospedado). Tudo é decidido aqui no servidor: valor, data da 1ª cobrança e desconto. O corpo da requisição só
// traz plano, cartão e dados do titular.
//
// LOG: nunca registra número, CVV, validade nem dados do titular. Só clinicId, etapa e códigos de erro.

const TAG = '[asaas/assinatura-cartao]'

const IP_RE = /^[0-9a-fA-F:.]{3,45}$/

// IP do cliente: o cabeçalho do Cloudflare primeiro, depois x-real-ip, e por último o ÚLTIMO item de x-forwarded-for
// (o primeiro item é escrito pelo próprio cliente e pode ser forjado; o último foi acrescentado pelo nosso proxy).
function clientIp(req: Request): string | null {
  const lastForwarded = req.headers.get('x-forwarded-for')?.split(',').map(x => x.trim()).filter(Boolean).pop()
  const candidates = [req.headers.get('cf-connecting-ip')?.trim(), req.headers.get('x-real-ip')?.trim(), lastForwarded]
  for (const c of candidates) if (c && IP_RE.test(c)) return c
  // Em desenvolvimento local não há proxy na frente; em produção sem IP real o Asaas não aceita a cobrança.
  return process.env.NODE_ENV === 'production' ? null : '127.0.0.1'
}

// Falha fechada: fora de produção só roda contra o sandbox do Asaas, nunca contra a conta real por engano.
function ambienteAsaasPermitido(): boolean {
  return process.env.NODE_ENV === 'production' || (process.env.ASAAS_ENV ?? '').trim().toLowerCase() === 'sandbox'
}

interface AsaasSubscriptionRow { creditCard?: unknown; id?: string; status?: string; billingType?: string; deleted?: boolean; externalReference?: string | null; value?: number }

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Prova do aceite do termo: uma linha em audit_logs (as clínicas só leem; INSERT só pelo service role aqui). O texto do
// termo é remontado com os valores que o servidor calculou e o sha256 dele vai junto, com versão, IP e navegador.
// Falha aqui não derruba o cadastro: a assinatura já existe no Asaas e cancelá-la por causa do log seria pior.
async function registrarAceite(
  db: ReturnType<typeof getAdminClient>,
  p: { clinicId: string; userId: string; ip: string; userAgent: string | null; planoLabel: string; valorCheio: number; firstValue: number; firstDueDate: string; promo: boolean; subscriptionId: string },
) {
  try {
    const termo = montarTermo({ planoLabel: p.planoLabel, valorCheio: p.valorCheio, valorPrimeira: p.firstValue, dataPrimeira: formatDiaBr(p.firstDueDate), promo: p.promo })
    const { error } = await db.from('audit_logs').insert({
      clinic_id: p.clinicId,
      user_id: p.userId,
      action: 'billing.terms_accepted',
      module: 'billing',
      resource_id: p.clinicId,
      ip_address: p.ip,
      user_agent: p.userAgent ? p.userAgent.slice(0, 300) : null,
      details: {
        terms_version: termo.versao,
        terms_sha256: createHash('sha256').update(termo.texto, 'utf8').digest('hex'),
        accepted_at: new Date().toISOString(),
        plan: p.planoLabel,
        first_value: p.firstValue,
        full_value: p.valorCheio,
        first_due: p.firstDueDate,
        promo: p.promo,
        subscription_id: p.subscriptionId,
      },
    })
    if (error) console.error(TAG, 'ATENCAO aceite nao gravado', p.clinicId, error.code ?? '', motivoDoErro(error))
  } catch (e) {
    console.error(TAG, 'ATENCAO aceite nao gravado', p.clinicId, e instanceof Error ? e.message.slice(0, 120) : '')
  }
}

export async function POST(req: Request) {
  const session = await requireSession(req)
  if (session instanceof NextResponse) return session

  if (!ambienteAsaasPermitido()) {
    return NextResponse.json({ error: 'Asaas sandbox não configurado' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  }

  const bodyClinicId = (body as { clinicId?: unknown } | null)?.clinicId
  if (typeof bodyClinicId === 'string' && bodyClinicId !== session.clinicId && !session.isSuperadmin) {
    return NextResponse.json({ error: 'Clínica não autorizada' }, { status: 403 })
  }

  const parsed = validarAssinaturaCartao(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { clinicId, plan, card, holder, expectedFullValue } = parsed.value

  const ip = clientIp(req)
  if (!ip) return NextResponse.json({ error: 'Não foi possível identificar a sua conexão. Tente de novo.' }, { status: 400 })

  const db = getAdminClient()
  const { data: clinic, error: clinicErr } = await db
    .from('clinics')
    .select('id, name, plan, created_at, trial_ends_at, billing_paid, asaas_subscription_id, billing_first_due, custom_monthly_price')
    .eq('id', clinicId)
    .maybeSingle()
  if (clinicErr) {
    console.error(TAG, 'clinics', clinicId, clinicErr.code ?? '', motivoDoErro(clinicErr))
    return NextResponse.json({ error: 'Não foi possível carregar a clínica.' }, { status: 500 })
  }
  if (!clinic) return NextResponse.json({ error: 'Clínica não encontrada' }, { status: 404 })

  if (clinic.billing_paid === true) {
    return NextResponse.json({ error: 'A assinatura desta clínica já está paga.' }, { status: 409 })
  }
  if (clinic.asaas_subscription_id) {
    return NextResponse.json({ error: 'Esta clínica já tem uma assinatura cadastrada. Para trocar o cartão, fale com o suporte.' }, { status: 409 })
  }
  // Plano fora da venda pública (ex.: Ilimitado + IA, sob consulta) só se a clínica já está nele.
  if (!isPublicPlan(plan) && plan !== clinic.plan) {
    return NextResponse.json({ error: 'Plano indisponível para contratação online.' }, { status: 400 })
  }

  // Preço: tabela do plano. O preço congelado da clínica (custom_monthly_price) só vale para o plano atual dela.
  const custom = clinic.custom_monthly_price != null ? Number(clinic.custom_monthly_price) : null
  const valorCheio = round2(plan === clinic.plan && custom != null && Number.isFinite(custom) && custom > 0
    ? custom
    : getPlanEntry(plan).priceValue)
  const firstDueDate = firstDueDateFor(clinic.trial_ends_at as string | null)
  // Promoção: cadastro dentro da janela E campanha ainda ativa no momento da assinatura.
  const promo = elegivelPromoPrimeiraCobranca(clinic.created_at as string | null) && campanhaAtiva()
  const firstValue = valorPrimeiraCobranca(valorCheio, promo)

  // O valor que a tela mostrou precisa ser o que o servidor vai cobrar. Se mudou (plano, preço, campanha), nada é
  // reservado nem enviado ao Asaas: a tela reexibe os valores novos e o cliente confirma de novo.
  if (round2(expectedFullValue) !== valorCheio) {
    return NextResponse.json({
      error: 'O valor da assinatura mudou. Confira o novo valor antes de confirmar.',
      code: 'valor_diferente',
      fullValue: valorCheio,
      firstValue,
      promo,
    }, { status: 409 })
  }

  // Reserva presa: uma tentativa anterior gravou billing_first_due e caiu antes de guardar a assinatura. Antes de
  // recusar, procura no Asaas se ela chegou a ser criada. Se sim, adota; se não, retoma a reserva.
  const previousClaim = (clinic.billing_first_due as string | null) ?? null
  if (previousClaim) {
    let existing: AsaasSubscriptionRow | undefined
    try {
      const found = await realAsaas.get<{ data?: AsaasSubscriptionRow[] }>(`/subscriptions?externalReference=${encodeURIComponent(clinicId)}&limit=20`)
      existing = (found?.data ?? []).find(x =>
        x?.id && !x.deleted && x.status === 'ACTIVE' && x.billingType === 'CREDIT_CARD' && (x.externalReference == null || x.externalReference === clinicId))
    } catch {
      console.error(TAG, 'consulta de assinaturas existentes falhou', clinicId)
      return NextResponse.json({ error: 'Não foi possível falar com o operador de cobrança agora. Tente de novo em instantes.' }, { status: 502 })
    }
    if (existing?.id) {
      const { data: adopted, error: adoptErr } = await db
        .from('clinics')
        .update({ asaas_subscription_id: existing.id, plan })
        .eq('id', clinicId)
        .is('asaas_subscription_id', null)
        .select('id, billing_promo_full_value')
      if (adoptErr) {
        console.error(TAG, 'adocao da assinatura existente falhou', clinicId, adoptErr.code ?? '', motivoDoErro(adoptErr))
        return NextResponse.json({ error: 'Não foi possível concluir a assinatura. Tente de novo.' }, { status: 500 })
      }
      if (!adopted || adopted.length === 0) {
        return NextResponse.json({ error: 'Já existe uma assinatura em andamento para esta clínica.' }, { status: 409 })
      }
      const storedFull = Number(adopted[0].billing_promo_full_value)
      const adoptedPromo = Number.isFinite(storedFull) && storedFull > 0
      const full = adoptedPromo ? round2(storedFull) : valorCheio
      const first = typeof existing.value === 'number' && Number.isFinite(existing.value) ? round2(existing.value) : valorPrimeiraCobranca(full, adoptedPromo)
      console.log(TAG, 'assinatura existente adotada', clinicId)
      return NextResponse.json({ ok: true, firstDueDate: previousClaim, firstValue: first, fullValue: full, promo: adoptedPromo, ...cardSummaryFrom(existing.creditCard) })
    }
  }

  // Reivindica a criação: dois pedidos paralelos não podem gerar duas assinaturas no Asaas. O valor cheio da promoção
  // vai junto, no mesmo UPDATE, para nunca existir reserva sem a informação que o webhook usa para voltar ao valor cheio.
  const claimPatch = { billing_first_due: firstDueDate, billing_promo_full_value: promo ? valorCheio : null }
  let claimQuery = db.from('clinics').update(claimPatch).eq('id', clinicId).is('asaas_subscription_id', null)
  claimQuery = previousClaim ? claimQuery.eq('billing_first_due', previousClaim) : claimQuery.is('billing_first_due', null)
  const { data: claimed, error: claimErr } = await claimQuery.select('id')
  if (claimErr) {
    console.error(TAG, 'claim', clinicId, claimErr.code ?? '', motivoDoErro(claimErr))
    return NextResponse.json({ error: 'Não foi possível iniciar a assinatura agora. Tente de novo.' }, { status: 500 })
  }
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ error: 'Já existe uma assinatura em andamento para esta clínica.' }, { status: 409 })
  }

  const releaseClaim = async () => {
    const { error } = await db
      .from('clinics')
      .update({ billing_first_due: null, billing_promo_full_value: null })
      .eq('id', clinicId)
      .is('asaas_subscription_id', null)
    if (error) console.error(TAG, 'ATENCAO nao liberou a reserva', clinicId, error.code ?? '')
  }

  let customerId: string
  try {
    customerId = await ensureAsaasCustomer(realAsaas, {
      clinicId,
      name: holder.name,
      cpfCnpj: holder.cpfCnpj,
      email: holder.email,
      phone: holder.phone,
    })
  } catch (e) {
    console.error(TAG, 'cliente nao criado', clinicId, e instanceof Error ? e.message.slice(0, 200) : '')
    await releaseClaim()
    return NextResponse.json({ error: 'Não foi possível cadastrar o titular no operador de cobrança. Confira os dados e tente de novo.' }, { status: 502 })
  }

  let subscriptionId: string
  let cardSummary: CardSummary
  try {
    const sub = await createCardSubscription(realAsaas, {
      customerId,
      clinicId,
      value: firstValue,
      firstDueDate,
      // Aparece em e-mails e na página de cobrança do cliente: só o nome do plano.
      description: `MyClinica - Plano ${getPlanEntry(plan).label}`,
      card,
      holder,
      remoteIp: ip,
    })
    subscriptionId = sub.id
    cardSummary = { cardLast4: sub.cardLast4, cardBrand: sub.cardBrand }
  } catch (e) {
    const kind = e instanceof AsaasCardError ? e.kind : 'indisponivel'
    const codes = e instanceof AsaasCardError ? e.codes.join(',') : ''
    const field = e instanceof AsaasCardError ? e.field : null
    console.error(TAG, 'assinatura nao criada', clinicId, kind, codes, field ?? '')
    await releaseClaim()
    // `code` combina com deveLimparCartao (front): só 'cartao_recusado' apaga número, validade e CVV; erro de dado do
    // titular ou genérico mantém os campos do cartão para a pessoa corrigir só o que falhou.
    if (kind === 'recusado') {
      return NextResponse.json({ error: 'Cartão recusado. Confira os dados ou use outro cartão.', code: 'cartao_recusado' }, { status: 422 })
    }
    if (kind === 'invalido' && field) {
      const msg = field === 'cep' ? 'CEP não encontrado. Confira o CEP do titular.'
        : field === 'documento' ? 'CPF ou CNPJ do titular inválido.'
        : 'Telefone do titular inválido.'
      return NextResponse.json({ error: msg, code: 'titular_invalido', field }, { status: 422 })
    }
    if (kind === 'invalido') {
      return NextResponse.json({ error: 'Dados inválidos. Confira os dados do cartão e do titular.', code: 'dados_invalidos' }, { status: 422 })
    }
    return NextResponse.json({ error: 'Não foi possível falar com o operador de cobrança agora. Tente de novo em instantes.' }, { status: 502 })
  }

  // billing_first_due e billing_promo_full_value já estão gravados desde a reserva.
  const { data: saved, error: updErr } = await db
    .from('clinics')
    .update({ asaas_subscription_id: subscriptionId, plan })
    .eq('id', clinicId)
    .is('asaas_subscription_id', null)
    .select('id')
  const cancelarAssinatura = async (): Promise<boolean> => {
    try {
      await realAsaas.delete(`/subscriptions/${encodeURIComponent(subscriptionId)}`)
      return true
    } catch {
      console.error(TAG, 'ATENCAO assinatura criada no Asaas e nao cancelada', clinicId, subscriptionId)
      return false
    }
  }
  if (updErr) {
    console.error(TAG, 'clinics update falhou apos criar assinatura', clinicId, updErr.code ?? '', motivoDoErro(updErr))
    // Só libera a reserva se a assinatura sumiu do Asaas; senão mantém o bloqueio para não criar uma segunda.
    if (await cancelarAssinatura()) await releaseClaim()
    return NextResponse.json({ error: 'Não foi possível concluir a assinatura. Nenhuma cobrança foi agendada; tente de novo.' }, { status: 500 })
  }
  if (!saved || saved.length === 0) {
    // Outro pedido da mesma clínica (ou o webhook) gravou uma assinatura primeiro: a nossa é a duplicada e sai do Asaas.
    // A reserva pertence à outra assinatura e fica como está.
    console.error(TAG, 'assinatura duplicada detectada', clinicId)
    await cancelarAssinatura()
    return NextResponse.json({ error: 'Já existe uma assinatura em andamento para esta clínica.' }, { status: 409 })
  }

  await registrarAceite(db, {
    clinicId, userId: session.userId, ip, userAgent: req.headers.get('user-agent'),
    planoLabel: getPlanEntry(plan).label, valorCheio, firstValue, firstDueDate, promo, subscriptionId,
  })
  console.log(TAG, 'aceite registrado', clinicId)
  return NextResponse.json({ ok: true, firstDueDate, firstValue, fullValue: valorCheio, promo, ...cardSummary })
}
