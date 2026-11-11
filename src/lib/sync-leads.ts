import { supabase } from '@/lib/supabase'
import { callN8n } from '@/lib/supabase-n8n'
import { cleanPhone } from '@/lib/utils'
import { brasilDayRange, hojeBrasil } from '@/lib/brasilDate'
import { parseN8nDate } from '@/lib/n8nDate'

interface N8nLead {
  phone: string
  nome: string | null
  procedimento: string | null
  data_agendamento: string | null
  status: string | null
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

    // Skip if appointment already exists for that day. O dia é o de Brasília: fatiar o ISO em UTC
    // (scheduledAt.slice(0, 10)) joga as consultas depois das 21h para o dia seguinte e erra a conferência.
    const dayRange = brasilDayRange(hojeBrasil(new Date(scheduledAt)))
    if (!dayRange) continue
    const { data: existing } = await supabase
      .from('appointments')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('patient_id', patientId)
      .gte('scheduled_at', dayRange.start)
      .lte('scheduled_at', dayRange.end)
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
