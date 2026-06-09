// Sanitização de inputs para prevenção de XSS e injeção

// Remove tags HTML e escapa caracteres perigosos
export function sanitizeString(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim()
}

// Remove tudo que não for dígito (CPF, CNPJ, telefone)
export function sanitizeDigits(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\D/g, '')
}

// Valida e normaliza email
export function sanitizeEmail(value: unknown): string {
  if (typeof value !== 'string') return ''
  const email = value.toLowerCase().trim()
  const emailRegex = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/
  return emailRegex.test(email) ? email : ''
}

// Valida UUID para evitar BOLA — sempre filtrar por clinic_id no banco
export function isValidUUID(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

// Sanitiza objeto recursivamente (para dados vindos de formulários)
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result = {} as T
  for (const key of Object.keys(obj) as (keyof T)[]) {
    const val = obj[key]
    if (typeof val === 'string') {
      result[key] = sanitizeString(val) as T[keyof T]
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      result[key] = sanitizeObject(val as Record<string, unknown>) as T[keyof T]
    } else {
      result[key] = val
    }
  }
  return result
}

// Valida tamanho máximo de string para evitar payload excessivo
export function assertMaxLength(value: string, max: number, field: string): void {
  if (value.length > max) {
    throw new Error(`Campo "${field}" excede o tamanho máximo de ${max} caracteres`)
  }
}
