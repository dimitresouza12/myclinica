// Cola entre as rotas /api/contrato-clinica e a lógica de server.ts. SÓ NO SERVIDOR.
import { NextResponse } from 'next/server'
import { requireClinicAdminSession } from '@/lib/sessionAuth'
import type { Ctx, Falha } from './server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const isUuid = (v: string) => UUID.test(v)

/** Sessão válida + admin da clínica; a clínica vem do vínculo do usuário, nunca da requisição. */
export async function authContext(req: Request): Promise<Ctx | NextResponse> {
  const s = await requireClinicAdminSession(req)
  if (s instanceof NextResponse) return s
  return { clinicId: s.clinicId, userId: s.userId }
}

export function failResponse(f: Falha): NextResponse {
  return NextResponse.json({ error: f.error, ...(f.extra ?? {}) }, { status: f.status, headers: f.headers })
}

/** Corpo JSON (objeto) ou null quando ausente/inválido. */
export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json()
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export const badId = () => NextResponse.json({ error: 'Contrato inválido.' }, { status: 400 })
export const badBody = () => NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
