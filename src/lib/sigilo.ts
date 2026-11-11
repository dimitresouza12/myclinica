import type { ClinicType } from '@/types'

/**
 * Interruptor do sigilo de anotações de psicologia (Res. CFP 001/2009).
 *
 * Só virar true depois de confirmar no banco que as policies
 * record_entries_confidential_* (e o gatilho que preenche author_user_id)
 * existem. Com false, a tela não oferece o interruptor, o insert não envia
 * is_confidential e nenhum texto promete sigilo ao usuário.
 *
 * Contrato: docs/psico-sigilo-record-entries.md
 */
export const SIGILO_ATIVO = true

/** Só a área de psicologia pode marcar uma evolução como anotação sigilosa. */
export function canMarkConfidential(area: ClinicType | null | undefined): boolean {
  return area === 'psico'
}

/**
 * Remove as entradas sigilosas. Usar antes de qualquer impressão/exportação do
 * prontuário: a nota sigilosa é pessoal do autor e não deve sair em papel.
 */
export function stripConfidentialForPrint<T extends { is_confidential?: boolean | null }>(entries: T[]): T[] {
  return entries.filter(e => !e.is_confidential)
}

/** Alias semântico de stripConfidentialForPrint. */
export const visibleEntries = stripConfidentialForPrint
