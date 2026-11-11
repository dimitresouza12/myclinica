// Impressos da Nutrição (plano alimentar, substituições, lista de compras, evolução). Os construtores devolvem HTML
// puro (testável); `imprimirNutri` entrega ao mecanismo de impressão do prontuário (printDocumento, src/lib/print.ts),
// que abre a janela de impressão / Salvar PDF. Todo texto digitado passa por `esc`.

import { printDocumento } from '@/lib/print'
import {
  indexarCatalogo, substituicoesEquivalentes, type Alimento,
} from './alimentos'
import {
  formatarPeso, listaDeCompras, progressoDoDia, totaisDoPlano, type PlanoDados,
} from './plano'
import { formatarNumero } from './validacao'
import { SERIES, variacao, type PontoSerie, type SerieChave } from './avaliacao'

export interface CabecalhoImpresso {
  clinica: string
  paciente: string
  /** Texto livre, ex.: telefone ou endereço da clínica. */
  detalhe?: string
}

export const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const dataBr = (iso: string) => { const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso }
const hojeBr = () => new Date().toLocaleDateString('pt-BR')

const TH = 'text-align:left;padding:5px 6px;border-bottom:2px solid #333;font-size:11px;text-transform:uppercase;color:#555'
const THR = TH.replace('text-align:left', 'text-align:right')
const TD = 'padding:5px 6px;border-bottom:1px solid #e5e5e5;font-size:12.5px;vertical-align:top'
const TDR = TD + ';text-align:right;white-space:nowrap'

function cabecalho(c: CabecalhoImpresso, titulo: string, subtitulo?: string): string {
  return `
    <div style="padding-bottom:10px;border-bottom:2px solid #333;margin-bottom:14px">
      <div style="font-size:18px;font-weight:800">${esc(c.clinica)}</div>
      ${c.detalhe ? `<div style="font-size:11.5px;color:#555">${esc(c.detalhe)}</div>` : ''}
    </div>
    <div style="font-size:17px;font-weight:800;margin-bottom:2px">${esc(titulo)}</div>
    <div style="font-size:12.5px;color:#444;margin-bottom:12px">Paciente: <strong>${esc(c.paciente)}</strong> &nbsp;|&nbsp; Emitido em ${hojeBr()}${subtitulo ? ` &nbsp;|&nbsp; ${esc(subtitulo)}` : ''}</div>`
}

const assinatura = `<div style="margin-top:36px;font-size:12px;color:#444">Nutricionista (CRN): ______________________________________</div>`

const g = (n: number) => formatarNumero(n, 0)
const g1 = (n: number) => formatarNumero(n, 1)

/** Plano alimentar para o paciente: refeições com alimento, quantidade, medida caseira e energia. */
export function htmlPlano(c: CabecalhoImpresso, plano: PlanoDados, catalogo: Alimento[]): string {
  const { refeicoes, dia } = totaisDoPlano(plano, catalogo)
  const prog = progressoDoDia(dia, plano.meta)
  const blocos = refeicoes.map(r => `
    <div style="margin:14px 0 4px;font-size:13.5px;font-weight:700;page-break-inside:avoid">${esc(r.refeicao.nome || 'Refeição')}${r.refeicao.horario ? ` <span style="font-weight:400;color:#555">às ${esc(r.refeicao.horario)}</span>` : ''}</div>
    <table style="width:100%;border-collapse:collapse;page-break-inside:avoid">
      <thead><tr><th style="${TH}">Alimento</th><th style="${THR}">Quantidade</th><th style="${TH}">Medida caseira</th><th style="${THR}">kcal</th></tr></thead>
      <tbody>
        ${r.itens.length === 0 ? `<tr><td style="${TD};color:#888" colspan="4">Sem alimentos nesta refeição.</td></tr>` : r.itens.map(i => `
          <tr><td style="${TD}">${esc(i.alimento?.nome ?? 'Alimento removido')}</td><td style="${TDR}">${g(i.item.gramas)} g</td><td style="${TD}">${esc(i.item.medida ?? '')}</td><td style="${TDR}">${g(i.nutrientes.kcal)}</td></tr>`).join('')}
      </tbody>
      <tfoot><tr><td style="${TD};font-weight:700" colspan="3">Total da refeição</td><td style="${TDR};font-weight:700">${g(r.total.kcal)}</td></tr></tfoot>
    </table>
    ${r.refeicao.obs ? `<div style="font-size:12px;color:#444;margin-top:4px">Obs.: ${esc(r.refeicao.obs)}</div>` : ''}`).join('')

  const linhaProg = (p: (typeof prog)[number]) =>
    `<tr><td style="${TD}">${p.rotulo}</td><td style="${TDR}">${p.chave === 'kcal' ? g(p.atual) : g1(p.atual)} ${p.un}</td><td style="${TDR}">${p.meta !== null ? `${p.chave === 'kcal' ? g(p.meta) : g1(p.meta)} ${p.un}` : '—'}</td></tr>`

  return `${cabecalho(c, plano.titulo || 'Plano alimentar')}
    ${blocos}
    <div style="margin:18px 0 4px;font-size:13.5px;font-weight:700;page-break-inside:avoid">Resumo do dia</div>
    <table style="width:100%;border-collapse:collapse;page-break-inside:avoid">
      <thead><tr><th style="${TH}">Nutriente</th><th style="${THR}">Plano</th><th style="${THR}">Meta</th></tr></thead>
      <tbody>${prog.map(linhaProg).join('')}<tr><td style="${TD}">Fibra</td><td style="${TDR}">${g1(dia.fibra)} g</td><td style="${TDR}">—</td></tr></tbody>
    </table>
    ${plano.observacoes ? `<div style="margin-top:14px;font-size:12.5px;white-space:pre-wrap"><strong>Orientações:</strong> ${esc(plano.observacoes)}</div>` : ''}
    <div style="margin-top:14px;font-size:10.5px;color:#777">Valores calculados com a TACO (4ª edição, NEPA/UNICAMP, 2011) e/ou dados informados pela clínica. As quantidades se referem ao alimento no preparo indicado.</div>
    ${assinatura}`
}

/** Substituições: para cada alimento do plano, trocas equivalentes (mesma energia, até 10% de diferença). */
export function htmlSubstituicoes(c: CabecalhoImpresso, plano: PlanoDados, catalogo: Alimento[], porItem = 6): string {
  const idx = indexarCatalogo(catalogo)
  const vistos = new Set<string>()
  const blocos: string[] = []
  for (const r of plano.refeicoes) {
    for (const i of r.itens) {
      const a = idx.get(i.alimentoId)
      const chave = `${i.alimentoId}|${i.gramas}`
      if (!a || vistos.has(chave)) continue
      vistos.add(chave)
      const subs = substituicoesEquivalentes(a, i.gramas, catalogo, { max: porItem })
      if (subs.length === 0) continue
      blocos.push(`
        <div style="margin:12px 0 4px;font-size:13px;font-weight:700;page-break-inside:avoid">${g(i.gramas)} g de ${esc(a.nome)} <span style="font-weight:400;color:#555">(${esc(r.nome)}, ${g(Math.round(a.kcal * i.gramas / 100))} kcal)</span> pode ser trocado por:</div>
        <table style="width:100%;border-collapse:collapse;page-break-inside:avoid">
          <tbody>${subs.map(s => `<tr><td style="${TD}">${esc(s.alimento.nome)}</td><td style="${TDR}">${g(s.gramas)} g</td><td style="${TDR}">${g(s.kcal)} kcal</td></tr>`).join('')}</tbody>
        </table>`)
    }
  }
  return `${cabecalho(c, 'Lista de substituições', plano.titulo)}
    ${blocos.length > 0 ? blocos.join('') : '<div style="font-size:12.5px;color:#666">Adicione alimentos ao plano para gerar as trocas.</div>'}
    <div style="margin-top:14px;font-size:10.5px;color:#777">As trocas mantêm a energia do item original (diferença de no máximo 10%) dentro do mesmo grupo de alimentos; os macronutrientes podem variar. Combine as trocas com o nutricionista.</div>
    ${assinatura}`
}

/** Lista de compras: soma do plano multiplicada pelos dias, por grupo. */
export function htmlCompras(c: CabecalhoImpresso, plano: PlanoDados, catalogo: Alimento[], dias = 7): string {
  const grupos = listaDeCompras(plano, catalogo, dias)
  const periodo = dias === 7 ? 'semana (7 dias)' : `${dias} dia${dias === 1 ? '' : 's'}`
  return `${cabecalho(c, 'Lista de compras', `Período: ${periodo}`)}
    ${grupos.length === 0 ? '<div style="font-size:12.5px;color:#666">Adicione alimentos ao plano para gerar a lista.</div>' : grupos.map(gr => `
      <div style="margin:14px 0 4px;font-size:13px;font-weight:700;page-break-inside:avoid">${esc(gr.rotulo)}</div>
      <table style="width:100%;border-collapse:collapse;page-break-inside:avoid">
        <tbody>${gr.itens.map(i => `<tr><td style="${TD};width:22px">&#9744;</td><td style="${TD}">${esc(i.alimento.nome)}</td><td style="${TDR}">${formatarPeso(i.gramasTotal)}</td><td style="${TDR};color:#777">${g(i.gramasPorDia)} g/dia</td></tr>`).join('')}</tbody>
      </table>`).join('')}
    <div style="margin-top:14px;font-size:10.5px;color:#777">As quantidades seguem o preparo do plano (por exemplo, arroz já cozido). Para itens crus, com casca ou com perdas, compre um pouco a mais.</div>`
}

/** Evolução: tabela de medidas por data (sem gráfico, que não sai bem no papel de todo navegador). */
export function htmlEvolucao(c: CabecalhoImpresso, series: Record<SerieChave, PontoSerie[]>): string {
  // uma linha por avaliação (o banco permite mais de uma no mesmo dia), em ordem de data
  const porId = new Map<string, string>()
  for (const s of SERIES) for (const p of series[s.chave]) if (!porId.has(p.id)) porId.set(p.id, p.data)
  const linhas = [...porId.entries()].map(([id, data]) => ({ id, data })).sort((a, b) => a.data.localeCompare(b.data))
  const valor = (k: SerieChave, id: string) => series[k].find(p => p.id === id)?.valor
  return `${cabecalho(c, 'Evolução antropométrica')}
    ${linhas.length === 0 ? '<div style="font-size:12.5px;color:#666">Sem avaliações registradas.</div>' : `
    <table style="width:100%;border-collapse:collapse">
      <thead><tr><th style="${TH}">Data</th>${SERIES.map(s => `<th style="${THR}">${s.rotulo} (${s.un})</th>`).join('')}</tr></thead>
      <tbody>${linhas.map(l => `<tr><td style="${TD}">${esc(dataBr(l.data))}</td>${SERIES.map(s => { const v = valor(s.chave, l.id); return `<td style="${TDR}">${v === undefined ? '—' : formatarNumero(v, 1)}</td>` }).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr><td style="${TD};font-weight:700">Variação</td>${SERIES.map(s => { const v = variacao(series[s.chave]); return `<td style="${TDR};font-weight:700">${v === null ? '—' : `${v > 0 ? '+' : ''}${formatarNumero(v, 1)}`}</td>` }).join('')}</tr></tfoot>
    </table>`}
    ${assinatura}`
}

/** Entrega o HTML à janela de impressão do navegador (Imprimir ou Salvar como PDF). */
export function imprimirNutri(html: string) {
  printDocumento(html, null)
}
