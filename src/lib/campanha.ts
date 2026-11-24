// Campanha de contrato da MyClinica. Constante única: o servidor decide a data da primeira cobrança aqui,
// nunca com base no que o navegador manda.
//
// Dentro da janela, a primeira cobrança é fixa em CAMPANHA_CONTRATO.firstDueDate. Fora dela, a primeira
// cobrança é o fim do teste da clínica (trial_ends_at).

import { hojeBrasil } from '@/lib/brasilDate'

export const CAMPANHA_CONTRATO = {
  /** Último instante da janela: 2026-12-15 23:59:59.999 em America/Fortaleza (UTC-3 o ano todo, sem horário de verão). */
  endsAt: '2026-12-15T23:59:59.999-03:00',
  /** Primeira cobrança de quem assina dentro da janela. */
  firstDueDate: '2027-01-15',
} as const

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export function campanhaAtiva(now: Date = new Date()): boolean {
  return now.getTime() <= new Date(CAMPANHA_CONTRATO.endsAt).getTime()
}

/** Dia (AAAA-MM-DD) do instante no fuso de Brasília/Fortaleza (mesmo offset). */
function diaLocal(iso: string | Date | null | undefined): string | null {
  if (!iso) return null
  const d = iso instanceof Date ? iso : new Date(iso)
  return Number.isNaN(d.getTime()) ? null : hojeBrasil(d)
}

/**
 * Data da primeira cobrança (AAAA-MM-DD).
 * - Dentro da campanha: 2027-01-15.
 * - Fora: o dia em que o teste termina (trial_ends_at). Se o teste já terminou ou a clínica não tem
 *   trial_ends_at, vale hoje (o Asaas não aceita vencimento no passado).
 */
export function firstDueDateFor(trialEndsAt: string | Date | null | undefined, now: Date = new Date()): string {
  if (campanhaAtiva(now)) return CAMPANHA_CONTRATO.firstDueDate
  const hoje = hojeBrasil(now)
  const fim = diaLocal(trialEndsAt)
  if (!fim || !DAY_RE.test(fim)) return hoje
  return fim < hoje ? hoje : fim
}
