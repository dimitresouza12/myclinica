// Acesso ao banco dos contratos de paciente e dos modelos de contrato. SÓ NO SERVIDOR.
//
// Usa o cliente de serviço (as tabelas têm RLS ligado e nenhuma policy de escrita para o navegador). Por isso TODA
// consulta aqui é escopada à clínica vinda do usuário logado (nunca do corpo da requisição) e confere que paciente,
// modelo, profissional e pedido de assinatura pertencem a essa clínica. O envio reaproveita o link do paciente e a
// assinatura eletrônica já existentes (lib/portal/server.ts): não há outro mecanismo de assinatura.

import { getAdminClient } from '@/lib/supabaseAdmin'
import { motivoDoErro, type Indisponibilidade } from '@/lib/nutri/erros'
import { hojeBrasil } from '@/lib/brasilDate'
import { contentHash } from '@/lib/assinatura/hash'
import { validateDocDraft } from '@/lib/assinatura/texto'
import { createPortalLink, revokePortalLink } from '@/lib/portal/server'
import { clampTtlDays } from '@/lib/portal/link'
import { daysUntil, effectiveStatus, isExpiringSoon, isStoredStatus, type ContractStatus, type StoredStatus } from './status'
import { MAX_TEMPLATES_PER_CLINIC, validateContractDraft, validateTemplateInput, type ContractDraftInput, type TemplateInput } from './modelo'

export type ContratoFalha = { ok: false; motivo: Indisponibilidade | 'nao_encontrado' | 'invalido' | 'conflito'; error?: string }

export const MENSAGEM_CONTRATO_FALHA: Record<Indisponibilidade, string> = {
  sem_tabela: 'Os contratos ainda não estão ativos nesta conta.',
  sem_permissao: 'Sem permissão para concluir. Tente de novo.',
  erro: 'Não foi possível concluir agora. Tente de novo em instantes.',
}

function falha(e: { code?: string; message?: string } | null | undefined, rota: string): ContratoFalha {
  const motivo = motivoDoErro(e)
  if (motivo !== 'sem_tabela') console.error(`[contratos:${rota}]`, e?.code ?? '', e?.message ?? '')
  return { ok: false, motivo }
}

// ── Modelos ─────────────────────────────────────────────────────────────────

export interface TemplateItem { id: string; name: string; body: string; updatedAt: string }

export async function listTemplates(clinicId: string): Promise<{ ok: true; templates: TemplateItem[] } | ContratoFalha> {
  const { data, error } = await getAdminClient().from('contract_templates').select('id, name, body, updated_at')
    .eq('clinic_id', clinicId).order('name', { ascending: true }).limit(MAX_TEMPLATES_PER_CLINIC)
  if (error) return falha(error, 'tpl-list')
  return { ok: true, templates: (data ?? []).map(t => ({ id: t.id as string, name: t.name as string, body: t.body as string, updatedAt: t.updated_at as string })) }
}

export async function createTemplate(clinicId: string, userId: string, input: TemplateInput): Promise<{ ok: true; template: TemplateItem } | ContratoFalha> {
  const v = validateTemplateInput(input)
  if (!v.ok) return { ok: false, motivo: 'invalido', error: v.error }
  const db = getAdminClient()
  const { count, error: cErr } = await db.from('contract_templates').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId)
  if (cErr) return falha(cErr, 'tpl-count')
  if ((count ?? 0) >= MAX_TEMPLATES_PER_CLINIC) return { ok: false, motivo: 'invalido', error: `Limite de ${MAX_TEMPLATES_PER_CLINIC} modelos. Apague algum para criar outro.` }
  const { data, error } = await db.from('contract_templates').insert({ clinic_id: clinicId, name: v.value.name, body: v.value.body, created_by: userId })
    .select('id, name, body, updated_at').single()
  if (error || !data) return falha(error, 'tpl-insert')
  return { ok: true, template: { id: data.id as string, name: data.name as string, body: data.body as string, updatedAt: data.updated_at as string } }
}

export async function updateTemplate(clinicId: string, id: string, input: TemplateInput): Promise<{ ok: true; template: TemplateItem } | ContratoFalha> {
  const v = validateTemplateInput(input)
  if (!v.ok) return { ok: false, motivo: 'invalido', error: v.error }
  const { data, error } = await getAdminClient().from('contract_templates')
    .update({ name: v.value.name, body: v.value.body, updated_at: new Date().toISOString() })
    .eq('id', id).eq('clinic_id', clinicId).select('id, name, body, updated_at')
  if (error) return falha(error, 'tpl-update')
  const row = data?.[0]
  if (!row) return { ok: false, motivo: 'nao_encontrado', error: 'Modelo não encontrado.' }
  return { ok: true, template: { id: row.id as string, name: row.name as string, body: row.body as string, updatedAt: row.updated_at as string } }
}

export async function deleteTemplate(clinicId: string, id: string): Promise<{ ok: true } | ContratoFalha> {
  const { data, error } = await getAdminClient().from('contract_templates').delete().eq('id', id).eq('clinic_id', clinicId).select('id')
  if (error) return falha(error, 'tpl-delete')
  if (!data || data.length === 0) return { ok: false, motivo: 'nao_encontrado', error: 'Modelo não encontrado.' }
  return { ok: true }
}

// ── Contratos ───────────────────────────────────────────────────────────────

export type LinkSituacao = 'ativo' | 'expirado' | 'revogado'

export interface ContractItem {
  id: string
  patientId: string
  patientName: string
  title: string
  /** Estado exibido (já com "vencido" e com o "assinado" vindo do paciente). */
  status: ContractStatus
  storedStatus: StoredStatus
  validFrom: string | null
  validUntil: string | null
  amount: number | null
  paymentMethod: string | null
  professionalId: string | null
  packageId: string | null
  signatureRequestId: string | null
  /** Só para "enviado": o link do paciente ainda vale, expirou ou foi revogado (pede reenvio). */
  linkSituacao: LinkSituacao | null
  sentAt: string | null
  signedAt: string | null
  signerName: string | null
  createdAt: string
  /** Dias até o término da vigência (negativo = venceu); null sem término. */
  daysToExpire: number | null
  expiringSoon: boolean
}

export interface ContractDetail extends ContractItem { contentText: string; templateId: string | null }

interface Row {
  id: string; patient_id: string; title: string; status: string; valid_from: string | null; valid_until: string | null
  amount: number | string | null; payment_method: string | null; professional_id: string | null; package_id: string | null
  signature_request_id: string | null; sent_at: string | null; signed_at: string | null; created_at: string
  content_text?: string; template_id?: string | null
}

const LIST_COLUMNS = 'id, patient_id, title, status, valid_from, valid_until, amount, payment_method, professional_id, package_id, signature_request_id, sent_at, signed_at, created_at'

async function enrich(clinicId: string, rows: Row[], now: Date): Promise<{ ok: true; items: (ContractItem & { contentText?: string; templateId?: string | null })[] } | ContratoFalha> {
  const db = getAdminClient()
  const today = hojeBrasil(now)
  const patientIds = Array.from(new Set(rows.map(r => r.patient_id)))
  const reqIds = rows.map(r => r.signature_request_id).filter((x): x is string => !!x)

  const names = new Map<string, string>()
  if (patientIds.length > 0) {
    const { data, error } = await db.from('patients').select('id, name').eq('clinic_id', clinicId).in('id', patientIds)
    if (error) return falha(error, 'enrich-patients')
    for (const p of data ?? []) names.set(p.id as string, p.name as string)
  }
  const requests = new Map<string, { status: string; expires_at: string }>()
  const signed = new Map<string, { signed_at: string; signer_name: string }>()
  if (reqIds.length > 0) {
    const [rq, sd] = await Promise.all([
      db.from('signature_requests').select('id, status, expires_at').eq('clinic_id', clinicId).in('id', reqIds),
      db.from('signed_documents').select('request_id, signed_at, signer_name').eq('clinic_id', clinicId).in('request_id', reqIds),
    ])
    if (rq.error) return falha(rq.error, 'enrich-requests')
    if (sd.error) return falha(sd.error, 'enrich-signed')
    for (const r of rq.data ?? []) requests.set(r.id as string, { status: r.status as string, expires_at: r.expires_at as string })
    for (const s of sd.data ?? []) signed.set(s.request_id as string, { signed_at: s.signed_at as string, signer_name: s.signer_name as string })
  }

  const items = rows.map(r => {
    const stored: StoredStatus = isStoredStatus(r.status) ? r.status : 'rascunho'
    const sig = r.signature_request_id ? signed.get(r.signature_request_id) : undefined
    const req = r.signature_request_id ? requests.get(r.signature_request_id) : undefined
    const status = effectiveStatus({ status: stored, validUntil: r.valid_until, signed: !!sig }, today)
    let linkSituacao: LinkSituacao | null = null
    if (status === 'enviado') {
      linkSituacao = !req || req.status === 'revogado' ? 'revogado' : new Date(req.expires_at).getTime() <= now.getTime() ? 'expirado' : 'ativo'
    }
    const item: ContractItem & { contentText?: string; templateId?: string | null } = {
      id: r.id, patientId: r.patient_id, patientName: names.get(r.patient_id) ?? '', title: r.title, status, storedStatus: stored,
      validFrom: r.valid_from, validUntil: r.valid_until, amount: r.amount === null ? null : Number(r.amount), paymentMethod: r.payment_method,
      professionalId: r.professional_id, packageId: r.package_id, signatureRequestId: r.signature_request_id, linkSituacao,
      sentAt: r.sent_at, signedAt: sig?.signed_at ?? r.signed_at, signerName: sig?.signer_name ?? null, createdAt: r.created_at,
      daysToExpire: daysUntil(r.valid_until, today), expiringSoon: isExpiringSoon({ status, validUntil: r.valid_until }, today),
    }
    if (r.content_text !== undefined) { item.contentText = r.content_text; item.templateId = r.template_id ?? null }
    return item
  })
  return { ok: true, items }
}

export const MAX_LIST = 1000

/** Contratos da clínica (ou de um paciente), do mais novo ao mais antigo. Nunca traz o texto: ele só vem no detalhe. */
export async function listContracts(clinicId: string, opts: { patientId?: string; now?: Date } = {}): Promise<{ ok: true; contracts: ContractItem[] } | ContratoFalha> {
  let q = getAdminClient().from('contracts').select(LIST_COLUMNS).eq('clinic_id', clinicId)
  if (opts.patientId) q = q.eq('patient_id', opts.patientId)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(MAX_LIST)
  if (error) return falha(error, 'list')
  const r = await enrich(clinicId, (data ?? []) as Row[], opts.now ?? new Date())
  return r.ok ? { ok: true, contracts: r.items } : r
}

export async function getContract(clinicId: string, id: string, now = new Date()): Promise<{ ok: true; contract: ContractDetail } | ContratoFalha> {
  const { data, error } = await getAdminClient().from('contracts').select(`${LIST_COLUMNS}, content_text, template_id`)
    .eq('id', id).eq('clinic_id', clinicId).maybeSingle()
  if (error) return falha(error, 'get')
  if (!data) return { ok: false, motivo: 'nao_encontrado', error: 'Contrato não encontrado.' }
  const r = await enrich(clinicId, [data as unknown as Row], now)
  if (!r.ok) return r
  return { ok: true, contract: r.items[0] as ContractDetail }
}

export interface CreateContractArgs extends ContractDraftInput {
  clinicId: string
  userId: string
  patientId: string
  templateId?: string | null
  professionalId?: string | null
  packageId?: string | null
}

/** Confere que o id (quando informado) existe NESTA clínica na tabela. Devolve null se estiver ok. */
async function mustBelong(table: 'contract_templates' | 'professionals', clinicId: string, id: string | null | undefined, label: string): Promise<ContratoFalha | null> {
  if (!id) return null
  const { data, error } = await getAdminClient().from(table).select('id').eq('id', id).eq('clinic_id', clinicId).maybeSingle()
  if (error) return falha(error, `belong-${table}`)
  return data ? null : { ok: false, motivo: 'invalido', error: `${label} não encontrado.` }
}

export async function createContract(a: CreateContractArgs): Promise<{ ok: true; id: string } | ContratoFalha> {
  const v = validateContractDraft(a)
  if (!v.ok) return { ok: false, motivo: 'invalido', error: v.error }
  const db = getAdminClient()

  const { data: patient, error: pErr } = await db.from('patients').select('id').eq('id', a.patientId).eq('clinic_id', a.clinicId).maybeSingle()
  if (pErr) return falha(pErr, 'create-patient')
  if (!patient) return { ok: false, motivo: 'nao_encontrado', error: 'Paciente não encontrado.' }
  const badTpl = await mustBelong('contract_templates', a.clinicId, a.templateId, 'Modelo')
  if (badTpl) return badTpl
  const badPro = await mustBelong('professionals', a.clinicId, a.professionalId, 'Profissional')
  if (badPro) return badPro
  if (a.packageId) {
    const { data: pkg, error: kErr } = await db.from('patient_packages').select('id').eq('id', a.packageId).eq('clinic_id', a.clinicId).eq('patient_id', a.patientId).maybeSingle()
    if (kErr) return falha(kErr, 'create-package')
    if (!pkg) return { ok: false, motivo: 'invalido', error: 'Pacote não encontrado para este paciente.' }
  }

  const { data, error } = await db.from('contracts').insert({
    clinic_id: a.clinicId, patient_id: a.patientId, template_id: a.templateId ?? null, title: v.value.title, content_text: v.value.contentText,
    status: 'rascunho', valid_from: v.value.validFrom, valid_until: v.value.validUntil, amount: v.value.amount, payment_method: v.value.paymentMethod,
    professional_id: a.professionalId ?? null, package_id: a.packageId ?? null, created_by: a.userId,
  }).select('id').single()
  if (error || !data) return falha(error, 'create-insert')
  return { ok: true, id: data.id as string }
}

/** Edita um rascunho. Contrato já enviado tem o texto congelado (o hash assinado tem de bater com o que o paciente leu). */
export async function updateContract(clinicId: string, id: string, input: ContractDraftInput & { professionalId?: string | null }): Promise<{ ok: true } | ContratoFalha> {
  const v = validateContractDraft(input)
  if (!v.ok) return { ok: false, motivo: 'invalido', error: v.error }
  const badPro = await mustBelong('professionals', clinicId, input.professionalId, 'Profissional')
  if (badPro) return badPro
  const patch: Record<string, unknown> = {
    title: v.value.title, content_text: v.value.contentText, valid_from: v.value.validFrom, valid_until: v.value.validUntil,
    amount: v.value.amount, payment_method: v.value.paymentMethod, updated_at: new Date().toISOString(),
  }
  if (input.professionalId !== undefined) patch.professional_id = input.professionalId
  const { data, error } = await getAdminClient().from('contracts').update(patch)
    .eq('id', id).eq('clinic_id', clinicId).eq('status', 'rascunho').select('id')
  if (error) return falha(error, 'update')
  if (!data || data.length === 0) {
    const cur = await getContract(clinicId, id)
    if (!cur.ok) return cur
    return { ok: false, motivo: 'conflito', error: 'Só o rascunho pode ser editado. Cancele este contrato e crie outro.' }
  }
  return { ok: true }
}

async function linkIdOf(clinicId: string, requestId: string | null): Promise<string | null> {
  if (!requestId) return null
  const { data } = await getAdminClient().from('signature_requests').select('link_id').eq('id', requestId).eq('clinic_id', clinicId).maybeSingle()
  return (data?.link_id as string | null) ?? null
}

/** Rascunho é apagado; os demais estados viram "cancelado" (o documento assinado continua guardado, imutável). */
export async function removeContract(clinicId: string, id: string, now = new Date()): Promise<{ ok: true; mode: 'apagado' | 'cancelado' } | ContratoFalha> {
  const db = getAdminClient()
  const cur = await getContract(clinicId, id, now)
  if (!cur.ok) return cur
  if (cur.contract.storedStatus === 'cancelado') return { ok: false, motivo: 'conflito', error: 'Contrato já cancelado.' }
  if (cur.contract.storedStatus === 'rascunho') {
    const { error } = await db.from('contracts').delete().eq('id', id).eq('clinic_id', clinicId).eq('status', 'rascunho')
    if (error) return falha(error, 'delete')
    return { ok: true, mode: 'apagado' }
  }
  // link ainda aberto deixa de valer: o paciente não assina um contrato cancelado
  const linkId = await linkIdOf(clinicId, cur.contract.signatureRequestId)
  if (linkId && cur.contract.status === 'enviado') {
    const r = await revokePortalLink(clinicId, linkId, now)
    if (!r.ok && r.motivo !== 'nao_encontrado') return { ok: false, motivo: r.motivo }
  }
  const { error } = await db.from('contracts').update({ status: 'cancelado', cancelled_at: now.toISOString(), updated_at: now.toISOString() })
    .eq('id', id).eq('clinic_id', clinicId).neq('status', 'cancelado')
  if (error) return falha(error, 'cancel')
  return { ok: true, mode: 'cancelado' }
}

export interface SendResult { ok: true; url: string; expiresAt: string }

/**
 * Envia (ou reenvia) o contrato para assinatura pelo link do paciente: cria o link com UM documento "contrato"
 * (texto congelado, hash gravado) e liga o pedido ao contrato. No reenvio, o link anterior é revogado antes.
 * Texto com [pendências] não sai: validateDocDraft recusa e a mensagem diz quais campos faltam.
 */
export async function sendContract(a: { clinicId: string; userId: string; id: string; origin: string; ttlDays: unknown; now?: Date }): Promise<SendResult | ContratoFalha> {
  const now = a.now ?? new Date()
  const cur = await getContract(a.clinicId, a.id, now)
  if (!cur.ok) return cur
  const c = cur.contract
  if (c.status === 'cancelado') return { ok: false, motivo: 'conflito', error: 'Contrato cancelado não pode ser enviado.' }
  if (c.status === 'assinado' || c.status === 'vencido') return { ok: false, motivo: 'conflito', error: 'Este contrato já foi assinado.' }

  const draft = validateDocDraft({ docType: 'contrato', title: c.title, contentText: c.contentText })
  if (!draft.ok) return { ok: false, motivo: 'invalido', error: draft.error }

  const db = getAdminClient()
  if (c.storedStatus === 'enviado') {
    const oldLink = await linkIdOf(a.clinicId, c.signatureRequestId)
    if (oldLink) {
      const r = await revokePortalLink(a.clinicId, oldLink, now)
      if (!r.ok && r.motivo !== 'nao_encontrado') return { ok: false, motivo: r.motivo }
    }
  }

  const link = await createPortalLink({
    clinicId: a.clinicId, userId: a.userId, patientId: c.patientId, scopes: ['assinatura'], ttlDays: clampTtlDays(a.ttlDays),
    message: null, docs: [{ docType: draft.docType, title: draft.title, contentText: draft.contentText }], origin: a.origin, now,
  })
  if (!link.ok) return { ok: false, motivo: link.motivo, error: link.error }
  const requestId = link.requestIds[0]
  if (!requestId) {
    await revokePortalLink(a.clinicId, link.id, now)
    return { ok: false, motivo: 'erro' }
  }

  const { data, error } = await db.from('contracts').update({
    status: 'enviado', signature_request_id: requestId, content_hash: await contentHash(draft.contentText), sent_at: now.toISOString(), updated_at: now.toISOString(),
  }).eq('id', a.id).eq('clinic_id', a.clinicId).in('status', ['rascunho', 'enviado']).select('id')
  if (error || !data || data.length === 0) {
    // não deixa um link vivo apontando para um contrato que não ficou como enviado
    const undo = await revokePortalLink(a.clinicId, link.id, now)
    if (!undo.ok) console.error('[contratos:send-undo]', undo.motivo)
    return error ? falha(error, 'send-update') : { ok: false, motivo: 'conflito', error: 'O contrato mudou durante o envio. Abra de novo e tente outra vez.' }
  }
  return { ok: true, url: link.url, expiresAt: link.expiresAt }
}
