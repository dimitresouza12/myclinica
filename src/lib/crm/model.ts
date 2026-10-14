// Modelo do CRM (funil de leads). Funções puras: sem React, sem rede, sem banco.

import { normalizeBrPhone, phoneKey } from '../whatsapp/phone'
import { PHONE_INCOMPLETE, isCompleteBrPhone } from '../phoneFormat'
import { dayKey } from '../whatsapp/inbox'
import { zonedTimeToUtc } from '../whatsapp/window'

export type Stage = 'novo' | 'em_conversa' | 'agendado' | 'compareceu' | 'perdido'
export type Source = 'whatsapp' | 'instagram' | 'google' | 'anuncio' | 'indicacao' | 'site' | 'outro'

export const STAGES: ReadonlyArray<{ key: Stage; label: string; hint: string }> = [
  { key: 'novo',        label: 'Novo',        hint: 'Chegou e ainda não foi respondido' },
  { key: 'em_conversa', label: 'Em conversa', hint: 'A clínica já respondeu' },
  { key: 'agendado',    label: 'Agendado',    hint: 'Tem consulta marcada' },
  { key: 'compareceu',  label: 'Compareceu',  hint: 'Foi atendido' },
  { key: 'perdido',     label: 'Perdido',     hint: 'Não vai seguir' },
]

export const SOURCES: ReadonlyArray<{ key: Source; label: string }> = [
  { key: 'whatsapp',  label: 'WhatsApp' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'google',    label: 'Google' },
  { key: 'anuncio',   label: 'Anúncio' },
  { key: 'indicacao', label: 'Indicação' },
  { key: 'site',      label: 'Site' },
  { key: 'outro',     label: 'Outro' },
]

export const LOST_REASONS = ['Achou caro', 'Sem retorno', 'Foi para outra clínica', 'Sem interesse agora', 'Não era paciente', 'Outro'] as const

export interface Lead {
  id: string
  clinic_id: string
  name: string | null
  phone: string | null
  phone_key: string | null
  stage: Stage
  stage_changed_at: string
  /** quem mudou a etapa por último: uma pessoa ('manual') ou uma regra do sistema ('auto') */
  stage_source: 'manual' | 'auto'
  /** por que o cartão mudou sozinho; vazio quando foi movido à mão */
  stage_note: string | null
  lost_reason: string | null
  source: Source
  interest: string | null
  estimated_value: number | null
  notes: string | null
  next_contact_at: string | null
  assigned_to: string | null
  patient_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export const STAGE_KEYS: Stage[] = STAGES.map(s => s.key)

export function isStage(v: unknown): v is Stage {
  return typeof v === 'string' && (STAGE_KEYS as string[]).includes(v)
}

export function stageLabel(stage: Stage): string {
  return STAGES.find(s => s.key === stage)?.label ?? stage
}

export function sourceLabel(source: string | null | undefined): string {
  return SOURCES.find(s => s.key === source)?.label ?? 'Outro'
}

/** Telefone para mostrar, ou '' quando não há. Do exterior (chave `raw:`) aparece com "+". Aceita com ou sem o 55. */
export function leadPhoneLabel(l: Pick<Lead, 'phone' | 'phone_key'>): string {
  const phone = l.phone?.trim()
  if (phone) {
    const digits = phone.replace(/\D/g, '')
    if (l.phone_key?.startsWith('raw:')) return `+${digits}`
    const n = digits.startsWith('55') && (digits.length === 12 || digits.length === 13) ? digits.slice(2) : digits
    if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
    if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
    return digits
  }
  if (l.phone_key?.startsWith('lid:')) return 'Número oculto pelo WhatsApp'
  return ''
}

/** Nome para mostrar: o nome, senão o telefone, senão um texto neutro. */
export function leadTitle(l: Pick<Lead, 'name' | 'phone' | 'phone_key'>): string {
  const name = l.name?.trim()
  if (name) return name
  if (l.phone?.trim()) return leadPhoneLabel(l)
  if (l.phone_key?.startsWith('lid:')) return 'Contato sem número'
  return 'Contato sem nome'
}

// ── agrupamento e totais ────────────────────────────────────────────────────

/** Leads por etapa. Dentro da etapa, o que entrou mais recentemente vem primeiro. */
export function groupByStage(leads: Lead[]): Record<Stage, Lead[]> {
  const out = { novo: [], em_conversa: [], agendado: [], compareceu: [], perdido: [] } as Record<Stage, Lead[]>
  for (const l of leads) (out[l.stage] ?? out.novo).push(l)
  for (const k of STAGE_KEYS) {
    out[k].sort((a, b) => Date.parse(b.stage_changed_at) - Date.parse(a.stage_changed_at))
  }
  return out
}

export function stageTotals(leads: Lead[]): { count: number; value: number } {
  return {
    count: leads.length,
    value: leads.reduce((sum, l) => sum + (l.estimated_value ?? 0), 0),
  }
}

/** Em andamento = ainda pode virar paciente (nem atendido, nem perdido). */
export function openLeadCount(leads: Lead[]): number {
  return leads.filter(l => l.stage !== 'perdido' && l.stage !== 'compareceu').length
}

export function formatMoney(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: value % 1 === 0 ? 0 : 2 })
}

// ── tempo ───────────────────────────────────────────────────────────────────

/** "agora", "3 horas", "1 dia", "2 semanas"… Tempo desde `since`. */
export function elapsedLabel(since: string | Date, now: Date): string {
  const ms = now.getTime() - new Date(since).getTime()
  if (!Number.isFinite(ms) || ms < 60_000) return 'agora'
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return h === 1 ? '1 hora' : `${h} horas`
  const d = Math.floor(h / 24)
  if (d < 14) return d === 1 ? '1 dia' : `${d} dias`
  const w = Math.floor(d / 7)
  if (d < 60) return `${w} semanas`
  const mo = Math.floor(d / 30)
  return mo === 1 ? '1 mês' : `${mo} meses`
}

/** Lead parado há mais de `days` dias na etapa e ainda em aberto. */
export function isStale(l: Pick<Lead, 'stage' | 'stage_changed_at'>, now: Date, days = 3): boolean {
  if (l.stage !== 'novo' && l.stage !== 'em_conversa') return false
  return now.getTime() - Date.parse(l.stage_changed_at) > days * 86_400_000
}

/** "Retomar" vencido (a data já passou) em lead ainda aberto. */
export function isFollowUpDue(l: Pick<Lead, 'stage' | 'next_contact_at'>, now: Date): boolean {
  if (!l.next_contact_at) return false
  if (l.stage === 'perdido' || l.stage === 'compareceu') return false
  return Date.parse(l.next_contact_at) <= now.getTime()
}

// ── "retomar em" (data no fuso da clínica) ──────────────────────────────────

export const CLINIC_TZ = 'America/Sao_Paulo'
const FOLLOW_UP_HOUR = 9

/** Valor de <input type="date"> (aaaa-mm-dd) → instante às 9h do dia, no fuso da clínica. Vazio/inválido → null. */
export function dateInputToIso(value: string, tz = CLINIC_TZ): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const probe = new Date(Date.UTC(y, mo - 1, d))
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null
  return zonedTimeToUtc(y, mo, d, FOLLOW_UP_HOUR, 0, tz).toISOString()
}

/** Instante → aaaa-mm-dd no fuso da clínica (para preencher <input type="date">). */
export function isoToDateInput(iso: string | null | undefined, tz = CLINIC_TZ): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : dayKey(d, tz)
}

const dayIndex = (key: string) => { const [y, m, d] = key.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86_400_000) }

/** "Retomar hoje", "Retomar amanhã", "Retomar 20/10" ou "Retomar atrasado há 2 dias". */
export function followUpLabel(iso: string, now: Date, tz = CLINIC_TZ): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const diff = dayIndex(dayKey(at, tz)) - dayIndex(dayKey(now, tz))
  if (diff === 0) return 'Retomar hoje'
  if (diff === 1) return 'Retomar amanhã'
  if (diff === -1) return 'Retomar atrasado há 1 dia'
  if (diff < -1) return `Retomar atrasado há ${-diff} dias`
  const [, m, d] = dayKey(at, tz).split('-')
  return `Retomar ${d}/${m}`
}

// ── formulário ──────────────────────────────────────────────────────────────

/** "1.800,50", "1800.5", "R$ 900" → número; vazio → null; inválido → NaN. */
export function parseMoney(input: string): number | null {
  const s = input.replace(/R\$|\s/g, '')
  if (!s) return null
  // "1.800,50" (pt-BR): a vírgula é o decimal. Sem vírgula, "1.800" é milhar e "1800.50" é decimal.
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '')
    : s
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return NaN
  return Number(normalized)
}

/**
 * Telefone digitado → { phone, phoneKey }.
 * Só vale o formato brasileiro completo: celular (DDD) 9XXXX-XXXX ou fixo (DDD) XXXX-XXXX. É o mesmo que o
 * campo impõe na digitação; aqui é a segunda trava, caso algo chegue por outro caminho.
 * Vazio: lead sem telefone (permitido). Qualquer outra coisa: null.
 */
export function leadPhoneFromInput(input: string): { phone: string; phoneKey: string } | null | 'vazio' {
  const raw = input.trim()
  if (!raw) return 'vazio'
  if (!isCompleteBrPhone(raw)) return null
  const national = normalizeBrPhone(raw)
  return national ? { phone: national, phoneKey: phoneKey(national) } : null
}

export interface LeadFormInput {
  name: string
  phone: string
  source: Source
  interest: string
  value: string
  notes: string
  assignedTo: string
}

export type LeadFormResult =
  | { ok: true; value: { name: string | null; phone: string | null; phone_key: string | null; source: Source; interest: string | null; estimated_value: number | null; notes: string | null; assigned_to: string | null } }
  | { ok: false; errors: Partial<Record<keyof LeadFormInput, string>> }

/**
 * `phoneLocked`: o lead já tem conversa no WhatsApp, então o telefone vem dela e não é conferido nem alterado aqui
 * (pode ser de outro país ou estar oculto pelo WhatsApp).
 */
export function validateLeadForm(input: LeadFormInput, opts: { phoneLocked?: boolean } = {}): LeadFormResult {
  const errors: Partial<Record<keyof LeadFormInput, string>> = {}

  const name = input.name.trim()
  const phone = opts.phoneLocked ? 'vazio' : leadPhoneFromInput(input.phone)
  if (!name && phone === 'vazio' && !opts.phoneLocked) errors.name = 'Informe o nome ou o telefone.'
  if (phone === null) errors.phone = PHONE_INCOMPLETE

  const value = parseMoney(input.value)
  if (value !== null && Number.isNaN(value)) errors.value = 'Valor inválido. Exemplo: 1.800,00'

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  const p = phone === 'vazio' || phone === null ? null : phone
  return {
    ok: true,
    value: {
      name: name || null,
      phone: p?.phone ?? null,
      phone_key: p?.phoneKey ?? null,
      source: input.source,
      interest: input.interest.trim() || null,
      estimated_value: value === null || Number.isNaN(value) ? null : value,
      notes: input.notes.trim() || null,
      assigned_to: input.assignedTo || null,
    },
  }
}

/**
 * Atualização de etapa feita por uma PESSOA: marca como manual (a automação respeita) e apaga o motivo
 * automático. Ao sair de "Perdido" o motivo da perda some; ao entrar, mantém o que já houver.
 */
export function stagePatch(to: Stage, lead: Pick<Lead, 'lost_reason'>, reason?: string | null): { stage: Stage; lost_reason: string | null; stage_source: 'manual'; stage_note: null } {
  const lost = to !== 'perdido' ? null : reason?.trim() || lead.lost_reason || null
  return { stage: to, lost_reason: lost, stage_source: 'manual', stage_note: null }
}
