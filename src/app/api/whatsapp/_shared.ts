import { NextResponse } from 'next/server'
import { EvolutionError } from '@/lib/whatsapp/evolution'

/** Erro da Evolution/servidor → resposta em português, sem vazar detalhe interno. */
export function failure(e: unknown): NextResponse {
  if (e instanceof EvolutionError) {
    if (e.status === 503) return NextResponse.json({ error: 'O WhatsApp ainda não está configurado neste servidor.' }, { status: 503 })
    if (e.status === 504) return NextResponse.json({ error: 'O WhatsApp demorou para responder. Tente de novo.' }, { status: 504 })
    return NextResponse.json({ error: 'Não foi possível falar com o WhatsApp agora. Tente de novo em instantes.' }, { status: 502 })
  }
  console.error('[whatsapp]', e instanceof Error ? e.message : e)
  return NextResponse.json({ error: 'Erro interno. Tente de novo.' }, { status: 500 })
}
