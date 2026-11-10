import { NextResponse } from 'next/server'
import { requireClinicAdmin } from '@/lib/whatsapp/auth'
import { rejectIfDemo } from '@/lib/demoGuard'
import { startConnection } from '@/lib/whatsapp/connection'
import { failure } from '../_shared'

// Inicia a conexão e devolve o QR (data URL) para a clínica ler no celular.
// Chamar de novo renova o QR, que expira em poucos segundos.
export async function POST(req: Request) {
  const ctx = await requireClinicAdmin(req)
  if (ctx instanceof NextResponse) return ctx
  const demo = await rejectIfDemo(ctx.clinicId)
  if (demo) return demo
  try {
    const result = await startConnection(ctx.clinicId)
    return NextResponse.json(result)
  } catch (e) {
    return failure(e)
  }
}
