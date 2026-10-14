// Mantém o funil em dia com a agenda e com o silêncio. Só no servidor (service role).
//
// As mensagens movem o lead na hora (webhook). Esta rotina cuida do resto, sem ninguém apertar nada:
//  1. liga ao paciente os leads cujo telefone já foi cadastrado como paciente (inclusive pela recepção);
//  2. aplica o que a agenda do paciente diz (Agendado, Compareceu, volta para Em conversa);
//  3. perde os leads que ficaram 30 dias sem sinal.
// Roda no agendador (a cada ~5 min, todas as clínicas) e quando alguém abre o CRM (só a clínica dela).
// É idempotente: rodar duas vezes seguidas não muda nada na segunda.

import { getAdminClient } from '@/lib/supabaseAdmin'
import { phoneKeys } from '../whatsapp/phone'
import { hasUpcomingAppointment, idleToLost, stageFromAppointments, type ApptFact, type StageChange } from './automation'
import type { Stage } from './model'

interface LeadRow {
  id: string
  stage: Stage
  stage_changed_at: string
  stage_source: 'manual' | 'auto'
  next_contact_at: string | null
  phone_key: string | null
  patient_id: string | null
}

export interface SyncResult { linked: number; moved: number }

const CHUNK = 150

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export async function syncClinicLeads(clinicId: string, now = new Date()): Promise<SyncResult> {
  const admin = getAdminClient()
  const result: SyncResult = { linked: 0, moved: 0 }

  // Compareceu não volta atrás, então só vale olhar o resto
  const { data: leadsData } = await admin.from('crm_leads')
    .select('id, stage, stage_changed_at, stage_source, next_contact_at, phone_key, patient_id')
    .eq('clinic_id', clinicId)
    .neq('stage', 'compareceu')
    .limit(2000)
  const leads = (leadsData ?? []) as LeadRow[]
  if (leads.length === 0) return result

  // 1. paciente com o mesmo telefone
  const unlinked = leads.filter(l => !l.patient_id && l.phone_key && !l.phone_key.startsWith('lid:') && !l.phone_key.startsWith('raw:'))
  if (unlinked.length > 0) {
    const { data: patients } = await admin.from('patients').select('id, phone')
      .eq('clinic_id', clinicId).eq('is_active', true).not('phone', 'is', null).limit(20000)
    const byKey = new Map<string, string>()
    for (const p of patients ?? []) {
      for (const k of phoneKeys(p.phone as string)) if (!byKey.has(k)) byKey.set(k, p.id as string)
    }
    for (const l of unlinked) {
      const pid = byKey.get(l.phone_key as string)
      if (!pid) continue
      const { error } = await admin.from('crm_leads').update({ patient_id: pid }).eq('id', l.id).is('patient_id', null)
      if (!error) { l.patient_id = pid; result.linked++ }
    }
  }

  // 2. agenda dos pacientes ligados
  const apptsByPatient = new Map<string, ApptFact[]>()
  const patientIds = [...new Set(leads.map(l => l.patient_id).filter((x): x is string => !!x))]
  for (const ids of chunks(patientIds)) {
    const { data } = await admin.from('appointments').select('patient_id, status, scheduled_at, created_at')
      .eq('clinic_id', clinicId).in('patient_id', ids)
    for (const a of data ?? []) {
      const list = apptsByPatient.get(a.patient_id as string) ?? []
      list.push({ status: a.status as string, scheduled_at: a.scheduled_at as string, created_at: a.created_at as string })
      apptsByPatient.set(a.patient_id as string, list)
    }
  }

  // 3. última mensagem do contato (para o silêncio)
  const lastInbound = new Map<string, string | null>()
  const openKeys = leads.filter(l => (l.stage === 'novo' || l.stage === 'em_conversa') && l.phone_key).map(l => l.phone_key as string)
  for (const keys of chunks(openKeys)) {
    const { data } = await admin.from('whatsapp_conversations').select('phone_key, last_inbound_at')
      .eq('clinic_id', clinicId).in('phone_key', keys)
    for (const c of data ?? []) lastInbound.set(c.phone_key as string, (c.last_inbound_at as string | null) ?? null)
  }

  for (const lead of leads) {
    const appts = lead.patient_id ? apptsByPatient.get(lead.patient_id) ?? [] : []
    let change: StageChange | null = stageFromAppointments(lead, appts, now)
    if (!change) {
      change = idleToLost(lead, lead.phone_key ? lastInbound.get(lead.phone_key) ?? null : null, hasUpcomingAppointment(appts, now), now)
    }
    if (!change) continue

    // o UPDATE confere a etapa lida: se alguém moveu o cartão agora há pouco, não sobrescreve
    const { data: moved } = await admin.from('crm_leads')
      .update({ stage: change.stage, stage_source: 'auto', stage_note: change.note, lost_reason: change.stage === 'perdido' ? change.lostReason ?? null : null })
      .eq('id', lead.id).eq('stage', lead.stage).select('id')
    if (moved && moved.length > 0) result.moved++
  }
  return result
}

/** Todas as clínicas que têm leads em aberto. Usado pelo agendador. */
export async function syncAllClinics(budgetMs = 4 * 60_000): Promise<{ clinics: number; linked: number; moved: number; skipped: number }> {
  const started = Date.now()
  const { data } = await getAdminClient().from('crm_leads').select('clinic_id').neq('stage', 'compareceu').limit(20000)
  const clinicIds = [...new Set((data ?? []).map(r => r.clinic_id as string))]

  const total = { clinics: 0, linked: 0, moved: 0, skipped: 0 }
  for (const id of clinicIds) {
    if (Date.now() - started > budgetMs) { total.skipped = clinicIds.length - total.clinics; break }
    try {
      const r = await syncClinicLeads(id)
      total.linked += r.linked
      total.moved += r.moved
    } catch (e) {
      console.error('[crm/sync]', id, e instanceof Error ? e.message : e)
    }
    total.clinics++
  }
  return total
}
