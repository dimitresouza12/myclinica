import { supabase } from '@/lib/supabase'

// O banco n8n NÃO é acessado diretamente pelo cliente (RLS bloqueia tudo).
// Todo acesso passa pela Edge Function `n8n-data` no projeto n8n, que valida
// o JWT do usuário (banco principal) e deriva o clinic_slug no servidor —
// o cliente nunca informa o slug.
const N8N_FN_URL =
  process.env.NEXT_PUBLIC_N8N_FUNCTIONS_URL ??
  'https://kqwijexdskiilhfxkbvk.supabase.co/functions/v1/n8n-data'

type N8nAction =
  | { action: 'list_chats' }
  | { action: 'update_chat_name'; conversation_id: string; nome: string }
  | { action: 'list_messages_by_conversation'; conversation_id: string }
  | { action: 'list_messages_by_phone'; phone: string }

export async function callN8n<T = unknown>(payload: N8nAction): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Sessão não autenticada')

  const res = await fetch(N8N_FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body?.error ?? `Erro ${res.status} ao acessar dados do WhatsApp`)
  }
  return body as T
}
