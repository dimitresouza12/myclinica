import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabaseAdmin'
import { requireSession } from '@/lib/sessionAuth'
import { realAsaas } from '@/lib/asaas'
import { AsaasCardError, payWithCardToken, updateSubscriptionCard } from '@/lib/asaasCartao'
import { validarAssinaturaCartao } from '@/lib/validarCartao'
import { TERMO_VERSAO } from '@/lib/termoAssinatura'
import { motivoDoErro } from '@/lib/nutri/erros'

export const dynamic = 'force-dynamic'

// Troca o cartão de uma assinatura que já existe e, se houver fatura em aberto (atrasada ou vencida), cobra nela.
// Tudo dentro do MyClinica: nenhuma página do Asaas é aberta. A clínica vem da sessão. Sem log de dado de cartão.

const TAG = '[asaas/assinatura-cartao/atualizar]'

function ambienteAsaasPermitido(): boolean {
  return process.env.NODE_ENV === 'production' || (process.env.ASAAS_ENV ?? '').trim().toLowerCase() === 'sandbox'
}

const IP_RE = /^[0-9a-fA-F:.]{3,45}$/
function clientIp(req: Request): string | null {
  const last = req.headers.get('x-forwarded-for')?.split(',').map(x => x.trim()).filter(Boolean).pop()
  for (const c of [req.headers.get('cf-connecting-ip')?.trim(), req.headers.get('x-real-ip')?.trim(), last]) {
    if (c && IP_RE.test(c)) return c
  }
  return process.env.NODE_ENV === 'production' ? null : '127.0.0.1'
}

interface AsaasPay { id?: string; status?: string; dueDate?: string; deleted?: boolean }

export async function POST(req: Request) {
  const session = await requireSession(req)
  if (session instanceof NextResponse) return session
  if (!ambienteAsaasPermitido()) return NextResponse.json({ error: 'Asaas sandbox não configurado' }, { status: 503 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 }) }
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  // Reaproveita a validação estrita de cartão e titular; os campos de plano e termo não se aplicam aqui.
  const parsed = validarAssinaturaCartao({
    ...b, clinicId: session.clinicId, plan: 'essencial', termsAccepted: true, termsVersion: TERMO_VERSAO, expectedFullValue: 1,
  })
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { card, holder } = parsed.value

  const ip = clientIp(req)
  if (!ip) return NextResponse.json({ error: 'Não foi possível identificar a sua conexão. Tente de novo.' }, { status: 400 })

  const { data: clinic, error } = await getAdminClient()
    .from('clinics').select('id, asaas_subscription_id').eq('id', session.clinicId).maybeSingle()
  if (error) {
    console.error(TAG, 'clinics', session.clinicId, error.code ?? '', motivoDoErro(error))
    return NextResponse.json({ error: 'Não foi possível carregar a clínica.' }, { status: 500 })
  }
  const subscriptionId = clinic?.asaas_subscription_id as string | null | undefined
  if (!subscriptionId) return NextResponse.json({ error: 'Esta clínica ainda não tem assinatura.' }, { status: 409 })

  let summary
  try {
    summary = await updateSubscriptionCard(realAsaas, subscriptionId, { card, holder, remoteIp: ip })
  } catch (e) {
    const kind = e instanceof AsaasCardError ? e.kind : 'indisponivel'
    const field = e instanceof AsaasCardError ? e.field : null
    console.error(TAG, 'cartao nao atualizado', session.clinicId, kind, e instanceof AsaasCardError ? e.codes.join(',') : '')
    return erroCartao(kind, field)
  }

  // Fatura em aberto: a atrasada primeiro; senão a que já venceu. A futura segue para a cobrança automática.
  let cobrada = false
  try {
    const list = await realAsaas.get<{ data?: AsaasPay[] }>(`/subscriptions/${encodeURIComponent(subscriptionId)}/payments?limit=10`)
    const abertas = (list?.data ?? []).filter(p => p?.id && !p.deleted && (p.status === 'OVERDUE' || p.status === 'PENDING'))
    const hoje = new Date().toISOString().slice(0, 10)
    const alvo = abertas.find(p => p.status === 'OVERDUE') ?? abertas.find(p => (p.dueDate ?? '9999') <= hoje)
    if (alvo?.id && summary.token) {
      await payWithCardToken(realAsaas, alvo.id, summary.token, ip)
      cobrada = true
    }
  } catch (e) {
    const kind = e instanceof AsaasCardError ? e.kind : 'indisponivel'
    console.error(TAG, 'cobranca nao feita', session.clinicId, kind)
    // O cartão novo já está salvo na assinatura; só a cobrança agora falhou.
    return NextResponse.json({
      error: kind === 'recusado'
        ? 'O cartão foi salvo, mas a cobrança foi recusada. Use outro cartão ou fale com o suporte.'
        : 'O cartão foi salvo, mas não conseguimos cobrar agora. Tente de novo em instantes.',
      code: kind === 'recusado' ? 'cartao_recusado' : 'cobranca_falhou',
    }, { status: kind === 'recusado' ? 422 : 502 })
  }

  return NextResponse.json({ ok: true, charged: cobrada, cardLast4: summary.cardLast4, cardBrand: summary.cardBrand })
}

function erroCartao(kind: string, field: string | null) {
  if (kind === 'recusado') return NextResponse.json({ error: 'Cartão recusado. Confira os dados ou use outro cartão.', code: 'cartao_recusado' }, { status: 422 })
  if (kind === 'invalido' && field) {
    const msg = field === 'cep' ? 'CEP não encontrado. Confira o CEP do titular.' : field === 'documento' ? 'CPF ou CNPJ do titular inválido.' : 'Telefone do titular inválido.'
    return NextResponse.json({ error: msg, code: 'titular_invalido', field }, { status: 422 })
  }
  if (kind === 'invalido') return NextResponse.json({ error: 'Dados inválidos. Confira os dados do cartão e do titular.', code: 'dados_invalidos' }, { status: 422 })
  return NextResponse.json({ error: 'Não foi possível falar com o operador de cobrança agora. Tente de novo em instantes.', code: 'indisponivel' }, { status: 502 })
}
