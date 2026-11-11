import { supabase } from '@/lib/supabase'
import type { EscribaArea, EscribaPublico } from '@/lib/ia/escriba'

// Cliente da rota /api/ia/escriba (o servidor decide clínica, plano, consentimento e provedor).
// Nada de provedor, chave ou modelo aqui: só falamos com o MyClinica.

export interface EscribaStatus {
  configurada: boolean
  plano: boolean
  consentimento: boolean
  consentimento_suportado: boolean
}

export interface EscribaDraft {
  rascunho: string
  aviso: string
  registros?: number
}

export class EscribaApiError extends Error {
  readonly code: string
  constructor(code: string, message: string) { super(message); this.name = 'EscribaApiError'; this.code = code }
}

async function call<T>(method: 'GET' | 'POST' | 'PUT', body?: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/ia/escriba', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({})) as { error?: string; message?: string }
  if (!res.ok) throw new EscribaApiError(json.error ?? 'erro', json.message ?? json.error ?? 'Não foi possível concluir. Tente de novo.')
  return json as T
}

let statusCache: { at: number; value: EscribaStatus } | null = null
const STATUS_TTL_MS = 30_000

export async function fetchEscribaStatus(force = false): Promise<EscribaStatus> {
  if (!force && statusCache && Date.now() - statusCache.at < STATUS_TTL_MS) return statusCache.value
  const value = await call<EscribaStatus>('GET')
  statusCache = { at: Date.now(), value }
  return value
}

export function invalidateEscribaStatus(): void { statusCache = null }

export function redigirEvolucao(args: { area: EscribaArea; patientId: string; texto: string }): Promise<EscribaDraft> {
  return call<EscribaDraft>('POST', { modo: 'evolucao', area: args.area, patient_id: args.patientId, texto: args.texto })
}

export function gerarRelatorio(args: { area: EscribaArea; patientId: string; publico: EscribaPublico; de: string; ate: string; observacoes?: string }): Promise<EscribaDraft> {
  return call<EscribaDraft>('POST', { modo: 'relatorio', area: args.area, patient_id: args.patientId, publico: args.publico, de: args.de, ate: args.ate, observacoes: args.observacoes ?? '' })
}

export async function salvarConsentimento(consentimento: boolean): Promise<void> {
  await call<{ consentimento: boolean }>('PUT', { consentimento })
  invalidateEscribaStatus()
}
