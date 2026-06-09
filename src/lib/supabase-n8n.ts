import { supabase } from '@/lib/supabase'

// O banco n8n NÃO é acessado diretamente pelo cliente (RLS bloqueia tudo).
// Todo acesso passa pela Edge Function `n8n-data` no projeto n8n, que valida
// o JWT do usuário (banco principal) e deriva o clinic_slug no servidor —
// o cliente nunca informa o slug.
const N8N_FN_URL =
  process.env.NEXT_PUBLIC_N8N_FUNCTIONS_URL ??
  'https://kqwijexdskiilhfxkbvk.supabase.co/functions/v1/n8n-data'

const N8N_WEBHOOK_BASE =
  process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL ??
  'https://kqwijexdskiilhfxkbvk.supabase.co/functions/v1'

type N8nAction =
  | { action: 'list_chats' }
  | { action: 'update_chat_name'; conversation_id: string; nome: string }
  | { action: 'list_messages_by_conversation'; conversation_id: string }
  | { action: 'list_messages_by_phone'; phone: string }

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sessão não autenticada')
  return token
}

export async function callN8n<T = unknown>(payload: N8nAction): Promise<T>
export async function callN8n<T = unknown>(webhook: string, payload: Record<string, unknown>): Promise<T>
export async function callN8n<T = unknown>(
  payloadOrWebhook: N8nAction | string,
  extraPayload?: Record<string, unknown>
): Promise<T> {
  const token = await getToken()

  if (typeof payloadOrWebhook === 'string') {
    const res = await fetch(`${N8N_WEBHOOK_BASE}/${payloadOrWebhook}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(extraPayload ?? {}),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body?.error ?? `Erro ${res.status}`)
    return body as T
  }

  const res = await fetch(N8N_FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payloadOrWebhook),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error ?? `Erro ${res.status} ao acessar dados do WhatsApp`)
  return body as T
}
