// IP do cliente atrás de proxy reverso (EasyPanel/Traefik). Módulo puro, sem node:crypto, para rodar também no
// middleware (Edge).
//
// O primeiro valor de X-Forwarded-For é o que o CLIENTE mandou: quem forja o cabeçalho escolhe esse valor e
// zera o rate limit por IP a cada requisição. Cada proxy confiável ACRESCENTA o endereço do salto anterior ao
// final da lista, então o IP real é o contado a partir do fim: com N proxies confiáveis na frente do app
// (PORTAL_TRUSTED_PROXY_HOPS, padrão 1), é o N-ésimo da direita para a esquerda.

type HeaderReader = { get(name: string): string | null }

const DEFAULT_HOPS = 1
const MAX_HOPS = 10
const IP_SHAPE = /^[0-9a-fA-F:.]{2,45}$/

export function trustedProxyHops(env: Record<string, string | undefined> = process.env): number {
  const raw = env.PORTAL_TRUSTED_PROXY_HOPS?.trim()
  if (!raw) return DEFAULT_HOPS
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0 || n > MAX_HOPS) return DEFAULT_HOPS
  return n
}

function sane(value: string | null | undefined): string | null {
  const v = value?.trim()
  return v && IP_SHAPE.test(v) ? v : null
}

/**
 * hops = 0: sem proxy confiável, cabeçalhos de cliente são ignorados (devolve 'unknown'; todos compartilham o
 * mesmo balde, o que é seguro e só mais restritivo). hops >= 1: N-ésimo valor de X-Forwarded-For contado do fim,
 * com x-real-ip (definido pelo proxy) como reserva. Se a lista for mais curta que hops, usa o primeiro valor
 * da lista (o salto mais próximo da borda que existe).
 */
export function clientIpFromHeaders(headers: HeaderReader, hops: number = trustedProxyHops()): string {
  if (hops <= 0) return 'unknown'
  const list = (headers.get('x-forwarded-for') ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (list.length > 0) {
    const picked = sane(list[Math.max(list.length - hops, 0)])
    if (picked) return picked
  }
  return sane(headers.get('x-real-ip')) ?? 'unknown'
}
