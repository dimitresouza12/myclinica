import crypto from 'crypto'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'

const CSRF_COOKIE = '__Host-csrf'
const CSRF_HEADER = 'x-csrf-token'
const TOKEN_LENGTH = 32

// Gera token CSRF criptograficamente seguro
export function generateCsrfToken(): string {
  return crypto.randomBytes(TOKEN_LENGTH).toString('hex')
}

// Hash do token para armazenar no cookie (double-submit pattern)
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// Seta o cookie CSRF na resposta (chamar em Server Actions ou route handlers)
export async function setCsrfCookie(): Promise<string> {
  const token = generateCsrfToken()
  const cookieStore = await cookies()
  cookieStore.set(CSRF_COOKIE, hashToken(token), {
    httpOnly: false,   // precisa ser lido pelo JS para enviar no header
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60,   // 1 hora
  })
  return token          // retornar ao client para incluir no header
}

// Valida token CSRF em route handlers (POST/PUT/PATCH/DELETE)
export function validateCsrf(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  const host = req.headers.get('host')

  // Verificação de origem (primeira linha de defesa)
  if (origin) {
    try {
      const originHost = new URL(origin).host
      if (originHost !== host) return false
    } catch {
      return false
    }
  }

  // Double-submit: header deve corresponder ao hash no cookie
  const headerToken = req.headers.get(CSRF_HEADER)
  const cookieHash = req.cookies.get(CSRF_COOKIE)?.value

  if (!headerToken || !cookieHash) return false
  return hashToken(headerToken) === cookieHash
}

// Métodos que exigem validação CSRF
export const CSRF_PROTECTED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
