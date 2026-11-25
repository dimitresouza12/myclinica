import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from '@/lib/supabaseAdmin'

// Troca de senha do próprio usuário logado. Roda no servidor para não depender da idade da sessão no navegador
// (o updateUser do cliente exige login recente e falhava para quem fica logado por semanas).
// Confere a senha atual, grava a nova e confirma entrando com ela antes de responder ok.
function anonClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Sessão inválida. Entre de novo.' }, { status: 401 })
  const admin = getAdminClient()
  const { data: { user }, error: userErr } = await admin.auth.getUser(authHeader.slice(7))
  if (userErr || !user?.email) return NextResponse.json({ error: 'Sessão inválida. Entre de novo.' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { atual?: unknown; nova?: unknown }
  const atual = typeof body.atual === 'string' ? body.atual : ''
  const nova = typeof body.nova === 'string' ? body.nova : ''
  if (!atual) return NextResponse.json({ error: 'Informe a senha atual.' }, { status: 400 })
  if (nova.length < 8 || nova.length > 72) return NextResponse.json({ error: 'A nova senha deve ter de 8 a 72 caracteres.' }, { status: 400 })
  if (nova === atual) return NextResponse.json({ error: 'A nova senha precisa ser diferente da atual.' }, { status: 400 })

  const { error: atualErr } = await anonClient().auth.signInWithPassword({ email: user.email, password: atual })
  if (atualErr) return NextResponse.json({ error: 'Senha atual incorreta.' }, { status: 403 })

  const { error: updErr } = await admin.auth.admin.updateUserById(user.id, { password: nova })
  if (updErr) {
    console.error('[auth/alterar-senha] update falhou:', updErr.message)
    return NextResponse.json({ error: 'Não foi possível alterar a senha. Tente novamente.' }, { status: 500 })
  }

  const { error: confirmErr } = await anonClient().auth.signInWithPassword({ email: user.email, password: nova })
  if (confirmErr) {
    console.error('[auth/alterar-senha] confirmação falhou:', confirmErr.message)
    return NextResponse.json({ error: 'A senha não foi gravada. Tente novamente.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
