// Limpeza dos anexos vencidos do Chat da equipe. Só no servidor (service role).
//
// Os arquivos ficam no bucket PRIVADO `team-chat`. Quando vencem, são APAGADOS do Storage e o anexo é
// marcado como expirado; a mensagem continua no canal com o aviso de "arquivo expirado".
// Só marca como expirado o que realmente saiu do Storage (ou já não existia): falha fica para o próximo ciclo.

import { getAdminClient } from '@/lib/supabaseAdmin'

const BUCKET = 'team-chat'
const DUE_BATCH = 500
const REMOVE_BATCH = 100
// Trava de segurança: 20 laços x 500 = 10 mil anexos por execução; o resto fica para o ciclo seguinte.
const MAX_ITERATIONS = 20

export interface TeamChatCleanupResult {
  due: number; deleted: number; failed: number
  orphansDeleted: number; orphansFailed: number
}

interface DueRow { id: string; storage_path: string | null }

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Apaga do Storage os anexos vencidos do Chat da equipe e os marca como expirados.
 * Nunca lança: erro de lote vira contagem em `failed` e a rotina segue (ou para, se não há progresso).
 * Retorna só contagens; nada de caminho ou conteúdo em log.
 */
export async function cleanupTeamChatAttachments(): Promise<TeamChatCleanupResult> {
  const result: TeamChatCleanupResult = { due: 0, deleted: 0, failed: 0, orphansDeleted: 0, orphansFailed: 0 }
  const admin = getAdminClient()
  // ids que já falharam nesta execução: voltam na próxima consulta, mas não contam duas vezes
  const failedIds = new Set<string>()

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let rows: DueRow[]
    try {
      const { data, error } = await admin.rpc('team_attachments_due', { p_limit: DUE_BATCH })
      if (error) {
        console.error('[team-chat/cleanup] listar vencidos', error.message)
        break
      }
      rows = (data ?? []) as DueRow[]
    } catch (e) {
      console.error('[team-chat/cleanup] listar vencidos', errMsg(e))
      break
    }
    if (rows.length === 0) break

    const fresh = rows.filter(r => !failedIds.has(r.id))
    result.due += fresh.length

    const okIds: string[] = []
    for (let s = 0; s < fresh.length; s += REMOVE_BATCH) {
      const chunk = fresh.slice(s, s + REMOVE_BATCH)
      const paths = chunk.map(r => r.storage_path).filter((p): p is string => !!p)
      try {
        if (paths.length > 0) {
          // remove() não acusa erro para objeto que já não existe: sem erro = saiu ou já estava fora
          const { error } = await admin.storage.from(BUCKET).remove(paths)
          if (error) throw new Error(error.message)
        }
        for (const r of chunk) okIds.push(r.id)
      } catch (e) {
        console.error('[team-chat/cleanup] remover lote', errMsg(e))
        for (const r of chunk) {
          if (!failedIds.has(r.id)) { failedIds.add(r.id); result.failed++ }
        }
      }
    }

    if (okIds.length === 0) break // nada andou: parar evita repetir a mesma lista até o limite

    try {
      const { error } = await admin.rpc('team_attachments_mark_expired', { p_ids: okIds })
      if (error) throw new Error(error.message)
      result.deleted += okIds.length
    } catch (e) {
      // arquivos já saíram do Storage; sem a marcação voltam como vencidos e a próxima remoção é inofensiva
      console.error('[team-chat/cleanup] marcar expirados', errMsg(e))
      for (const id of okIds) {
        if (!failedIds.has(id)) { failedIds.add(id); result.failed++ }
      }
      break
    }

    if (rows.length < DUE_BATCH) break
  }

  await cleanupOrphans(result)
  return result
}

/**
 * Objetos do bucket que nunca viraram anexo (upload sem a RPC de registro). Nada a marcar no banco:
 * o que sai do Storage some da listagem. Falha volta no próximo ciclo.
 */
async function cleanupOrphans(result: TeamChatCleanupResult): Promise<void> {
  const admin = getAdminClient()
  const failedNames = new Set<string>()

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let names: string[]
    try {
      const { data, error } = await admin.rpc('team_chat_orphan_objects', { p_limit: DUE_BATCH })
      if (error) {
        console.error('[team-chat/cleanup] listar órfãos', error.message)
        return
      }
      names = ((data ?? []) as Array<{ name: string | null }>).map(r => r.name).filter((n): n is string => !!n)
    } catch (e) {
      console.error('[team-chat/cleanup] listar órfãos', errMsg(e))
      return
    }
    if (names.length === 0) return

    let progressed = 0
    for (let s = 0; s < names.length; s += REMOVE_BATCH) {
      const chunk = names.slice(s, s + REMOVE_BATCH)
      try {
        const { error } = await admin.storage.from(BUCKET).remove(chunk)
        if (error) throw new Error(error.message)
        result.orphansDeleted += chunk.length
        progressed += chunk.length
      } catch (e) {
        console.error('[team-chat/cleanup] remover órfãos', errMsg(e))
        for (const n of chunk) {
          if (!failedNames.has(n)) { failedNames.add(n); result.orphansFailed++ }
        }
      }
    }

    if (progressed === 0 || names.length < DUE_BATCH) return
  }
}
