// Modelos de contrato (campos {{...}} preenchidos do cadastro), valor sugerido e validação do rascunho.
// Lógica pura, testada em contratos.test.ts. O contrato assinado é TEXTO PURO (mesma regra da assinatura eletrônica).

import { formatBrl, formatCpf, formatDateBr, formatDateExtenso, parseIsoDay } from '@/lib/documentos/campos'
import { fillTemplate, unknownTokens } from '@/lib/documentos/modelo'
import { guardianIdent } from '@/lib/pacientes/responsavel'
import { MAX_DOC_TEXT, MAX_DOC_TITLE, normalizeDocText } from '@/lib/assinatura/texto'

/** Campos {{...}} que o modelo de contrato aceita, com o rótulo mostrado na edição do modelo e na pendência. */
export const CONTRACT_TOKENS: { key: string; label: string }[] = [
  { key: 'paciente', label: 'Nome do paciente' },
  { key: 'paciente_ident', label: 'Paciente com CPF' },
  { key: 'cpf', label: 'CPF do paciente' },
  { key: 'responsavel', label: 'Responsável legal do paciente' },
  { key: 'responsavel_ident', label: 'Responsável legal com CPF' },
  { key: 'endereco', label: 'Endereço do paciente' },
  { key: 'clinica', label: 'Nome da clínica' },
  { key: 'clinica_endereco', label: 'Endereço da clínica' },
  { key: 'profissional', label: 'Profissional responsável' },
  { key: 'registro', label: 'Registro no conselho' },
  { key: 'profissional_ident', label: 'Profissional com registro' },
  { key: 'objeto', label: 'Serviço (pacote ou orçamento)' },
  { key: 'valor', label: 'Valor' },
  { key: 'forma_pagamento', label: 'Forma de pagamento' },
  { key: 'vigencia_inicio', label: 'Início da vigência' },
  { key: 'vigencia_fim', label: 'Término da vigência' },
  { key: 'data', label: 'Data de hoje' },
]

export const CONTRACT_TOKEN_KEYS = CONTRACT_TOKENS.map(t => t.key)
const LABELS: Record<string, string> = Object.fromEntries(CONTRACT_TOKENS.map(t => [t.key, t.label.toLowerCase()]))

export const PAYMENT_METHODS = ['Pix', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro', 'Boleto', 'Transferência', 'Convênio'] as const

export const DEFAULT_TEMPLATE_NAME = 'Contrato de prestação de serviços (padrão)'

/** O texto padrão antigo (CONTRATADA / CONTRATANTE) como modelo inicial, agora com os campos preenchidos sozinhos. */
export const DEFAULT_TEMPLATE_BODY = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS

CONTRATADA: {{clinica}}
CONTRATANTE: {{paciente_ident}}

CLÁUSULA 1ª: O presente contrato tem por objeto a prestação dos seguintes serviços: {{objeto}}.
CLÁUSULA 2ª: O CONTRATANTE compromete-se a comparecer nas datas e horários agendados e a seguir as orientações do profissional responsável, {{profissional_ident}}.
CLÁUSULA 3ª: Pelos serviços, o CONTRATANTE pagará o valor de R$ {{valor}}, por {{forma_pagamento}}.
CLÁUSULA 4ª: Este contrato vigora de {{vigencia_inicio}} até {{vigencia_fim}}.
CLÁUSULA 5ª: Qualquer das partes pode rescindir o contrato mediante aviso prévio por escrito, sendo devidos os serviços já prestados até a data da rescisão.

{{data}}`

export interface PlanItemLike { description: string; value: number | null }

export interface ContractContext {
  patientName: string
  patientCpf?: string | null
  /** Responsável legal (ou tutor) do cadastro; sem ele os campos do modelo ficam pendentes. */
  guardianName?: string | null
  guardianCpf?: string | null
  patientAddress?: string | null
  clinicName: string
  clinicAddress?: string | null
  professionalName?: string | null
  /** Registro já formatado ("CRM 12345"). */
  professionalRegistration?: string | null
  /** Valor em reais, ou null (vira pendência). */
  amount: number | null
  paymentMethod: string
  validFrom: string
  validUntil: string
  packageName?: string | null
  packageSessions?: number | null
  planItems?: PlanItemLike[]
  /** Hoje, "AAAA-MM-DD". */
  today: string
}

/** Serviço do contrato: o pacote escolhido ou, sem pacote, os itens do orçamento do paciente. Vazio quando não há nenhum. */
export function describeObject(ctx: Pick<ContractContext, 'packageName' | 'packageSessions' | 'planItems'>): string {
  const pkg = (ctx.packageName ?? '').trim()
  if (pkg) {
    const n = ctx.packageSessions
    return n && n > 0 ? `${pkg} (${n} ${n === 1 ? 'sessão' : 'sessões'})` : pkg
  }
  const items = (ctx.planItems ?? []).filter(i => i.description.trim())
  if (items.length === 0) return ''
  return items.map(i => (i.value && i.value > 0 ? `${i.description.trim()} (R$ ${formatBrl(i.value)})` : i.description.trim())).join('; ')
}

/** Valor sugerido: o do pacote escolhido; sem pacote, a soma do orçamento; sem nenhum dos dois, null. */
export function suggestAmount(ctx: { packagePrice?: number | null; planItems?: PlanItemLike[] }): number | null {
  if (ctx.packagePrice && ctx.packagePrice > 0) return ctx.packagePrice
  const sum = (ctx.planItems ?? []).reduce((acc, i) => acc + (i.value && i.value > 0 ? i.value : 0), 0)
  return sum > 0 ? Math.round(sum * 100) / 100 : null
}

export function buildContractValues(ctx: ContractContext): Record<string, string> {
  const paciente = ctx.patientName.trim()
  const cpf = formatCpf(ctx.patientCpf)
  const prof = (ctx.professionalName ?? '').trim()
  const reg = (ctx.professionalRegistration ?? '').trim()
  return {
    paciente,
    paciente_ident: cpf ? `${paciente}, CPF ${cpf}` : paciente,
    cpf,
    responsavel: (ctx.guardianName ?? '').trim(),
    responsavel_ident: guardianIdent({ guardian_name: ctx.guardianName, guardian_cpf: ctx.guardianCpf }),
    endereco: (ctx.patientAddress ?? '').trim(),
    clinica: ctx.clinicName.trim(),
    clinica_endereco: (ctx.clinicAddress ?? '').trim(),
    profissional: prof,
    registro: reg,
    profissional_ident: [prof, reg].filter(Boolean).join(', '),
    objeto: describeObject(ctx),
    valor: ctx.amount !== null && ctx.amount > 0 ? formatBrl(ctx.amount) : '',
    forma_pagamento: ctx.paymentMethod.trim(),
    vigencia_inicio: formatDateBr(ctx.validFrom),
    vigencia_fim: formatDateBr(ctx.validUntil),
    data: formatDateExtenso(ctx.today),
  }
}

/** Texto do contrato a partir de um modelo. `missing` lista o que o cadastro não tinha e ficou entre [colchetes]. */
export function renderContract(template: string, ctx: ContractContext): { text: string; missing: string[] } {
  const { text, missing } = fillTemplate(template, buildContractValues(ctx), LABELS)
  return { text: normalizeDocText(text), missing }
}

export const MAX_TEMPLATE_NAME = 80
export const MIN_CONTRACT_TEXT = 30
export const MAX_TEMPLATES_PER_CLINIC = 30

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string }

export interface TemplateInput { name: unknown; body: unknown }

/** Valida um modelo vindo da edição: nome, tamanho do texto e campos {{...}} desconhecidos (erro de digitação). */
export function validateTemplateInput(i: TemplateInput): Checked<{ name: string; body: string }> {
  const name = typeof i.name === 'string' ? i.name.trim() : ''
  if (!name || name.length > MAX_TEMPLATE_NAME) return { ok: false, error: `Dê um nome ao modelo (até ${MAX_TEMPLATE_NAME} caracteres).` }
  const body = typeof i.body === 'string' ? normalizeDocText(i.body) : ''
  if (body.length < MIN_CONTRACT_TEXT) return { ok: false, error: 'O texto do modelo está curto demais.' }
  if (body.length > MAX_DOC_TEXT) return { ok: false, error: `O texto passa de ${MAX_DOC_TEXT} caracteres.` }
  const bad = unknownTokens(body, CONTRACT_TOKEN_KEYS)
  if (bad.length > 0) return { ok: false, error: `Campo desconhecido no modelo: ${bad.slice(0, 3).map(k => `{{${k}}}`).join(', ')}.` }
  return { ok: true, value: { name, body } }
}

export interface ContractDraftInput {
  title: unknown
  contentText: unknown
  validFrom: unknown
  validUntil: unknown
  amount: unknown
  paymentMethod: unknown
}

export interface ContractDraft {
  title: string
  contentText: string
  validFrom: string | null
  validUntil: string | null
  amount: number | null
  paymentMethod: string | null
}

function optionalDay(v: unknown, label: string): Checked<string | null> {
  if (v === null || v === undefined || v === '') return { ok: true, value: null }
  if (typeof v !== 'string' || !parseIsoDay(v)) return { ok: false, error: `${label} inválida.` }
  return { ok: true, value: v }
}

/**
 * Valida o rascunho de contrato (a gravação aceita texto com [pendências]: elas só travam o ENVIO, via
 * validateDocDraft). Vigência: o término não pode ser antes do início.
 */
export function validateContractDraft(i: ContractDraftInput): Checked<ContractDraft> {
  const title = typeof i.title === 'string' ? i.title.trim() : ''
  if (!title || title.length > MAX_DOC_TITLE) return { ok: false, error: `Informe o título (até ${MAX_DOC_TITLE} caracteres).` }
  const contentText = typeof i.contentText === 'string' ? normalizeDocText(i.contentText) : ''
  if (contentText.length < MIN_CONTRACT_TEXT) return { ok: false, error: 'O texto do contrato está curto demais.' }
  if (contentText.length > MAX_DOC_TEXT) return { ok: false, error: `O texto passa de ${MAX_DOC_TEXT} caracteres.` }
  const from = optionalDay(i.validFrom, 'Início da vigência')
  if (!from.ok) return from
  const until = optionalDay(i.validUntil, 'Término da vigência')
  if (!until.ok) return until
  if (from.value && until.value && until.value < from.value) return { ok: false, error: 'O término da vigência não pode ser antes do início.' }
  let amount: number | null = null
  if (i.amount !== null && i.amount !== undefined && i.amount !== '') {
    const n = typeof i.amount === 'number' ? i.amount : Number(i.amount)
    if (!Number.isFinite(n) || n < 0 || n > 100_000_000) return { ok: false, error: 'Valor inválido.' }
    amount = Math.round(n * 100) / 100
  }
  const pm = typeof i.paymentMethod === 'string' ? i.paymentMethod.trim() : ''
  if (pm.length > 60) return { ok: false, error: 'Forma de pagamento muito longa.' }
  return { ok: true, value: { title, contentText, validFrom: from.value, validUntil: until.value, amount, paymentMethod: pm || null } }
}
