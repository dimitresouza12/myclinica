// Autenticação das rotas chamadas pelo navegador logado. SÓ NO SERVIDOR.
//
// Aceita o cookie de sessão do Supabase (o que o navegador manda sozinho em fetch same-origin) OU o token Bearer.
// A identidade é sempre confirmada no servidor de autenticação do Supabase (getUser), nunca lida do cookie sem
// verificar. A clínica vem SEMPRE da linha do usuário em clinic_users, nunca do corpo da requisição.

import { NextResponse } from 'next/server'
import { createServerClient, parseCookieHeader } from '@supabase/ssr'
import { getAdminClient } from '@/lib/supabaseAdmin'

export interface SessionCtx {
  userId: string
  clinicId: string
  role: string | null
  isSuperadmin: boolean
  displayName: string | null
  email: string | null
}

/** Id do usuário logado (cookie ou Bearer), ou null. */
export async function getSessionUser(req: Request): Promise<{ id: string; email: string | null } | null> {
  const header = req.headers.get('authorization')
  if (header?.startsWith('Bearer ')) {
    const { data: { user }, error } = await getAdminClient().auth.getUser(header.slice(7))
    return error || !user ? null : { id: user.id, email: user.email ?? null }
  }

  const cookieHeader = req.headers.get('cookie')
  if (!cookieHeader) return null
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(cookieHeader).map(c => ({ name: c.name, value: c.value ?? '' }))
        },
        // Rota de API só lê a sessão; a renovação do cookie fica a cargo do middleware.
        setAll() {},
      },
    },
  )
  const { data: { user }, error } = await supabase.auth.getUser()
  return error || !user ? null : { id: user.id, email: user.email ?? null }
}

/** Usuário logado + a clínica dele (linha ativa em clinic_users). 401 sem sessão, 403 sem vínculo ativo. */
export async function requireSession(req: Request): Promise<SessionCtx | NextResponse> {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: row, error } = await getAdminClient()
    .from('clinic_users')
    .select('clinic_id, role, is_superadmin, display_name')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (error) {
    console.error('[sessionAuth] clinic_users', error.code ?? '', error.message)
    return NextResponse.json({ error: 'Não foi possível validar o acesso.' }, { status: 500 })
  }
  if (!row?.clinic_id) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  return {
    userId: user.id,
    clinicId: row.clinic_id as string,
    role: (row.role as string | null) ?? null,
    isSuperadmin: row.is_superadmin === true,
    displayName: (row.display_name as string | null) ?? null,
    email: user.email,
  }
}

/** Como requireSession, mas só admin da clínica ou superadmin. */
export async function requireClinicAdminSession(req: Request): Promise<SessionCtx | NextResponse> {
  const ctx = await requireSession(req)
  if (ctx instanceof NextResponse) return ctx
  if (ctx.role !== 'admin' && !ctx.isSuperadmin) {
    return NextResponse.json({ error: 'Somente o administrador da clínica pode fazer isto.' }, { status: 403 })
  }
  return ctx
}
