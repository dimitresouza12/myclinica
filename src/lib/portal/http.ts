import { NextResponse } from 'next/server'
import { MENSAGEM_FALHA, type Falha } from './server'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Resposta de erro das rotas da clínica a partir de uma falha de `lib/portal/server`. */
export function falhaResponse(r: Falha): NextResponse {
  if (r.motivo === 'invalido') return NextResponse.json({ error: r.error ?? 'Dados inválidos.' }, { status: 400 })
  if (r.motivo === 'nao_encontrado') return NextResponse.json({ error: r.error ?? 'Não encontrado.' }, { status: 404 })
  const motivo = r.motivo === 'sem_tabela' || r.motivo === 'sem_permissao' ? r.motivo : 'erro'
  return NextResponse.json({ error: MENSAGEM_FALHA[motivo], motivo }, { status: motivo === 'sem_tabela' ? 503 : 500 })
}
