// Estado da conexão WhatsApp de uma clínica: junta a tabela clinic_whatsapp (o que o
// MyClinica sabe) com a Evolution (o que realmente está conectado). Só no servidor.

import { getAdminClient } from '@/lib/supabaseAdmin'
import { rowToSettings, settingsToRow, DEFAULT_SETTINGS, type WhatsAppSettings, type SettingsRow } from './settings'
import {
  instanceNameFor, createInstance, connectInstance, connectionState, connectedNumber, removeInstance, setWebhook,
} from './evolution'

export type ConnStatus = 'desconectado' | 'aguardando_qr' | 'conectado'

export interface ConnectionView {
  status: ConnStatus
  phone: string | null
  connectedAt: string | null
  qr?: string | null
}

interface Row {
  clinic_id: string
  instance_name: string
  status: ConnStatus
  phone_number: string | null
  connected_at: string | null
}

const COLS = 'clinic_id, instance_name, status, phone_number, connected_at'
const SETTINGS_COLS = 'confirm_enabled, confirm_mode, vespera_send_time, no_dia_hours_before, send_window_start, send_window_end, late_booking_policy, timezone, message_template, reply_yes_text, reply_no_text'

async function loadRow(clinicId: string): Promise<Row | null> {
  const { data } = await getAdminClient().from('clinic_whatsapp').select(COLS).eq('clinic_id', clinicId).maybeSingle()
  return (data as Row | null) ?? null
}

export async function ensureRow(clinicId: string): Promise<Row> {
  const existing = await loadRow(clinicId)
  if (existing) return existing
  const { data, error } = await getAdminClient()
    .from('clinic_whatsapp')
    .upsert({ clinic_id: clinicId, instance_name: instanceNameFor(clinicId) }, { onConflict: 'clinic_id', ignoreDuplicates: true })
    .select(COLS)
    .maybeSingle()
  if (error) throw new Error('Não foi possível preparar a conexão')
  return (data as Row | null) ?? (await loadRow(clinicId))!
}

async function setStatus(clinicId: string, patch: Partial<Pick<Row, 'status' | 'phone_number' | 'connected_at'>>) {
  await getAdminClient()
    .from('clinic_whatsapp')
    .update({ ...patch, status_changed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('clinic_id', clinicId)
}

const view = (r: Pick<Row, 'status' | 'phone_number' | 'connected_at'>, qr?: string | null): ConnectionView => ({
  status: r.status,
  phone: r.phone_number,
  connectedAt: r.connected_at,
  ...(qr !== undefined ? { qr } : {}),
})

/** Estado atual, conferido na Evolution quando a clínica está conectada ou conectando. */
export async function getConnection(clinicId: string): Promise<ConnectionView> {
  const row = await loadRow(clinicId)
  if (!row || row.status === 'desconectado') return { status: 'desconectado', phone: null, connectedAt: null }

  const state = await connectionState(row.instance_name)

  if (state === null) {
    await setStatus(clinicId, { status: 'desconectado', phone_number: null, connected_at: null })
    return { status: 'desconectado', phone: null, connectedAt: null }
  }

  if (state === 'open') {
    if (row.status === 'conectado') return view(row)
    const phone = await connectedNumber(row.instance_name).catch(() => null)
    const connectedAt = new Date().toISOString()
    await setStatus(clinicId, { status: 'conectado', phone_number: phone, connected_at: connectedAt })
    return { status: 'conectado', phone, connectedAt }
  }

  if (state === 'close' && row.status === 'conectado') {
    // sessão caiu (celular desconectou o aparelho, ficou offline demais…)
    await setStatus(clinicId, { status: 'desconectado', phone_number: null, connected_at: null })
    return { status: 'desconectado', phone: null, connectedAt: null }
  }

  if (row.status !== 'aguardando_qr') await setStatus(clinicId, { status: 'aguardando_qr' })
  return { status: 'aguardando_qr', phone: null, connectedAt: null }
}

/**
 * Registra o webhook na instância. Só quando WHATSAPP_WEBHOOK_URL e WHATSAPP_WEBHOOK_TOKEN
 * estão definidos: em desenvolvimento local fica sem, para a Evolution não apontar para localhost.
 */
async function ensureWebhook(instanceName: string): Promise<void> {
  const url = process.env.WHATSAPP_WEBHOOK_URL
  const token = process.env.WHATSAPP_WEBHOOK_TOKEN
  if (!url || !token) return
  try {
    await setWebhook(instanceName, url, token)
  } catch (e) {
    // sem webhook as respostas do paciente não chegam; a conexão em si segue funcionando
    console.warn('[whatsapp] não foi possível registrar o webhook da instância', e instanceof Error ? e.message : e)
  }
}

/** Inicia (ou retoma) a conexão e devolve o QR para a clínica ler no celular. */
export async function startConnection(clinicId: string): Promise<ConnectionView> {
  const row = await ensureRow(clinicId)
  const state = await connectionState(row.instance_name)

  if (state === 'open') return getConnection(clinicId) // já conectada

  const { qr } = state === null
    ? await createInstance(row.instance_name)
    : await connectInstance(row.instance_name)

  await ensureWebhook(row.instance_name)
  await setStatus(clinicId, { status: 'aguardando_qr', phone_number: null, connected_at: null })
  return { status: 'aguardando_qr', phone: null, connectedAt: null, qr }
}

/** Desconecta do WhatsApp e apaga a instância. */
export async function stopConnection(clinicId: string): Promise<ConnectionView> {
  const row = await loadRow(clinicId)
  if (row) {
    await removeInstance(row.instance_name)
    await setStatus(clinicId, { status: 'desconectado', phone_number: null, connected_at: null })
  }
  return { status: 'desconectado', phone: null, connectedAt: null }
}

/** Nome da instância da clínica, só se estiver conectada de verdade. */
export async function connectedInstanceFor(clinicId: string): Promise<string | null> {
  const c = await getConnection(clinicId)
  if (c.status !== 'conectado') return null
  return (await loadRow(clinicId))?.instance_name ?? null
}

/** Reconcilia o estado de uma clínica a partir do nome da instância (usado pelo webhook). */
export async function getConnectionByInstance(instanceName: string): Promise<void> {
  const { data } = await getAdminClient().from('clinic_whatsapp').select('clinic_id').eq('instance_name', instanceName).maybeSingle()
  if (data?.clinic_id) await getConnection(data.clinic_id as string)
}

/** Configuração da confirmação (padrões, se a clínica ainda não tem linha). */
export async function loadSettings(clinicId: string): Promise<WhatsAppSettings> {
  const { data } = await getAdminClient().from('clinic_whatsapp').select(SETTINGS_COLS).eq('clinic_id', clinicId).maybeSingle()
  return data ? rowToSettings(data as SettingsRow) : DEFAULT_SETTINGS
}

/** Grava a configuração já validada. Ligar a confirmação exige WhatsApp conectado. */
export async function saveSettings(clinicId: string, s: WhatsAppSettings): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (s.confirmEnabled) {
    const c = await getConnection(clinicId)
    if (c.status !== 'conectado') {
      return { ok: false, status: 409, error: 'Conecte o WhatsApp da clínica antes de ligar a confirmação automática.' }
    }
  }
  await ensureRow(clinicId)
  const { error } = await getAdminClient()
    .from('clinic_whatsapp')
    .update({ ...settingsToRow(s), updated_at: new Date().toISOString() })
    .eq('clinic_id', clinicId)
  if (error) return { ok: false, status: 500, error: 'Não foi possível salvar. Tente de novo.' }
  return { ok: true }
}
