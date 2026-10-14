import { timingSafeEqual } from 'crypto'

/** Compara um segredo recebido com o esperado em tempo constante. Sem segredo configurado, nega. */
export function secretMatches(received: string | null, expected: string | undefined): boolean {
  if (!expected || !received) return false
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
