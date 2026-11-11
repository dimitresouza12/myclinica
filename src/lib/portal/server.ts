// Acesso ao banco do link mágico, da assinatura eletrônica e do QR verificador. SÓ NO SERVIDOR.
//
// Usa o cliente de serviço porque a página pública não tem sessão. Por isso TODA consulta aqui é escopada à
// clínica e ao paciente da linha do link (ou à clínica vinda do usuário logado, nas rotas da clínica): nunca
// atravessa clínicas e nunca confia em id vindo do corpo sem conferir a clínica. As tabelas têm RLS ligado
// (sem policy de escrita para o navegador): só este módulo grava.

import { getAdminClient } from '@/lib/supabaseAdmin'
import { motivoDoErro, type Indisponibilidade } from '@/lib/nutri/erros'
import { carregarTaco } from '@/lib/nutri/alimentos'
import { computeExpiry, linkState, MAX_DOCS_PER_LINK, MAX_MESSAGE_LENGTH, portalUrl } from './link'
import { generateToken, hashIp, hashToken, ipHashSecret, isWellFormedToken } from './token'
import { hasScope, type PortalScope } from './scopes'
import {
  shapeAppointments, shapePlan, shapeVaccines, shapeWeights,
  type PublicAppointment, type PublicPlan, type PublicVaccine, type PublicWeight,
} from './publicView'
import { validateDocDraft, type SignDocType } from '@/lib/assinatura/texto'
import { contentHash, HASH_RE, sha256Hex, signedHash } from '@/lib/assinatura/hash'
import { cleanUserAgent, SIGN_ACCEPT_TEXT, validateSignInput, type SignInput } from '@/lib/assinatura/validar'
import {
  buildVerificationView, generateVerificationCode, hashCode, isVerifiableDocType, normalizeCode,
  type VerificationView, type VerifiableDocType,
} from '@/lib/assinatura/verificacao'

export type Falha = { ok: false; motivo: Indisponibilidade | 'nao_encontrado' | 'invalido'; error?: string }

function falha(e: { code?: string; message?: string } | null | undefined, rota: string): Falha {
  const motivo = motivoDoErro(e)
  if (motivo !== 'sem_tabela') console.error(`[portal:${rota}]`, e?.code ?? '', e?.message ?? '')
  return { ok: false, motivo }
}

export const MENSAGEM_FALHA: Record<Indisponibilidade, string> = {
  sem_tabela: 'O link do paciente e a assinatura eletrônica ainda não estão ativos nesta conta.',
  sem_permissao: 'Sem permissão para concluir. Tente de novo.',
  erro: 'Não foi possível concluir agora. Tente de novo em instantes.',
}

// ── Rotas da clínica ────────────────────────────────────────────────────────

export interface CreateLinkArgs {
  clinicId: string
  userId: string
  patientId: string
  scopes: PortalScope[]
  ttlDays: number
  message: string | null
  docs: { docType: unknown; title: unknown; contentText: unknown }[]
  origin: string
  now?: Date
}

export type CreateLinkResult =
  | { ok: true; id: string; url: string; expiresAt: string; scopes: PortalScope[]; requestIds: string[] }
  | Falha

export async function createPortalLink(a: CreateLinkArgs): Promise<CreateLinkResult> {
  const db = getAdminClient()
  const now = a.now ?? new Date()

  if (a.scopes.length === 0) return { ok: false, motivo: 'invalido', error: 'Escolha ao menos o que o paciente poderá ver.' }
  const message = a.message?.trim() ? a.message.trim() : null
  if (message && message.length > MAX_MESSAGE_LENGTH) return { ok: false, motivo: 'invalido', error: `A mensagem passa de ${MAX_MESSAGE_LENGTH} caracteres.` }
  if (message && !hasScope(a.scopes, 'orientacoes')) return { ok: false, motivo: 'invalido', error: 'Mensagem sem o escopo Orientações.' }

  const wantsSign = hasScope(a.scopes, 'assinatura')
  if (!wantsSign && a.docs.length > 0) return { ok: false, motivo: 'invalido', error: 'Documentos sem o escopo de assinatura.' }
  if (wantsSign && (a.docs.length === 0 || a.docs.length > MAX_DOCS_PER_LINK)) {
    return { ok: false, motivo: 'invalido', error: `Inclua de 1 a ${MAX_DOCS_PER_LINK} documentos para assinar.` }
  }
  const drafts: { docType: SignDocType; title: string; contentText: string }[] = []
  for (const d of a.docs) {
    const v = validateDocDraft(d)
    if (!v.ok) return { ok: false, motivo: 'invalido', error: v.error }
    drafts.push(v)
  }

  // o paciente tem de ser desta clínica
  const { data: patient, error: pErr } = await db.from('patients').select('id').eq('id', a.patientId).eq('clinic_id', a.clinicId).maybeSingle()
  if (pErr) return falha(pErr, 'patient')
  if (!patient) return { ok: false, motivo: 'nao_encontrado', error: 'Paciente não encontrado.' }

  const token = generateToken()
  const expiresAt = computeExpiry(now, a.ttlDays).toISOString()
  const { data: link, error: lErr } = await db.from('patient_portal_links').insert({
    clinic_id: a.clinicId, patient_id: a.patientId, token_hash: hashToken(token), scopes: a.scopes,
    message, created_by: a.userId, expires_at: expiresAt,
  }).select('id').single()
  if (lErr || !link) return falha(lErr, 'link-insert')

  let requestIds: string[] = []
  if (drafts.length > 0) {
    const rows = await Promise.all(drafts.map(async d => ({
      clinic_id: a.clinicId, patient_id: a.patientId, link_id: link.id, doc_type: d.docType, title: d.title,
      content_text: d.contentText, content_hash: await contentHash(d.contentText), created_by: a.userId, expires_at: expiresAt,
    })))
    const { data: created, error: rErr } = await db.from('signature_requests').insert(rows).select('id')
    if (!rErr) requestIds = (created ?? []).map(r => r.id as string)
    if (rErr) {
      // sem os documentos o link não serve: desfaz para não deixar um link sem o que foi pedido
      const { error: undoErr } = await db.from('patient_portal_links').delete().eq('id', link.id).eq('clinic_id', a.clinicId)
      if (undoErr) console.error('[portal:link-undo]', undoErr.message)
      return falha(rErr, 'request-insert')
    }
  }
  return { ok: true, id: link.id as string, url: portalUrl(a.origin, token), expiresAt, scopes: a.scopes, requestIds }
}

export interface LinkListItem {
  id: string; scopes: PortalScope[]; createdAt: string; expiresAt: string; revokedAt: string | null
  lastAccessAt: string | null; accessCount: number; state: 'active' | 'expired' | 'revoked'
}
export interface SignatureListItem {
  id: string; linkId: string | null; docType: SignDocType; title: string; status: 'pendente' | 'assinado' | 'revogado'
  createdAt: string; signedAt: string | null; signerName: string | null
}

export async function listPatientPortal(clinicId: string, patientId: string, now = new Date()): Promise<{ ok: true; links: LinkListItem[]; signatures: SignatureListItem[] } | Falha> {
  const db = getAdminClient()
  const { data: links, error: lErr } = await db.from('patient_portal_links')
    .select('id, scopes, created_at, expires_at, revoked_at, last_access_at, access_count')
    .eq('clinic_id', clinicId).eq('patient_id', patientId).order('created_at', { ascending: false }).limit(20)
  if (lErr) return falha(lErr, 'list-links')
  const { data: reqs, error: rErr } = await db.from('signature_requests')
    .select('id, link_id, doc_type, title, status, created_at')
    .eq('clinic_id', clinicId).eq('patient_id', patientId).order('created_at', { ascending: false }).limit(40)
  if (rErr) return falha(rErr, 'list-requests')
  const ids = (reqs ?? []).map(r => r.id as string)
  const signed = new Map<string, { signed_at: string; signer_name: string }>()
  if (ids.length > 0) {
    const { data: sd, error: sErr } = await db.from('signed_documents').select('request_id, signed_at, signer_name').eq('clinic_id', clinicId).in('request_id', ids)
    if (sErr) return falha(sErr, 'list-signed')
    for (const s of sd ?? []) signed.set(s.request_id as string, { signed_at: s.signed_at as string, signer_name: s.signer_name as string })
  }
  return {
    ok: true,
    links: (links ?? []).map(l => ({
      id: l.id as string, scopes: l.scopes as PortalScope[], createdAt: l.created_at as string, expiresAt: l.expires_at as string,
      revokedAt: (l.revoked_at as string | null) ?? null, lastAccessAt: (l.last_access_at as string | null) ?? null,
      accessCount: (l.access_count as number) ?? 0, state: linkState({ expires_at: l.expires_at as string, revoked_at: (l.revoked_at as string | null) ?? null }, now),
    })),
    signatures: (reqs ?? []).map(r => {
      const s = signed.get(r.id as string)
      return {
        id: r.id as string, linkId: (r.link_id as string | null) ?? null, docType: r.doc_type as SignDocType, title: r.title as string,
        status: s ? 'assinado' as const : (r.status as 'pendente' | 'assinado' | 'revogado'),
        createdAt: r.created_at as string, signedAt: s?.signed_at ?? null, signerName: s?.signer_name ?? null,
      }
    }),
  }
}

export async function revokePortalLink(clinicId: string, linkId: string, now = new Date()): Promise<{ ok: true } | Falha> {
  const db = getAdminClient()
  const { data, error } = await db.from('patient_portal_links').update({ revoked_at: now.toISOString() })
    .eq('id', linkId).eq('clinic_id', clinicId).is('revoked_at', null).select('id')
  if (error) return falha(error, 'revoke')
  if (!data || data.length === 0) return { ok: false, motivo: 'nao_encontrado', error: 'Link não encontrado ou já revogado.' }
  // documentos ainda não assinados deste link deixam de poder ser assinados
  const { error: rErr } = await db.from('signature_requests').update({ status: 'revogado' })
    .eq('link_id', linkId).eq('clinic_id', clinicId).eq('status', 'pendente')
  if (rErr) return falha(rErr, 'revoke-requests')
  return { ok: true }
}

export interface SignedDocumentFull {
  clinic: { name: string; logo: string | null; address: string | null; phone: string | null }
  patientName: string; title: string; contentText: string; contentHash: string
  signerName: string; method: 'desenho' | 'digitado'; signatureImage: string | null
  signedAt: string; ipHash: string; userAgent: string; signedHash: string; acceptedText: string
}

export async function getSignedDocument(clinicId: string, requestId: string): Promise<{ ok: true; doc: SignedDocumentFull } | Falha> {
  const db = getAdminClient()
  const { data: s, error } = await db.from('signed_documents')
    .select('title, content_text, content_hash, signer_name, method, signature_image, signed_at, ip_hash, user_agent, signed_hash, accepted_text, patient_id')
    .eq('request_id', requestId).eq('clinic_id', clinicId).maybeSingle()
  if (error) return falha(error, 'get-signed')
  if (!s) return { ok: false, motivo: 'nao_encontrado', error: 'Documento assinado não encontrado.' }
  const [{ data: clinic }, { data: patient }] = await Promise.all([
    db.from('clinics').select('name, logo_url, address, phone').eq('id', clinicId).maybeSingle(),
    db.from('patients').select('name').eq('id', s.patient_id as string).eq('clinic_id', clinicId).maybeSingle(),
  ])
  return {
    ok: true,
    doc: {
      clinic: { name: (clinic?.name as string) ?? '', logo: (clinic?.logo_url as string | null) ?? null, address: (clinic?.address as string | null) ?? null, phone: (clinic?.phone as string | null) ?? null },
      patientName: (patient?.name as string) ?? '', title: s.title as string, contentText: s.content_text as string, contentHash: s.content_hash as string,
      signerName: s.signer_name as string, method: s.method as 'desenho' | 'digitado', signatureImage: (s.signature_image as string | null) ?? null,
      signedAt: s.signed_at as string, ipHash: s.ip_hash as string, userAgent: s.user_agent as string, signedHash: s.signed_hash as string, acceptedText: s.accepted_text as string,
    },
  }
}

// ── Documento emitido com QR verificador ────────────────────────────────────

export interface IssueArgs {
  clinicId: string; userId: string; patientId: string; docType: unknown; contentHash: unknown
  professionalId: string | null
}

export async function issueDocument(a: IssueArgs): Promise<{ ok: true; code: string; issuedAt: string } | Falha> {
  if (!isVerifiableDocType(a.docType)) return { ok: false, motivo: 'invalido', error: 'Este tipo de documento não recebe QR de verificação.' }
  if (typeof a.contentHash !== 'string' || !HASH_RE.test(a.contentHash)) return { ok: false, motivo: 'invalido', error: 'Hash do documento inválido.' }
  const db = getAdminClient()
  const { data: patient, error: pErr } = await db.from('patients').select('id').eq('id', a.patientId).eq('clinic_id', a.clinicId).maybeSingle()
  if (pErr) return falha(pErr, 'issue-patient')
  if (!patient) return { ok: false, motivo: 'nao_encontrado', error: 'Paciente não encontrado.' }

  // nome e registro do profissional são copiados agora (o cadastro pode mudar depois, o documento não)
  let professionalName: string | null = null
  let professionalRegistration: string | null = null
  if (a.professionalId) {
    const { data: pro } = await db.from('professionals').select('name, registration_number').eq('id', a.professionalId).eq('clinic_id', a.clinicId).maybeSingle()
    professionalName = (pro?.name as string | null) ?? null
    professionalRegistration = (pro?.registration_number as string | null) ?? null
  }
  const code = generateVerificationCode()
  const { data, error } = await db.from('issued_documents').insert({
    clinic_id: a.clinicId, patient_id: a.patientId, doc_type: a.docType as VerifiableDocType, code_hash: hashCode(code),
    content_hash: a.contentHash, professional_id: a.professionalId, professional_name: professionalName,
    professional_registration: professionalRegistration, issued_by: a.userId,
  }).select('issued_at').single()
  if (error || !data) return falha(error, 'issue-insert')
  return { ok: true, code, issuedAt: data.issued_at as string }
}

// ── Páginas públicas ────────────────────────────────────────────────────────

export interface PortalLinkRow {
  id: string; clinic_id: string; patient_id: string; scopes: PortalScope[]; message: string | null
  expires_at: string; revoked_at: string | null; access_count: number
}

/** Link ativo pelo token, ou null. Token malformado, desconhecido, expirado ou revogado: a mesma resposta (null). */
export async function resolveLink(token: unknown, now = new Date()): Promise<PortalLinkRow | null> {
  if (!isWellFormedToken(token)) return null
  const { data, error } = await getAdminClient().from('patient_portal_links')
    .select('id, clinic_id, patient_id, scopes, message, expires_at, revoked_at, access_count')
    .eq('token_hash', hashToken(token)).maybeSingle()
  if (error) { falha(error, 'resolve'); return null }
  if (!data) return null
  const row = data as PortalLinkRow
  return linkState(row, now) === 'active' ? row : null
}

export interface PortalDoc { id: string; title: string; docType: SignDocType; contentText: string; signedAt: string | null }
export interface PortalPageData {
  clinicName: string; firstName: string; petName: string | null; scopes: PortalScope[]; expiresAt: string
  message: string | null
  appointments: PublicAppointment[] | null
  vaccines: PublicVaccine[] | null
  weights: PublicWeight[] | null
  plan: PublicPlan | null
  documents: PortalDoc[] | null
}

export async function loadPortalPage(link: PortalLinkRow, now = new Date()): Promise<PortalPageData | null> {
  const db = getAdminClient()
  const { clinic_id: clinicId, patient_id: patientId } = link
  const [{ data: clinic }, { data: patient }] = await Promise.all([
    db.from('clinics').select('name').eq('id', clinicId).maybeSingle(),
    db.from('patients').select('name, pet_name').eq('id', patientId).eq('clinic_id', clinicId).maybeSingle(),
  ])
  if (!clinic || !patient) return null

  const out: PortalPageData = {
    clinicName: clinic.name as string,
    firstName: ((patient.name as string) ?? '').trim().split(/\s+/)[0] ?? '',
    petName: hasScope(link.scopes, 'vacinas_peso') ? ((patient.pet_name as string | null)?.trim() || null) : null,
    scopes: link.scopes, expiresAt: link.expires_at,
    message: hasScope(link.scopes, 'orientacoes') ? link.message : null,
    appointments: null, vaccines: null, weights: null, plan: null, documents: null,
  }

  if (hasScope(link.scopes, 'proximas_consultas')) {
    const { data, error } = await db.from('appointments').select('scheduled_at, status, procedure_name, professionals(name)')
      .eq('clinic_id', clinicId).eq('patient_id', patientId).in('status', ['agendado', 'confirmado'])
      .gte('scheduled_at', now.toISOString()).order('scheduled_at', { ascending: true }).limit(10)
    if (error) falha(error, 'page-appointments')
    type Row = { scheduled_at: string; status: string; procedure_name: string | null; professionals: { name: string } | { name: string }[] | null }
    out.appointments = shapeAppointments(((data ?? []) as unknown as Row[]).map(r => ({
      scheduled_at: r.scheduled_at, status: r.status, procedure_name: r.procedure_name,
      professional_name: (Array.isArray(r.professionals) ? r.professionals[0]?.name : r.professionals?.name) ?? null,
    })), now)
  }

  if (hasScope(link.scopes, 'vacinas_peso')) {
    const [v, w] = await Promise.all([
      db.from('pet_vaccinations').select('kind, name, batch, manufacturer, applied_on, next_due_on')
        .eq('clinic_id', clinicId).eq('patient_id', patientId).order('applied_on', { ascending: false }).limit(60),
      db.from('pet_weights').select('weighed_on, weight_kg')
        .eq('clinic_id', clinicId).eq('patient_id', patientId).order('weighed_on', { ascending: false }).limit(24),
    ])
    if (v.error) falha(v.error, 'page-vaccines')
    if (w.error) falha(w.error, 'page-weights')
    out.vaccines = shapeVaccines((v.data ?? []) as never, now)
    out.weights = shapeWeights((w.data ?? []) as never)
  }

  if (hasScope(link.scopes, 'plano_alimentar')) {
    const { data, error } = await db.from('nutri_avaliacoes').select('dados')
      .eq('clinic_id', clinicId).eq('patient_id', patientId).eq('tipo', 'plano')
      .order('data', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) falha(error, 'page-plan')
    out.plan = data ? shapePlan(data.dados, await carregarTaco()) : null
  }

  if (hasScope(link.scopes, 'assinatura')) {
    const { data, error } = await db.from('signature_requests').select('id, doc_type, title, content_text, status, expires_at')
      .eq('link_id', link.id).eq('clinic_id', clinicId).eq('patient_id', patientId).in('status', ['pendente', 'assinado']).order('created_at', { ascending: true })
    if (error) falha(error, 'page-requests')
    const reqs = data ?? []
    const signed = new Map<string, string>()
    if (reqs.length > 0) {
      const { data: sd } = await db.from('signed_documents').select('request_id, signed_at').eq('clinic_id', clinicId).in('request_id', reqs.map(r => r.id as string))
      for (const s of sd ?? []) signed.set(s.request_id as string, s.signed_at as string)
    }
    out.documents = reqs.map(r => ({
      id: r.id as string, title: r.title as string, docType: r.doc_type as SignDocType,
      contentText: signed.has(r.id as string) ? '' : (r.content_text as string), signedAt: signed.get(r.id as string) ?? null,
    }))
  }
  return out
}

/** Registro de acesso do link; falha aqui não derruba a página, mas aparece no log.
 *  access_count é leitura+escrita (o PostgREST não aceita expressão `col + 1` no update e RPC fica fora de escopo):
 *  acessos simultâneos podem subcontar. É só informativo para a clínica; descartado de propósito. */
export async function touchLink(link: PortalLinkRow, now = new Date()): Promise<void> {
  const { error } = await getAdminClient().from('patient_portal_links')
    .update({ last_access_at: now.toISOString(), access_count: (link.access_count ?? 0) + 1 }).eq('id', link.id).eq('clinic_id', link.clinic_id)
  if (error) console.error('[portal:touch]', error.message)
}

export type SignResult =
  | { ok: true; signedAt: string; hashShort: string }
  | { ok: false; status: 400 | 404 | 409 | 500; error: string }

export async function signRequest(link: PortalLinkRow, input: SignInput, meta: { ip: string; userAgent: string | null }, now = new Date()): Promise<SignResult> {
  if (!hasScope(link.scopes, 'assinatura')) return { ok: false, status: 404, error: 'Documento não disponível.' }
  const v = validateSignInput(input)
  if (!v.ok) return { ok: false, status: 400, error: v.error }

  const db = getAdminClient()
  const { data: req, error } = await db.from('signature_requests')
    .select('id, doc_type, title, content_text, content_hash, status, expires_at')
    .eq('id', v.requestId).eq('link_id', link.id).eq('clinic_id', link.clinic_id).eq('patient_id', link.patient_id).maybeSingle()
  if (error) { falha(error, 'sign-load'); return { ok: false, status: 500, error: 'Não foi possível assinar agora. Tente de novo.' } }
  if (!req || req.status === 'revogado' || new Date(req.expires_at as string).getTime() <= now.getTime()) {
    return { ok: false, status: 404, error: 'Documento não disponível.' }
  }
  if (req.status === 'assinado') return { ok: false, status: 409, error: 'Este documento já foi assinado.' }

  // o hash guardado na criação tem de bater com o texto: detecta adulteração da linha antes de assinar
  const currentHash = await contentHash(req.content_text as string)
  if (currentHash !== req.content_hash) {
    console.error('[portal:sign] hash do conteúdo não confere', req.id)
    return { ok: false, status: 500, error: 'Não foi possível assinar este documento. Avise a clínica.' }
  }

  const signedAt = now.toISOString()
  const imageHash = v.drawing ? await sha256Hex(v.drawing) : ''
  const sealed = await signedHash({
    requestId: req.id as string, clinicId: link.clinic_id, patientId: link.patient_id, contentHash: currentHash,
    signerName: v.signerName, method: v.method, signatureImageHash: imageHash, signedAt,
  })
  const { error: insErr } = await db.from('signed_documents').insert({
    request_id: req.id, clinic_id: link.clinic_id, patient_id: link.patient_id, doc_type: req.doc_type, title: req.title,
    content_text: req.content_text, content_hash: currentHash, signer_name: v.signerName, method: v.method,
    signature_image: v.drawing, accepted_text: SIGN_ACCEPT_TEXT, signed_at: signedAt,
    ip_hash: hashIp(meta.ip, ipHashSecret()), user_agent: cleanUserAgent(meta.userAgent), signed_hash: sealed,
  })
  if (insErr) {
    if (insErr.code === '23505') return { ok: false, status: 409, error: 'Este documento já foi assinado.' }
    falha(insErr, 'sign-insert')
    return { ok: false, status: 500, error: 'Não foi possível assinar agora. Tente de novo.' }
  }
  const { error: updErr } = await db.from('signature_requests').update({ status: 'assinado' }).eq('id', req.id).eq('clinic_id', link.clinic_id)
  if (updErr) console.error('[portal:sign-status]', updErr.message) // a assinatura já está gravada e é imutável
  // contrato de paciente ligado a este pedido passa a "assinado" (o estado também é derivado na leitura, então falha aqui não perde nada;
  // sem a tabela `contracts` ainda: silêncio, é o caso normal antes da migration)
  const { error: ctrErr } = await db.from('contracts').update({ status: 'assinado', signed_at: signedAt })
    .eq('signature_request_id', req.id).eq('clinic_id', link.clinic_id).eq('status', 'enviado')
  if (ctrErr && motivoDoErro(ctrErr) !== 'sem_tabela') console.error('[portal:sign-contract]', ctrErr.message)
  return { ok: true, signedAt, hashShort: sealed.slice(0, 12).toUpperCase() }
}

export async function lookupVerification(rawCode: unknown): Promise<VerificationView | null> {
  const code = normalizeCode(rawCode)
  if (!code) return null
  const db = getAdminClient()
  const { data, error } = await db.from('issued_documents')
    .select('doc_type, issued_at, revoked_at, content_hash, professional_name, professional_registration, clinic_id')
    .eq('code_hash', hashCode(code)).maybeSingle()
  if (error) { falha(error, 'verify'); return null }
  if (!data) return null
  const { data: clinic } = await db.from('clinics').select('name').eq('id', data.clinic_id as string).maybeSingle()
  if (!clinic) return null
  return buildVerificationView({
    doc_type: data.doc_type as string, issued_at: data.issued_at as string, revoked_at: (data.revoked_at as string | null) ?? null,
    content_hash: data.content_hash as string, professional_name: (data.professional_name as string | null) ?? null,
    professional_registration: (data.professional_registration as string | null) ?? null, clinic_name: clinic.name as string,
  })
}
