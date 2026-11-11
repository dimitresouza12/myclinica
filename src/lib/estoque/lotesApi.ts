// Gravações de estoque com lote. Sem gatilho no banco: o saldo do produto e o do lote são atualizados aqui,
// um depois do outro, cada UPDATE só vale se o saldo ainda for o que foi lido (se outra pessoa mexeu no meio, para
// e pede para tentar de novo). Se um passo falha, os anteriores são desfeitos na ordem inversa.
import { supabase } from '@/lib/supabase'
import { hojeBrasil } from '@/lib/brasilDate'
import {
  agruparRecall, chaveLote, planejarBaixa, saldoDoLote,
  type Alocacao, type MovimentoDeLote, type PlanoBaixa, type RecallResumo, type StockLot,
} from './lotes'

export type Resultado<T = undefined> = { ok: true; data: T } | { ok: false; erro: string; conflito?: boolean }

class ConflitoErro extends Error {}

const agora = () => new Date().toISOString()
type Desfazer = () => PromiseLike<unknown>

async function desfazerTudo(passos: Desfazer[]) {
  for (const p of [...passos].reverse()) {
    try { await p() } catch { /* melhor esforço */ }
  }
}

/** UPDATE de um saldo que só vale se o saldo no banco ainda for `antigo`. */
async function atualizarSaldo(tabela: 'stock_items' | 'stock_lots', id: string, coluna: string, antigo: number, patch: Record<string, unknown>) {
  const { data, error } = await supabase.from(tabela).update({ ...patch, updated_at: agora() }).eq('id', id).eq(coluna, antigo).select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new ConflitoErro()
}

const MSG_CONFLITO = 'O estoque mudou enquanto você registrava. Atualize a tela e tente de novo.'

function falha(e: unknown): Resultado<never> {
  if (e instanceof ConflitoErro) return { ok: false, erro: MSG_CONFLITO, conflito: true }
  return { ok: false, erro: 'Não foi possível salvar. Tente de novo.' }
}

async function lerProduto(itemId: string): Promise<{ quantity: number }> {
  const { data, error } = await supabase.from('stock_items').select('quantity').eq('id', itemId).single()
  if (error || !data) throw new Error(error?.message ?? 'produto não encontrado')
  return { quantity: Number((data as { quantity: number }).quantity) || 0 }
}

// ── Entrada ──────────────────────────────────────────────────────────────────

export interface DadosLote {
  lote: string
  validade: string | null
  custo: number | null
  fornecedor: string | null
  notaFiscal: string | null
}

export interface EntradaInput {
  clinicId: string
  itemId: string
  quantidade: number
  motivo: string | null
  userName: string | null
  /** sem isto a entrada fica "sem lote", como sempre foi */
  lote?: DadosLote | null
}

/** Entrada de estoque. Com lote: soma no lote que já existe (mesmo código e validade) ou cria um novo. */
export async function registrarEntrada(i: EntradaInput): Promise<Resultado<{ lotId: string | null }>> {
  const passos: Desfazer[] = []
  try {
    const item = await lerProduto(i.itemId)
    let lotId: string | null = null

    if (i.lote) {
      const { data: existentes, error } = await supabase.from('stock_lots').select('*').eq('stock_item_id', i.itemId)
      if (error) throw new Error(error.message)
      const chave = chaveLote(i.lote.lote, i.lote.validade)
      const igual = ((existentes ?? []) as StockLot[]).find(l => chaveLote(l.lote, l.validade) === chave)
      if (igual) {
        const atual = Number(igual.quantidade_atual) || 0
        const inicial = Number(igual.quantidade_inicial) || 0
        await atualizarSaldo('stock_lots', igual.id, 'quantidade_atual', atual, { quantidade_atual: atual + i.quantidade, quantidade_inicial: inicial + i.quantidade })
        passos.push(() => supabase.from('stock_lots').update({ quantidade_atual: atual, quantidade_inicial: inicial, updated_at: agora() }).eq('id', igual.id))
        lotId = igual.id
      } else {
        const { data, error: insErr } = await supabase.from('stock_lots').insert([{
          clinic_id: i.clinicId,
          stock_item_id: i.itemId,
          lote: i.lote.lote.trim(),
          validade: i.lote.validade || null,
          quantidade_inicial: i.quantidade,
          quantidade_atual: i.quantidade,
          custo: i.lote.custo,
          fornecedor: i.lote.fornecedor,
          nota_fiscal: i.lote.notaFiscal,
        }]).select('id').single()
        if (insErr || !data) throw new Error(insErr?.message ?? 'lote não criado')
        lotId = (data as { id: string }).id
        const novo = lotId
        passos.push(() => supabase.from('stock_lots').delete().eq('id', novo))
      }
    }

    await atualizarSaldo('stock_items', i.itemId, 'quantity', item.quantity, { quantity: item.quantity + i.quantidade })
    passos.push(() => supabase.from('stock_items').update({ quantity: item.quantity, updated_at: agora() }).eq('id', i.itemId))

    const { error: movErr } = await supabase.from('stock_movements').insert([{
      clinic_id: i.clinicId, item_id: i.itemId, type: 'entrada', quantity: i.quantidade,
      reason: i.motivo, user_name: i.userName, lot_id: lotId,
    }])
    if (movErr) throw new Error(movErr.message)
    return { ok: true, data: { lotId } }
  } catch (e) {
    await desfazerTudo(passos)
    return falha(e)
  }
}

// ── Saída ────────────────────────────────────────────────────────────────────

export interface SaidaInput {
  clinicId: string
  itemId: string
  quantidade: number
  motivo: string | null
  userName: string | null
  /** `SEM_LOTE`, id de lote, ou vazio para automático (FEFO) */
  escolhido?: string | null
  permitirVencido?: boolean
  /** quem recebeu o material (rastreio de recall) */
  patientId?: string | null
  appointmentId?: string | null
}

export type SaidaResultado =
  | { ok: true; data: { alocacoes: Alocacao[] } }
  | { ok: false; erro: string; plano?: Extract<PlanoBaixa, { ok: false }>; conflito?: boolean }

export function mensagemPlano(plano: Extract<PlanoBaixa, { ok: false }>, unidade: string): string {
  const u = unidade ? ` ${unidade}` : ''
  switch (plano.erro) {
    case 'quantidade': return 'Quantidade deve ser maior que zero.'
    case 'insuficiente': {
      const base = `Estoque insuficiente. Disponível dentro da validade: ${plano.disponivel}${u}.`
      return plano.vencidos > 0 ? `${base} Há ${plano.vencidos}${u} em lotes vencidos, que só saem se você escolher o lote.` : base
    }
    case 'lote_insuficiente': return `Este lote tem só ${plano.disponivel}${u} disponíveis.`
    case 'lote_vencido': return 'Este lote está vencido.'
    default: return 'Lote não encontrado. Atualize a tela.'
  }
}

/** Saída de estoque: automática por FEFO (vence primeiro, sai primeiro) ou do lote escolhido. */
export async function registrarSaida(i: SaidaInput & { unidade?: string }): Promise<SaidaResultado> {
  const passos: Desfazer[] = []
  try {
    const item = await lerProduto(i.itemId)
    const { data, error } = await supabase.from('stock_lots').select('*').eq('stock_item_id', i.itemId).gt('quantidade_atual', 0)
    if (error) throw new Error(error.message)
    const lots = (data ?? []) as StockLot[]
    const saldoLotes = lots.reduce((s, l) => s + saldoDoLote(l), 0)

    const plano = planejarBaixa({
      quantidade: i.quantidade, lots, saldoSemLote: Math.max(0, item.quantity - saldoLotes),
      hoje: hojeBrasil(), escolhido: i.escolhido ?? null, permitirVencido: i.permitirVencido,
    })
    if (!plano.ok) return { ok: false, erro: mensagemPlano(plano, i.unidade ?? ''), plano }
    if (i.quantidade > item.quantity) return { ok: false, erro: `Estoque insuficiente. Disponível: ${item.quantity}${i.unidade ? ` ${i.unidade}` : ''}.` }

    for (const a of plano.alocacoes) {
      if (!a.lotId) continue
      const lot = lots.find(l => l.id === a.lotId)!
      const atual = Number(lot.quantidade_atual) || 0
      await atualizarSaldo('stock_lots', lot.id, 'quantidade_atual', atual, { quantidade_atual: atual - a.quantidade })
      passos.push(() => supabase.from('stock_lots').update({ quantidade_atual: atual, updated_at: agora() }).eq('id', lot.id))
    }
    await atualizarSaldo('stock_items', i.itemId, 'quantity', item.quantity, { quantity: item.quantity - i.quantidade })
    passos.push(() => supabase.from('stock_items').update({ quantity: item.quantity, updated_at: agora() }).eq('id', i.itemId))

    const { error: movErr } = await supabase.from('stock_movements').insert(plano.alocacoes.map(a => ({
      clinic_id: i.clinicId, item_id: i.itemId, type: 'saida', quantity: a.quantidade,
      reason: i.motivo, user_name: i.userName, lot_id: a.lotId,
      patient_id: i.patientId ?? null, appointment_id: i.appointmentId ?? null,
    })))
    if (movErr) throw new Error(movErr.message)
    return { ok: true, data: { alocacoes: plano.alocacoes } }
  } catch (e) {
    await desfazerTudo(passos)
    const r = falha(e)
    return { ok: false, erro: r.ok ? '' : r.erro, conflito: !r.ok ? r.conflito : undefined }
  }
}

// ── Lote inicial (opcional) e edição ─────────────────────────────────────────

/**
 * Atribui parte do saldo que está "sem lote" a um lote. Não muda a quantidade do produto nem gera movimentação:
 * é só dar nome e validade ao que já estava lá. Só acontece quando a pessoa pede; nada disso é automático.
 */
export async function criarLoteComSaldoExistente(i: {
  clinicId: string; itemId: string; quantidade: number } & DadosLote): Promise<Resultado<{ lotId: string }>> {
  try {
    const item = await lerProduto(i.itemId)
    const { data, error } = await supabase.from('stock_lots').select('*').eq('stock_item_id', i.itemId)
    if (error) throw new Error(error.message)
    const lots = (data ?? []) as StockLot[]
    const livre = Math.max(0, item.quantity - lots.reduce((s, l) => s + saldoDoLote(l), 0))
    if (i.quantidade <= 0 || i.quantidade > livre) return { ok: false, erro: `Só há ${livre} sem lote neste produto.` }
    if (lots.some(l => chaveLote(l.lote, l.validade) === chaveLote(i.lote, i.validade))) {
      return { ok: false, erro: 'Já existe um lote com este código e validade. Registre uma entrada nele.' }
    }
    const { data: criado, error: insErr } = await supabase.from('stock_lots').insert([{
      clinic_id: i.clinicId, stock_item_id: i.itemId, lote: i.lote.trim(), validade: i.validade || null,
      quantidade_inicial: i.quantidade, quantidade_atual: i.quantidade, custo: i.custo, fornecedor: i.fornecedor, nota_fiscal: i.notaFiscal,
    }]).select('id').single()
    if (insErr || !criado) throw new Error(insErr?.message ?? 'lote não criado')
    return { ok: true, data: { lotId: (criado as { id: string }).id } }
  } catch (e) {
    return falha(e)
  }
}

export async function atualizarDadosLote(id: string, d: DadosLote): Promise<Resultado> {
  const { error } = await supabase.from('stock_lots').update({
    lote: d.lote.trim(), validade: d.validade || null, custo: d.custo, fornecedor: d.fornecedor, nota_fiscal: d.notaFiscal, updated_at: agora(),
  }).eq('id', id)
  if (error) return /23505|duplicate/i.test(`${error.code ?? ''} ${error.message}`)
    ? { ok: false, erro: 'Já existe um lote com este código e validade neste produto.' }
    : { ok: false, erro: 'Não foi possível salvar o lote.' }
  return { ok: true, data: undefined }
}

// ── Recall ───────────────────────────────────────────────────────────────────

/** Quem recebeu material deste lote. Nome e telefone vêm de `patients`; sem permissão para ler, aparece sem nome. */
export async function buscarRecall(lotId: string): Promise<Resultado<RecallResumo>> {
  const { data, error } = await supabase
    .from('stock_movements')
    .select('id, type, quantity, created_at, patient_id, appointment_id')
    .eq('lot_id', lotId)
    .order('created_at', { ascending: false })
    .limit(2000)
  if (error) return { ok: false, erro: 'Não foi possível consultar o lote.' }
  const movs = (data ?? []) as MovimentoDeLote[]
  const ids = [...new Set(movs.map(m => m.patient_id).filter((x): x is string => !!x))]
  const pacientes: Record<string, { name: string; phone: string | null }> = {}
  for (let n = 0; n < ids.length; n += 150) {
    const { data: pats } = await supabase.from('patients').select('id, name, phone').in('id', ids.slice(n, n + 150))
    for (const p of (pats ?? []) as { id: string; name: string; phone: string | null }[]) pacientes[p.id] = { name: p.name, phone: p.phone }
  }
  return { ok: true, data: agruparRecall(movs, pacientes) }
}
