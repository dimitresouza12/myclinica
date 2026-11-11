// Tokens do link mágico e hash de IP. SÓ NO SERVIDOR (usa node:crypto): o token em claro existe apenas na resposta
// que cria o link; o banco guarda o SHA-256. Funções puras exceto a geração aleatória.

import { createHash, createHmac, randomBytes } from 'node:crypto'
import { clientIpFromHeaders } from './clientIp'

export const TOKEN_BYTES = 32
/** base64url de 32 bytes: 43 caracteres. */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

export function isWellFormedToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_RE.test(token)
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function hashToken(token: string): string {
  return sha256Hex(token)
}

/** HMAC-SHA256 do IP com um segredo do servidor: não dá para reverter o IP nem comparar entre ambientes. */
export function hashIp(ip: string, secret: string): string {
  return createHmac('sha256', secret).update(ip, 'utf8').digest('hex')
}

/** Segredo do hash de IP: PORTAL_HASH_SALT, ou derivado da chave de serviço (sem copiá-la nem registrá-la). */
export function ipHashSecret(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.PORTAL_HASH_SALT?.trim()
  if (explicit && explicit.length >= 16) return explicit
  const base = env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return sha256Hex(`myclinica-portal-ip:${base}`)
}

/** IP do cliente a partir dos cabeçalhos do proxy (regra única em clientIp.ts, a mesma do middleware). */
export function clientIpFrom(headers: { get(name: string): string | null }): string {
  return clientIpFromHeaders(headers)
}
