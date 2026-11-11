// Lote e validade no estoque: regras puras (sem React e sem rede).
//
// Modelo: `stock_items.quantity` continua sendo o saldo TOTAL do produto. Cada lote (`stock_lots`) guarda o
// saldo da sua parte. O que não está em nenhum lote é o "saldo sem lote" (= quantidade do produto menos a soma
// dos lotes), então produto antigo, sem lote nenhum, continua valendo igual e sem perda de saldo.
//
// Datas de validade são datas de calendário ("AAAA-MM-DD", sem horário). "Hoje" vem do fuso de Brasília
// (hojeBrasil), nunca do UTC: depois das 21h, toISOString() já é o dia seguinte e marcaria como vencido um lote
// que ainda vale hoje. O lote vale ATÉ o fim do dia da validade.

import { hojeBrasil } from '@/lib/brasilDate'

export interface StockLot {
  id: string
  clinic_id: string
  stock_item_id: string
  lote: string
  validade: string | null
  quantidade_inicial: number
  quantidade_atual: number
  custo: number | null
  fornecedor: string | null
  nota_fiscal: string | null
  created_at: string
  updated_at?: string | null
}

export type ValidadeFaixa = 'vencido' | 'ate30' | 'ate60' | 'ate90' | 'ok' | 'sem_validade'
export type FiltroValidade = 'todos' | 'vencidos' | '30' | '60' | '90'

/** Opção "sem lote" no seletor de lote da saída. */
export const SEM_LOTE = '__sem_lote__'

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

function diaUtc(dia: string): number {
  const [y, m, d] = dia.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Dias entre hoje e a validade: 0 = vence hoje, negativo = já venceu. Sem validade (ou data inválida) = null. */
export function diasAteValidade(validade: string | null | undefined, hoje: string = hojeBrasil()): number | null {
  const v = (validade ?? '').slice(0, 10)
  if (!DAY_RE.test(v) || !DAY_RE.test(hoje)) return null
  return Math.round((diaUtc(v) - diaUtc(hoje)) / 86_400_000)
}

export function faixaValidade(validade: string | null | undefined, hoje: string = hojeBrasil()): ValidadeFaixa {
  const dias = diasAteValidade(validade, hoje)
  if (dias === null) return 'sem_validade'
  if (dias < 0) return 'vencido'
  if (dias <= 30) return 'ate30'
  if (dias <= 60) return 'ate60'
  if (dias <= 90) return 'ate90'
  return 'ok'
}

export function textoValidade(dias: number | null): string {
  if (dias === null) return 'Sem validade'
  if (dias < -1) return `Vencido há ${-dias} dias`
  if (dias === -1) return 'Vencido ontem'
  if (dias === 0) return 'Vence hoje'
  if (dias === 1) return 'Vence amanhã'
  return `Vence em ${dias} dias`
}

/** "AAAA-MM-DD" para "dd/mm/aaaa" sem passar por Date (evita voltar um dia por causa do fuso). */
export function formatarDia(dia: string | null | undefined): string {
  const v = (dia ?? '').slice(0, 10)
  if (!DAY_RE.test(v)) return '-'
  return `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}`
}

export const saldoDoLote = (lot: Pick<StockLot, 'quantidade_atual'>): number => Math.max(0, Number(lot.quantidade_atual) || 0)

export function loteVencido(lot: Pick<StockLot, 'validade'>, hoje: string = hojeBrasil()): boolean {
  return faixaValidade(lot.validade, hoje) === 'vencido'
}

/** Vence primeiro, sai primeiro: validade crescente, lote sem validade por último, desempate pela entrada mais antiga. */
export function ordenarFefo<T extends Pick<StockLot, 'validade' | 'created_at' | 'lote'>>(lots: T[]): T[] {
  return [...lots].sort((a, b) => {
    const va = a.validade ? a.validade.slice(0, 10) : null
    const vb = b.validade ? b.validade.slice(0, 10) : null
    if (va !== vb) {
      if (va === null) return 1
      if (vb === null) return -1
      return va < vb ? -1 : 1
    }
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1
    return a.lote.localeCompare(b.lote, 'pt-BR')
  })
}

export const lotesDoItem = <T extends Pick<StockLot, 'stock_item_id'>>(lots: T[], itemId: string): T[] =>
  lots.filter(l => l.stock_item_id === itemId)

// ── Resumo por produto ───────────────────────────────────────────────────────

export interface ResumoItemLotes {
  /** o produto tem algum lote com saldo */
  comLote: boolean
  saldoLotes: number
  /** quantidade do produto que não está em nenhum lote (nunca negativa) */
  saldoSemLote: number
  /** a soma dos lotes passa da quantidade do produto (alguém mexeu no saldo por fora): precisa de revisão */
  inconsistente: boolean
  vencidoQtd: number
  /** lote com saldo que merece o destaque: o vencido mais antigo; se não há, o que vence primeiro */
  destaque: { lot: StockLot; dias: number | null; faixa: ValidadeFaixa } | null
}

export function resumoItem(item: { id: string; quantity: number }, lots: StockLot[], hoje: string = hojeBrasil()): ResumoItemLotes {
  const doItem = ordenarFefo(lotesDoItem(lots, item.id).filter(l => saldoDoLote(l) > 0))
  const saldoLotes = doItem.reduce((s, l) => s + saldoDoLote(l), 0)
  const qty = Number(item.quantity) || 0
  const vencidos = doItem.filter(l => loteVencido(l, hoje))
  const alvo = vencidos[0] ?? doItem.find(l => l.validade) ?? null
  return {
    comLote: doItem.length > 0,
    saldoLotes,
    saldoSemLote: Math.max(0, qty - saldoLotes),
    inconsistente: saldoLotes > qty,
    vencidoQtd: vencidos.reduce((s, l) => s + saldoDoLote(l), 0),
    destaque: alvo ? { lot: alvo, dias: diasAteValidade(alvo.validade, hoje), faixa: faixaValidade(alvo.validade, hoje) } : null,
  }
}

// ── Baixa: FEFO automático ou lote escolhido ─────────────────────────────────

export interface Alocacao {
  /** null = saldo sem lote */
  lotId: string | null
  quantidade: number
  vencido: boolean
}

export type PlanoBaixa =
  | { ok: true; alocacoes: Alocacao[] }
  | { ok: false; erro: 'quantidade' | 'insuficiente' | 'lote_insuficiente' | 'lote_vencido' | 'lote_inexistente'; disponivel: number; vencidos: number }

interface PlanoEntrada {
  quantidade: number
  /** lotes DO PRODUTO (qualquer saldo) */
  lots: StockLot[]
  saldoSemLote: number
  hoje?: string
  /** `SEM_LOTE`, um id de lote, ou vazio/null para automático (FEFO) */
  escolhido?: string | null
  /** só vale para lote escolhido à mão: a pessoa confirmou que sabe que está vencido */
  permitirVencido?: boolean
}

/**
 * Decide de onde sai a quantidade.
 *  - Automático: lotes dentro da validade em ordem FEFO e, por último, o saldo sem lote (validade desconhecida).
 *    Lote vencido NUNCA entra sozinho: para usar ou descartar um vencido é preciso escolhê-lo.
 *  - Escolhido: só aquele lote (ou só o saldo sem lote); vencido exige `permitirVencido`.
 */
export function planejarBaixa({ quantidade, lots, saldoSemLote, hoje = hojeBrasil(), escolhido = null, permitirVencido = false }: PlanoEntrada): PlanoBaixa {
  const comSaldo = ordenarFefo(lots.filter(l => saldoDoLote(l) > 0))
  const validos = comSaldo.filter(l => !loteVencido(l, hoje))
  const vencidosQtd = comSaldo.filter(l => loteVencido(l, hoje)).reduce((s, l) => s + saldoDoLote(l), 0)
  const semLote = Math.max(0, saldoSemLote)
  const disponivelAuto = validos.reduce((s, l) => s + saldoDoLote(l), 0) + semLote

  if (!Number.isFinite(quantidade) || quantidade <= 0) return { ok: false, erro: 'quantidade', disponivel: disponivelAuto, vencidos: vencidosQtd }

  if (escolhido) {
    if (escolhido === SEM_LOTE) {
      if (quantidade > semLote) return { ok: false, erro: 'lote_insuficiente', disponivel: semLote, vencidos: vencidosQtd }
      return { ok: true, alocacoes: [{ lotId: null, quantidade, vencido: false }] }
    }
    const lot = lots.find(l => l.id === escolhido)
    if (!lot) return { ok: false, erro: 'lote_inexistente', disponivel: disponivelAuto, vencidos: vencidosQtd }
    const venc = loteVencido(lot, hoje)
    if (quantidade > saldoDoLote(lot)) return { ok: false, erro: 'lote_insuficiente', disponivel: saldoDoLote(lot), vencidos: vencidosQtd }
    if (venc && !permitirVencido) return { ok: false, erro: 'lote_vencido', disponivel: saldoDoLote(lot), vencidos: vencidosQtd }
    return { ok: true, alocacoes: [{ lotId: lot.id, quantidade, vencido: venc }] }
  }

  if (quantidade > disponivelAuto) return { ok: false, erro: 'insuficiente', disponivel: disponivelAuto, vencidos: vencidosQtd }
  const alocacoes: Alocacao[] = []
  let falta = quantidade
  for (const lot of validos) {
    if (falta <= 0) break
    const take = Math.min(falta, saldoDoLote(lot))
    alocacoes.push({ lotId: lot.id, quantidade: take, vencido: false })
    falta -= take
  }
  if (falta > 0) alocacoes.push({ lotId: null, quantidade: falta, vencido: false })
  return { ok: true, alocacoes }
}

// ── Alertas de validade ──────────────────────────────────────────────────────

export interface ResumoAlertas {
  vencidos: { lotes: number; unidades: number }
  /** acumulados: o lote que vence em 10 dias conta em 30, 60 e 90 */
  ate30: { lotes: number; unidades: number }
  ate60: { lotes: number; unidades: number }
  ate90: { lotes: number; unidades: number }
}

export function resumoAlertas(lots: StockLot[], hoje: string = hojeBrasil()): ResumoAlertas {
  const out: ResumoAlertas = {
    vencidos: { lotes: 0, unidades: 0 }, ate30: { lotes: 0, unidades: 0 }, ate60: { lotes: 0, unidades: 0 }, ate90: { lotes: 0, unidades: 0 },
  }
  for (const l of lots) {
    const saldo = saldoDoLote(l)
    if (saldo <= 0) continue
    const dias = diasAteValidade(l.validade, hoje)
    if (dias === null) continue
    const add = (k: keyof ResumoAlertas) => { out[k].lotes += 1; out[k].unidades += saldo }
    if (dias < 0) add('vencidos')
    else {
      if (dias <= 30) add('ate30')
      if (dias <= 60) add('ate60')
      if (dias <= 90) add('ate90')
    }
  }
  return out
}

/** Frase curta para o sino de pendências; null quando não há nada vencido nem vencendo em 30 dias. */
export function textoAlertaValidade(r: ResumoAlertas): string | null {
  const partes: string[] = []
  if (r.vencidos.lotes > 0) partes.push(`${r.vencidos.lotes} ${r.vencidos.lotes === 1 ? 'lote vencido' : 'lotes vencidos'}`)
  if (r.ate30.lotes > 0) partes.push(`${r.ate30.lotes} ${r.ate30.lotes === 1 ? 'lote vence' : 'lotes vencem'} em até 30 dias`)
  return partes.length ? partes.join(' e ') : null
}

export function filtrarPorValidade<T extends Pick<StockLot, 'validade' | 'quantidade_atual'>>(lots: T[], filtro: FiltroValidade, hoje: string = hojeBrasil()): T[] {
  if (filtro === 'todos') return lots
  return lots.filter(l => {
    const dias = diasAteValidade(l.validade, hoje)
    if (dias === null) return false
    if (filtro === 'vencidos') return dias < 0
    return dias >= 0 && dias <= Number(filtro)
  })
}

/** Ordem da lista de lotes: o que exige ação primeiro (vencidos e mais próximos), sem validade no fim. */
export function ordenarPorValidade<T extends Pick<StockLot, 'validade' | 'created_at' | 'lote'>>(lots: T[]): T[] {
  return ordenarFefo(lots)
}

// ── Recall: quem recebeu o lote ──────────────────────────────────────────────

export interface MovimentoDeLote {
  id: string
  type: string
  quantity: number
  created_at: string
  patient_id?: string | null
  appointment_id?: string | null
}

export interface RecallPaciente {
  patientId: string
  nome: string
  telefone: string | null
  quantidade: number
  usos: { data: string; quantidade: number; appointmentId: string | null }[]
}

export interface RecallResumo {
  pacientes: RecallPaciente[]
  /** unidades que saíram do lote sem paciente informado */
  semPaciente: number
  totalSaidas: number
}

/** Agrupa as saídas do lote por paciente (mais recente primeiro dentro de cada um). Entradas e ajustes não contam. */
export function agruparRecall(
  movimentos: MovimentoDeLote[],
  pacientes: Record<string, { name: string; phone: string | null }>,
): RecallResumo {
  const map = new Map<string, RecallPaciente>()
  let semPaciente = 0
  let totalSaidas = 0
  const saidas = movimentos.filter(m => m.type === 'saida').sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  for (const m of saidas) {
    const q = Math.abs(Number(m.quantity) || 0)
    totalSaidas += q
    if (!m.patient_id) { semPaciente += q; continue }
    let p = map.get(m.patient_id)
    if (!p) {
      const info = pacientes[m.patient_id]
      p = { patientId: m.patient_id, nome: info?.name ?? 'Paciente sem acesso ao nome', telefone: info?.phone ?? null, quantidade: 0, usos: [] }
      map.set(m.patient_id, p)
    }
    p.quantidade += q
    p.usos.push({ data: m.created_at, quantidade: q, appointmentId: m.appointment_id ?? null })
  }
  return {
    pacientes: [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    semPaciente,
    totalSaidas,
  }
}

/** Mesmo lote (código sem diferença de caixa/espaços e mesma validade) numa nova entrada soma no lote existente. */
export function chaveLote(lote: string, validade: string | null | undefined): string {
  return `${lote.trim().toLowerCase().replace(/\s+/g, ' ')}|${(validade ?? '').slice(0, 10)}`
}
