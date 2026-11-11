import { NextResponse } from 'next/server'
import { MENSAGEM_CONTRATO_FALHA, type ContratoFalha } from './server'

export { UUID_RE } from '@/lib/portal/http'

/** Resposta de erro das rotas /api/contratos a partir de uma falha de `lib/contratos/server`. */
export function contratoFalhaResponse(r: ContratoFalha): NextResponse {
  if (r.motivo === 'invalido') return NextResponse.json({ error: r.error ?? 'Dados inválidos.' }, { status: 400 })
  if (r.motivo === 'nao_encontrado') return NextResponse.json({ error: r.error ?? 'Não encontrado.' }, { status: 404 })
  if (r.motivo === 'conflito') return NextResponse.json({ error: r.error ?? 'Operação não permitida neste estado.' }, { status: 409 })
  return NextResponse.json({ error: MENSAGEM_CONTRATO_FALHA[r.motivo], motivo: r.motivo }, { status: r.motivo === 'sem_tabela' ? 503 : 500 })
}
