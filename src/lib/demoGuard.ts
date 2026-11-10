// Trava de envio da clínica de demonstração. Só no servidor (service role).
//
// A conta de demo (clinics.demo_mode = true) tem pacientes com telefone real: nenhuma
// mensagem de verdade pode sair dela, nem por engano, nem por chamada direta à API.
// O botão desabilitado na tela é só cortesia; o bloqueio de verdade é este.
//
// Regra de falha: se a coluna ainda não existe (migração 20261109 não aplicada) ou a leitura
// falhar por qualquer motivo, a clínica é tratada como NÃO demo, para nunca derrubar uma
// clínica real. O motivo vai para o log do servidor, sem dado pessoal.

import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabaseAdmin'

export const DEMO_SEND_BLOCKED_MESSAGE = 'Envio de mensagens desativado na conta de demonstração.'

/** Postgres: undefined_column. PostgREST repassa o código quando a coluna não existe. */
const UNDEFINED_COLUMN = '42703'

function warn(reason: string): void {
  console.warn(`[demoGuard] não foi possível ler clinics.demo_mode (${reason}); tratando como clínica normal`)
}

function describeError(error: { code?: string; message?: string }): string {
  if (error.code === UNDEFINED_COLUMN || /demo_mode/.test(error.message ?? '') && /does not exist|could not find/i.test(error.message ?? '')) {
    return 'coluna demo_mode inexistente'
  }
  return `erro ${error.code ?? 'desconhecido'}`
}

/**
 * A clínica é de demonstração? `clinicId` deve vir da sessão autenticada (linha do usuário em
 * clinic_users), nunca do corpo da requisição. Qualquer falha de leitura devolve false.
 */
export async function isDemoClinic(clinicId: string): Promise<boolean> {
  try {
    const { data, error } = await getAdminClient()
      .from('clinics')
      .select('demo_mode')
      .eq('id', clinicId)
      .maybeSingle()
    if (error) { warn(describeError(error)); return false }
    return (data as { demo_mode?: unknown } | null)?.demo_mode === true
  } catch (e) {
    warn(e instanceof Error ? e.name : 'exceção')
    return false
  }
}

/**
 * Das clínicas informadas, quais são de demonstração. Uma consulta só, para rotinas que varrem
 * várias clínicas (agendador). Falha de leitura devolve conjunto vazio (ninguém é demo).
 */
export async function demoClinicIds(clinicIds: string[]): Promise<Set<string>> {
  if (clinicIds.length === 0) return new Set()
  try {
    const { data, error } = await getAdminClient()
      .from('clinics')
      .select('id, demo_mode')
      .in('id', clinicIds)
    if (error) { warn(describeError(error)); return new Set() }
    return new Set(
      ((data ?? []) as { id: string; demo_mode?: unknown }[])
        .filter(r => r.demo_mode === true)
        .map(r => r.id),
    )
  } catch (e) {
    warn(e instanceof Error ? e.name : 'exceção')
    return new Set()
  }
}

/** Resposta 403 padrão das rotas de envio. */
export function demoBlockedResponse(): NextResponse {
  return NextResponse.json({ error: DEMO_SEND_BLOCKED_MESSAGE }, { status: 403 })
}

/**
 * Para usar logo depois da autenticação, antes de qualquer envio:
 *   const blocked = await rejectIfDemo(ctx.clinicId)
 *   if (blocked) return blocked
 */
export async function rejectIfDemo(clinicId: string): Promise<NextResponse | null> {
  return (await isDemoClinic(clinicId)) ? demoBlockedResponse() : null
}
