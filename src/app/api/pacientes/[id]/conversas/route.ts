import { NextResponse } from 'next/server'
import { requireModulePerm } from '@/lib/whatsapp/auth'
import { getAdminClient } from '@/lib/supabaseAdmin'
import { rateLimit } from '@/lib/rateLimit'
import { patientPhoneKeys, selectPatientConversations, primaryConversation } from '@/lib/conversas/match'
import { clampLimit, parseCursor, isMissingTable } from '@/lib/conversas/messages'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const MSG_COLS = 'id, conversation_id, direction, kind, body, origin, sent_by_name, created_at, media_status, media_name, media_size, delivery_status, deleted_at, edited_at'

// Conversas de WhatsApp de UM paciente (aba "Conversas" do prontuário). Somente leitura.
// Acesso: quem pode VER o módulo CRM (a mesma permissão da tela Mensagens): atendimento e admin.
// Profissional sem essa permissão recebe 403. A clínica vem do usuário logado; o paciente e as conversas
// são sempre conferidos contra ela. Nada de conteúdo de mensagem vai para log.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireModulePerm(req, 'crm', false)
  if (auth instanceof NextResponse) return auth

  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Paciente inválido.' }, { status: 400 })

  const limit = rateLimit(`pac-conversas:${auth.userId}`, { limit: 60, windowMs: 60_000 })
  if (!limit.success) return NextResponse.json({ error: 'Muitas requisições. Aguarde um instante.' }, { status: 429 })

  const url = new URL(req.url)
  const pageSize = clampLimit(url.searchParams.get('limit'))
  const before = parseCursor(url.searchParams.get('before'))

  const admin = getAdminClient()

  const { data: patient, error: patErr } = await admin.from('patients')
    .select('id, phone').eq('id', id).eq('clinic_id', auth.clinicId).maybeSingle()
  if (patErr) {
    console.error('[pacientes/conversas] paciente', patErr.code)
    return NextResponse.json({ error: 'Não foi possível carregar as conversas.' }, { status: 500 })
  }
  if (!patient) return NextResponse.json({ error: 'Paciente não encontrado.' }, { status: 404 })

  // estado da conexão guardado no banco (sem falar com a Evolution)
  const { data: wa, error: waErr } = await admin.from('clinic_whatsapp')
    .select('status').eq('clinic_id', auth.clinicId).maybeSingle()
  if (waErr && !isMissingTable(waErr)) {
    console.error('[pacientes/conversas] conexao', waErr.code)
    return NextResponse.json({ error: 'Não foi possível carregar as conversas.' }, { status: 500 })
  }
  const connection = (wa?.status as string | undefined) ?? null
  if (connection !== 'conectado') {
    return NextResponse.json({ connection, conversations: [], messages: [], hasMore: false })
  }

  const keys = patientPhoneKeys(patient.phone as string | null)
  let q = admin.from('whatsapp_conversations')
    .select('id, phone_key, patient_id, contact_name, last_message_at')
    .eq('clinic_id', auth.clinicId)
  // chaves só têm dígitos (vêm de phoneKeys): seguras dentro do filtro .or()
  q = keys.length > 0 ? q.or(`patient_id.eq.${id},phone_key.in.(${keys.join(',')})`) : q.eq('patient_id', id)
  const { data: convRows, error: convErr } = await q.limit(20)
  if (convErr) {
    if (isMissingTable(convErr)) return NextResponse.json({ connection, unavailable: true, conversations: [], messages: [], hasMore: false })
    console.error('[pacientes/conversas] conversas', convErr.code)
    return NextResponse.json({ error: 'Não foi possível carregar as conversas.' }, { status: 500 })
  }

  const convs = selectPatientConversations(id, keys, (convRows ?? []) as { id: string; phone_key: string; patient_id: string | null; contact_name: string | null; last_message_at: string }[])
  if (convs.length === 0) return NextResponse.json({ connection, conversations: [], messages: [], hasMore: false })

  let mq = admin.from('whatsapp_messages').select(MSG_COLS)
    .eq('clinic_id', auth.clinicId)
    .in('conversation_id', convs.map(c => c.id))
    .order('created_at', { ascending: false })
    .limit(pageSize + 1)
  if (before) mq = mq.lt('created_at', before)
  const { data: msgs, error: msgErr } = await mq
  if (msgErr) {
    if (isMissingTable(msgErr)) return NextResponse.json({ connection, unavailable: true, conversations: [], messages: [], hasMore: false })
    console.error('[pacientes/conversas] mensagens', msgErr.code)
    return NextResponse.json({ error: 'Não foi possível carregar as conversas.' }, { status: 500 })
  }

  const rows = msgs ?? []
  const hasMore = rows.length > pageSize
  const primary = primaryConversation(convs)
  return NextResponse.json({
    connection,
    conversations: convs.map(c => ({ id: c.id, contactName: c.contact_name, lastMessageAt: c.last_message_at })),
    primaryConversationId: primary?.id ?? null,
    // da mais nova para a mais antiga; o cliente ordena para exibir
    messages: rows.slice(0, pageSize),
    hasMore,
  })
}
