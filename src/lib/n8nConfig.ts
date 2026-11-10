// Endereço dos webhooks n8n (Edge Functions do projeto n8n). Compartilhado entre o cliente
// (supabase-n8n.ts) e as rotas de servidor que repassam disparos depois de checar a clínica.
export const N8N_WEBHOOK_BASE =
  process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL ??
  'https://kqwijexdskiilhfxkbvk.supabase.co/functions/v1'
