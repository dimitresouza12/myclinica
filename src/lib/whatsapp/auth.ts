import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from '@/lib/supabaseAdmin'

export interface ClinicAdminCtx { clinicId: string; userId: string }

/**
 * Autoriza chamadas das rotas de WhatsApp feitas pelo navegador: exige token de
 * sessão (Bearer) e que quem chama seja ADMIN ativo da clínica (ou superadmin).
 *
 * A clínica vem SEMPRE da linha do usuário em clinic_users, nunca do corpo da
 * requisição — um admin não consegue conectar, apagar ou usar o WhatsApp de
 * outra clínica trocando um id no corpo.
 */
export async function requireClinicAdmin(req: Request): Promise<ClinicAdminCtx | NextResponse> {
  const header = req.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const admin = getAdminClient()
  const { data: { user }, error } = await admin.auth.getUser(header.slice(7))
  if (error || !user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: row } = await admin
    .from('clinic_users')
    .select('clinic_id, role, is_superadmin')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!row?.clinic_id || (row.role !== 'admin' && !row.is_superadmin)) {
    return NextResponse.json({ error: 'Somente o administrador da clínica pode gerenciar o WhatsApp' }, { status: 403 })
  }
  return { clinicId: row.clinic_id as string, userId: user.id }
}

export interface ModuleCtx extends ClinicAdminCtx { userName: string }

/**
 * Autoriza quem tem permissão no módulo (ver ou editar): admin e superadmin sempre; os demais pela
 * função do banco `has_module_perm`, chamada com o token do usuário. É a mesma regra que o resto do
 * app usa, sem duplicar a lógica aqui. A clínica vem SEMPRE do usuário logado, nunca do corpo.
 */
export async function requireModulePerm(req: Request, module: string, needEdit: boolean): Promise<ModuleCtx | NextResponse> {
  const header = req.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  const token = header.slice(7)

  const admin = getAdminClient()
  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: row } = await admin
    .from('clinic_users')
    .select('clinic_id, role, is_superadmin, display_name')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (!row?.clinic_id) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  if (row.role !== 'admin' && !row.is_superadmin) {
    const asUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } },
    )
    const { data: allowed } = await asUser.rpc('has_module_perm', { p_module: module, p_need_edit: needEdit })
    if (allowed !== true) {
      return NextResponse.json({ error: 'Você não tem permissão para isso.' }, { status: 403 })
    }
  }
  return { clinicId: row.clinic_id as string, userId: user.id, userName: (row.display_name as string | null) ?? 'Equipe' }
}

/** Quem pode EDITAR a Agenda (botão "Enviar confirmação agora"). */
export function requireAgendaEditor(req: Request): Promise<ModuleCtx | NextResponse> {
  return requireModulePerm(req, 'agenda', true)
}
