import { NextResponse } from 'next/server'
import { requireClinicAdmin } from '@/lib/whatsapp/auth'
import { getConnection } from '@/lib/whatsapp/connection'
import { failure } from '../_shared'

export async function GET(req: Request) {
  const ctx = await requireClinicAdmin(req)
  if (ctx instanceof NextResponse) return ctx
  try {
    return NextResponse.json(await getConnection(ctx.clinicId))
  } catch (e) {
    return failure(e)
  }
}
