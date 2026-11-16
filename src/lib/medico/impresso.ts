// Peças comuns dos impressos da Medicina (pedido de exames e receita): cabeçalho da clínica, identificação do paciente,
// data e assinatura com o nome e o registro do profissional. Mesmo mecanismo de impressão dos demais documentos do
// prontuário (printDocumento, src/lib/print.ts: janela de impressão / Salvar PDF). HTML puro, testável; todo texto
// digitado passa por `esc`.

import { buildDocumentoHtml, esc, printDocumento, printHtmlInWindow } from '@/lib/print'
import { openPrintWindow } from '@/lib/documentRender'
import { formatDateBr } from '@/lib/documentos/campos'

export { esc }

export interface ProfissionalImpresso {
  nome: string
  /** "CRM 12345" (já com a sigla do conselho) */
  registro: string
  /** "RQE 678" */
  rqe: string
}

export interface CabecalhoImpresso {
  clinica: string
  /** Texto livre: endereço e telefone da clínica. */
  detalhe?: string
  paciente: string
  /** "CPF 000.000.000-00 | Nascimento 01/02/2020" (só o que existir). */
  pacienteDetalhe?: string
  /** Dia do documento, "AAAA-MM-DD". */
  data: string
  profissional: ProfissionalImpresso
}

export const ESTILO_TH = 'text-align:left;padding:5px 6px;border-bottom:2px solid #333;font-size:11px;text-transform:uppercase;color:#555'
export const ESTILO_TD = 'padding:6px;border-bottom:1px solid #e5e5e5;font-size:12.5px;vertical-align:top'

/** Cabeçalho do impresso: clínica, título do documento e identificação do paciente. */
export function cabecalhoHtml(c: CabecalhoImpresso, titulo: string, selo?: string): string {
  return `
    <div style="padding-bottom:10px;border-bottom:2px solid #333;margin-bottom:14px">
      <div style="font-size:18px;font-weight:800">${esc(c.clinica)}</div>
      ${c.detalhe ? `<div style="font-size:11.5px;color:#555">${esc(c.detalhe)}</div>` : ''}
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px">
      <div style="font-size:17px;font-weight:800;letter-spacing:0.02em">${esc(titulo)}</div>
      ${selo ? `<div style="border:2px solid #111;padding:2px 10px;font-size:12px;font-weight:800;letter-spacing:0.06em">${esc(selo)}</div>` : ''}
    </div>
    <div style="font-size:12.5px;margin-bottom:2px">Paciente: <strong>${esc(c.paciente)}</strong></div>
    ${c.pacienteDetalhe ? `<div style="font-size:11.5px;color:#444;margin-bottom:2px">${esc(c.pacienteDetalhe)}</div>` : ''}
    <div style="font-size:11.5px;color:#444;margin-bottom:14px">Data: ${esc(formatDateBr(c.data))}</div>`
}

/** Linha de assinatura com nome e registro. Sem profissional identificado, deixa a linha em branco para carimbo. */
export function assinaturaHtml(p: ProfissionalImpresso): string {
  const ident = [p.registro, p.rqe].filter(Boolean).join(' | ')
  return `
    <div style="margin-top:56px;max-width:340px;page-break-inside:avoid">
      <div style="border-top:1px solid #333;padding-top:6px;text-align:center;font-size:12.5px">
        <div style="font-weight:700">${esc(p.nome || ' ')}</div>
        ${ident ? `<div style="font-size:11.5px;color:#444">${esc(ident)}</div>` : ''}
      </div>
    </div>`
}

/** Entrega o HTML à janela de impressão do navegador (Imprimir ou Salvar como PDF). */
export function imprimirMedico(html: string) {
  printDocumento(html, null)
}

/**
 * Abre a janela de impressão AGORA, ainda dentro do clique: quem salva antes de imprimir (espera assíncrona) precisa
 * dela aberta de antemão, senão o navegador bloqueia o pop-up. Devolve null se o navegador bloqueou.
 */
export function abrirJanelaDeImpressao(): Window | null {
  return openPrintWindow()
}

/** Escreve o HTML na janela já aberta por abrirJanelaDeImpressao e imprime. */
export function imprimirNaJanela(w: Window, html: string): Promise<void> {
  return printHtmlInWindow(w, buildDocumentoHtml(html, null))
}
