// Aplicação de produto na Estética com rastreabilidade de lote: regras puras (sem React e sem rede).
//
// Liga a aplicação ao Estoque que já existe (stock_items + stock_lots, 20261114): o lote escolhido na ficha é o lote do
// Estoque, a baixa sai dele e a saída com paciente alimenta o recall. A validade segue as regras de src/lib/estoque/lotes.ts
// (data de calendário, "hoje" em Brasília, o lote vale até o fim do dia da validade).
//
// Formato do jsonb `regioes` (estetica_aplicacoes.regioes): lista de { id, regiao, unidades, x, y }, com x/y no mapa do
// rosto (viewBox 300x249 do faceograma) ou null quando a região foi digitada sem ponto no mapa.

import { hojeBrasil } from '@/lib/brasilDate'
import { STATUS_LABEL, type ContractStatus } from '@/lib/contratos/status'
import { FACE_TOOLS } from '@/lib/faceograma'
import {
  diasAteValidade, faixaValidade, formatarDia, loteVencido, textoValidade,
  type ResumoAlertas, type ValidadeFaixa,
} from '@/lib/estoque/lotes'

// ── Tipo de aplicação e dose ─────────────────────────────────────────────────

export interface TipoAplicacao { key: string; label: string }

/** Os mesmos tipos do faceograma (cores e nomes iguais nas duas abas) mais "Outro produto". */
export const TIPOS_APLICACAO: TipoAplicacao[] = [
  ...FACE_TOOLS.map(t => ({ key: t.key, label: t.label })),
  { key: 'outro', label: 'Outro produto' },
]

export const rotuloTipo = (key: string): string => TIPOS_APLICACAO.find(t => t.key === key)?.label ?? 'Outro produto'
export const corDoTipo = (key: string): string => FACE_TOOLS.find(t => t.key === key)?.color ?? '#6B7280'

export const DOSE_UNIDADES = ['U', 'ml', 'ampola', 'seringa'] as const
export type DoseUnidade = (typeof DOSE_UNIDADES)[number]

/** Unidade escrita de formas diferentes ("un", "unidades", "Ampolas", "ML") em uma só forma comparável. */
export function normalizarUnidade(raw: string | null | undefined): string {
  const s = (raw ?? '').trim().toLowerCase()
  if (['u', 'ui', 'un', 'unid', 'unidade', 'unidades'].includes(s)) return 'U'
  if (['ml', 'mℓ'].includes(s)) return 'ml'
  if (['amp', 'ampola', 'ampolas'].includes(s)) return 'ampola'
  if (['ser', 'seringa', 'seringas'].includes(s)) return 'seringa'
  return s
}

const arred = (n: number) => Math.round(n * 100) / 100

/**
 * Quanto baixar do estoque, na unidade do produto. Se o produto é controlado na mesma unidade da dose (toxina em U,
 * preenchedor em ml) a baixa é a própria dose; senão (frasco, caixa) sugere 1 e a pessoa ajusta.
 */
export function sugerirBaixa(dose: number, doseUnidade: string, unidadeEstoque: string | null | undefined): number {
  if (!Number.isFinite(dose) || dose <= 0) return 0
  const mesma = normalizarUnidade(doseUnidade) !== '' && normalizarUnidade(doseUnidade) === normalizarUnidade(unidadeEstoque)
  return mesma ? arred(dose) : 1
}

/** 20 -> "20", 0.5 -> "0,5" */
export const formatarNumero = (n: number): string => String(arred(n)).replace('.', ',')

export const textoDose = (dose: number, unidade: string): string => `${formatarNumero(dose)} ${unidade}`.trim()

// ── Regiões aplicadas ────────────────────────────────────────────────────────

export interface RegiaoAplicada {
  id: string
  regiao: string
  /** dose desta região; null = não informada */
  unidades: number | null
  /** posição no mapa do rosto; null = região digitada, sem ponto */
  x: number | null
  y: number | null
}

export const MAX_REGIOES = 60

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN
  return Number.isFinite(n) ? n : null
}

/** Lê o jsonb do banco (ou de qualquer lugar) sem confiar no formato: descarta o que não é região. */
export function normalizarRegioes(raw: unknown): RegiaoAplicada[] {
  if (!Array.isArray(raw)) return []
  const out: RegiaoAplicada[] = []
  for (const r of raw.slice(0, MAX_REGIOES)) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    const un = num(o.unidades)
    out.push({
      id: typeof o.id === 'string' && o.id ? o.id : `r${out.length}`,
      regiao: typeof o.regiao === 'string' ? o.regiao.trim().slice(0, 80) : '',
      unidades: un !== null && un >= 0 ? arred(un) : null,
      x: num(o.x),
      y: num(o.y),
    })
  }
  return out
}

export const somaRegioes = (regioes: RegiaoAplicada[]): number => arred(regioes.reduce((s, r) => s + (r.unidades ?? 0), 0))

/** Dose total da ficha: a soma das regiões quando elas trazem dose; senão o valor digitado. */
export function doseTotal(regioes: RegiaoAplicada[], manual: number): number {
  const soma = somaRegioes(regioes)
  return soma > 0 ? soma : arred(Number.isFinite(manual) && manual > 0 ? manual : 0)
}

/** "Glabela 10 U, Frontal 8 U" (região sem dose aparece só com o nome). */
export function resumoRegioes(regioes: RegiaoAplicada[], unidade: string): string {
  return regioes
    .filter(r => r.regiao || r.unidades !== null)
    .map(r => `${r.regiao || 'Região sem nome'}${r.unidades !== null ? ` ${textoDose(r.unidades, unidade)}` : ''}`)
    .join(', ')
}

// ── Lote disponível (vem do estoque) ─────────────────────────────────────────

export interface LoteDisponivel {
  lotId: string
  itemId: string
  produto: string
  /** unidade do produto no estoque (frasco, U, ml...) */
  unidade: string
  categoria: string | null
  lote: string
  validade: string | null
  fabricante: string | null
  saldo: number
}

/** Linha de estetica_lotes_para_aplicacao() para o tipo da tela; null se faltar o essencial. */
export function mapearLote(row: unknown): LoteDisponivel | null {
  if (!row || typeof row !== 'object') return null
  const o = row as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v : null)
  const lotId = str(o.lot_id)
  const itemId = str(o.stock_item_id)
  const produto = str(o.produto)
  const lote = str(o.lote)
  const saldo = num(o.saldo)
  if (!lotId || !itemId || !produto || !lote || saldo === null) return null
  return {
    lotId, itemId, produto, lote, saldo,
    unidade: str(o.unidade) ?? '',
    categoria: str(o.categoria),
    validade: str(o.validade)?.slice(0, 10) ?? null,
    fabricante: str(o.fabricante),
  }
}

export interface EstadoLote {
  /** lote vencido: não pode ser aplicado */
  bloqueado: boolean
  tom: 'ok' | 'aviso' | 'bloqueio' | 'neutro'
  faixa: ValidadeFaixa
  dias: number | null
  texto: string
}

export function estadoDoLote(validade: string | null, hoje: string = hojeBrasil()): EstadoLote {
  const dias = diasAteValidade(validade, hoje)
  const faixa = faixaValidade(validade, hoje)
  if (dias === null) return { bloqueado: false, tom: 'neutro', faixa, dias, texto: 'Sem validade informada' }
  if (dias < 0) return { bloqueado: true, tom: 'bloqueio', faixa, dias, texto: `${textoValidade(dias)}. Bloqueado para aplicação` }
  if (dias <= 30) return { bloqueado: false, tom: 'aviso', faixa, dias, texto: textoValidade(dias) }
  return { bloqueado: false, tom: 'ok', faixa, dias, texto: `Validade ${formatarDia(validade)}` }
}

/** Lotes do mesmo produto na ordem de escolha: os dentro da validade primeiro (vence primeiro, sai primeiro) e os vencidos no fim. */
export function ordenarParaEscolha<T extends Pick<LoteDisponivel, 'validade' | 'lote'>>(lotes: T[], hoje: string = hojeBrasil()): T[] {
  const chave = (l: T) => (l.validade ? l.validade.slice(0, 10) : '9999-12-31')
  return [...lotes].sort((a, b) => {
    const va = loteVencido(a, hoje) ? 1 : 0
    const vb = loteVencido(b, hoje) ? 1 : 0
    if (va !== vb) return va - vb
    const ca = chave(a)
    const cb = chave(b)
    if (ca !== cb) return ca < cb ? -1 : 1
    return a.lote.localeCompare(b.lote, 'pt-BR')
  })
}

export interface ProdutoComLotes {
  itemId: string
  produto: string
  unidade: string
  categoria: string | null
  lotes: LoteDisponivel[]
}

/** Agrupa os lotes por produto (ordem alfabética; injetáveis primeiro). */
export function agruparPorProduto(lotes: LoteDisponivel[], hoje: string = hojeBrasil()): ProdutoComLotes[] {
  const map = new Map<string, ProdutoComLotes>()
  for (const l of lotes) {
    let p = map.get(l.itemId)
    if (!p) { p = { itemId: l.itemId, produto: l.produto, unidade: l.unidade, categoria: l.categoria, lotes: [] }; map.set(l.itemId, p) }
    p.lotes.push(l)
  }
  const prioridade = (p: ProdutoComLotes) => (p.categoria === 'injetavel' ? 0 : 1)
  return [...map.values()]
    .map(p => ({ ...p, lotes: ordenarParaEscolha(p.lotes, hoje) }))
    .sort((a, b) => prioridade(a) - prioridade(b) || a.produto.localeCompare(b.produto, 'pt-BR'))
}

/** Contagem de lotes vencidos e perto de vencer (com saldo), no mesmo formato do Estoque. */
export function alertasDeLotes(lotes: Pick<LoteDisponivel, 'validade' | 'saldo'>[], hoje: string = hojeBrasil()): ResumoAlertas {
  const out: ResumoAlertas = {
    vencidos: { lotes: 0, unidades: 0 }, ate30: { lotes: 0, unidades: 0 }, ate60: { lotes: 0, unidades: 0 }, ate90: { lotes: 0, unidades: 0 },
  }
  for (const l of lotes) {
    if (l.saldo <= 0) continue
    const dias = diasAteValidade(l.validade, hoje)
    if (dias === null) continue
    const add = (k: keyof ResumoAlertas) => { out[k].lotes += 1; out[k].unidades += l.saldo }
    if (dias < 0) add('vencidos')
    else {
      if (dias <= 30) add('ate30')
      if (dias <= 60) add('ate60')
      if (dias <= 90) add('ate90')
    }
  }
  return out
}

// ── Validação do formulário ──────────────────────────────────────────────────

export interface RascunhoAplicacao {
  data: string
  lote: LoteDisponivel | null
  dose: number
  doseUnidade: string
  baixa: number
  regioes: RegiaoAplicada[]
  observacoes: string
}

const DIA = /^\d{4}-\d{2}-\d{2}$/

/** Mensagem do primeiro problema do formulário, ou null se pode registrar. */
export function validarAplicacao(r: RascunhoAplicacao, hoje: string = hojeBrasil()): string | null {
  if (!r.lote) return 'Escolha o produto e o lote usado.'
  if (loteVencido(r.lote, hoje)) return `O lote ${r.lote.lote} venceu em ${formatarDia(r.lote.validade)}. Material vencido não pode ser aplicado: escolha outro lote.`
  if (!DIA.test(r.data) || r.data > hoje) return 'Informe a data da aplicação (não pode ser futura).'
  if (!Number.isFinite(r.dose) || r.dose <= 0) return 'Informe a dose aplicada.'
  if (!r.doseUnidade.trim()) return 'Escolha a unidade da dose.'
  if (!Number.isFinite(r.baixa) || r.baixa <= 0) return 'Informe quanto baixar do estoque.'
  if (r.baixa > r.lote.saldo) return `O lote ${r.lote.lote} tem só ${formatarNumero(r.lote.saldo)}${r.lote.unidade ? ` ${r.lote.unidade}` : ''} em estoque.`
  if (r.regioes.some(x => !x.regiao.trim() && (x.unidades ?? 0) > 0)) return 'Dê um nome à região que tem dose.'
  if (r.observacoes.length > 4000) return 'As observações passam de 4000 caracteres.'
  return null
}

/** Mensagem em português para o erro que a função do banco devolve (o texto do erro é o código). */
export function mensagemDoErro(message: string | null | undefined): string {
  const m = (message ?? '').toLowerCase()
  const tem = (c: string) => m.includes(c)
  if (tem('lote_vencido')) return 'Este lote está vencido e não pode ser usado em aplicação. Atualize a tela e escolha outro lote.'
  if (tem('lote_insuficiente')) return 'O lote não tem saldo suficiente. Atualize a tela e confira a quantidade.'
  if (tem('estoque_insuficiente')) return 'O produto não tem saldo suficiente no estoque. Atualize a tela e confira a quantidade.'
  if (tem('lote_inexistente')) return 'Lote não encontrado. Atualize a tela e escolha de novo.'
  if (tem('paciente_invalido')) return 'Paciente não encontrado nesta clínica.'
  if (tem('termo_invalido')) return 'Este termo não pertence a este paciente.'
  if (tem('aplicacao_estornada') || tem('ja_estornada')) return 'Esta aplicação já foi estornada.'
  if (tem('aplicacao_inexistente')) return 'Aplicação não encontrada. Atualize a tela.'
  if (tem('sem_permissao') || tem('sem_sessao') || tem('row-level security') || tem('permission denied')) return 'Você não tem permissão para registrar aplicações. Fale com quem administra a clínica.'
  if (tem('dados_invalidos')) return 'Algum dado da aplicação está inválido. Confira dose, quantidade e data.'
  return 'Não foi possível salvar agora. Tente de novo.'
}

// ── Aplicação gravada ────────────────────────────────────────────────────────

export interface Aplicacao {
  id: string
  /** AAAA-MM-DD */
  data: string
  tipo: string
  produto: string
  fabricante: string | null
  lote: string
  validade: string | null
  dose: number
  doseUnidade: string
  quantidadeBaixa: number
  regioes: RegiaoAplicada[]
  observacoes: string
  contractId: string | null
  lotId: string | null
  profissionalNome: string
  profissionalRegistro: string
  estornadaEm: string | null
  estornoMotivo: string
  createdAt: string
}

/** Colunas lidas de estetica_aplicacoes (na ordem do tipo `Aplicacao`). */
export const COLUNAS_APLICACAO =
  'id, data, tipo, produto, fabricante, lote, validade, dose, dose_unidade, quantidade_baixa, regioes, observacoes, contract_id, lot_id, profissional_nome, profissional_registro, estornada_em, estorno_motivo, created_at'

export function normalizarAplicacao(row: unknown): Aplicacao | null {
  if (!row || typeof row !== 'object') return null
  const o = row as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const id = str(o.id)
  const data = str(o.data).slice(0, 10)
  const dose = num(o.dose)
  if (!id || !DIA.test(data) || dose === null) return null
  return {
    id, data, dose,
    tipo: str(o.tipo) || 'outro',
    produto: str(o.produto),
    fabricante: str(o.fabricante) || null,
    lote: str(o.lote),
    validade: str(o.validade).slice(0, 10) || null,
    doseUnidade: str(o.dose_unidade) || 'U',
    quantidadeBaixa: num(o.quantidade_baixa) ?? 0,
    regioes: normalizarRegioes(o.regioes),
    observacoes: str(o.observacoes),
    contractId: str(o.contract_id) || null,
    lotId: str(o.lot_id) || null,
    profissionalNome: str(o.profissional_nome),
    profissionalRegistro: str(o.profissional_registro),
    estornadaEm: str(o.estornada_em) || null,
    estornoMotivo: str(o.estorno_motivo),
    createdAt: str(o.created_at),
  }
}

/** Mais recente primeiro (data da aplicação, depois a hora em que foi lançada). */
export function ordenarAplicacoes(lista: Aplicacao[]): Aplicacao[] {
  return [...lista].sort((a, b) => (a.data !== b.data ? (a.data < b.data ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1))
}

/** Aplicações que valem (sem as estornadas). */
export const aplicacoesValidas = (lista: Aplicacao[]): Aplicacao[] => lista.filter(a => !a.estornadaEm)

// ── Termo de consentimento (módulo de contratos) ─────────────────────────────

export interface TermoLike { id: string; title: string; status: ContractStatus; createdAt: string }

/** Termos que servem de consentimento: tudo que não foi cancelado, os assinados primeiro e, dentro do grupo, o mais recente. */
export function termosUteis<T extends TermoLike>(termos: T[]): T[] {
  const peso = (t: T) => (t.status === 'assinado' ? 0 : t.status === 'enviado' ? 1 : 2)
  return termos.filter(t => t.status !== 'cancelado').sort((a, b) => peso(a) - peso(b) || (a.createdAt < b.createdAt ? 1 : -1))
}

export const rotuloTermo = (t: Pick<TermoLike, 'title' | 'status'>): string => `${t.title} (${STATUS_LABEL[t.status]})`
