// Leitura da configuração de IA no painel do Gestor da Otimiza Aí. O MyClinica não guarda chave de
// provedor, modelo, preço nem limite: pergunta ao Gestor (server-to-server) se a IA está ligada para a
// clínica e quanto resta do orçamento. Só roda no servidor (lê env; nunca importar em 'use client').
//
// Variáveis (ver docs/ia-gateway-myclinica.md): GESTOR_API_URL e GESTOR_IA_KEY. Sem elas, ou com qualquer
// falha na consulta, getIaConfig() devolve null = IA DESLIGADA (falha fechada).

export interface IaConfig {
  /** identificador do provedor registrado em registerProviderFactory (hoje: 'gestor') */
  provider: string
  /** id do modelo, definido pelo Gestor */
  model: string
  /** interruptor do cliente no Gestor; false = desligada */
  enabled: boolean
  /** teto de tokens de saída por chamada imposto pelo Gestor (opcional) */
  maxOutputTokens?: number
  /** saldo/orçamento restante do cliente no período, se o Gestor informar (opcional) */
  budgetRemaining?: number | null
}

export const GESTOR_PROVIDER = 'gestor'

/** Cache curto: a rota consulta o status a cada GET/POST e o orçamento só precisa ser aproximado. */
const TTL_OK_MS = 60_000
/** Falha também é guardada, por pouco tempo, para um Gestor fora do ar não travar cada requisição. */
const TTL_FALHA_MS = 10_000
const STATUS_TIMEOUT_MS = 5_000
const MAX_ENTRIES = 500

interface CacheEntry { at: number; ttl: number; value: IaConfig | null }
const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<IaConfig | null>>()

/** Base e chave do Gestor, só do ambiente do servidor. null = integração não configurada. */
export function gestorEnv(): { base: string; key: string } | null {
  const rawBase = process.env.GESTOR_API_URL?.trim()
  const key = process.env.GESTOR_IA_KEY?.trim()
  if (!rawBase || !key) return null
  const base = rawBase.replace(/\/+$/, '')
  try {
    const u = new URL(base)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  } catch {
    return null
  }
  return { base, key }
}

/** Só para testes. */
export function clearIaConfigCache(): void {
  cache.clear()
  inflight.clear()
}

/** Descarta o status guardado da clínica (ex.: após consumo, para o saldo ser relido). */
export function invalidateIaConfig(clinicId: string): void {
  cache.delete(clinicId)
}

function remember(clinicId: string, value: IaConfig | null): void {
  if (cache.size >= MAX_ENTRIES) {
    const now = Date.now()
    for (const [k, e] of cache) if (now - e.at >= e.ttl) cache.delete(k)
    if (cache.size >= MAX_ENTRIES) cache.clear()
  }
  cache.set(clinicId, { at: Date.now(), ttl: value ? TTL_OK_MS : TTL_FALHA_MS, value })
}

async function fetchStatus(clinicId: string, env: { base: string; key: string }): Promise<IaConfig | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), STATUS_TIMEOUT_MS)
  try {
    const res = await fetch(`${env.base}/api/publico/ia/status?ref=${encodeURIComponent(clinicId)}`, {
      method: 'GET',
      headers: { 'x-sistema-chave': env.key },
      cache: 'no-store',
      signal: ctrl.signal,
    })
    if (!res.ok) {
      // só o status HTTP no log: nunca corpo, chave nem identificador do cliente
      console.error('[ia/config] Gestor respondeu status', res.status)
      return null
    }
    const body = await res.json() as {
      enabled?: unknown; model?: unknown; budgetRemaining?: unknown; maxOutputTokens?: unknown
    } | null
    if (!body || typeof body !== 'object') return null
    const cfg: IaConfig = {
      provider: GESTOR_PROVIDER,
      model: typeof body.model === 'string' && body.model ? body.model : GESTOR_PROVIDER,
      enabled: body.enabled === true,
    }
    if (typeof body.budgetRemaining === 'number' && Number.isFinite(body.budgetRemaining)) cfg.budgetRemaining = body.budgetRemaining
    else if (body.budgetRemaining === null) cfg.budgetRemaining = null
    if (typeof body.maxOutputTokens === 'number' && Number.isFinite(body.maxOutputTokens) && body.maxOutputTokens > 0) cfg.maxOutputTokens = body.maxOutputTokens
    return cfg
  } catch (e) {
    console.error('[ia/config] consulta ao Gestor falhou', e instanceof Error ? e.name : '')
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Status de IA da clínica no Gestor, com cache de 60 s. null = Gestor/variáveis não configurados ou
 * consulta falhou (IA desligada). `clinicId` vem da sessão autenticada, nunca do corpo da requisição.
 */
export async function getIaConfig(clinicId: string): Promise<IaConfig | null> {
  const env = gestorEnv()
  if (!env || !clinicId) return null

  const hit = cache.get(clinicId)
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value

  const pending = inflight.get(clinicId)
  if (pending) return pending

  const p = fetchStatus(clinicId, env)
    .then(value => { remember(clinicId, value); return value })
    .finally(() => { inflight.delete(clinicId) })
  inflight.set(clinicId, p)
  return p
}
