import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'

// Definido inline para não importar crypto (Node.js) no Edge Runtime
const CSRF_PROTECTED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Request-ID', crypto.randomUUID())
  return response
}

function blockResponse(status: number, message: string, retryAfter?: number): NextResponse {
  const res = NextResponse.json({ error: message }, { status })
  if (retryAfter) res.headers.set('Retry-After', String(retryAfter))
  return res
}

export async function middleware(request: NextRequest) {
  const { pathname, method } = { pathname: request.nextUrl.pathname, method: request.method }
  const ip = getClientIp(request)

  // Rate limit global em rotas de API
  if (pathname.startsWith('/api/')) {
    const isAuthRoute = pathname.startsWith('/api/auth')
    const limit = isAuthRoute
      ? rateLimit(`auth:${ip}`, { limit: 5,  windowMs: 10 * 60_000 })
      : rateLimit(`api:${ip}`,  { limit: 60, windowMs: 60_000 })

    if (!limit.success) {
      return blockResponse(429, 'Muitas requisições. Tente novamente mais tarde.', Math.ceil((limit.resetAt - Date.now()) / 1000))
    }
  }

  // Verificação de origem para métodos mutáveis (CSRF layer 1: origin check)
  if (CSRF_PROTECTED_METHODS.has(method) && pathname.startsWith('/api/')) {
    const origin = request.headers.get('origin')
    const host   = request.headers.get('host')
    if (origin && host) {
      try {
        const originHost = new URL(origin).host
        if (originHost !== host) return blockResponse(403, 'Origem inválida')
      } catch {
        return blockResponse(403, 'Origem inválida')
      }
    }
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const isPublicPath =
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/trial-expirado') ||
    pathname.startsWith('/financial-demo') ||
    // Chamada server-to-server do Asaas — sem cookie de sessão. Autenticada
    // por token próprio (ver isValidAsaasToken em api/asaas/webhook/route.ts).
    pathname.startsWith('/api/asaas/webhook')

  if (isPublicPath) return addSecurityHeaders(supabaseResponse)

  // getSession() lê o cookie local sem acionar refresh automático — evita o
  // "Refresh Token Not Found" que getUser() lança quando não há sessão válida.
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return addSecurityHeaders(supabaseResponse)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.svg|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
