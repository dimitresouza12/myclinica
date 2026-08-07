import { supabase } from '@/lib/supabase'

export type AuditAction =
  | 'auth.login'
  | 'auth.logout'
  | 'auth.login_failed'
  | 'auth.mfa_enrolled'
  | 'auth.mfa_verified'
  | 'auth.session_expired'
  | 'auth.password_reset'
  | 'patient.view'
  | 'patient.create'
  | 'patient.update'
  | 'patient.delete'
  | 'patient.export'
  | 'prontuario.view'
  | 'prontuario.update'
  | 'appointment.create'
  | 'appointment.update'
  | 'appointment.delete'
  | 'financial.view'
  | 'financial.create'
  | 'financial.update'
  | 'financial.delete'
  | 'admin.role_change'
  | 'admin.clinic_create'
  | 'admin.clinic_suspend'
  | 'admin.impersonation_start'
  | 'admin.impersonation_stop'
  | 'config.update'
  | 'stock.update'
  | 'stock.movement'
  | 'user.create'
  | 'user.update'
  | 'user.delete'
  | 'user.deactivate'
  | 'user.reactivate'

interface AuditPayload {
  action: AuditAction
  user_id: string
  clinic_id: string
  module: string
  resource_id?: string
  ip_address?: string
  user_agent?: string
  // Dados extras sem PII — nunca incluir cpf, nome, email, telefone
  details?: Record<string, string | number | boolean>
}

// audit() é chamado só de componentes 'use client' (nenhum call site é
// server-side hoje) — reaproveita o cliente autenticado do navegador em vez
// de criar um cliente anônimo à parte, que nunca teria sessão e sempre
// falharia na policy de RLS "actor_id/user_id = auth.uid()" (sem gerar erro
// visível: o catch abaixo engolia a falha).
export async function audit(payload: AuditPayload): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({
      action:      payload.action,
      user_id:     payload.user_id,
      clinic_id:   payload.clinic_id,
      module:      payload.module,
      resource_id: payload.resource_id ?? null,
      ip_address:  payload.ip_address ?? null,
      user_agent:  payload.user_agent ? payload.user_agent.slice(0, 255) : null,
      details:     payload.details ?? null,
    })
  } catch {
    // Nunca deixar falha de log derrubar o fluxo principal
    console.error('[audit] Falha ao registrar log de auditoria:', payload.action)
  }
}

// Helper para extrair IP e user-agent de Request (App Router)
export function extractRequestMeta(req: Request) {
  const ip_address =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  const user_agent = req.headers.get('user-agent') ?? 'unknown'
  return { ip_address, user_agent }
}
