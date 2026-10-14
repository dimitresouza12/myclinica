import { NextResponse } from 'next/server'
import { requireModulePerm } from '@/lib/whatsapp/auth'
import { signedMediaUrl } from '@/lib/whatsapp/media-store'
import { getAdminClient } from '@/lib/supabaseAdmin'
import { rateLimit } from '@/lib/rateLimit'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_IDS = 60

// Links temporários (poucos minutos) dos arquivos de uma conversa. Uma chamada só para a conversa inteira,
// para não estourar o limite de requisições. Exige permissão de VER o módulo CRM; só devolve mensagens da
// clínica de quem pede. Com `download: true` o link baixa o arquivo com o nome original.
export async function POST(req: Request) {
  const ctx = await requireModulePerm(req, 'crm', false)
  if (ctx instanceof NextResponse) return ctx

  const limit = rateLimit(`wa-media-urls:${ctx.userId}`, { limit: 30, windowMs: 60_000 })
  if (!limit.success) return NextResponse.json({ error: 'Muitas requisições. Aguarde um instante.' }, { status: 429 })

  let body: { messageIds?: unknown; download?: unknown } = {}
  try { body = await req.json() } catch { /* corpo inválido */ }
  const ids = Array.isArray(body.messageIds) ? body.messageIds.filter((x): x is string => typeof x === 'string' && UUID.test(x)).slice(0, MAX_IDS) : []
  if (ids.length === 0) return NextResponse.json({ urls: {} })
  const download = body.download === true

  const { data } = await getAdminClient().from('whatsapp_messages')
    .select('id, media_path, media_name, kind')
    .in('id', ids).eq('clinic_id', ctx.clinicId).eq('media_status', 'ready')

  const urls: Record<string, string> = {}
  await Promise.all((data ?? []).map(async row => {
    if (!row.media_path) return
    const name = download ? ((row.media_name as string | null) ?? 'arquivo') : undefined
    const url = await signedMediaUrl(row.media_path as string, name)
    if (url) urls[row.id as string] = url
  }))
  return NextResponse.json({ urls })
}
