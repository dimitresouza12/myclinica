import { supabase } from '@/lib/supabase'
import { callN8n } from '@/lib/supabase-n8n'
import { cleanPhone } from '@/lib/utils'

interface N8nLead {
  phone: string
  nome: string | null
  procedimento: string | null
  data_agendamento: string | null
  status: string | null
}

// Horário de Brasília (UTC-3, sem horário de verão desde 2019).
// A clínica e o bot operam nesse fuso; ancoramos a data explicitamente
// para não depender do fuso do navegador de quem dispara o sync.
const BRT_OFFSET = '-03:00'

function parseN8nDate(raw: string | null): string | null {
  if (!raw) return null
  // Já vem com fuso/ISO explícito (ex.: timestamptz do banco) → confia.
  const iso = new Date(raw)
  if (!isNaN(iso.getTime()) && /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw.trim())) {
    return iso.toISOString()
  }
  // DD/MM/YYYY HH:mm or DD/MM/YYYY — interpreta como horário de Brasília
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/)
  if (m) {
    const yyyy = m[3]
    const mm = m[2].padStart(2, '0')
    const dd = m[1].padStart(2, '0')
    const hh = (m[4] ?? '9').padStart(2, '0')
    const min = (m[5] ?? '0').padStart(2, '0')
    const d = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:00${BRT_OFFSET}`)
    if (!isNaN(d.getTime())) return d.toISOString()
  }
  // Fallback: data sem fuso explícito — assume Brasília.
  if (!isNaN(iso.getTime())) {
    const d = new Date(`${raw.trim().replace(' ', 'T')}${BRT_OFFSET}`)
    return isNaN(d.getTime()) ? iso.toISOString() : d.toISOString()
  }
  return null
}

export async function syncLeadAppointments(clinicId: string, _clinicSlug?: string) {
  // O slug é derivado no servidor pela Edge Function — não enviamos do cliente.
  let allChats: N8nLead[] = []
  try {
    const { data } = await callN8n<{ data: N8nLead[] }>({ action: 'list_chats' })
    allChats = data ?? []
  } catch {
    return
  }
  const leads = allChats.filter(
    (l) => l.status?.toLowerCase() === 'agendado' && l.data_agendamento != null,
  )

  if (!leads.length) return

  const { data: patients } = await supabase
    .from('patients')
    .select('id, phone')
    .eq('clinic_id', clinicId)

  const phoneMap = new Map<string, string>()
  for (const p of patients ?? []) {
    const key = cleanPhone(p.phone)
    if (key) phoneMap.set(key, p.id)
  }

  for (const lead of leads) {
    const key = cleanPhone(lead.phone)
    if (!key) continue

    const scheduledAt = parseN8nDate(lead.data_agendamento)
    if (!scheduledAt) continue

    let patientId = phoneMap.get(key)

    // Auto-create patient if not found
    if (!patientId) {
      const { data: newPatient, error } = await supabase
        .from('patients')
        .insert([{
          clinic_id: clinicId,
          name: lead.nome?.trim() || `Lead ${key}`,
          phone: key,
          is_active: true,
          registration_status: 'approved',
          notes: lead.procedimento ? `Lead WhatsApp — interesse: ${lead.procedimento}` : 'Lead WhatsApp',
        }])
        .select('id')
        .single()

      if (error || !newPatient?.id) continue
      patientId = newPatient.id as string
      phoneMap.set(key, patientId)
    }

    // Skip if appointment already exists for that day
    const datePrefix = scheduledAt.slice(0, 10)
    const { data: existing } = await supabase
      .from('appointments')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('patient_id', patientId)
      .gte('scheduled_at', `${datePrefix}T00:00:00`)
      .lte('scheduled_at', `${datePrefix}T23:59:59`)
      .limit(1)

    if (existing?.length) continue

    const { error: apptErr } = await supabase.from('appointments').insert([{
      clinic_id: clinicId,
      patient_id: patientId,
      procedure_name: lead.procedimento ?? 'Consulta via WhatsApp',
      scheduled_at: scheduledAt,
      duration_minutes: 60,
      status: 'agendado',
      notes: 'Agendado pelo bot WhatsApp',
    }])
    if (apptErr) {
      console.error('[sync-leads] falha ao inserir agendamento:', apptErr.message)
      continue
    }
  }
}
