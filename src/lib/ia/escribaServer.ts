// IA escriba: parte que só roda no servidor (banco, auditoria). Nada aqui conhece provedor de LLM nem
// chave: isso fica atrás de src/lib/ia/provider.ts e da config remota (src/lib/ia/config.ts).
// Nada aqui pode ser importado por componente 'use client'.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '@/lib/supabaseAdmin'

/** Postgres: undefined_column (PostgREST repassa o código quando a coluna não existe). */
const UNDEFINED_COLUMN = '42703'

export interface ClinicIaInfo {
  plan: string | null
  clinicType: string | null
  specialties: string[]
  /** consentimento explícito da clínica; sem a coluna no banco = false */
  consent: boolean
  /** false = migração do consentimento ainda não aplicada */
  consentSupported: boolean
}

/** Plano, áreas e consentimento da clínica. `clinicId` vem da sessão, nunca do corpo. */
export async function loadClinicIaInfo(clinicId: string): Promise<ClinicIaInfo | null> {
  const admin = getAdminClient()
  const base = await admin.from('clinics').select('plan, clinic_type, specialties').eq('id', clinicId).maybeSingle()
  if (base.error || !base.data) {
    if (base.error) console.error('[ia/escriba] leitura da clínica falhou', base.error.code ?? '')
    return null
  }
  const row = base.data as { plan: string | null; clinic_type: string | null; specialties: string[] | null }

  let consent = false
  let consentSupported = true
  const c = await admin.from('clinics').select('ia_escriba_consent').eq('id', clinicId).maybeSingle()
  if (c.error) {
    consentSupported = false
    if (c.error.code !== UNDEFINED_COLUMN) console.error('[ia/escriba] leitura do consentimento falhou', c.error.code ?? '')
  } else {
    consent = (c.data as { ia_escriba_consent?: unknown } | null)?.ia_escriba_consent === true
  }
  return { plan: row.plan, clinicType: row.clinic_type, specialties: row.specialties ?? [], consent, consentSupported }
}

/**
 * Cliente com o token do usuário: as leituras de prontuário passam pela RLS (acesso por profissional,
 * sigilo de psicologia), em vez de usar a service role. Mesmo padrão de requireModulePerm.
 */
export function userScopedClient(req: Request): SupabaseClient | null {
  const header = req.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: header } }, auth: { persistSession: false, autoRefreshToken: false } },
  )
}

export { UNDEFINED_COLUMN }

/**
 * Auditoria de uso em audit_logs (service role). Só metadados: clínica, usuário, área, tamanhos e
 * contagens. NUNCA o texto clínico. Falha de log não derruba o fluxo, mas vai para o log do servidor.
 */
export async function recordEscribaUsage(args: {
  action: 'ia.escriba' | 'ia.escriba_consent' | 'ia.importar_modelo' | 'documentos.modelo_salvo' | 'documentos.modelo_removido'
  clinicId: string
  userId: string
  patientId?: string
  req: Request
  details: Record<string, string | number | boolean>
}): Promise<void> {
  try {
    const ip = args.req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? args.req.headers.get('x-real-ip') ?? null
    const ua = args.req.headers.get('user-agent')
    const { error } = await getAdminClient().from('audit_logs').insert({
      action: args.action,
      module: 'prontuario',
      user_id: args.userId,
      clinic_id: args.clinicId,
      resource_id: args.patientId ?? null,
      ip_address: ip,
      user_agent: ua ? ua.slice(0, 255) : null,
      details: args.details,
    })
    if (error) console.error('[ia/escriba] auditoria não gravada', args.action, error.code ?? '')
  } catch (e) {
    console.error('[ia/escriba] auditoria falhou', args.action, e instanceof Error ? e.name : '')
  }
}
