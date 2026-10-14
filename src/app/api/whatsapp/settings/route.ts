import { NextResponse } from 'next/server'
import { requireClinicAdmin } from '@/lib/whatsapp/auth'
import { loadSettings, saveSettings } from '@/lib/whatsapp/connection'
import { validateSettings } from '@/lib/whatsapp/settings'
import { failure } from '../_shared'

export async function GET(req: Request) {
  const ctx = await requireClinicAdmin(req)
  if (ctx instanceof NextResponse) return ctx
  try {
    return NextResponse.json(await loadSettings(ctx.clinicId))
  } catch (e) {
    return failure(e)
  }
}

export async function PUT(req: Request) {
  const ctx = await requireClinicAdmin(req)
  if (ctx instanceof NextResponse) return ctx

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 }) }

  const v = validateSettings(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  try {
    const r = await saveSettings(ctx.clinicId, v.value)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json(v.value)
  } catch (e) {
    return failure(e)
  }
}
