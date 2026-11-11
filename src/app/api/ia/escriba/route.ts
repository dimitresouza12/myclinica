import { NextResponse } from 'next/server'
import { requireClinicAdmin, requireModulePerm } from '@/lib/whatsapp/auth'
import { isDemoClinic } from '@/lib/demoGuard'
import { hasWhatsAppAI } from '@/lib/planGates'
import { rateLimit } from '@/lib/rateLimit'
import { brasilDayRange } from '@/lib/brasilDate'
import { getAdminClient } from '@/lib/supabaseAdmin'
import {
  buildReportMaterial, buildSystemPrompt, buildUserMessage, LIMITES, sanitizeIdentifiers, validateInput,
  type EntryForReport,
} from '@/lib/ia/escriba'
import { loadClinicIaInfo, recordEscribaUsage, UNDEFINED_COLUMN, userScopedClient } from '@/lib/ia/escribaServer'
import { getIaConfig } from '@/lib/ia/config'
import { LlmProviderError, resolveProvider } from '@/lib/ia/provider'
import { MSG_LIMITE_MENSAL } from '@/lib/ia/gestorProvider' // importar registra a fábrica 'gestor'
import { recordIaUsage } from '@/lib/ia/usage'

export const maxDuration = 60

// IA escriba: transforma rascunho/tópicos/ditado do profissional em evolução (modo "evolucao") ou monta
// um relatório a partir das evoluções do período (modo "relatorio"). A saída é SEMPRE um rascunho: esta
// rota nunca grava nada no prontuário.
//
// Provedor: nenhuma chave, modelo ou chamada de rede mora aqui. A rota fala com a interface LlmProvider
// (src/lib/ia/provider.ts), resolvida pela config remota do Gestor (src/lib/ia/config.ts) com o clinicId
// da sessão. Sem config = provedor "não configurado" = 503 ia_indisponivel (falha fechada). O Gestor
// registra o consumo por conta própria (provider.recordsOwnUsage), então recordIaUsage() é pulado nele;
// a auditoria de metadados em audit_logs continua aqui.
//
// Ordem das barreiras: sessão e permissão de prontuário -> provedor configurado -> limite de
// taxa -> corpo válido -> plano com IA -> consentimento da clínica -> área da clínica -> paciente da
// clínica (RLS do usuário). Só então o texto, já sem identificadores, sai para o provedor.
//
// LGPD: dado de saúde é dado sensível. Ao provedor vai apenas o texto do profissional (ou as evoluções,
// sem notas sigilosas) depois de sanitizeIdentifiers(); nome, CPF, telefone, e-mail e endereço do
// paciente nunca são enviados. A clínica e o usuário vêm da sessão, nunca do corpo.
//
// Limite de taxa: em memória (src/lib/rateLimit.ts), por instância do servidor. Com mais de uma instância
// o teto efetivo é multiplicado e reinicia a cada deploy; serve para conter duplo clique, laço de script e
// custo descontrolado, não é cota de faturamento. Para cota rígida, trocar por Redis/tabela.

const MSG_INDISPONIVEL = 'IA ainda não configurada.'

function json(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, { status })
}

const limiteMensal = () => json({ error: 'limite_mensal', message: MSG_LIMITE_MENSAL }, 429)
const ind = () => json({ error: 'ia_indisponivel', message: MSG_INDISPONIVEL }, 503)

/** Estado para a tela decidir o que mostrar. Não chama o provedor. */
export async function GET(req: Request) {
  const ctx = await requireModulePerm(req, 'prontuario', false)
  if (ctx instanceof NextResponse) return ctx

  const info = await loadClinicIaInfo(ctx.clinicId)
  return NextResponse.json({
    // configurada = o Gestor respondeu enabled para esta clínica
    configurada: resolveProvider(await getIaConfig(ctx.clinicId), { clinicId: ctx.clinicId }).configured,
    plano: hasWhatsAppAI(info?.plan),
    consentimento: info?.consent === true,
    consentimento_suportado: info?.consentSupported === true,
  })
}

/** Consentimento explícito da clínica (só administrador). Sem a coluna no banco, responde 503. */
export async function PUT(req: Request) {
  const ctx = await requireClinicAdmin(req)
  if (ctx instanceof NextResponse) return ctx

  let body: unknown
  try { body = await req.json() } catch {
    return json({ error: 'corpo_invalido', message: 'Corpo da requisição inválido.' }, 400)
  }
  const value = (body as { consentimento?: unknown } | null)?.consentimento
  if (typeof value !== 'boolean') return json({ error: 'corpo_invalido', message: 'Informe consentimento true ou false.' }, 400)

  const info = await loadClinicIaInfo(ctx.clinicId)
  if (!info) return json({ error: 'clinica_nao_encontrada', message: 'Clínica não encontrada.' }, 404)
  if (value && !hasWhatsAppAI(info.plan)) {
    return json({ error: 'plano_sem_ia', message: 'O plano atual da clínica não inclui a IA.' }, 403)
  }

  const { error } = await getAdminClient()
    .from('clinics')
    .update({
      ia_escriba_consent: value,
      ia_escriba_consent_at: value ? new Date().toISOString() : null,
      ia_escriba_consent_by: value ? ctx.userId : null,
    })
    .eq('id', ctx.clinicId)
  if (error) {
    if (error.code === UNDEFINED_COLUMN) {
      return json({ error: 'consentimento_indisponivel', message: 'O registro de consentimento ainda não está disponível neste ambiente.' }, 503)
    }
    console.error('[ia/escriba] não foi possível gravar o consentimento', error.code ?? '')
    return json({ error: 'erro_interno', message: 'Não foi possível salvar agora. Tente de novo.' }, 500)
  }

  await recordEscribaUsage({ action: 'ia.escriba_consent', clinicId: ctx.clinicId, userId: ctx.userId, req, details: { consentimento: value } })
  return NextResponse.json({ consentimento: value })
}

export async function POST(req: Request) {
  const ctx = await requireModulePerm(req, 'prontuario', true)
  if (ctx instanceof NextResponse) return ctx

  const iaConfig = await getIaConfig(ctx.clinicId)
  const provider = resolveProvider(iaConfig, { clinicId: ctx.clinicId })
  if (!provider.configured) return ind()
  // orçamento do cliente esgotado no Gestor: nem tenta (o Gestor também barra com 429 limite_mensal)
  if (typeof iaConfig?.budgetRemaining === 'number' && iaConfig.budgetRemaining <= 0) return limiteMensal()

  const byUser = rateLimit(`ia-escriba:u:${ctx.userId}`, { limit: LIMITES.porUsuarioPorMinuto, windowMs: 60_000 })
  const byClinic = rateLimit(`ia-escriba:c:${ctx.clinicId}`, { limit: LIMITES.porClinicaPorHora, windowMs: 60 * 60_000 })
  if (!byUser.success || !byClinic.success) {
    return json({ error: 'limite_de_uso', message: 'Muitos pedidos em pouco tempo. Aguarde um momento e tente de novo.' }, 429)
  }

  let raw: unknown
  try { raw = await req.json() } catch {
    return json({ error: 'corpo_invalido', message: 'Corpo da requisição inválido.' }, 400)
  }
  const parsed = validateInput(raw)
  if (!parsed.ok) return json({ error: parsed.error, message: parsed.message }, parsed.error === 'texto_longo' ? 413 : 400)
  const input = parsed.input

  const info = await loadClinicIaInfo(ctx.clinicId)
  if (!info) return json({ error: 'clinica_nao_encontrada', message: 'Clínica não encontrada.' }, 404)
  if (!hasWhatsAppAI(info.plan)) {
    return json({ error: 'plano_sem_ia', message: 'O plano atual da clínica não inclui a IA escriba.' }, 403)
  }
  if (!info.consent) {
    return json({
      error: 'consentimento_ausente',
      message: 'A clínica ainda não autorizou o uso de IA com dados de saúde. O administrador precisa dar o consentimento em Evolução antes de usar este recurso.',
    }, 403)
  }
  // a área pedida precisa ser uma das áreas da clínica (a conta de demonstração libera todas)
  const clinicAreas = new Set([info.clinicType, ...info.specialties].filter(Boolean) as string[])
  if (!clinicAreas.has(input.area) && !(await isDemoClinic(ctx.clinicId))) {
    return json({ error: 'area_invalida', message: 'A IA escriba não está disponível para esta área na sua clínica.' }, 403)
  }

  // Leituras de prontuário com o token do usuário (RLS), sempre escopadas à clínica da sessão.
  const db = userScopedClient(req)
  if (!db) return json({ error: 'Não autorizado' }, 401)
  const { data: patient, error: pErr } = await db
    .from('patients')
    .select('name, birth_date')
    .eq('id', input.patientId)
    .eq('clinic_id', ctx.clinicId)
    .maybeSingle()
  if (pErr) {
    console.error('[ia/escriba] leitura do paciente falhou', pErr.code ?? '')
    return json({ error: 'erro_interno', message: 'Não foi possível ler o paciente. Tente de novo.' }, 500)
  }
  if (!patient) return json({ error: 'paciente_nao_encontrado', message: 'Paciente não encontrado.' }, 404)

  const sanitizeOpts = { patientName: (patient as { name?: string | null }).name, birthDate: (patient as { birth_date?: string | null }).birth_date }
  const redactions: Record<string, number> = {}
  const sanitize = (t: string): string => {
    const r = sanitizeIdentifiers(t, sanitizeOpts)
    for (const [k, n] of Object.entries(r.redactions)) redactions[k] = (redactions[k] ?? 0) + n
    return r.text
  }

  let system: string
  let user: string
  let inputChars: number
  let registros: number | undefined

  if (input.modo === 'evolucao') {
    const clean = sanitize(input.texto)
    system = buildSystemPrompt('evolucao', input.area)
    user = buildUserMessage('evolucao', clean)
    inputChars = input.texto.length
  } else {
    const range = brasilDayRange(input.de), rangeEnd = brasilDayRange(input.ate)
    if (!range || !rangeEnd) return json({ error: 'periodo_invalido', message: 'Período inválido.' }, 400)
    const query = (withConfidentialFilter: boolean) => {
      let q = db.from('record_entries')
        .select(withConfidentialFilter ? 'created_at, entry_text, is_confidential' : 'created_at, entry_text')
        .eq('clinic_id', ctx.clinicId)
        .eq('patient_id', input.patientId)
        .gte('created_at', range.start)
        .lte('created_at', rangeEnd.end)
      if (withConfidentialFilter) q = q.eq('is_confidential', false)
      return q.order('created_at', { ascending: false }).limit(LIMITES.registrosMax * 2)
    }
    let res = await query(true)
    // sem a coluna de sigilo no banco não existe nota sigilosa: reler sem o filtro é seguro
    if (res.error?.code === UNDEFINED_COLUMN) res = await query(false)
    if (res.error) {
      console.error('[ia/escriba] leitura das evoluções falhou', res.error.code ?? '')
      return json({ error: 'erro_interno', message: 'Não foi possível ler as evoluções. Tente de novo.' }, 500)
    }
    const built = buildReportMaterial((res.data ?? []) as unknown as EntryForReport[], sanitize)
    if (built.usados === 0) {
      return json({ error: 'sem_registros', message: 'Não há evoluções com texto neste período.' }, 422)
    }
    registros = built.usados
    system = buildSystemPrompt('relatorio', input.area, input.publico)
    user = buildUserMessage('relatorio', built.material, { de: input.de, ate: input.ate, observacoes: sanitize(input.observacoes) })
    inputChars = built.material.length
  }

  const feature = input.modo === 'evolucao' ? 'escriba_evolucao' : 'escriba_relatorio'
  let completion
  try {
    completion = await provider.complete({
      feature,
      system,
      user,
      maxTokens: input.modo === 'evolucao' ? LIMITES.maxTokensEvolucao : LIMITES.maxTokensRelatorio,
    })
  } catch (e) {
    const kind = e instanceof LlmProviderError ? e.kind : 'erro'
    if (!(e instanceof LlmProviderError)) console.error('[ia/escriba] provedor falhou', e instanceof Error ? e.name : '')
    const code = e instanceof LlmProviderError ? e.code : undefined
    if (kind === 'limite' && code === 'limite_mensal') return limiteMensal()
    if (kind === 'indisponivel' && code === 'cliente_bloqueado') {
      return json({ error: 'ia_bloqueada', message: 'O uso de IA está bloqueado para esta clínica. Fale com o suporte.' }, 403)
    }
    if (kind === 'indisponivel' && code === 'ia_desativada') {
      return json({ error: 'ia_desativada', message: 'A IA está desativada para esta clínica. Fale com o suporte.' }, 403)
    }
    if (kind === 'indisponivel' || kind === 'autenticacao') return ind()
    if (kind === 'limite' || kind === 'sobrecarga') {
      return json({ error: 'ia_ocupada', message: 'A IA está ocupada agora. Tente de novo em instantes.' }, 503)
    }
    if (kind === 'timeout') return json({ error: 'ia_demorou', message: 'A IA demorou para responder. Tente de novo.' }, 504)
    return json({ error: 'ia_falhou', message: 'Não foi possível gerar o rascunho agora. Tente de novo.' }, 502)
  }
  const text = completion.text.trim()
  if (!text) return json({ error: 'ia_falhou', message: 'Não foi possível gerar o rascunho agora. Tente de novo.' }, 502)

  // provedores que registram o próprio consumo (Gestor) não passam pelo sink: evita contar em dobro
  if (!provider.recordsOwnUsage) {
    await recordIaUsage({
      clinicId: ctx.clinicId,
      feature,
      model: completion.usage.model,
      inputTokens: completion.usage.inputTokens,
      outputTokens: completion.usage.outputTokens,
    })
  }

  await recordEscribaUsage({
    action: 'ia.escriba',
    clinicId: ctx.clinicId,
    userId: ctx.userId,
    patientId: input.patientId,
    req,
    details: {
      modo: input.modo,
      area: input.area,
      ...(input.modo === 'relatorio' ? { publico: input.publico, registros: registros ?? 0 } : {}),
      entrada_chars: inputChars,
      saida_chars: text.length,
      identificadores_removidos: Object.values(redactions).reduce((a, b) => a + b, 0),
      modelo: completion.usage.model,
      tokens_entrada: completion.usage.inputTokens,
      tokens_saida: completion.usage.outputTokens,
    },
  })

  return NextResponse.json({
    rascunho: text,
    aviso: 'Rascunho gerado por IA. Revise antes de salvar.',
    identificadores_removidos: redactions,
    ...(registros !== undefined ? { registros } : {}),
  })
}
