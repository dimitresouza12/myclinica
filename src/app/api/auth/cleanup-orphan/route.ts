import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabaseAdmin'

async function deleteOrphan(userId: string): Promise<{ ok: boolean; reason?: string }> {
  // Segurança: só deleta se não tem clínica E foi criado há menos de 10 minutos
  const { data: clinicUser } = await getAdminClient()
    .from('clinic_users')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (clinicUser) return { ok: false, reason: 'has_clinic' }

  const { data: authUser } = await getAdminClient().auth.admin.getUserById(userId)
  if (!authUser.user) return { ok: false, reason: 'not_found' }

  const ageMs = Date.now() - new Date(authUser.user.created_at).getTime()
  if (ageMs > 10 * 60 * 1000) return { ok: false, reason: 'too_old' }

  await getAdminClient().auth.admin.deleteUser(userId)
  return { ok: true }
}

// Chamado com sessão ativa (RPC falhou após signUp bem-sucedido)
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')

  if (authHeader?.startsWith('Bearer ')) {
    // Caminho autenticado: valida token e extrai userId
    const token = authHeader.slice(7)
    const { data: { user }, error } = await getAdminClient().auth.getUser(token)
    if (error || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }
    const result = await deleteOrphan(user.id)
    return NextResponse.json(result)
  }

  // Caminho não-autenticado: email confirmation ativado, sem sessão
  // Aceita userId diretamente mas com restrições rígidas (sem clínica + criado < 10min)
  const body = await req.json().catch(() => ({}))
  const { userId } = body as { userId?: string }
  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }

  const result = await deleteOrphan(userId)
  return NextResponse.json(result)
}
