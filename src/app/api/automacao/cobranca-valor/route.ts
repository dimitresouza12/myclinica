import { asaasPut } from '@/lib/asaas'
import { authenticateAutomacao, automacaoError, automacaoJson, loadAutomacaoClinic, readJsonBody } from '@/lib/automacaoIntegration'
import { requestMeta } from '@/lib/gestorIntegration'
import { rejectIfDemo } from '@/lib/demoGuard'
import { getAdminClient } from '@/lib/supabaseAdmin'

const VALOR_MAXIMO = 100_000

/** Valor mensal personalizado: número com no máximo 2 casas entre 1 e 100000, ou null (volta ao preço de tabela). */
function validarValor(v: unknown): { ok: true; valor: number | null } | { ok: false } {
  if (v === null) return { ok: true, valor: null }
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 1 || v > VALOR_MAXIMO) return { ok: false }
  return { ok: true, valor: Math.round(v * 100) / 100 }
}

// Dashboard -> MyClinica. Grava o preço congelado da clínica (clinics.custom_monthly_price) com registro em audit_logs e,
// se a clínica já tem assinatura no Asaas, atualiza o valor dela ANTES de gravar (falha no Asaas não muda nada aqui).
// Voltar ao preço de tabela (null) não mexe na assinatura: o aviso diz que o valor dela continua o antigo.
export async function POST(req: Request) {
  const denied = authenticateAutomacao(req)
  if (denied) return denied
  const body = await readJsonBody(req)
  if (!body.ok) return body.response
  const clinic = await loadAutomacaoClinic(body.value.clinicId)
  if (!clinic.ok) return clinic.response
  const demo = await rejectIfDemo(clinic.clinic.id)
  if (demo) return demo
  const novo = validarValor(body.value.valor)
  if (!novo.ok) return automacaoError('Informe um valor entre R$ 1,00 e R$ 100.000,00, ou nulo para voltar ao preço de tabela.', 400)

  try {
    const admin = getAdminClient()
    const { data: atual, error: erroLeitura } = await admin
      .from('clinics')
      .select('custom_monthly_price, asaas_subscription_id')
      .eq('id', clinic.clinic.id)
      .maybeSingle()
    if (erroLeitura || !atual) {
      console.error('[automacao/cobranca-valor] leitura falhou:', erroLeitura?.message)
      return automacaoError('Erro ao ler a clínica.', 500)
    }
    const antes = atual.custom_monthly_price == null ? null : Number(atual.custom_monthly_price)
    if (antes === novo.valor) return automacaoJson({ ok: true, valorMensalPersonalizado: antes, assinaturaAtualizada: false, aviso: null })

    const assinatura = (atual.asaas_subscription_id as string | null) ?? null
    let assinaturaAtualizada = false
    let aviso: string | null = null
    if (assinatura && novo.valor !== null) {
      try {
        // só as próximas cobranças: a cobrança já gerada e em aberto não muda de valor
        await asaasPut(`/subscriptions/${assinatura}`, { value: novo.valor, updatePendingPayments: false })
        assinaturaAtualizada = true
      } catch (e) {
        console.error('[automacao/cobranca-valor] Asaas falhou:', e instanceof Error ? e.name : 'erro')
        return automacaoError('Não foi possível atualizar a assinatura no Asaas. Nada foi alterado.', 502)
      }
    } else if (assinatura && novo.valor === null) {
      aviso = 'A clínica voltou ao preço de tabela, mas a assinatura no Asaas continua com o valor anterior.'
    }

    const { error: erroGravar } = await admin.from('clinics').update({ custom_monthly_price: novo.valor }).eq('id', clinic.clinic.id)
    if (erroGravar) {
      console.error('[automacao/cobranca-valor] update falhou:', erroGravar.message)
      return automacaoError(assinaturaAtualizada
        ? 'A assinatura no Asaas foi atualizada, mas não foi possível gravar o valor aqui. Repita a operação.'
        : 'Erro ao gravar o valor.', 500)
    }
    const meta = requestMeta(req)
    const { error: erroAuditoria } = await admin.from('audit_logs').insert({
      action: 'painel.cobranca_valor', module: 'painel', clinic_id: clinic.clinic.id, resource_id: clinic.clinic.id, user_id: null,
      ip_address: meta.ip, user_agent: meta.userAgent ? meta.userAgent.slice(0, 255) : null,
      details: { origin: 'painel', before: { customMonthlyPrice: antes }, after: { customMonthlyPrice: novo.valor }, assinaturaAtualizada },
    })
    if (erroAuditoria) {
      console.error('[automacao/cobranca-valor] audit_logs falhou:', erroAuditoria.message)
      aviso = [aviso, 'O valor foi gravado, mas o registro em audit_logs falhou.'].filter(Boolean).join(' ')
    }
    return automacaoJson({ ok: true, valorMensalPersonalizado: novo.valor, assinaturaAtualizada, aviso })
  } catch (e) {
    console.error('[automacao/cobranca-valor] erro inesperado:', e instanceof Error ? e.name : 'erro')
    return automacaoError('Erro interno.', 500)
  }
}
