// Regras do link mágico: validade, estado, URL e mensagem de WhatsApp. Funções puras.

import { waMeNumber } from '@/lib/phoneFormat'
import { SCOPE_LABEL, type PortalScope } from './scopes'

export const TTL_OPTIONS_DAYS = [7, 15, 30] as const
export const DEFAULT_TTL_DAYS = 7
export const MAX_TTL_DAYS = 30
export const MAX_MESSAGE_LENGTH = 1000
export const MAX_DOCS_PER_LINK = 3

export function clampTtlDays(days: unknown): number {
  const n = typeof days === 'number' ? Math.floor(days) : NaN
  if (!Number.isFinite(n) || n < 1) return DEFAULT_TTL_DAYS
  return Math.min(n, MAX_TTL_DAYS)
}

export function computeExpiry(now: Date, ttlDays: number): Date {
  return new Date(now.getTime() + clampTtlDays(ttlDays) * 86_400_000)
}

export type LinkState = 'active' | 'expired' | 'revoked'

export interface LinkTimes { expires_at: string; revoked_at: string | null }

export function linkState(link: LinkTimes, now: Date): LinkState {
  if (link.revoked_at) return 'revoked'
  return new Date(link.expires_at).getTime() > now.getTime() ? 'active' : 'expired'
}

export const LINK_STATE_LABEL: Record<LinkState, string> = { active: 'Ativo', expired: 'Expirado', revoked: 'Revogado' }

/** Origem pública do sistema para montar o link: variável de ambiente se houver, senão a origem da requisição. */
export function publicOrigin(requestOrigin: string, env: Record<string, string | undefined> = process.env): string {
  const configured = env.NEXT_PUBLIC_APP_URL?.trim()
  const base = configured && /^https?:\/\//i.test(configured) ? configured : requestOrigin
  return base.replace(/\/+$/, '')
}

export function portalUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/p/${token}`
}

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? ''
}

/** Texto pronto para o WhatsApp. Nada é enviado sozinho: a clínica abre o wa.me e envia. */
export function buildPortalMessage(args: { patientName: string; clinicName: string; url: string; scopes: readonly PortalScope[]; expiresAt: Date }): string {
  const itens = args.scopes.map(s => `- ${SCOPE_LABEL[s]}`).join('\n')
  const ate = args.expiresAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const nome = primeiroNome(args.patientName)
  return [
    `Olá${nome ? `, ${nome}` : ''}! Aqui é a ${args.clinicName}.`,
    'Preparamos um link seguro e pessoal para você:',
    itens,
    args.url,
    `O link vale até ${ate}. Não compartilhe com outras pessoas.`,
  ].join('\n')
}

/** Link wa.me com o texto pronto; null quando o paciente não tem telefone válido. */
export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const num = waMeNumber(phone)
  return num ? `https://wa.me/${num}?text=${encodeURIComponent(text)}` : null
}
