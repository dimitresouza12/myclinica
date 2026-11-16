// Impresso da prescrição de exercícios. O construtor devolve HTML puro (testável); `imprimirPrograma` entrega ao
// mecanismo de impressão do prontuário (printDocumento, src/lib/print.ts: Imprimir ou Salvar como PDF).
// Todo texto digitado passa por `esc`; a foto só entra se vier como URL assinada http(s).

import { printDocumento } from '@/lib/print'
import { dataBr } from '@/lib/vet/datas'
import { rotuloRegiao, textoDaDose, textoDaFrequencia, lerVideo, type ItemPrescricao, type Prescricao } from './exercicios'

export const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface CabecalhoPrograma {
  clinica: string
  /** endereço e telefone da clínica, texto livre */
  detalhe?: string
  paciente: string
  /** AAAA-MM-DD de hoje (data de emissão) */
  emitidoEm: string
}

export interface ProfissionalPrograma {
  nome: string
  /** "CREFITO-3 12345-F" já formatado; vazio quando não cadastrado */
  registro: string
}

const seguro = (url: string | undefined) => (url && /^https?:\/\//i.test(url) && !/["'<>\s]/.test(url) ? url : '')

function blocoItem(i: ItemPrescricao, n: number, foto: string): string {
  const dose = textoDaDose(i.sets, i.reps)
  const regiao = rotuloRegiao(i.region)
  const video = i.video_url ? lerVideo(i.video_url) : null
  const linhas = [
    [dose, textoDaFrequencia(i.times_per_week)].filter(Boolean).join('  |  '),
    regiao ? `Região: ${regiao}` : '',
  ].filter(Boolean)
  return `
    <div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #ddd;page-break-inside:avoid">
      ${foto ? `<img src="${esc(foto)}" alt="" style="width:96px;height:96px;object-fit:cover;border-radius:6px;flex:none" />` : ''}
      <div style="min-width:0;flex:1">
        <div style="font-size:14px;font-weight:700">${n}. ${esc(i.name)}</div>
        ${linhas.map(l => `<div style="font-size:12px;color:#333;margin-top:2px">${esc(l)}</div>`).join('')}
        ${i.description ? `<div style="font-size:12px;margin-top:4px;white-space:pre-wrap">${esc(i.description)}</div>` : ''}
        ${i.notes ? `<div style="font-size:12px;margin-top:4px;font-style:italic">${esc(i.notes)}</div>` : ''}
        ${video ? `<div style="font-size:11px;color:#555;margin-top:4px">Vídeo: ${esc(video.url)}</div>` : ''}
      </div>
    </div>`
}

/** Programa completo: cabeçalho da clínica, paciente, orientações, exercícios (com foto quando houver) e assinatura. */
export function htmlPrograma(c: CabecalhoPrograma, programa: Prescricao, itens: ItemPrescricao[], fotos: ReadonlyMap<string, string>, profissional: ProfissionalPrograma | null): string {
  const ordem = [...itens].sort((a, b) => a.sort_order - b.sort_order)
  const assinatura = profissional
    ? `${esc(profissional.nome)}${profissional.registro ? ` - ${esc(profissional.registro)}` : ''}`
    : '______________________________________'
  return `
    <div style="padding-bottom:10px;border-bottom:2px solid #333;margin-bottom:14px">
      <div style="font-size:18px;font-weight:800">${esc(c.clinica)}</div>
      ${c.detalhe ? `<div style="font-size:11.5px;color:#555">${esc(c.detalhe)}</div>` : ''}
    </div>
    <div style="font-size:17px;font-weight:800;margin-bottom:6px">Programa de exercícios</div>
    <div style="font-size:12.5px"><span style="color:#555">Paciente:</span> <strong>${esc(c.paciente)}</strong></div>
    <div style="font-size:12.5px"><span style="color:#555">Programa:</span> <strong>${esc(programa.title)}</strong></div>
    <div style="font-size:11.5px;color:#555;margin-bottom:8px">Início em ${esc(dataBr(programa.started_on))}. Emitido em ${esc(dataBr(c.emitidoEm))}.</div>
    ${programa.notes ? `<div style="font-size:12.5px;white-space:pre-wrap;margin:8px 0 6px;padding:8px 10px;background:#f4f4f4;border-radius:6px">${esc(programa.notes)}</div>` : ''}
    ${ordem.length === 0 ? '<div style="margin-top:14px;font-size:12.5px;color:#666">Nenhum exercício neste programa.</div>' : ordem.map((i, k) => blocoItem(i, k + 1, seguro(i.image_path ? fotos.get(i.image_path) : undefined))).join('')}
    <div style="margin-top:14px;font-size:10.5px;color:#777">Faça os exercícios no ritmo orientado e pare se sentir dor forte, tontura ou falta de ar, avisando o seu fisioterapeuta.</div>
    <div style="margin-top:36px;font-size:12px;color:#444">Fisioterapeuta: ${assinatura}</div>`
}

/** Entrega o HTML à janela de impressão do navegador (Imprimir ou Salvar como PDF). */
export function imprimirPrograma(html: string) {
  printDocumento(html, null)
}
