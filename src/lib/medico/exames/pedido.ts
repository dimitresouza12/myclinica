// Pedido de exames estruturado: itens do catálogo (ou exame livre), urgência, indicação clínica e CID. Modelo de dados
// versionado (v:1) guardado em medico_registros (tipo 'pedido_exames'), validação e o HTML do impresso. Lógica pura,
// testada em pedido.test.ts.

import { examePorId, type ExameCatalogo } from './catalogo'
import { assinaturaHtml, cabecalhoHtml, ESTILO_TD, esc, type CabecalhoImpresso, type ProfissionalImpresso } from '../impresso'

export type Urgencia = 'rotina' | 'urgente'

export const URGENCIA_ROTULO: Record<Urgencia, string> = { rotina: 'Rotina', urgente: 'Urgente' }

export interface ItemExame {
  /** Id do catálogo; vazio no exame digitado à mão. */
  id: string | null
  nome: string
  categoria: string
  /** Código TUSS do catálogo (se houver). */
  tuss: string | null
}

export interface PedidoExamesDados {
  v: 1
  urgencia: Urgencia
  itens: ItemExame[]
  /** Indicação clínica em texto livre (hipótese, motivo do pedido). */
  indicacao: string
  /** CID-10 informado pelo profissional ("E11.9 - Diabetes mellitus..." ou só o código). */
  cid: string
  /** Preparo, jejum, local de coleta ou qualquer orientação ao paciente. */
  observacoes: string
  profissional: ProfissionalImpresso | null
}

export const MAX_ITENS = 40
export const MAX_INDICACAO = 600
export const MAX_OBSERVACOES = 600
export const MAX_NOME_EXAME = 140
export const CATEGORIA_LIVRE = 'Outros exames'

export function pedidoVazio(): PedidoExamesDados {
  return { v: 1, urgencia: 'rotina', itens: [], indicacao: '', cid: '', observacoes: '', profissional: null }
}

/** Item a partir de um exame do catálogo. */
export function itemDoCatalogo(e: ExameCatalogo): ItemExame {
  return { id: e.id, nome: e.nome, categoria: e.categoria, tuss: e.tuss ?? null }
}

/** Item digitado à mão (fora do catálogo). */
export function itemLivre(nome: string): ItemExame {
  return { id: null, nome: nome.trim().replace(/\s+/g, ' ').slice(0, MAX_NOME_EXAME), categoria: CATEGORIA_LIVRE, tuss: null }
}

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function profissionalDe(v: unknown): ProfissionalImpresso | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const nome = texto(o.nome, 160)
  return nome ? { nome, registro: texto(o.registro, 60), rqe: texto(o.rqe, 40) } : null
}

/** Lê o JSON gravado (de qualquer versão ou lixo) e devolve sempre um pedido válido para a tela. */
export function normalizarPedido(raw: unknown): PedidoExamesDados {
  const base = pedidoVazio()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>
  const itens: ItemExame[] = []
  if (Array.isArray(o.itens)) {
    for (const it of o.itens) {
      if (!it || typeof it !== 'object') continue
      const r = it as Record<string, unknown>
      const id = typeof r.id === 'string' && r.id ? r.id : null
      const doCatalogo = id ? examePorId(id) : undefined
      // exame do catálogo mantém o nome gravado (o que foi impresso naquele dia), cai no catálogo só se o nome sumiu
      const nome = texto(r.nome, MAX_NOME_EXAME) || doCatalogo?.nome || ''
      if (!nome) continue
      itens.push({
        id: doCatalogo ? id : null,
        nome,
        categoria: texto(r.categoria, 80) || doCatalogo?.categoria || CATEGORIA_LIVRE,
        tuss: typeof r.tuss === 'string' && /^\d{8}$/.test(r.tuss) ? r.tuss : null,
      })
      if (itens.length >= MAX_ITENS) break
    }
  }
  return {
    v: 1,
    urgencia: o.urgencia === 'urgente' ? 'urgente' : 'rotina',
    itens,
    indicacao: texto(o.indicacao, MAX_INDICACAO),
    cid: texto(o.cid, 200),
    observacoes: texto(o.observacoes, MAX_OBSERVACOES),
    profissional: profissionalDe(o.profissional),
  }
}

/** True se o formulário tem algo digitado (serve ao aviso de "não salvo"). */
export function pedidoTemConteudo(d: PedidoExamesDados): boolean {
  return d.itens.length > 0 || d.indicacao.trim() !== '' || d.cid.trim() !== '' || d.observacoes.trim() !== ''
}

/** Alterna um exame do catálogo na seleção (marca ou desmarca). Respeita o limite de itens. */
export function alternarExame(itens: ItemExame[], e: ExameCatalogo): ItemExame[] {
  if (itens.some(i => i.id === e.id)) return itens.filter(i => i.id !== e.id)
  return itens.length >= MAX_ITENS ? itens : [...itens, itemDoCatalogo(e)]
}

/** Acrescenta um exame livre, sem repetir o mesmo nome (sem acento nem maiúscula). */
export function adicionarLivre(itens: ItemExame[], nome: string): ItemExame[] {
  const novo = itemLivre(nome)
  const chave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (!novo.nome || itens.length >= MAX_ITENS || itens.some(i => chave(i.nome) === chave(novo.nome))) return itens
  return [...itens, novo]
}

/** Erros que impedem de salvar ou imprimir (lista vazia = pode). Mensagens prontas para a tela. */
export function validarPedido(d: PedidoExamesDados): string[] {
  const erros: string[] = []
  if (d.itens.length === 0) erros.push('Escolha pelo menos um exame.')
  if (!d.indicacao.trim() && !d.cid.trim()) erros.push('Informe a indicação clínica ou o CID: operadoras e laboratórios costumam exigir.')
  if (d.indicacao.length > MAX_INDICACAO) erros.push(`A indicação clínica passa de ${MAX_INDICACAO} caracteres.`)
  if (d.observacoes.length > MAX_OBSERVACOES) erros.push(`As observações passam de ${MAX_OBSERVACOES} caracteres.`)
  return erros
}

/** Resumo de uma linha do pedido para o histórico: "Hemograma completo, Glicemia de jejum e mais 3". */
export function resumoDoPedido(d: PedidoExamesDados, max = 2): string {
  const nomes = d.itens.map(i => i.nome)
  if (nomes.length === 0) return 'Sem exames'
  if (nomes.length <= max) return nomes.join(', ')
  const resto = nomes.length - max
  return `${nomes.slice(0, max).join(', ')} e mais ${resto}`
}

/** Itens agrupados por categoria, na ordem da primeira aparição (os exames livres vão por último). */
export function agruparPorCategoria(itens: ItemExame[]): { categoria: string; itens: ItemExame[] }[] {
  const grupos: { categoria: string; itens: ItemExame[] }[] = []
  for (const it of itens) {
    const g = grupos.find(x => x.categoria === it.categoria)
    if (g) g.itens.push(it)
    else grupos.push({ categoria: it.categoria, itens: [it] })
  }
  const livre = grupos.findIndex(g => g.categoria === CATEGORIA_LIVRE)
  if (livre >= 0 && livre !== grupos.length - 1) grupos.push(...grupos.splice(livre, 1))
  return grupos
}

/** HTML do impresso "SOLICITAÇÃO DE EXAMES". Mesmo estilo dos demais documentos do prontuário. */
export function htmlPedidoExames(c: CabecalhoImpresso, d: PedidoExamesDados): string {
  const grupos = agruparPorCategoria(d.itens)
  const temTuss = d.itens.some(i => i.tuss)
  let n = 0
  const blocos = grupos.map(g => `
    <div style="margin:14px 0 4px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#555;page-break-after:avoid">${esc(g.categoria)}</div>
    <table style="width:100%;border-collapse:collapse">
      <tbody>
        ${g.itens.map(i => `<tr style="page-break-inside:avoid"><td style="${ESTILO_TD};width:28px;color:#555">${++n}.</td><td style="${ESTILO_TD}">${esc(i.nome)}</td>${temTuss ? `<td style="${ESTILO_TD};width:84px;text-align:right;color:#555;white-space:nowrap">${i.tuss ? esc(i.tuss) : ''}</td>` : ''}</tr>`).join('')}
      </tbody>
    </table>`).join('')

  const cabecalhoTuss = temTuss ? `<div style="font-size:10.5px;color:#777;text-align:right;margin-top:4px">Coluna da direita: código TUSS, quando informado.</div>` : ''

  return `${cabecalhoHtml(c, 'SOLICITAÇÃO DE EXAMES', d.urgencia === 'urgente' ? 'URGENTE' : undefined)}
    ${d.indicacao.trim() ? `<div style="margin-bottom:6px;font-size:12.5px;white-space:pre-wrap"><strong>Indicação clínica:</strong> ${esc(d.indicacao)}</div>` : ''}
    ${d.cid.trim() ? `<div style="margin-bottom:6px;font-size:12.5px"><strong>CID-10:</strong> ${esc(d.cid)}</div>` : ''}
    <div style="margin:12px 0 0;font-size:13px;font-weight:700">Solicito os seguintes exames:</div>
    ${blocos}
    ${cabecalhoTuss}
    ${d.observacoes.trim() ? `<div style="margin-top:14px;font-size:12.5px;white-space:pre-wrap"><strong>Observações:</strong> ${esc(d.observacoes)}</div>` : ''}
    ${assinaturaHtml(c.profissional)}`
}
