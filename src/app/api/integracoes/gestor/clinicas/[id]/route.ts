import { getAdminClient } from '@/lib/supabaseAdmin'
import { demoClinicIds } from '@/lib/demoGuard'
import {
  CLINIC_COLUMNS,
  UUID_RE,
  authenticateGestor,
  buildAuditRow,
  buildClinicUpdate,
  gestorError,
  gestorJson,
  mapClinicRow,
  requestMeta,
  validateClinicPatch,
  type ClinicPatchBase,
  type ClinicRow,
} from '@/lib/gestorIntegration'

type Ctx = { params: Promise<{ id: string }> }

async function countFor(table: 'clinic_users' | 'patients', clinicId: string): Promise<number> {
  const { count, error } = await getAdminClient()
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
  if (error) throw new Error(`contagem de ${table}: ${error.message}`)
  return count ?? 0
}

export async function GET(req: Request, { params }: Ctx) {
  const denied = authenticateGestor(req)
  if (denied) return denied

  const { id } = await params
  if (!UUID_RE.test(id)) return gestorError('Clínica não encontrada.', 404)

  try {
    const admin = getAdminClient()
    const { data: clinic, error } = await admin
      .from('clinics')
      .select(CLINIC_COLUMNS)
      .eq('id', id)
      .maybeSingle()
    if (error) {
      console.error('[gestor/clinicas/:id GET] consulta falhou:', error.message)
      return gestorError('Erro ao buscar clínica.', 500)
    }
    if (!clinic) return gestorError('Clínica não encontrada.', 404)

    const [users, patientsCount] = await Promise.all([
      admin
        .from('clinic_users')
        .select('id, display_name, email, role, is_active')
        .eq('clinic_id', id)
        .order('display_name', { ascending: true }),
      countFor('patients', id),
    ])
    if (users.error) {
      console.error('[gestor/clinicas/:id GET] usuários falhou:', users.error.message)
      return gestorError('Erro ao buscar usuários da clínica.', 500)
    }

    const userList = (users.data ?? []).map(u => ({
      id: u.id as string,
      displayName: (u.display_name as string | null) ?? '',
      email: (u.email as string | null) ?? '',
      role: u.role as string,
      isActive: (u.is_active as boolean | null) ?? true,
    }))

    const isDemo = (await demoClinicIds([id])).has(id)
    return gestorJson({
      clinic: mapClinicRow(clinic as unknown as ClinicRow, userList.length, patientsCount, isDemo),
      users: userList,
    })
  } catch (err) {
    console.error('[gestor/clinicas/:id GET] erro inesperado:', err instanceof Error ? err.message : err)
    return gestorError('Erro interno.', 500)
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const denied = authenticateGestor(req)
  if (denied) return denied

  const { id } = await params
  if (!UUID_RE.test(id)) return gestorError('Clínica não encontrada.', 404)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return gestorError('Corpo da requisição não é um JSON válido.', 400)
  }
  const parsed = validateClinicPatch(body)
  if (!parsed.ok) return gestorError(parsed.error, 400)

  try {
    const admin = getAdminClient()
    const { data: current, error: readErr } = await admin
      .from('clinics')
      .select(`${CLINIC_COLUMNS}, asaas_subscription_id`)
      .eq('id', id)
      .maybeSingle()
    if (readErr) {
      console.error('[gestor/clinicas/:id PATCH] leitura falhou:', readErr.message)
      return gestorError('Erro ao buscar clínica.', 500)
    }
    if (!current) return gestorError('Clínica não encontrada.', 404)

    const plan = buildClinicUpdate(current as unknown as ClinicPatchBase, parsed.value)

    let row = current as unknown as ClinicRow
    if (plan.changed.length > 0) {
      const { data: updated, error: updErr } = await admin
        .from('clinics')
        .update(plan.update)
        .eq('id', id)
        .select(CLINIC_COLUMNS)
        .single()
      if (updErr || !updated) {
        console.error('[gestor/clinicas/:id PATCH] update falhou:', updErr?.message)
        return gestorError('Erro ao atualizar clínica.', 500)
      }
      row = updated as unknown as ClinicRow

      const meta = requestMeta(req)
      const { error: auditErr } = await admin.from('audit_logs').insert(
        buildAuditRow({ clinicId: id, changed: plan.changed, before: plan.before, after: plan.after, ip: meta.ip, userAgent: meta.userAgent }),
      )
      if (auditErr) {
        // A alteração já foi aplicada; não desfaz, mas a falha precisa ficar visível
        console.error('[gestor/clinicas/:id PATCH] audit_logs falhou:', auditErr.message)
        plan.warnings.push('A alteração foi aplicada, mas o registro em audit_logs falhou.')
      }
    }

    const [usersCount, patientsCount] = await Promise.all([countFor('clinic_users', id), countFor('patients', id)])
    // só leitura, para a resposta ter o mesmo formato do GET; o PATCH continua sem poder alterar demoMode
    const isDemo = (await demoClinicIds([id])).has(id)
    return gestorJson({ clinic: mapClinicRow(row, usersCount, patientsCount, isDemo), warnings: plan.warnings })
  } catch (err) {
    console.error('[gestor/clinicas/:id PATCH] erro inesperado:', err instanceof Error ? err.message : err)
    return gestorError('Erro interno.', 500)
  }
}
