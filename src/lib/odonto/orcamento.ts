// Aprovação do orçamento odontológico item a item. O paciente pode aprovar parte do plano e recusar ou deixar o resto
// em aberto: cada item do plano de tratamento carrega o seu status (`approval`). Lógica pura (testada em orcamento.test.ts).
// Item sem status (planos antigos) conta como pendente.

export type AprovacaoItem = 'pendente' | 'aprovado' | 'recusado'
export const APROVACOES: { id: AprovacaoItem; rotulo: string }[] = [
  { id: 'pendente', rotulo: 'Pendente' },
  { id: 'aprovado', rotulo: 'Aprovado' },
  { id: 'recusado', rotulo: 'Recusado' },
]

interface ItemComValor { value: number | null; approval?: AprovacaoItem }

export function aprovacaoDoItem(i: { approval?: AprovacaoItem }): AprovacaoItem {
  return i.approval === 'aprovado' || i.approval === 'recusado' ? i.approval : 'pendente'
}

export interface TotaisOrcamento {
  itens: number
  /** soma de tudo, inclusive recusado */
  total: number
  aprovado: number
  pendente: number
  recusado: number
  qtdAprovado: number
  qtdPendente: number
  qtdRecusado: number
  /** pendente + aprovado: o que ainda vale como proposta */
  vigente: number
}

const centavos = (n: number) => Math.round(n * 100) / 100

export function totaisOrcamento(items: ItemComValor[]): TotaisOrcamento {
  const t: TotaisOrcamento = { itens: items.length, total: 0, aprovado: 0, pendente: 0, recusado: 0, qtdAprovado: 0, qtdPendente: 0, qtdRecusado: 0, vigente: 0 }
  for (const it of items) {
    const v = it.value && it.value > 0 ? it.value : 0
    t.total += v
    const a = aprovacaoDoItem(it)
    if (a === 'aprovado') { t.aprovado += v; t.qtdAprovado++ }
    else if (a === 'recusado') { t.recusado += v; t.qtdRecusado++ }
    else { t.pendente += v; t.qtdPendente++ }
  }
  t.total = centavos(t.total); t.aprovado = centavos(t.aprovado); t.pendente = centavos(t.pendente); t.recusado = centavos(t.recusado)
  t.vigente = centavos(t.aprovado + t.pendente)
  return t
}

export type StatusOrcamento = 'vazio' | 'pendente' | 'aprovado' | 'parcial' | 'recusado'
export const STATUS_ORCAMENTO_ROTULO: Record<StatusOrcamento, string> = {
  vazio: 'Sem itens',
  pendente: 'Aguardando resposta',
  aprovado: 'Aprovado',
  parcial: 'Aprovado em parte',
  recusado: 'Recusado',
}

/**
 * Status do orçamento como um todo. Parcial = há item aprovado e também item recusado ou ainda em aberto.
 * Tudo aprovado = aprovado; tudo recusado = recusado; nada decidido = pendente.
 */
export function statusOrcamento(items: { approval?: AprovacaoItem }[]): StatusOrcamento {
  if (items.length === 0) return 'vazio'
  const n = { aprovado: 0, pendente: 0, recusado: 0 }
  for (const it of items) n[aprovacaoDoItem(it)]++
  if (n.aprovado === items.length) return 'aprovado'
  if (n.recusado === items.length) return 'recusado'
  if (n.aprovado > 0) return 'parcial'
  return 'pendente'
}

/** O orçamento já tem alguma decisão registrada? Sem decisão, a impressão sai como sempre saiu. */
export function temDecisao(items: { approval?: AprovacaoItem }[]): boolean {
  return items.some(i => i.approval === 'aprovado' || i.approval === 'recusado')
}

/** Itens que ainda valem para o paciente (tudo menos o recusado): base do valor sugerido no contrato. */
export function itensVigentes<T extends { approval?: AprovacaoItem }>(items: T[]): T[] {
  return items.filter(i => aprovacaoDoItem(i) !== 'recusado')
}

/** Troca o status de um item sem mutar a lista. */
export function comAprovacao<T extends { id: string; approval?: AprovacaoItem }>(items: T[], id: string, approval: AprovacaoItem): T[] {
  return items.map(i => (i.id === id ? { ...i, approval } : i))
}
/** Define o mesmo status para todos os itens. */
export function aprovarTodos<T extends { approval?: AprovacaoItem }>(items: T[], approval: AprovacaoItem): T[] {
  return items.map(i => ({ ...i, approval }))
}
