import { NextResponse } from 'next/server'
import { requireModulePerm } from '@/lib/whatsapp/auth'
import { sendMediaFromInbox } from '@/lib/whatsapp/conversations'
import { checkUpload, checkVoice, MAX_UPLOAD_BYTES, MAX_VOICE_SECONDS } from '@/lib/whatsapp/media'
import { rateLimit } from '@/lib/rateLimit'
import { failure } from '../../_shared'

export const maxDuration = 120

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_CAPTION = 1000
// o corpo do formulário tem o arquivo mais um pouco de cabeçalho
const MAX_BODY_BYTES = MAX_UPLOAD_BYTES + 512 * 1024

// Envia uma imagem ou um documento pela caixa de entrada (multipart: conversationId, file, caption).
// A clínica vem do usuário logado; exige permissão de EDITAR o módulo CRM.
export async function POST(req: Request) {
  const ctx = await requireModulePerm(req, 'crm', true)
  if (ctx instanceof NextResponse) return ctx

  const limit = rateLimit(`wa-inbox-media:${ctx.userId}`, { limit: 15, windowMs: 60_000 })
  if (!limit.success) {
    return NextResponse.json({ error: 'Muitos arquivos em pouco tempo. Aguarde um instante.' }, { status: 429 })
  }

  const declared = Number(req.headers.get('content-length') ?? 0)
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'O arquivo é grande demais. O limite é 16 MB.' }, { status: 413 })
  }

  let form: FormData
  try { form = await req.formData() } catch {
    return NextResponse.json({ error: 'Não foi possível ler o arquivo enviado. Tente de novo.' }, { status: 400 })
  }

  const conversationId = String(form.get('conversationId') ?? '')
  const caption = String(form.get('caption') ?? '').replace(/\r\n/g, '\n').trim()
  const file = form.get('file')

  if (!UUID.test(conversationId)) return NextResponse.json({ error: 'Conversa inválida.' }, { status: 400 })
  if (!(file instanceof File)) return NextResponse.json({ error: 'Escolha um arquivo para enviar.' }, { status: 400 })
  if (caption.length > MAX_CAPTION) return NextResponse.json({ error: `A legenda pode ter até ${MAX_CAPTION} caracteres.` }, { status: 400 })

  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const isVoice = form.get('voice') === '1'
  let target: { name: string; mime: string; kind: 'image' | 'document' | 'audio'; seconds: number | null }
  if (isVoice) {
    const v = checkVoice({ size: file.size, head })
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    const seconds = Number(form.get('seconds'))
    target = { name: 'audio', mime: v.mime, kind: 'audio', seconds: Number.isFinite(seconds) && seconds > 0 ? Math.min(Math.round(seconds), MAX_VOICE_SECONDS) : null }
  } else {
    const c = checkUpload({ name: file.name, size: file.size, head })
    if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 })
    target = { name: c.name, mime: c.mime, kind: c.kind, seconds: null }
  }

  try {
    const r = await sendMediaFromInbox({
      clinicId: ctx.clinicId, conversationId, userId: ctx.userId, userName: ctx.userName,
      bytes: Buffer.from(await file.arrayBuffer()), caption: isVoice ? '' : caption, ...target,
    })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return failure(e)
  }
}
