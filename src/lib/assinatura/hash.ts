// Hashes da assinatura eletrônica simples. Roda no navegador e no servidor (Web Crypto), sem dependência.

import { normalizeDocText } from './texto'

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Hash do conteúdo de um documento: SHA-256 do texto normalizado. Mesmo texto, mesmo hash, em qualquer lugar. */
export async function contentHash(text: string): Promise<string> {
  return sha256Hex(normalizeDocText(text))
}

/** Versão curta para conferência visual: 12 caracteres em 3 grupos, maiúsculos ("A1B2-C3D4-E5F6"). */
export function shortHash(hash: string): string {
  const h = hash.slice(0, 12).toUpperCase()
  return `${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8, 12)}`
}

export const HASH_RE = /^[0-9a-f]{64}$/

export interface SignedHashInput {
  requestId: string
  clinicId: string
  patientId: string
  contentHash: string
  signerName: string
  method: 'desenho' | 'digitado'
  /** SHA-256 da imagem do desenho; vazio no modo digitado */
  signatureImageHash: string
  /** ISO 8601 UTC do aceite */
  signedAt: string
}

/** Selo do ato de assinar: amarra documento, signatário, método e instante. Qualquer alteração muda o hash. */
export async function signedHash(i: SignedHashInput): Promise<string> {
  return sha256Hex(JSON.stringify(['myclinica-assinatura-v1', i.requestId, i.clinicId, i.patientId, i.contentHash, i.signerName, i.method, i.signatureImageHash, i.signedAt]))
}
