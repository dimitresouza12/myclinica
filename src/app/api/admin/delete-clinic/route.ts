import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabaseAdmin'

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const admin = getAdminClient()
  const token = authHeader.slice(7)
  const { data: { user }, error: authError } = await admin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })
  }

  const { data: callerRow } = await admin
    .from('clinic_users')
    .select('is_superadmin')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (!callerRow?.is_superadmin) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { clinicId } = await req.json().catch(() => ({}))
  if (!clinicId || typeof clinicId !== 'string') {
    return NextResponse.json({ error: 'clinicId obrigatório' }, { status: 400 })
  }

  // Coleta os usuários da clínica ANTES de apagar (a exclusão da clínica
  // já cascateia clinic_users, então precisamos dos IDs primeiro)
  const { data: clinicUsers } = await admin
    .from('clinic_users')
    .select('user_id, is_superadmin')
    .eq('clinic_id', clinicId)

  const { error: deleteError } = await admin.from('clinics').delete().eq('id', clinicId)
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  // Apaga as contas de login (Supabase Auth) dos usuários dessa clínica,
  // exceto superadmins (nunca apagar um superadmin por engano)
  const authResults: { userId: string; ok: boolean; reason?: string }[] = []
  for (const cu of clinicUsers ?? []) {
    if (cu.is_superadmin) {
      authResults.push({ userId: cu.user_id, ok: false, reason: 'superadmin_skipped' })
      continue
    }
    const { error } = await admin.auth.admin.deleteUser(cu.user_id)
    authResults.push({ userId: cu.user_id, ok: !error, reason: error?.message })
  }

  return NextResponse.json({ ok: true, authUsersDeleted: authResults })
}
