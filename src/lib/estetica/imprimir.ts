// Impressos da Estética: ficha de aplicação (com lote, dose, regiões e mapa) e histórico de aplicações do paciente.
// Os construtores devolvem HTML puro (testável); `imprimirEstetica` entrega ao mecanismo de impressão do prontuário
// (printDocumento, src/lib/print.ts). Todo texto digitado passa por `esc`.

import { printDocumento, esc } from '@/lib/print'
import { FACE_VH, FACE_VW, FACE_ZONE_SHAPES } from '@/lib/faceograma'
import { formatarDia } from '@/lib/estoque/lotes'
import { aplicacoesValidas, rotuloTipo, corDoTipo, textoDose, resumoRegioes, type Aplicacao } from './aplicacoes'

export interface CabecalhoEstetica {
  clinica: string
  paciente: string
  /** Texto livre, ex.: telefone ou endereço da clínica. */
  detalhe?: string
}

const hojeBr = () => new Date().toLocaleDateString('pt-BR')

const TH = 'text-align:left;padding:4px 6px;border-bottom:2px solid #333;font-size:10.5px;text-transform:uppercase;color:#555'
const TD = 'padding:5px 6px;border-bottom:1px solid #e5e5e5;font-size:12px;vertical-align:top'

function cabecalho(c: CabecalhoEstetica, titulo: string): string {
  return `
    <div style="padding-bottom:10px;border-bottom:2px solid #333;margin-bottom:12px">
      <div style="font-size:18px;font-weight:800">${esc(c.clinica)}</div>
      ${c.detalhe ? `<div style="font-size:11.5px;color:#555">${esc(c.detalhe)}</div>` : ''}
    </div>
    <div style="font-size:17px;font-weight:800;margin-bottom:2px">${esc(titulo)}</div>
    <div style="font-size:12.5px;color:#444;margin-bottom:10px">Paciente: <strong>${esc(c.paciente)}</strong> &nbsp;|&nbsp; Emitido em ${hojeBr()}</div>`
}

const assinaturas = `
  <div style="margin-top:38px;display:flex;gap:28px;font-size:12px;color:#444">
    <div style="flex:1;border-top:1px solid #333;padding-top:4px">Paciente ou responsável</div>
    <div style="flex:1;border-top:1px solid #333;padding-top:4px">Profissional responsável</div>
  </div>`

const campo = (rotulo: string, valor: string) =>
  `<div style="flex:1 1 150px;min-width:140px"><div style="font-size:10px;text-transform:uppercase;color:#666">${esc(rotulo)}</div><div style="font-size:13px;font-weight:700">${valor || '-'}</div></div>`

/** Mapa do rosto sem foto: as zonas em cinza claro e os pontos numerados na cor do tipo. Só desenha regiões que têm ponto. */
export function svgMapaAplicacao(a: Pick<Aplicacao, 'tipo' | 'regioes'>): string {
  const cor = corDoTipo(a.tipo)
  const pontos = a.regioes.map((r, i) => ({ r, n: i + 1 })).filter(p => p.r.x !== null && p.r.y !== null)
  if (pontos.length === 0) return ''
  const zonas = FACE_ZONE_SHAPES.map(z => `<ellipse cx="${z.cx}" cy="${z.cy}" rx="${z.rx}" ry="${z.ry}" fill="none" stroke="#d4d4d4" stroke-width="0.8"/>`).join('')
  const dots = pontos.map(({ r, n }) =>
    `<circle cx="${r.x}" cy="${r.y}" r="6" fill="${cor}" stroke="#fff" stroke-width="1"/><text x="${r.x}" y="${(r.y ?? 0) + 2.6}" font-size="7.5" font-weight="700" text-anchor="middle" fill="#fff" font-family="Arial,sans-serif">${n}</text>`,
  ).join('')
  return `<svg viewBox="0 0 ${FACE_VW} ${FACE_VH}" width="260" height="${Math.round(260 * FACE_VH / FACE_VW)}" style="border:1px solid #ccc;border-radius:6px" role="img" aria-label="Mapa das regiões aplicadas">${zonas}${dots}</svg>`
}

function tabelaRegioes(a: Aplicacao): string {
  if (a.regioes.length === 0) return ''
  return `
    <table style="width:100%;border-collapse:collapse;margin-top:6px">
      <thead><tr><th style="${TH};width:34px">N.</th><th style="${TH}">Região</th><th style="${TH};text-align:right">Dose</th></tr></thead>
      <tbody>${a.regioes.map((r, i) => `<tr><td style="${TD}">${r.x !== null ? i + 1 : ''}</td><td style="${TD}">${esc(r.regiao || '-')}</td><td style="${TD};text-align:right">${r.unidades !== null ? esc(textoDose(r.unidades, a.doseUnidade)) : '-'}</td></tr>`).join('')}</tbody>
    </table>`
}

/** Ficha de UMA aplicação: o que foi usado (produto, fabricante, lote, validade), dose, regiões com mapa, termo e assinaturas. */
export function htmlFichaAplicacao(c: CabecalhoEstetica, a: Aplicacao, termo?: { titulo: string; situacao: string } | null): string {
  const mapa = svgMapaAplicacao(a)
  return `
    ${cabecalho(c, 'FICHA DE APLICAÇÃO')}
    ${a.estornadaEm ? `<div style="margin-bottom:10px;padding:6px 8px;border:1.5px solid #b91c1c;color:#b91c1c;font-size:12px;font-weight:700">APLICAÇÃO ESTORNADA${a.estornoMotivo ? `: ${esc(a.estornoMotivo)}` : ''}</div>` : ''}
    <div style="display:flex;flex-wrap:wrap;gap:10px 18px;margin-bottom:12px">
      ${campo('Data da aplicação', esc(formatarDia(a.data)))}
      ${campo('Tipo', esc(rotuloTipo(a.tipo)))}
      ${campo('Dose total', esc(textoDose(a.dose, a.doseUnidade)))}
    </div>
    <div style="font-size:11px;text-transform:uppercase;font-weight:800;color:#333;margin:8px 0 4px">Produto e lote</div>
    <div style="display:flex;flex-wrap:wrap;gap:10px 18px;padding:8px 10px;border:1px solid #bbb;border-radius:6px">
      ${campo('Produto', esc(a.produto))}
      ${campo('Fabricante', esc(a.fabricante ?? ''))}
      ${campo('Lote', esc(a.lote))}
      ${campo('Validade', esc(formatarDia(a.validade)))}
    </div>
    <div style="font-size:11px;text-transform:uppercase;font-weight:800;color:#333;margin:14px 0 4px">Regiões aplicadas</div>
    ${a.regioes.length === 0 ? '<div style="font-size:12px;color:#555">Regiões não detalhadas nesta aplicação.</div>' : `<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">${mapa ? `<div>${mapa}</div>` : ''}<div style="flex:1 1 220px;min-width:200px">${tabelaRegioes(a)}</div></div>`}
    ${a.observacoes ? `<div style="font-size:11px;text-transform:uppercase;font-weight:800;color:#333;margin:14px 0 4px">Observações e técnica</div><div style="font-size:12.5px;white-space:pre-wrap">${esc(a.observacoes)}</div>` : ''}
    <div style="font-size:11px;text-transform:uppercase;font-weight:800;color:#333;margin:14px 0 4px">Termo de consentimento</div>
    <div style="font-size:12.5px">${termo ? `${esc(termo.titulo)} (${esc(termo.situacao)})` : 'Nenhum termo vinculado a esta aplicação.'}</div>
    <div style="margin-top:12px;font-size:12px;color:#444">Profissional: <strong>${esc(a.profissionalNome || '-')}</strong>${a.profissionalRegistro ? ` &nbsp;|&nbsp; Registro: ${esc(a.profissionalRegistro)}` : ''}</div>
    ${assinaturas}`
}

/** Histórico do paciente: uma linha por aplicação (data, produto, lote, validade, dose e regiões). Estornadas ficam de fora. */
export function htmlHistoricoAplicacoes(c: CabecalhoEstetica, lista: Aplicacao[]): string {
  const validas = aplicacoesValidas(lista)
  const linhas = validas.map(a => `
    <tr>
      <td style="${TD};white-space:nowrap">${esc(formatarDia(a.data))}</td>
      <td style="${TD}">${esc(a.produto)}<div style="font-size:10.5px;color:#666">${esc(rotuloTipo(a.tipo))}${a.fabricante ? ` | ${esc(a.fabricante)}` : ''}</div></td>
      <td style="${TD}">${esc(a.lote)}<div style="font-size:10.5px;color:#666">Val. ${esc(formatarDia(a.validade))}</div></td>
      <td style="${TD};white-space:nowrap">${esc(textoDose(a.dose, a.doseUnidade))}</td>
      <td style="${TD}">${esc(resumoRegioes(a.regioes, a.doseUnidade) || '-')}</td>
    </tr>`).join('')
  return `
    ${cabecalho(c, 'HISTÓRICO DE APLICAÇÕES')}
    ${validas.length === 0
      ? '<div style="font-size:12.5px;color:#555">Nenhuma aplicação registrada.</div>'
      : `<table style="width:100%;border-collapse:collapse">
          <thead><tr><th style="${TH}">Data</th><th style="${TH}">Produto</th><th style="${TH}">Lote</th><th style="${TH}">Dose</th><th style="${TH}">Regiões</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>`}
    <div style="margin-top:34px;font-size:12px;color:#444">Profissional responsável: ______________________________________</div>`
}

export function imprimirEstetica(html: string) {
  printDocumento(html, null)
}
