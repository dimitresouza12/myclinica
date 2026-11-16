// Rate limiter em memória — funciona para instância única (EasyPanel/standalone)
// Para múltiplas instâncias, substituir por Upstash Redis

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Limpa entradas expiradas periodicamente (evita memory leak)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt < now) store.delete(key)
    }
  }, 60_000)
}

interface RateLimitOptions {
  limit: number      // máximo de requests
  windowMs: number   // janela em ms
}

interface RateLimitResult {
  success: boolean
  remaining: number
  resetAt: number
}

export function rateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + opts.windowMs })
    return { success: true, remaining: opts.limit - 1, resetAt: now + opts.windowMs }
  }

  if (entry.count >= opts.limit) {
    return { success: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { success: true, remaining: opts.limit - entry.count, resetAt: entry.resetAt }
}

/**
 * Só consulta: diz se a chave ainda tem folga, SEM gastar uma tentativa. Serve para cobrar o limite apenas
 * de quem de fato conseguiu (ex.: reserva gravada), em vez de cobrar também a tentativa recusada.
 */
export function rateLimitPeek(key: string, opts: RateLimitOptions): boolean {
  const entry = store.get(key)
  if (!entry || entry.resetAt < Date.now()) return true
  return entry.count < opts.limit
}

// Perfis pré-definidos
export const rateLimitProfiles = {
  // Login: 5 tentativas por 10 minutos por IP
  auth: (ip: string) => rateLimit(`auth:${ip}`, { limit: 5, windowMs: 10 * 60_000 }),
  // API geral: 60 req/min por IP
  api: (ip: string) => rateLimit(`api:${ip}`, { limit: 60, windowMs: 60_000 }),
  // Webhook n8n: 20 req/min
  webhook: (ip: string) => rateLimit(`webhook:${ip}`, { limit: 20, windowMs: 60_000 }),
  // Export de dados: 3 por hora
  export: (userId: string) => rateLimit(`export:${userId}`, { limit: 3, windowMs: 60 * 60_000 }),
}
