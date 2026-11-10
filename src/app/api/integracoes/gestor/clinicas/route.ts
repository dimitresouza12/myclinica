import { getAdminClient } from '@/lib/supabaseAdmin'
import { demoClinicIds } from '@/lib/demoGuard'
import {
  CLINIC_COLUMNS,
  authenticateGestor,
  buildSearchFilter,
  computedStatusOf,
  gestorError,
  gestorJson,
  mapClinicRow,
  parseListParams,
  type ClinicRow,
} from '@/lib/gestorIntegration'

// Teto de linhas lidas quando há filtro por status (o status é calculado em
// código, não é coluna filtrável). A base tem dezenas de clínicas.
const STATUS_FILTER_SCAN_LIMIT = 2000

type ClinicWithCounts = ClinicRow & {
  clinic_users: { count: number }[] | null
  patients: { count: number }[] | null
}

const SELECT_WITH_COUNTS = `${CLINIC_COLUMNS}, clinic_users(count), patients(count)`

export async function GET(req: Request) {
  const denied = authenticateGestor(req)
  if (denied) return denied

  const parsed = parseListParams(new URL(req.url).searchParams)
  if (!parsed.ok) return gestorError(parsed.error, 400)
  const { search, plan, status, limit, offset } = parsed.value

  try {
    // Contagens vêm no mesmo SELECT (agregado embutido do PostgREST, via FK
    // clinic_users.clinic_id / patients.clinic_id): sem N+1.
    let q = getAdminClient()
      .from('clinics')
      .select(SELECT_WITH_COUNTS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })

    const searchFilter = buildSearchFilter(search)
    if (searchFilter) q = q.or(searchFilter)
    if (plan) q = q.eq('plan', plan)

    q = status ? q.range(0, STATUS_FILTER_SCAN_LIMIT - 1) : q.range(offset, offset + limit - 1)

    const { data, count, error } = await q
    if (error) {
      console.error('[gestor/clinicas GET] consulta falhou:', error.message)
      return gestorError('Erro ao listar clínicas.', 500)
    }

    let rows = (data ?? []) as unknown as ClinicWithCounts[]
    let total = count ?? rows.length

    if (status) {
      rows = rows.filter(r => computedStatusOf(r) === status)
      total = rows.length
      rows = rows.slice(offset, offset + limit)
    }

    const demoIds = await demoClinicIds(rows.map(r => r.id))
    const items = rows.map(r => mapClinicRow(r, r.clinic_users?.[0]?.count ?? 0, r.patients?.[0]?.count ?? 0, demoIds.has(r.id)))
    return gestorJson({ total, items })
  } catch (err) {
    console.error('[gestor/clinicas GET] erro inesperado:', err instanceof Error ? err.message : err)
    return gestorError('Erro interno.', 500)
  }
}
