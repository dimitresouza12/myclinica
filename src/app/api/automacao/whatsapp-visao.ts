import type { ConnectionView } from '@/lib/whatsapp/connection'
import { EvolutionError } from '@/lib/whatsapp/evolution'
import { automacaoError } from '@/lib/automacaoIntegration'

/** Telefone mascarado para o painel: só os 4 últimos dígitos. O número inteiro e o nome da instância não saem daqui. */
export function mascararTelefone(phone: string | null): string | null {
  if (!phone) return null
  const d = phone.replace(/\D/g, '')
  return d.length >= 4 ? `••••${d.slice(-4)}`.replace(/•/g, '*') : null
}

export function visaoPublica(v: ConnectionView) {
  return { status: v.status, telefone: mascararTelefone(v.phone), conectadoEm: v.connectedAt, qr: v.qr ?? null }
}

export function erroDoWhatsapp(e: unknown) {
  if (e instanceof EvolutionError) {
    if (e.status === 503) return automacaoError('O WhatsApp ainda não está configurado neste servidor.', 503)
    if (e.status === 504) return automacaoError('O WhatsApp demorou para responder. Tente de novo.', 504)
    return automacaoError('Não foi possível falar com o WhatsApp agora. Tente de novo em instantes.', 502)
  }
  console.error('[automacao/whatsapp]', e instanceof Error ? e.name : 'erro')
  return automacaoError('Erro interno.', 500)
}
