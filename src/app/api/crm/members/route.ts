import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabaseAdmin'
import { requireModulePerm } from '@/lib/whatsapp/auth'

// Quem da equipe pode ser responsável por um lead. O navegador não consegue listar a equipe
// (a política de clinic_users só mostra a própria linha a quem não é admin), então a lista sai daqui.
// A clínica vem do usuário logado; basta poder VER o CRM. Só nome e id: nada de e-mail.
export async function GET(req: Request) {
  const ctx = await requireModulePerm(req, 'crm', false)
  if (ctx instanceof NextResponse) return ctx

  const { data, error } = await getAdminClient()
    .from('clinic_users')
    .select('user_id, display_name, role')
    .eq('clinic_id', ctx.clinicId)
    .eq('is_active', true)
    .eq('is_superadmin', false)
    .order('display_name', { ascending: true })
  if (error) {
    console.error('[crm/members]', error.message)
    return NextResponse.json({ error: 'Não foi possível carregar a equipe.' }, { status: 500 })
  }

  const members = (data ?? [])
    .filter(m => m.user_id)
    .map(m => ({ userId: m.user_id as string, name: ((m.display_name as string | null)?.trim() || 'Sem nome') }))
  return NextResponse.json({ members })
}
