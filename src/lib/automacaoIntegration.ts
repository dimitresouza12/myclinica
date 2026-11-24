// Autenticação e utilidades das rotas /api/automacao/* (n8n -> MyClinica), no padrão de gestorIntegration.ts.
//
// Chamadas servidor-a-servidor autenticadas por segredo compartilhado (AUTOMACAO_N8N_KEY) em vez de sessão.
// As rotas usam o service role, então TODA consulta é escopada por clinic_id: a clínica vem do corpo/URL
// da chamada, é validada (uuid, existe, ativa) e cada recurso (consulta, paciente) é conferido contra ela.

import { createHash, timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabaseAdmin'
import { rateLimit } from '@/lib/rateLimit'
import { clientIpFromHeaders } from '@/lib/portal/clientIp'
import { UUID_RE } from '@/lib/gestorIntegration'

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)

// ─── Resposta ────────────────────────────────────────────────────────────────

export function automacaoJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export function automacaoError(error: string, status: number, extra: Record<string, unknown> = {}): NextResponse {
  return automacaoJson({ error, ...extra }, status)
}

// ─── Autenticação ────────────────────────────────────────────────────────────

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest()

/** Compara em tempo constante: os dois lados passam por SHA-256, então os buffers têm sempre 32 bytes. */
function secretsMatch(provided: string, expected: string): boolean {
  return timingSafeEqual(sha256(provided), sha256(expected))
}

/** Chamadas autorizadas por minuto (o n8n varre as clínicas a cada poucos minutos e envia uma mensagem por chamada). */
export const AUTOMACAO_RATE_LIMIT = { limit: 600, windowMs: 60_000 } as const
/** Tentativas com chave errada por IP: o middleware não aplica limite por IP nestas rotas. */
const AUTH_FAILURE_LIMIT = { limit: 20, windowMs: 60_000 } as const

const retryAfterSeconds = (resetAt: number) => Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))

function tooMany(resetAt: number): NextResponse {
  const res = automacaoError('Muitas requisições. Tente novamente em instantes.', 429)
  res.headers.set('Retry-After', String(retryAfterSeconds(resetAt)))
  return res
}

/**
 * Devolve null se a chamada está autorizada; senão, a resposta de erro pronta.
 * Falha fechada: sem AUTOMACAO_N8N_KEY nada passa (503). Nunca loga nem devolve o segredo.
 */
export function authenticateAutomacao(req: Request): NextResponse | null {
  const expected = process.env.AUTOMACAO_N8N_KEY
  if (!expected) {
    console.error('[automacao] AUTOMACAO_N8N_KEY não configurada; integração desligada')
    return automacaoError('Integração não configurada', 503)
  }

  const header = req.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  if (!match || !secretsMatch(match[1], expected)) {
    const ip = clientIpFromHeaders(req.headers)
    const fail = rateLimit(`automacao-auth-fail:${ip}`, AUTH_FAILURE_LIMIT)
    if (!fail.success) return tooMany(fail.resetAt)
    return automacaoError('Não autorizado', 401)
  }

  const rl = rateLimit('automacao:n8n', AUTOMACAO_RATE_LIMIT)
  if (!rl.success) return tooMany(rl.resetAt)
  return null
}

// ─── Corpo da requisição ─────────────────────────────────────────────────────

const MAX_BODY_BYTES = 64 * 1024

export type Parsed<T> = { ok: true; value: T } | { ok: false; response: NextResponse }

/** Lê o JSON do corpo (objeto, até 64 KB). Erro vira resposta 400/413 pronta. */
export async function readJsonBody(req: Request): Promise<Parsed<Record<string, unknown>>> {
  let raw: string
  try { raw = await req.text() } catch { return { ok: false, response: automacaoError('Corpo ilegível.', 400) } }
  if (raw.length > MAX_BODY_BYTES) return { ok: false, response: automacaoError('Corpo grande demais.', 413) }
  let body: unknown
  try { body = JSON.parse(raw) } catch { return { ok: false, response: automacaoError('Corpo deve ser JSON válido.', 400) } }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, response: automacaoError('Corpo da requisição deve ser um objeto JSON.', 400) }
  }
  return { ok: true, value: body as Record<string, unknown> }
}

// ─── Clínica ─────────────────────────────────────────────────────────────────

export interface AutomacaoClinic { id: string; name: string }

/**
 * Valida a clínica da chamada: uuid, existe e está ativa (is_active nulo conta como ativa, como no /admin).
 * Falha de leitura vira 500 genérico; o detalhe fica só no log do servidor, sem dado de paciente.
 */
export async function loadAutomacaoClinic(clinicId: unknown): Promise<{ ok: true; clinic: AutomacaoClinic } | { ok: false; response: NextResponse }> {
  if (!isUuid(clinicId)) return { ok: false, response: automacaoError('Clínica não encontrada.', 404) }
  const { data, error } = await getAdminClient()
    .from('clinics')
    .select('id, name, is_active')
    .eq('id', clinicId)
    .maybeSingle()
  if (error) {
    console.error('[automacao] leitura da clínica falhou:', error.code ?? 'sem código')
    return { ok: false, response: automacaoError('Erro ao buscar clínica.', 500) }
  }
  if (!data) return { ok: false, response: automacaoError('Clínica não encontrada.', 404) }
  const row = data as { id: string; name: string; is_active: boolean | null }
  if (row.is_active === false) return { ok: false, response: automacaoError('Clínica inativa.', 403) }
  return { ok: true, clinic: { id: row.id, name: row.name } }
}
