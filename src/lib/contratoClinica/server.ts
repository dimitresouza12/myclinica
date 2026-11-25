// Contrato da clínica: rascunho, código por WhatsApp, assinatura e cobrança. SÓ NO SERVIDOR.
//
// Escreve com o cliente de serviço (clinic_agreements não tem policy de escrita) e por isso TODA consulta aqui é
// escopada à clínica vinda do usuário logado (`ctx.clinicId`), nunca do corpo. Dependências (banco, Asaas,
// WhatsApp, relógio, ambiente) entram por `ContractDeps`, então os testes rodam tudo com mocks.
//
// Ordem de assinar (a tabela só aceita mudar asaas_ref depois de 'signed'):
//   1 valida entrada e nome -> 2 reserva a tentativa do código -> 3 confere o código -> 4 gera selo, PDF e hash
//   -> 5 sobe o PDF no bucket privado -> 6 UM UPDATE grava toda a prova e muda para 'signed' (só se ainda 'pending'
//   e com o mesmo código) -> 7 cobrança no Asaas (falha aqui NÃO desfaz a assinatura; dá para repetir).

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '@/lib/supabaseAdmin'
import { realAsaas, type AsaasApi } from '@/lib/asaas'
import { createContractBilling } from '@/lib/asaasContrato'
import { sendText } from '@/lib/whatsapp/evolution'
import { whatsappCandidates, normalizeBrPhone } from '@/lib/whatsapp/phone'
import { motivoDoErro } from '@/lib/nutri/erros'
import { hojeBrasil } from '@/lib/brasilDate'
import { contentHash, sha256Hex, shortHash } from '@/lib/assinatura/hash'
import { cleanSignerName, cleanUserAgent, validateSignInput } from '@/lib/assinatura/validar'
import { isValidCpf } from '@/lib/convenios/receitaSaude'
import { onlyDigits } from '@/lib/numericFormat'
import { firstDueDateFor, campanhaAtiva, CAMPANHA_CONTRATO } from '@/lib/campanha'
import { quoteContract } from '@/lib/contratoPrecos'
import { elegivelPromoPrimeiraCobranca, valorPrimeiraCobranca } from '@/lib/promoPrimeiraCobranca'
import { PLAN_CATALOG } from '@/lib/planCatalog'
import {
  buildContractText, contratadaFromEnv, contratadaPendencias, rotuloDocContratada, CONTRATO_TITULO, CONTRATO_VERSAO,
} from './modelo'
import {
  CODE_TTL_MS, MAX_CODE_ATTEMPTS, MENSAGEM_CODIGO, canSendCode, checkCode, codeMessage, codeSecret,
  generateCode, hashCode, hashDestination, maskPhone,
} from './codigo'
import { buildManifest, contractSignedHash } from './prova'
import { buildContractPdf } from './pdf'
import { formatBrl, formatCpf, formatDateBr } from '@/lib/documentos/campos'
import { formatDateTimeBr } from '@/lib/assinatura/carimbo'

export const BUCKET = 'clinic-agreements'
export const SIGNED_URL_TTL_S = 300
/** Reivindicação de cobrança presa (servidor caiu no meio): depois disso outra tentativa pode retomar. */
const BILLING_CLAIM_STALE_MS = 10 * 60_000

export interface ContractDeps {
  db: SupabaseClient
  asaas: AsaasApi
  sendText: typeof sendText
  now: () => Date
  env: Record<string, string | undefined>
  /** Gerador do código (troca nos testes). */
  newCode: () => string
}

export function defaultDeps(): ContractDeps {
  return { db: getAdminClient(), asaas: realAsaas, sendText, now: () => new Date(), env: process.env, newCode: generateCode }
}

export interface Ctx { clinicId: string; userId: string }

export interface Falha {
  ok: false
  status: number
  error: string
  extra?: Record<string, unknown>
  headers?: Record<string, string>
}
const fail = (status: number, error: string, extra?: Record<string, unknown>, headers?: Record<string, string>): Falha =>
  ({ ok: false, status, error, extra, headers })

type Row = Record<string, unknown>
type DbError = { code?: string; message?: string } | null | undefined

function dbFail(e: DbError, rota: string): Falha {
  const motivo = motivoDoErro(e)
  if (motivo === 'sem_tabela') return fail(503, 'O contrato ainda não está ativo nesta conta.')
  console.error(`[contratoClinica:${rota}]`, e?.code ?? '', e?.message ?? '')
  return fail(500, 'Não foi possível concluir agora. Tente de novo em instantes.')
}

/** Nunca inclui code_hash. */
const PUBLIC_COLS =
  'id, clinic_id, plan, months, payment_mode, installments, monthly_value, total_value, card_fee_value, first_due_date, ' +
  'content_hash, signer_name, signer_cpf, status, signed_at, pdf_hash, signed_hash, asaas_ref, created_at, code_sent_to, code_expires_at'
const INTERNAL_COLS = `${PUBLIC_COLS}, content_text, code_hash, code_attempts, code_sent_count, pdf_path, user_id`

export interface AgreementView {
  id: string
  status: 'pending' | 'signed' | 'cancelled'
  plan: string
  planLabel: string
  months: number
  paymentMode: 'monthly' | 'upfront'
  installments: number
  monthlyValue: number
  totalValue: number
  cardFeeValue: number
  firstDueDate: string | null
  signerName: string | null
  signerCpf: string | null
  signedAt: string | null
  signedHash: string | null
  contentHash: string | null
  pdfHash: string | null
  billingRef: string | null
  billingState: 'nenhuma' | 'em_andamento' | 'criada'
  codeSentTo: string | null
  codeExpiresAt: string | null
  createdAt: string
  /** Só no detalhe. */
  contentText?: string
}

function view(r: Row, withText = false): AgreementView {
  const ref = (r.asaas_ref as string | null) ?? null
  const plan = String(r.plan)
  const v: AgreementView = {
    id: String(r.id),
    status: r.status as AgreementView['status'],
    plan,
    planLabel: (PLAN_CATALOG as Record<string, { label: string }>)[plan]?.label ?? plan,
    months: Number(r.months),
    paymentMode: r.payment_mode as 'monthly' | 'upfront',
    installments: Number(r.installments),
    monthlyValue: Number(r.monthly_value),
    totalValue: Number(r.total_value),
    cardFeeValue: Number(r.card_fee_value),
    firstDueDate: (r.first_due_date as string | null) ?? null,
    signerName: (r.signer_name as string | null) ?? null,
    signerCpf: (r.signer_cpf as string | null) ?? null,
    signedAt: (r.signed_at as string | null) ?? null,
    signedHash: (r.signed_hash as string | null) ?? null,
    contentHash: (r.content_hash as string | null) ?? null,
    pdfHash: (r.pdf_hash as string | null) ?? null,
    billingRef: ref && !ref.startsWith('creating:') ? ref : null,
    billingState: !ref ? 'nenhuma' : ref.startsWith('creating:') ? 'em_andamento' : 'criada',
    codeSentTo: (r.code_sent_to as string | null) ?? null,
    codeExpiresAt: (r.code_expires_at as string | null) ?? null,
    createdAt: String(r.created_at),
  }
  if (withText) v.contentText = String(r.content_text ?? '')
  return v
}

// ── Rascunho ────────────────────────────────────────────────────────────────

export interface DraftInput {
  plan?: unknown
  months?: unknown
  paymentMode?: unknown
  installments?: unknown
  responsibleName?: unknown
  responsibleCpf?: unknown
}

/** Nome completo do responsável: mesmas regras do nome na assinatura (duas palavras ou mais, sem < >). */
function validateResponsibleName(raw: unknown): { ok: true; name: string } | { ok: false; error: string } {
  const name = cleanSignerName(raw)
  const words = name.split(' ')
  if (name.length < 5 || name.length > 120 || words.length < 2 || words.some(w => w.length < 2)) return { ok: false, error: 'Digite o nome completo do responsável.' }
  if (/[<>]/.test(name)) return { ok: false, error: 'O nome tem caracteres inválidos.' }
  return { ok: true, name }
}

export async function createDraft(ctx: Ctx, input: DraftInput, deps: ContractDeps = defaultDeps()): Promise<{ ok: true; agreement: AgreementView } | Falha> {
  const now = deps.now()
  const nome = validateResponsibleName(input.responsibleName)
  if (!nome.ok) return fail(400, nome.error)
  const cpf = onlyDigits(typeof input.responsibleCpf === 'string' ? input.responsibleCpf : '')
  if (!isValidCpf(cpf)) return fail(400, 'CPF do responsável inválido.')

  const contratada = contratadaFromEnv(deps.env)
  const pend = contratadaPendencias(contratada)
  if (pend.length > 0) {
    return fail(503, 'Os dados da empresa contratada ainda não foram configurados. Tente novamente mais tarde.', { pendencias: pend })
  }

  const db = deps.db
  const { data: clinic, error: cErr } = await db.from('clinics').select('id, name, address, phone, email, trial_ends_at, created_at').eq('id', ctx.clinicId).maybeSingle()
  if (cErr) return dbFail(cErr, 'draft-clinic')
  if (!clinic) return fail(404, 'Clínica não encontrada.')

  // Black Friday: 50% na primeira mensalidade também no contrato mês a mês (mesma regra do cartão: cadastro na janela).
  const promoPrimeira = elegivelPromoPrimeiraCobranca(clinic.created_at as string | null) && campanhaAtiva(now)
  const quote = quoteContract({ plan: input.plan, months: input.months, paymentMode: input.paymentMode, installments: input.installments, promoPrimeira })
  if (!quote.ok) return fail(400, quote.error)

  // Contrato vigente: não abre outro por cima (evita cobrança em duplicidade no Asaas).
  const { data: signed, error: sErr } = await db.from('clinic_agreements').select('id, signed_at, months').eq('clinic_id', ctx.clinicId).eq('status', 'signed')
  if (sErr) return dbFail(sErr, 'draft-signed')
  const vigente = (signed ?? []).some(s => {
    const start = new Date(String(s.signed_at)).getTime()
    return !Number.isNaN(start) && start + Number(s.months) * 31 * 86_400_000 > now.getTime()
  })
  if (vigente) return fail(409, 'Esta clínica já tem um contrato assinado em vigor.')

  const q = quote.quote
  const firstDueDate = firstDueDateFor(clinic.trial_ends_at as string | null, now)
  const text = buildContractText({
    contratada,
    clinicName: String(clinic.name),
    clinicAddress: (clinic.address as string | null) ?? null,
    clinicPhone: (clinic.phone as string | null) ?? null,
    clinicEmail: (clinic.email as string | null) ?? null,
    responsibleName: nome.name,
    responsibleCpf: cpf,
    plan: q.plan,
    months: q.months,
    paymentMode: q.paymentMode,
    installments: q.installments,
    monthlyValue: q.monthlyValue,
    promoFirstValue: q.promo ? q.firstValue : null,
    contractTotal: q.contractTotal,
    cardFeeValue: q.cardFeeValue,
    totalValue: q.totalValue,
    installmentValue: q.installmentValue,
    firstDueDate,
    generatedOn: hojeBrasil(now),
  })

  // Um rascunho aberto por clínica: os anteriores ainda pendentes são cancelados.
  const { error: cancelErr } = await db.from('clinic_agreements').update({ status: 'cancelled' }).eq('clinic_id', ctx.clinicId).eq('status', 'pending')
  if (cancelErr) return dbFail(cancelErr, 'draft-cancel')

  const { data: row, error } = await db.from('clinic_agreements').insert({
    clinic_id: ctx.clinicId,
    user_id: ctx.userId,
    plan: q.plan,
    months: q.months,
    payment_mode: q.paymentMode,
    installments: q.installments,
    monthly_value: q.monthlyValue,
    total_value: q.totalValue,
    card_fee_value: q.cardFeeValue,
    first_due_date: firstDueDate,
    content_text: text,
    content_hash: await contentHash(text),
    signer_name: nome.name,
    signer_cpf: cpf,
    status: 'pending',
  }).select(`${PUBLIC_COLS}, content_text`).single()
  if (error || !row) return dbFail(error, 'draft-insert')
  return { ok: true, agreement: view(row as unknown as Row, true) }
}

// ── Leitura ─────────────────────────────────────────────────────────────────

export async function listAgreements(ctx: Ctx, deps: ContractDeps = defaultDeps()): Promise<{ ok: true; agreements: AgreementView[] } | Falha> {
  const { data, error } = await deps.db.from('clinic_agreements').select(PUBLIC_COLS).eq('clinic_id', ctx.clinicId)
    .neq('status', 'cancelled').order('created_at', { ascending: false }).limit(10)
  if (error) return dbFail(error, 'list')
  return { ok: true, agreements: ((data ?? []) as unknown as Row[]).map(r => view(r)) }
}

export interface SignedDetail { agreement: AgreementView; pdfUrl: string | null; pdfUrlExpiresInSeconds: number | null }

/** Detalhe de um contrato da clínica; assinado traz a URL assinada (curta) do PDF no bucket privado. */
export async function getAgreement(ctx: Ctx, id: string, deps: ContractDeps = defaultDeps()): Promise<{ ok: true; detail: SignedDetail } | Falha> {
  const { data, error } = await deps.db.from('clinic_agreements').select(`${PUBLIC_COLS}, content_text, pdf_path`)
    .eq('id', id).eq('clinic_id', ctx.clinicId).maybeSingle()
  if (error) return dbFail(error, 'get')
  if (!data) return fail(404, 'Contrato não encontrado.')
  const row = data as unknown as Row
  let pdfUrl: string | null = null
  if (row.status === 'signed' && typeof row.pdf_path === 'string') {
    const { data: s, error: sErr } = await deps.db.storage.from(BUCKET).createSignedUrl(row.pdf_path, SIGNED_URL_TTL_S)
    if (sErr || !s?.signedUrl) console.error('[contratoClinica:get] url do PDF', sErr?.message ?? 'sem url')
    else pdfUrl = s.signedUrl
  }
  return { ok: true, detail: { agreement: view(row, true), pdfUrl, pdfUrlExpiresInSeconds: pdfUrl ? SIGNED_URL_TTL_S : null } }
}

/** PDF de leitura (sem assinatura) de um contrato pendente: é o que o cliente abre antes de pedir o código. */
export async function previewAgreementPdf(ctx: Ctx, id: string, deps: ContractDeps = defaultDeps()): Promise<{ ok: true; pdf: Uint8Array } | Falha> {
  const { data, error } = await deps.db.from('clinic_agreements').select(`${PUBLIC_COLS}, content_text`)
    .eq('id', id).eq('clinic_id', ctx.clinicId).maybeSingle()
  if (error) return dbFail(error, 'previa')
  if (!data) return fail(404, 'Contrato não encontrado.')
  const row = data as unknown as Row
  if (row.status !== 'pending') return fail(409, 'Este contrato não está mais aguardando assinatura.')
  try {
    const contratada = contratadaFromEnv()
    const cpf = String(row.signer_cpf ?? '')
    const nome = String(row.signer_name ?? '')
    const pdf = buildContractPdf({
      title: CONTRATO_TITULO, text: String(row.content_text), manifest: [], signatureImage: null, signerName: nome, previa: true,
      resumo: [
        ['Plano', PLAN_CATALOG[row.plan as keyof typeof PLAN_CATALOG]?.label ?? String(row.plan)],
        ['Prazo', `${Number(row.months)} meses`],
        [row.payment_mode === 'upfront' ? 'Valor do contrato' : 'Mensalidade', `R$ ${formatBrl(row.payment_mode === 'upfront' ? Number(row.total_value) : Number(row.monthly_value))}`],
        ['1ª cobrança', row.first_due_date ? formatDateBr(String(row.first_due_date)) : '-'],
      ],
      contratada: { nome: contratada.razaoSocial, documento: rotuloDocContratada(contratada.cnpj), assinadoEm: 'Assinatura digital (gov.br) a ser anexada ao registro', imagem: null, pendente: true },
      contratante: { nome, documento: `CPF ${formatCpf(cpf) || cpf}`, assinadoEm: 'Aguardando assinatura', imagem: null, pendente: true },
      timbre: { nome: contratada.razaoSocial, documento: rotuloDocContratada(contratada.cnpj), local: contratada.cidadeUf, site: 'myclinica.online' },
    })
    return { ok: true, pdf }
  } catch (e) {
    console.error('[contratoClinica:previa]', e instanceof Error ? e.message : e)
    return fail(500, 'Não foi possível gerar o contrato para leitura. Tente de novo.')
  }
}

// ── Código por WhatsApp ─────────────────────────────────────────────────────

export interface SendCodeResult { ok: true; sentTo: string; expiresAt: string; resendAvailableAt: string; codeValidMinutes: number }

export async function sendCode(ctx: Ctx, id: string, input: { phone?: unknown }, deps: ContractDeps = defaultDeps()): Promise<SendCodeResult | Falha> {
  const instance = deps.env.MYCLINICA_CONTRACT_WA_INSTANCE?.trim()
  if (!instance) return fail(503, 'O envio do código por WhatsApp não está disponível agora.')
  const secret = codeSecret(deps.env)
  if (!secret) return fail(503, 'O envio do código não está disponível agora.')

  const national = normalizeBrPhone(typeof input.phone === 'string' ? input.phone : '')
  if (!national) return fail(400, 'Informe um celular com DDD que tenha WhatsApp.')
  const candidates = whatsappCandidates(national)

  const db = deps.db
  const { data, error } = await db.from('clinic_agreements').select('id, status, code_sent_count').eq('id', id).eq('clinic_id', ctx.clinicId).maybeSingle()
  if (error) return dbFail(error, 'code-load')
  if (!data) return fail(404, 'Contrato não encontrado.')
  if (data.status !== 'pending') return fail(409, 'Este contrato não aceita mais código.')

  const now = deps.now()
  const since = new Date(now.getTime() - 24 * 60 * 60_000).toISOString()
  const { data: logs, error: lErr } = await db.from('clinic_agreement_code_log').select('agreement_id, sent_at').eq('clinic_id', ctx.clinicId).gte('sent_at', since)
  if (lErr) return dbFail(lErr, 'code-log')
  const rows = (logs ?? []) as { agreement_id: string; sent_at: string }[]
  const decision = canSendCode({
    agreementSentAt: rows.filter(r => r.agreement_id === id).map(r => r.sent_at),
    clinicSentAt: rows.map(r => r.sent_at),
    now,
  })
  if (!decision.ok) {
    const msg = decision.reason === 'aguarde'
      ? `Aguarde ${decision.retryAfterSeconds} segundos para pedir outro código.`
      : 'Muitos códigos pedidos. Tente de novo mais tarde.'
    return fail(429, msg, { retryAfterSeconds: decision.retryAfterSeconds, reason: decision.reason }, { 'Retry-After': String(decision.retryAfterSeconds) })
  }

  const code = deps.newCode()
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS).toISOString()
  const sentTo = maskPhone(national)
  const prev = Number(data.code_sent_count ?? 0)

  // Reserva o envio: só um pedido por vez avança o contador (trava otimista). O perdedor recebe 429 sem enviar nada.
  const { data: upd, error: uErr } = await db.from('clinic_agreements').update({
    code_hash: hashCode(secret, id, code),
    code_expires_at: expiresAt,
    code_attempts: 0,
    code_sent_to: sentTo,
    code_sent_count: prev + 1,
  }).eq('id', id).eq('clinic_id', ctx.clinicId).eq('status', 'pending').eq('code_sent_count', prev).select('id')
  if (uErr) return dbFail(uErr, 'code-reserve')
  if (!upd || upd.length === 0) return fail(429, 'Já existe um pedido de código em andamento. Aguarde um instante.', { retryAfterSeconds: 5 }, { 'Retry-After': '5' })

  const { data: logRow, error: insErr } = await db.from('clinic_agreement_code_log')
    .insert({ clinic_id: ctx.clinicId, agreement_id: id, sent_at: now.toISOString(), destination_hash: hashDestination(secret, national) }).select('id').single()
  if (insErr || !logRow) {
    await invalidateCode(db, id, ctx.clinicId)
    return dbFail(insErr, 'code-log-insert')
  }

  const text = codeMessage(code)
  let sent = false
  let lastErr: unknown = null
  for (const to of candidates) {
    try { await deps.sendText(instance, to, text); sent = true; break } catch (e) { lastErr = e }
  }
  if (!sent) {
    console.error('[contratoClinica:code-send]', lastErr instanceof Error ? lastErr.message : lastErr)
    await invalidateCode(db, id, ctx.clinicId)
    // Envio que não saiu não conta no limite.
    await db.from('clinic_agreement_code_log').delete().eq('id', (logRow as Row).id as string)
    return fail(502, 'Não foi possível enviar o código por WhatsApp agora. Tente de novo em instantes.')
  }

  return {
    ok: true,
    sentTo,
    expiresAt,
    resendAvailableAt: new Date(now.getTime() + 60_000).toISOString(),
    codeValidMinutes: CODE_TTL_MS / 60_000,
  }
}

async function invalidateCode(db: SupabaseClient, id: string, clinicId: string) {
  const { error } = await db.from('clinic_agreements').update({ code_hash: null, code_expires_at: null }).eq('id', id).eq('clinic_id', clinicId).eq('status', 'pending')
  if (error) console.error('[contratoClinica:invalidate]', error.code ?? '', error.message)
}

// ── Assinatura ──────────────────────────────────────────────────────────────

export interface SignInputBody {
  code?: unknown
  method?: unknown
  signerName?: unknown
  drawing?: unknown
  accepted?: unknown
}

export interface SignMeta { ip: string; userAgent: string | null | undefined }

export interface BillingOutcome {
  status: 'criada' | 'pendente' | 'em_andamento'
  ref: string | null
  kind: 'subscription' | 'payment' | null
  invoiceUrl: string | null
  /** Mensagem curta para a tela quando a cobrança não saiu. */
  message: string | null
}

export interface SignResult {
  ok: true
  agreement: AgreementView
  billing: BillingOutcome
  warnings: string[]
}

const sameName = (a: string, b: string) => {
  const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
  return n(a) === n(b)
}

export async function signAgreement(ctx: Ctx, id: string, input: SignInputBody, meta: SignMeta, deps: ContractDeps = defaultDeps()): Promise<SignResult | Falha> {
  const secret = codeSecret(deps.env)
  if (!secret) return fail(503, 'A assinatura não está disponível agora.')

  const valid = validateSignInput({ requestId: id, method: input.method, signerName: input.signerName, drawing: input.drawing, accepted: input.accepted })
  if (!valid.ok) return fail(400, valid.error)

  const db = deps.db
  const { data, error } = await db.from('clinic_agreements').select(INTERNAL_COLS).eq('id', id).eq('clinic_id', ctx.clinicId).maybeSingle()
  if (error) return dbFail(error, 'sign-load')
  if (!data) return fail(404, 'Contrato não encontrado.')
  const row = data as unknown as Row
  if (row.status === 'signed') return fail(409, 'Este contrato já foi assinado.')
  if (row.status !== 'pending') return fail(409, 'Este contrato foi cancelado. Gere um novo.')
  if (!sameName(valid.signerName, String(row.signer_name ?? ''))) return fail(400, 'O nome precisa ser igual ao do responsável no contrato.')

  const now = deps.now()
  // A campanha acabou entre gerar e assinar: o texto traz a data da campanha, então precisa ser gerado de novo.
  if (row.first_due_date === CAMPANHA_CONTRATO.firstDueDate && !campanhaAtiva(now)) {
    return fail(409, 'A campanha terminou. Gere o contrato novamente para ver as condições atuais.', { motivo: 'campanha_encerrada' })
  }

  // Reserva a tentativa ANTES de comparar: duas requisições paralelas não passam de 5 tentativas.
  const reserved = Number(row.code_attempts ?? 0) + 1
  if (reserved > MAX_CODE_ATTEMPTS) return fail(429, MENSAGEM_CODIGO.tentativas, { reason: 'tentativas' })
  const { data: att, error: aErr } = await db.from('clinic_agreements').update({ code_attempts: reserved })
    .eq('id', id).eq('clinic_id', ctx.clinicId).eq('status', 'pending').eq('code_attempts', row.code_attempts as number).select('id')
  if (aErr) return dbFail(aErr, 'sign-attempt')
  if (!att || att.length === 0) return fail(409, 'Tente de novo em instantes.')

  const check = checkCode({
    state: { codeHash: (row.code_hash as string | null) ?? null, expiresAt: (row.code_expires_at as string | null) ?? null, attempts: reserved },
    input: input.code,
    secret,
    agreementId: id,
    now,
  })
  if (!check.ok) {
    const left = Math.max(MAX_CODE_ATTEMPTS - reserved, 0)
    return fail(check.reason === 'incorreto' ? 400 : 422, MENSAGEM_CODIGO[check.reason], { reason: check.reason, attemptsLeft: left })
  }

  // Prova
  const signedAt = now.toISOString()
  const userAgent = cleanUserAgent(meta.userAgent)
  const ip = meta.ip && meta.ip !== 'unknown' ? meta.ip : ''
  const cHash = String(row.content_hash)
  const cpf = String(row.signer_cpf ?? '')
  const signatureImageHash = valid.drawing ? await sha256Hex(valid.drawing) : ''
  const seal = {
    agreementId: id, clinicId: ctx.clinicId, userId: ctx.userId, contentHash: cHash, signerName: valid.signerName,
    signerCpf: cpf, method: valid.method, signatureImageHash, signedAt,
  }
  const sHash = await contractSignedHash(seal)

  const { data: clinic, error: clErr } = await db.from('clinics').select('name').eq('id', ctx.clinicId).maybeSingle()
  if (clErr) return dbFail(clErr, 'sign-clinic')

  const manifest = buildManifest({
    ...seal, clinicName: String(clinic?.name ?? ''), signedHash: sHash, ipAddress: ip, userAgent,
    codeSentTo: String(row.code_sent_to ?? ''), contractVersion: CONTRATO_VERSAO,
  })
  let pdf: Uint8Array
  try {
    const contratada = contratadaFromEnv()
    const quando = formatDateTimeBr(signedAt) || signedAt
    pdf = buildContractPdf({
      title: CONTRATO_TITULO, text: String(row.content_text), manifest, signatureImage: valid.drawing, signerName: valid.signerName,
      resumo: [
        ['Plano', PLAN_CATALOG[row.plan as keyof typeof PLAN_CATALOG]?.label ?? String(row.plan)],
        ['Prazo', `${Number(row.months)} meses`],
        [row.payment_mode === 'upfront' ? 'Valor do contrato' : 'Mensalidade', `R$ ${formatBrl(row.payment_mode === 'upfront' ? Number(row.total_value) : Number(row.monthly_value))}`],
        ['1ª cobrança', row.first_due_date ? formatDateBr(String(row.first_due_date)) : '-'],
      ],
      // A CONTRATADA confirma depois, por assinatura digital gov.br anexada ao registro (cláusula 12.4): o bloco fica em aberto.
      contratada: { nome: contratada.razaoSocial, documento: rotuloDocContratada(contratada.cnpj), assinadoEm: 'Assinatura digital (gov.br) a ser anexada ao registro', imagem: null, pendente: true },
      contratante: { nome: valid.signerName, documento: `CPF ${formatCpf(cpf) || cpf}`, assinadoEm: `Assinado eletronicamente em ${quando}`, imagem: valid.drawing },
      verificacao: `${shortHash(cHash)} / ${shortHash(sHash)}`,
      timbre: { nome: contratada.razaoSocial, documento: rotuloDocContratada(contratada.cnpj), local: contratada.cidadeUf, site: 'myclinica.online' },
    })
  } catch (e) {
    console.error('[contratoClinica:pdf]', e instanceof Error ? e.message : e)
    return fail(500, 'Não foi possível gerar o PDF do contrato. Tente de novo.')
  }
  const pdfHash = createHash('sha256').update(pdf).digest('hex')
  const path = `${ctx.clinicId}/${id}-${pdfHash.slice(0, 12)}.pdf`

  const { error: upErr } = await db.storage.from(BUCKET).upload(path, Buffer.from(pdf), { contentType: 'application/pdf', upsert: false })
  if (upErr) {
    console.error('[contratoClinica:upload]', upErr.message)
    return fail(500, 'Não foi possível guardar o contrato assinado. Tente de novo.')
  }

  // UM UPDATE com toda a prova. Só vale se ainda está pendente e com o mesmo código (nenhum reenvio no meio).
  const { data: done, error: sigErr } = await db.from('clinic_agreements').update({
    status: 'signed',
    user_id: ctx.userId,
    signed_at: signedAt,
    signer_name: valid.signerName,
    signature_image: valid.drawing,
    ip_address: ip || null,
    user_agent: userAgent || null,
    signed_hash: sHash,
    pdf_path: path,
    pdf_hash: pdfHash,
    code_hash: null,
    code_expires_at: null,
  }).eq('id', id).eq('clinic_id', ctx.clinicId).eq('status', 'pending').eq('code_hash', row.code_hash as string).select(PUBLIC_COLS)
  if (sigErr || !done || done.length === 0) {
    const { error: rmErr } = await db.storage.from(BUCKET).remove([path])
    if (rmErr) console.error('[contratoClinica:orphan]', path, rmErr.message)
    if (sigErr) return dbFail(sigErr, 'sign-update')
    return fail(409, 'O contrato mudou durante a assinatura. Peça um novo código e tente de novo.')
  }
  const signedRow = (done as unknown as Row[])[0]

  const warnings: string[] = []
  const billing = await runBilling(ctx, signedRow, deps, warnings, true)
  return { ok: true, agreement: view({ ...signedRow, asaas_ref: billing.status === 'criada' ? billing.ref : signedRow.asaas_ref }), billing, warnings }
}

// ── Cobrança (Asaas) ────────────────────────────────────────────────────────

/** Repete a cobrança de um contrato já assinado que ficou sem cobrança no Asaas. */
export async function retryBilling(ctx: Ctx, id: string, deps: ContractDeps = defaultDeps()): Promise<{ ok: true; agreement: AgreementView; billing: BillingOutcome; warnings: string[] } | Falha> {
  const { data, error } = await deps.db.from('clinic_agreements').select(PUBLIC_COLS).eq('id', id).eq('clinic_id', ctx.clinicId).maybeSingle()
  if (error) return dbFail(error, 'bill-load')
  if (!data) return fail(404, 'Contrato não encontrado.')
  const row = data as unknown as Row
  if (row.status !== 'signed') return fail(409, 'A cobrança só é criada depois da assinatura.')
  const warnings: string[] = []
  const billing = await runBilling(ctx, row, deps, warnings, false)
  return { ok: true, agreement: view({ ...row, asaas_ref: billing.status === 'criada' ? billing.ref : row.asaas_ref }), billing, warnings }
}

async function runBilling(ctx: Ctx, agreement: Row, deps: ContractDeps, warnings: string[], applyClinic: boolean): Promise<BillingOutcome> {
  const db = deps.db
  const id = String(agreement.id)
  const now = deps.now()

  const { data: clinic, error: cErr } = await db.from('clinics')
    .select('name, email, phone, billing_phone, asaas_customer_real_id').eq('id', ctx.clinicId).maybeSingle()
  if (cErr || !clinic) {
    console.error('[contratoClinica:bill-clinic]', cErr?.code ?? '', cErr?.message ?? 'sem clínica')
    return { status: 'pendente', ref: null, kind: null, invoiceUrl: null, message: 'Não foi possível iniciar a cobrança agora.' }
  }

  if (applyClinic) {
    // Fatos do contrato na clínica (a coluna de plano segue o contratado).
    const { error } = await db.from('clinics').update({
      plan: agreement.plan,
      contract_months: agreement.months,
      contract_payment_mode: agreement.payment_mode,
      contract_start_date: hojeBrasil(now),
      first_due_date: agreement.first_due_date,
    }).eq('id', ctx.clinicId)
    if (error) { console.error('[contratoClinica:clinic-update]', error.code ?? '', error.message); warnings.push('clinic_update_falhou') }
  }

  // Reivindica a criação: sem isto, dois pedidos paralelos criariam duas assinaturas no Asaas.
  const existing = (agreement.asaas_ref as string | null) ?? null
  const claim = `creating:${now.toISOString()}`
  if (existing && !existing.startsWith('creating:')) {
    return { status: 'criada', ref: existing, kind: existing.startsWith('sub_') ? 'subscription' : 'payment', invoiceUrl: null, message: null }
  }
  if (existing) {
    const started = new Date(existing.slice('creating:'.length)).getTime()
    if (Number.isNaN(started) || now.getTime() - started < BILLING_CLAIM_STALE_MS) {
      return { status: 'em_andamento', ref: null, kind: null, invoiceUrl: null, message: 'A cobrança está sendo criada. Aguarde um instante.' }
    }
  }
  const claimQuery = db.from('clinic_agreements').update({ asaas_ref: claim }).eq('id', id).eq('clinic_id', ctx.clinicId)
  const { data: claimed, error: claimErr } = await (existing ? claimQuery.eq('asaas_ref', existing) : claimQuery.is('asaas_ref', null)).select('id')
  if (claimErr) {
    console.error('[contratoClinica:bill-claim]', claimErr.code ?? '', claimErr.message)
    return { status: 'pendente', ref: null, kind: null, invoiceUrl: null, message: 'Não foi possível iniciar a cobrança agora.' }
  }
  if (!claimed || claimed.length === 0) {
    return { status: 'em_andamento', ref: null, kind: null, invoiceUrl: null, message: 'A cobrança está sendo criada. Aguarde um instante.' }
  }

  const plan = String(agreement.plan)
  const label = (PLAN_CATALOG as Record<string, { label: string }>)[plan]?.label ?? plan
  const promoAplicada = agreement.payment_mode === 'monthly'
    && Math.round(Number(agreement.total_value) * 100) < Math.round(Number(agreement.monthly_value) * 100) * Number(agreement.months)
  const phone = normalizeBrPhone((clinic.billing_phone as string | null) ?? (clinic.phone as string | null))
  try {
    const out = await createContractBilling(deps.asaas, {
      existingCustomerId: (clinic.asaas_customer_real_id as string | null) ?? null,
      clinicId: ctx.clinicId,
      customerName: String(agreement.signer_name ?? clinic.name),
      customerCpf: String(agreement.signer_cpf ?? ''),
      customerEmail: (clinic.email as string | null) ?? null,
      customerPhone: phone || null,
      paymentMode: agreement.payment_mode as 'monthly' | 'upfront',
      months: Number(agreement.months) as 3 | 6 | 12,
      installments: Number(agreement.installments),
      monthlyValue: Number(agreement.monthly_value),
      // Promoção gravada no contrato: o total do mês a mês é menor que mensalidade x meses.
      firstValue: promoAplicada ? valorPrimeiraCobranca(Number(agreement.monthly_value), true) : null,
      totalValue: Number(agreement.total_value),
      firstDueDate: String(agreement.first_due_date),
      description: `MyClinica - Plano ${label} - contrato de ${agreement.months} meses (${shortHash(String(agreement.content_hash ?? ''))})`,
    })

    const { error: refErr } = await db.from('clinic_agreements').update({ asaas_ref: out.ref }).eq('id', id).eq('clinic_id', ctx.clinicId)
    if (refErr) {
      // O Asaas já criou: registra o ref no log para ninguém recriar à mão e para o suporte reconciliar.
      console.error('[contratoClinica:bill-ref] ATENCAO cobranca criada no Asaas e nao gravada', out.ref, refErr.code ?? '', refErr.message)
      warnings.push('ref_nao_gravado')
    }
    const clinicPatch: Record<string, unknown> = { asaas_customer_real_id: out.customerId }
    if (out.kind === 'subscription') clinicPatch.asaas_subscription_id = out.ref
    // O webhook restaura o valor cheio da assinatura quando a primeira cobrança (com desconto) for paga.
    if (out.kind === 'subscription' && promoAplicada) clinicPatch.billing_promo_full_value = Number(agreement.monthly_value)
    const { error: cuErr } = await db.from('clinics').update(clinicPatch).eq('id', ctx.clinicId)
    if (cuErr) { console.error('[contratoClinica:bill-clinic-ids]', cuErr.code ?? '', cuErr.message); warnings.push('ids_nao_gravados') }
    return { status: 'criada', ref: out.ref, kind: out.kind, invoiceUrl: out.invoiceUrl, message: null }
  } catch (e) {
    console.error('[contratoClinica:asaas]', e instanceof Error ? e.message : e)
    // Libera a reivindicação para a próxima tentativa.
    const { error: relErr } = await db.from('clinic_agreements').update({ asaas_ref: null }).eq('id', id).eq('clinic_id', ctx.clinicId).eq('asaas_ref', claim)
    if (relErr) console.error('[contratoClinica:bill-release]', relErr.code ?? '', relErr.message)
    return { status: 'pendente', ref: null, kind: null, invoiceUrl: null, message: 'O contrato foi assinado, mas a cobrança ainda não foi criada. Tente criar a cobrança de novo.' }
  }
}
