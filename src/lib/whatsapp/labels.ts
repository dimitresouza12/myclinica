// Textos que a interface mostra sobre o estado de uma confirmação. Sem dependências: serve
// à Agenda, ao Dashboard, à aba de Configurações e ao painel de superadmin.

export type ConfirmationStatus = 'enviando' | 'enviado' | 'confirmado' | 'pediu_remarcacao' | 'respondeu' | 'falhou'

export interface ConfirmationInfo {
  kind: 'confirmacao' | 'lembrete'
  status: ConfirmationStatus
  sent_at: string | null
  answered_at: string | null
  error: string | null
}

export const ERROR_LABEL: Record<string, string> = {
  telefone_invalido: 'Telefone inválido',
  sem_whatsapp: 'Número sem WhatsApp',
  interrompido: 'Envio interrompido',
  tentar_novamente: 'WhatsApp demorou para responder',
  whatsapp_desconectado: 'WhatsApp desconectado',
}

export type Tone = 'ok' | 'warn' | 'info' | 'bad' | 'muted'

export interface ConfirmationLabel { text: string; short: string; tone: Tone }

const hhmm = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''

/** `text` para o detalhe da consulta, `short` para o selo no cartão da lista. */
export function confirmationLabel(c: ConfirmationInfo): ConfirmationLabel {
  switch (c.status) {
    case 'enviando':
      return { text: 'Enviando o aviso…', short: 'Enviando', tone: 'muted' }
    case 'enviado':
      return c.kind === 'lembrete'
        ? { text: `Lembrete enviado${c.sent_at ? ` às ${hhmm(c.sent_at)}` : ''}`, short: 'Lembrete enviado', tone: 'muted' }
        : { text: `Aviso enviado${c.sent_at ? ` às ${hhmm(c.sent_at)}` : ''}, aguardando resposta`, short: 'Aguardando resposta', tone: 'info' }
    case 'confirmado':
      return { text: `Confirmou pelo WhatsApp${c.answered_at ? ` às ${hhmm(c.answered_at)}` : ''}`, short: 'Confirmou', tone: 'ok' }
    case 'pediu_remarcacao':
      return { text: 'Pediu para remarcar. Entre em contato com o paciente.', short: 'Pediu remarcar', tone: 'warn' }
    case 'respondeu':
      return { text: 'Respondeu. Veja a conversa no WhatsApp e confirme manualmente.', short: 'Respondeu', tone: 'info' }
    case 'falhou': {
      const why = c.error ? (ERROR_LABEL[c.error] ?? 'Não foi possível enviar') : 'Não foi possível enviar'
      return { text: `Aviso não enviado: ${why}`, short: why, tone: 'bad' }
    }
  }
}

/** Entre várias linhas da mesma consulta, a mais relevante: a mais recente. */
export function pickLatest<T extends { created_at: string }>(rows: T[]): T | null {
  return rows.reduce<T | null>((best, r) => (!best || r.created_at > best.created_at ? r : best), null)
}
