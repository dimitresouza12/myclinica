import { NextResponse } from 'next/server'
import { requireClinicAdmin } from '@/lib/whatsapp/auth'
import { rejectIfDemo } from '@/lib/demoGuard'
import { stopConnection } from '@/lib/whatsapp/connection'
import { failure } from '../_shared'

export async function POST(req: Request) {
  const ctx = await requireClinicAdmin(req)
  if (ctx instanceof NextResponse) return ctx
  const demo = await rejectIfDemo(ctx.clinicId)
  if (demo) return demo
  try {
    return NextResponse.json(await stopConnection(ctx.clinicId))
  } catch (e) {
    return failure(e)
  }
}
