// Código verificador dos documentos próprios (QR /verificar/[codigo]). SÓ NO SERVIDOR para gerar (node:crypto).
// O código tem 80 bits de entropia e o banco guarda apenas o SHA-256 dele.

import { randomBytes } from 'node:crypto'
import { sha256Hex } from '@/lib/portal/token'
import { shortHash } from './hash'
import { formatCode, isVerifiableDocType, VERIFIABLE_LABEL } from './tipos'

export { formatCode, isVerifiableDocType, VERIFIABLE_DOC_TYPES, VERIFIABLE_LABEL, type VerifiableDocType } from './tipos'

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' // Crockford base32: sem I, L, O, U
const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{16}$/

export function generateVerificationCode(): string {
  const bytes = randomBytes(10)
  let bits = 0
  let acc = 0
  let out = ''
  for (const b of bytes) {
    acc = (acc << 8) | b
    bits += 8
    while (bits >= 5) { out += ALPHABET[(acc >>> (bits - 5)) & 31]; bits -= 5 }
  }
  return out
}

/** "abcd-efgh ijkl-mnop" -> "ABCDEFGHIJKLMNOP"; null se não for um código válido. Aceita as trocas O->0 e I/L->1 de quem digita. */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 40) return null
  const c = raw.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
  return CODE_RE.test(c) ? c : null
}

export function hashCode(code: string): string {
  return sha256Hex(`verificar:${code}`)
}

export function verificationUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/verificar/${formatCode(code)}`
}

export interface IssuedRow {
  doc_type: string
  issued_at: string
  revoked_at: string | null
  content_hash: string
  professional_name: string | null
  professional_registration: string | null
  clinic_name: string
}

/** O que a página pública mostra: nunca nome do paciente nem conteúdo clínico. */
export interface VerificationView {
  valid: boolean
  clinicName: string
  typeLabel: string
  issuedAt: string
  professional: string | null
  shortHash: string
}

export function buildVerificationView(row: IssuedRow): VerificationView {
  const type = isVerifiableDocType(row.doc_type) ? VERIFIABLE_LABEL[row.doc_type] : 'Documento'
  const reg = row.professional_registration?.trim()
  const name = row.professional_name?.trim()
  return {
    valid: !row.revoked_at,
    clinicName: row.clinic_name,
    typeLabel: type,
    issuedAt: row.issued_at,
    professional: name ? (reg ? `${name} (${reg})` : name) : null,
    shortHash: shortHash(row.content_hash),
  }
}
