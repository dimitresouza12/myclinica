import { NextResponse } from 'next/server'
import { requireModulePerm } from '@/lib/whatsapp/auth'
import { rejectIfDemo } from '@/lib/demoGuard'
import { N8N_WEBHOOK_BASE } from '@/lib/n8nConfig'
import { rateLimit } from '@/lib/rateLimit'
import { getAdminClient } from '@/lib/supabaseAdmin'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const maxDuration = 60

// Dispara uma campanha de WhatsApp pelo webhook n8n `campanha-whatsapp`. Antes ia direto do
// navegador para o n8n, sem nenhuma checagem no servidor; agora passa por aqui para a conta de
// demonstração nunca disparar mensagem real. A clínica vem do usuário logado, nunca do corpo;
// o corpo é repassado como estava e o n8n continua derivando a clínica do token do usuário.
// A campanha nasce como rascunho no navegador; só depois que o n8n aceita o disparo é que esta rota a
// marca como enviada (a tabela campaigns não tem política de UPDATE para usuários, então vai pelo servidor,
// sempre escopada à clínica da sessão).
export async function POST(req: Request) {
  const ctx = await requireModulePerm(req, 'campanhas', true)
  if (ctx instanceof NextResponse) return ctx

  const demo = await rejectIfDemo(ctx.clinicId)
  if (demo) return demo

  // uma campanha por vez já é o uso normal; isto só contém duplo clique e laço de script
  const limit = rateLimit(`campanha-dispatch:${ctx.clinicId}`, { limit: 5, windowMs: 60_000 })
  if (!limit.success) {
    return NextResponse.json({ error: 'Muitos disparos em pouco tempo. Aguarde um momento.' }, { status: 429 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  try {
    const res = await fetch(`${N8N_WEBHOOK_BASE}/campanha-whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: req.headers.get('authorization') ?? '' },
      body: JSON.stringify(body),
    })
    const out = await res.json().catch(() => ({}))
    if (!res.ok) {
      const message = typeof (out as { error?: unknown })?.error === 'string' ? (out as { error: string }).error : `Erro ${res.status}`
      return NextResponse.json({ error: message }, { status: res.status })
    }

    const campaignId = (body as { campaign_id?: unknown }).campaign_id
    if (typeof campaignId === 'string' && UUID.test(campaignId)) {
      const { error } = await getAdminClient()
        .from('campaigns')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', campaignId)
        .eq('clinic_id', ctx.clinicId)
      if (error) console.error('[campanhas/dispatch] não foi possível marcar a campanha como enviada', error.code ?? '')
    }
    return NextResponse.json(out)
  } catch (e) {
    console.error('[campanhas/dispatch]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Não foi possível disparar a campanha agora. Tente de novo em instantes.' }, { status: 502 })
  }
}
