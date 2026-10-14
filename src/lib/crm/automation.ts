// Regras que movem os leads sozinhos. Funções puras: sem rede, sem banco, sem relógio escondido.
//
// Princípios:
//  1. Só fatos movem o cartão: mensagem enviada/recebida, consulta marcada/concluída/cancelada, silêncio.
//     Nada de adivinhar intenção pelo texto ("na dúvida, não decide").
//  2. O que a equipe decidiu POR ÚLTIMO vale. Uma regra de agenda só desfaz uma escolha manual se o fato
//     for mais novo que ela; as regras de mensagem só mexem em Novo e Perdido, nunca no meio do funil.
//  3. Todo movimento carrega o motivo (note), para o cartão dizer por que mudou.

import type { Lead, Stage } from './model'

export const IDLE_DAYS = 30

export interface StageChange {
  stage: Stage
  /** por que mudou — aparece no cartão e no painel do lead */
  note: string
  /** só para Perdido */
  lostReason?: string
}

// ── mensagens ───────────────────────────────────────────────────────────────

/**
 * Uma mensagem nova entrou na conversa do lead.
 *  - o contato escreve e o lead estava Perdido → volta como Novo (alguém precisa responder)
 *  - a clínica responde: Novo → Em conversa; Perdido → Em conversa (retomou)
 * Mensagens automáticas (confirmação de consulta) não passam por aqui: não são conversa.
 */
export function stageOnMessage(stage: Stage, direction: 'in' | 'out'): StageChange | null {
  if (direction === 'in') {
    return stage === 'perdido' ? { stage: 'novo', note: 'O contato voltou a escrever' } : null
  }
  if (stage === 'novo') return { stage: 'em_conversa', note: 'A clínica respondeu no WhatsApp' }
  if (stage === 'perdido') return { stage: 'em_conversa', note: 'A clínica retomou a conversa' }
  return null
}

// ── agenda ──────────────────────────────────────────────────────────────────

export interface ApptFact {
  status: string
  scheduled_at: string
  created_at: string
}

type StageState = Pick<Lead, 'stage' | 'stage_changed_at' | 'stage_source'>

/**
 * O que a agenda do paciente diz sobre o lead.
 *  - consulta concluída → Compareceu (de qualquer etapa, e nunca volta)
 *  - consulta futura marcada ou confirmada → Agendado
 *  - estava Agendado, não há mais consulta futura e a última foi cancelada ou faltou → Em conversa
 */
export function stageFromAppointments(lead: StageState, appts: ApptFact[], now: Date): StageChange | null {
  if (lead.stage === 'compareceu') return null

  const changedAt = Date.parse(lead.stage_changed_at)
  // uma escolha manual só é desfeita por um fato mais novo que ela
  const mayOverride = (factAt: number) => lead.stage_source === 'auto' || factAt > changedAt

  if (appts.some(a => a.status === 'concluido' && mayOverride(Date.parse(a.scheduled_at)))) {
    return { stage: 'compareceu', note: 'Consulta concluída na agenda' }
  }

  const upcoming = appts.filter(a =>
    (a.status === 'agendado' || a.status === 'confirmado') && Date.parse(a.scheduled_at) >= now.getTime())

  if (lead.stage !== 'agendado' && upcoming.some(a => mayOverride(Date.parse(a.created_at)))) {
    return { stage: 'agendado', note: 'Consulta marcada na agenda' }
  }

  if (lead.stage === 'agendado' && upcoming.length === 0) {
    const last = [...appts].sort((a, b) => Date.parse(b.scheduled_at) - Date.parse(a.scheduled_at))[0]
    if (last && (last.status === 'cancelado' || last.status === 'faltou') && mayOverride(Date.parse(last.scheduled_at))) {
      return { stage: 'em_conversa', note: last.status === 'faltou' ? 'Faltou à consulta' : 'A consulta foi cancelada' }
    }
  }
  return null
}

/** Existe consulta futura ativa (marcada ou confirmada)? */
export function hasUpcomingAppointment(appts: ApptFact[], now: Date): boolean {
  return appts.some(a => (a.status === 'agendado' || a.status === 'confirmado') && Date.parse(a.scheduled_at) >= now.getTime())
}

// ── silêncio ────────────────────────────────────────────────────────────────

/**
 * Lead aberto, sem consulta marcada, sem "retomar em" no futuro, e sem sinal de vida há `days` dias
 * (nem mensagem do contato, nem movimento no funil) → Perdido, motivo "Sem retorno".
 * Se o contato voltar a escrever, o lead reabre sozinho (stageOnMessage).
 */
export function idleToLost(
  lead: Pick<Lead, 'stage' | 'stage_changed_at' | 'next_contact_at'>,
  lastInboundAt: string | null,
  hasUpcomingAppt: boolean,
  now: Date,
  days = IDLE_DAYS,
): StageChange | null {
  if (lead.stage !== 'novo' && lead.stage !== 'em_conversa') return null
  if (hasUpcomingAppt) return null
  if (lead.next_contact_at && Date.parse(lead.next_contact_at) > now.getTime()) return null

  const lastSignal = Math.max(Date.parse(lead.stage_changed_at), lastInboundAt ? Date.parse(lastInboundAt) : 0)
  if (now.getTime() - lastSignal <= days * 86_400_000) return null
  return { stage: 'perdido', note: `Sem resposta há ${days} dias`, lostReason: 'Sem retorno' }
}
