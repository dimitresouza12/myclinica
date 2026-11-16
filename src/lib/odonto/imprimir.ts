// Impressos da Odontologia: periograma, comparação entre duas datas e ficha de ortodontia. Os construtores devolvem HTML
// puro (testável); `imprimirOdonto` entrega ao mecanismo de impressão do prontuário (printDocumento, src/lib/print.ts).
// Todo texto digitado passa por `esc`.

import { printDocumento } from '@/lib/print'
import {
  PERIO_INFERIOR, PERIO_SUPERIOR, compararPerio, fmtDelta, fmtNum, indiceDoSitio, nic, ordemNaTela, resumoPerio, temFurca,
  FAIXA_SANGRAMENTO_ROTULO, type FacePerio, type PerioDados,
} from './periograma'
import { faceLabel } from '../odontogramaGeometry'
import {
  aparelhoUsaFio, consultasOrdenadas, linhaDoTempo, proximaManutencao, prazoManutencao, previsaoDeTermino, rotuloAparelho,
  rotuloArcadas, rotuloSituacao, tempoDeTratamento, textoPrazo, textoTempo, type OrtoDados,
} from './ortodontia'

export interface CabecalhoImpresso {
  clinica: string
  paciente: string
  /** Texto livre, ex.: telefone ou endereço da clínica. */
  detalhe?: string
}

export const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const dataBr = (iso: string) => { const p = iso.slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso }
const hojeBr = () => new Date().toLocaleDateString('pt-BR')

const TH = 'text-align:left;padding:4px 6px;border-bottom:2px solid #333;font-size:10.5px;text-transform:uppercase;color:#555'
const TD = 'padding:4px 6px;border-bottom:1px solid #e5e5e5;font-size:12px;vertical-align:top'

function cabecalho(c: CabecalhoImpresso, titulo: string, subtitulo?: string): string {
  return `
    <div style="padding-bottom:10px;border-bottom:2px solid #333;margin-bottom:12px">
      <div style="font-size:18px;font-weight:800">${esc(c.clinica)}</div>
      ${c.detalhe ? `<div style="font-size:11.5px;color:#555">${esc(c.detalhe)}</div>` : ''}
    </div>
    <div style="font-size:17px;font-weight:800;margin-bottom:2px">${esc(titulo)}</div>
    <div style="font-size:12.5px;color:#444;margin-bottom:10px">Paciente: <strong>${esc(c.paciente)}</strong> &nbsp;|&nbsp; Emitido em ${hojeBr()}${subtitulo ? ` &nbsp;|&nbsp; ${esc(subtitulo)}` : ''}</div>`
}

const assinatura = `<div style="margin-top:34px;font-size:12px;color:#444">Cirurgião-dentista (CRO): ______________________________________</div>`

// ── Periograma ───────────────────────────────────────────────────

const CEL = 'border:1px solid #bbb;text-align:center;font-size:8.5px;line-height:1.3;padding:1px 0;height:15px;overflow:hidden'
const ROT = 'border:1px solid #bbb;font-size:8px;padding:1px 3px;color:#444;background:#f4f4f4;white-space:nowrap;overflow:hidden'

function blocoFace(dados: PerioDados, dentes: number[], face: FacePerio): string {
  const ordens = dentes.map(n => ordemNaTela(n))
  const linha = (rotulo: string, cel: (n: number, i: number) => string, fundo = '') =>
    `<tr><td style="${ROT}">${rotulo}</td>${dentes.map((n, k) => ordens[k].map(s => {
      const t = dados.dentes[n]
      if (t?.ausente) return `<td style="${CEL};background:#e5e5e5;color:#999">x</td>`
      return `<td style="${CEL}${fundo}">${cel(n, indiceDoSitio(s))}</td>`
    }).join('')).join('')}</tr>`
  const v = (n: number) => dados.dentes[n]?.[face]
  return [
    linha('Sang./sup.', (n, i) => `${v(n)?.sang[i] ? '&#9679;' : ''}${v(n)?.sup[i] ? '&#9670;' : ''}`),
    linha('Recessão', (n, i) => `${v(n)?.rec[i] ?? ''}`),
    linha('Prof. (PS)', (n, i) => { const x = v(n)?.ps[i]; return x === null || x === undefined ? '' : x >= 6 ? `<strong style="color:#b91c1c">${x}</strong>` : x >= 4 ? `<strong>${x}</strong>` : `${x}` }),
    linha('NIC', (n, i) => { const x = nic(v(n)?.ps[i] ?? null, v(n)?.rec[i] ?? null); return x === null ? '' : `${x}` }, ';background:#fafafa'),
  ].join('')
}

function tabelaArcada(dados: PerioDados, dentes: number[], superior: boolean): string {
  const cab = `<tr><td style="${ROT}"></td>${dentes.map(n => `<td colspan="3" style="${CEL};font-weight:700;font-size:10px;background:#eee">${n}</td>`).join('')}</tr>`
  const mob = `<tr><td style="${ROT}">Mobilidade</td>${dentes.map(n => `<td colspan="3" style="${CEL}">${dados.dentes[n]?.ausente ? '' : (dados.dentes[n]?.mob ?? '')}</td>`).join('')}</tr>`
  const furca = `<tr><td style="${ROT}">Furca</td>${dentes.map(n => `<td colspan="3" style="${CEL}">${dados.dentes[n]?.ausente || !temFurca(n) ? '' : (dados.dentes[n]?.furca ?? '')}</td>`).join('')}</tr>`
  const nomeFaceV = 'Vestibular'
  const nomeFaceL = faceLabel(superior ? 11 : 41, 'l')
  const titulo = (t: string) => `<tr><td colspan="${1 + dentes.length * 3}" style="padding:3px 4px;font-size:9px;font-weight:700;text-transform:uppercase;color:#333;border:none">${t}</td></tr>`
  // na arcada de cima a face vestibular fica acima; na de baixo, a lingual
  const ordem: [string, FacePerio][] = superior ? [[nomeFaceV, 'v'], [nomeFaceL, 'l']] : [[nomeFaceL, 'l'], [nomeFaceV, 'v']]
  return `<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:8px;page-break-inside:avoid">
    <colgroup><col style="width:54px">${dentes.map(() => '<col><col><col>').join('')}</colgroup>
    ${cab}${mob}${furca}
    ${ordem.map(([nome, f]) => titulo(nome) + blocoFace(dados, dentes, f)).join('')}
  </table>`
}

function quadroResumo(d: PerioDados): string {
  const r = resumoPerio(d)
  const item = (rot: string, val: string) => `<td style="${TD};white-space:nowrap"><div style="font-size:10px;color:#666;text-transform:uppercase">${rot}</div><div style="font-size:14px;font-weight:700">${val}</div></td>`
  return `<table style="width:100%;border-collapse:collapse;margin:8px 0"><tr>
    ${item('Sangramento', r.pctSangramento === null ? '-' : `${fmtNum(r.pctSangramento)}%`)}
    ${item('Sítios sangrando', `${r.sitiosSangrando} de ${r.sitiosRegistrados}`)}
    ${item('Supuração', String(r.sitiosSupurando))}
    ${item('PS média', r.psMedia === null ? '-' : `${fmtNum(r.psMedia)} mm`)}
    ${item('NIC médio', r.nicMedia === null ? '-' : `${fmtNum(r.nicMedia)} mm`)}
  </tr><tr>
    ${item('PS 4 mm ou mais', r.pctPs4 === null ? '-' : `${r.sitiosPs4} sítios (${fmtNum(r.pctPs4, 0)}%)`)}
    ${item('PS 6 mm ou mais', String(r.sitiosPs6))}
    ${item('Mobilidade', `${r.dentesComMobilidade} dente(s)`)}
    ${item('Furca', `${r.dentesComFurca} dente(s)`)}
    ${item('Dentes ausentes', String(r.dentesAusentes))}
  </tr></table>
  ${r.faixaSangramento ? `<div style="font-size:11px;color:#555">Sangramento na faixa: ${FAIXA_SANGRAMENTO_ROTULO[r.faixaSangramento]}. Menos de 10% é o limite usado como referência de saúde gengival.</div>` : ''}`
}

const LEGENDA = `<div style="font-size:10.5px;color:#555;margin:6px 0">&#9679; sangramento à sondagem &nbsp; &#9670; supuração &nbsp; PS: profundidade de sondagem (mm) &nbsp; NIC: nível de inserção clínica = PS + recessão &nbsp; Mobilidade 0 a 3 &nbsp; Furca 0 a 3 &nbsp; x: dente ausente</div>`

/** Periograma de uma data: ficha completa dos 32 dentes, resumo dos índices e observações. */
export function htmlPeriograma(c: CabecalhoImpresso, dados: PerioDados, dataIso: string): string {
  return `${cabecalho(c, 'Periograma', `Exame de ${dataBr(dataIso)}`)}
    ${tabelaArcada(dados, PERIO_SUPERIOR, true)}
    ${tabelaArcada(dados, PERIO_INFERIOR, false)}
    ${LEGENDA}
    ${quadroResumo(dados)}
    ${dados.obs.trim() ? `<div style="margin-top:10px;font-size:12px"><strong>Observações:</strong> ${esc(dados.obs).replace(/\n/g, '<br>')}</div>` : ''}
    ${assinatura}`
}

/** Comparação de dois exames: índices gerais, contagem de sítios que mudaram e variação por dente. */
export function htmlPeriogramaComparacao(c: CabecalhoImpresso, a: PerioDados, dataA: string, b: PerioDados, dataB: string): string {
  const cmp = compararPerio(a, b)
  const linha = (rot: string, va: string, vb: string, d: string) => `<tr><td style="${TD}">${rot}</td><td style="${TD};text-align:right">${va}</td><td style="${TD};text-align:right">${vb}</td><td style="${TD};text-align:right;font-weight:700">${d}</td></tr>`
  const pct = (x: number | null) => (x === null ? '-' : `${fmtNum(x)}%`)
  const mm = (x: number | null) => (x === null ? '-' : `${fmtNum(x)} mm`)
  const s = cmp.sitios
  return `${cabecalho(c, 'Periograma: comparação entre datas', `${dataBr(dataA)} e ${dataBr(dataB)}`)}
    <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
      <thead><tr><th style="${TH}">Índice</th><th style="${TH};text-align:right">${dataBr(dataA)}</th><th style="${TH};text-align:right">${dataBr(dataB)}</th><th style="${TH};text-align:right">Variação</th></tr></thead>
      <tbody>
        ${linha('Sangramento à sondagem', pct(cmp.a.pctSangramento), pct(cmp.b.pctSangramento), cmp.delta.pctSangramento === null ? '-' : `${fmtDelta(cmp.delta.pctSangramento)} pontos`)}
        ${linha('Sítios com sangramento', String(cmp.a.sitiosSangrando), String(cmp.b.sitiosSangrando), fmtDelta(cmp.delta.sitiosSangrando, 0))}
        ${linha('Profundidade de sondagem média', mm(cmp.a.psMedia), mm(cmp.b.psMedia), cmp.delta.psMedia === null ? '-' : `${fmtDelta(cmp.delta.psMedia)} mm`)}
        ${linha('NIC médio', mm(cmp.a.nicMedia), mm(cmp.b.nicMedia), cmp.delta.nicMedia === null ? '-' : `${fmtDelta(cmp.delta.nicMedia)} mm`)}
        ${linha('Sítios com PS de 4 mm ou mais', String(cmp.a.sitiosPs4), String(cmp.b.sitiosPs4), fmtDelta(cmp.delta.sitiosPs4, 0))}
        ${linha('Sítios com supuração', String(cmp.a.sitiosSupurando), String(cmp.b.sitiosSupurando), fmtDelta(cmp.b.sitiosSupurando - cmp.a.sitiosSupurando, 0))}
      </tbody>
    </table>
    <div style="font-size:12.5px;margin-bottom:10px">Entre os ${s.comparados} sítios medidos nas duas datas: profundidade melhorou em ${s.psMelhorou} e piorou em ${s.psPiorou}
      (variação de 2 mm ou mais); NIC melhorou em ${s.nicMelhorou} e piorou em ${s.nicPiorou}; o sangramento cessou em ${s.sangramentoCessou} e apareceu em ${s.sangramentoNovo}.
      ${cmp.perdidos.length ? `Dentes presentes na primeira data e ausentes na segunda: ${cmp.perdidos.join(', ')}.` : ''}</div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr><th style="${TH}">Dente</th><th style="${TH};text-align:right">PS média</th><th style="${TH};text-align:right">PS máx.</th><th style="${TH};text-align:right">NIC médio</th><th style="${TH};text-align:right">Sangr. (sítios)</th></tr></thead>
      <tbody>
        ${cmp.dentes.map(d => `<tr><td style="${TD}"><strong>${d.dente}</strong></td>
          <td style="${TD};text-align:right">${fmtNum(d.a.psMedia)} &rarr; ${fmtNum(d.b.psMedia)} (${fmtDelta(d.dPsMedia)})</td>
          <td style="${TD};text-align:right">${d.a.psMax ?? '-'} &rarr; ${d.b.psMax ?? '-'}</td>
          <td style="${TD};text-align:right">${fmtNum(d.a.nicMedia)} &rarr; ${fmtNum(d.b.nicMedia)} (${fmtDelta(d.dNicMedia)})</td>
          <td style="${TD};text-align:right">${d.a.sangrando} &rarr; ${d.b.sangrando}</td></tr>`).join('') || `<tr><td style="${TD};color:#888" colspan="5">Nenhum dente com medida nas duas datas.</td></tr>`}
      </tbody>
    </table>
    <div style="font-size:10.5px;color:#555;margin-top:8px">Variação = segunda data menos a primeira. Em profundidade e NIC, número negativo é melhora.</div>
    ${assinatura}`
}

// ── Ortodontia ───────────────────────────────────────────────────

/** Ficha do tratamento: dados do aparelho, próxima manutenção, histórico de manutenções e linha do tempo. */
export function htmlOrtodontia(c: CabecalhoImpresso, d: OrtoDados, hoje: string): string {
  const usaFio = aparelhoUsaFio(d.aparelho)
  const prox = proximaManutencao(d)
  const tempo = tempoDeTratamento(d, hoje)
  const fim = previsaoDeTermino(d)
  const campo = (rot: string, val: string) => val ? `<tr><td style="${TD};width:34%;color:#555">${rot}</td><td style="${TD}">${esc(val)}</td></tr>` : ''
  const consultas = consultasOrdenadas(d)
  const tl = linhaDoTempo(d, hoje)
  return `${cabecalho(c, 'Ficha de ortodontia', rotuloSituacao(d.situacao))}
    <table style="width:100%;border-collapse:collapse;margin-bottom:12px"><tbody>
      ${campo('Aparelho', rotuloAparelho(d.aparelho, d.aparelhoOutro))}
      ${campo('Arcadas', rotuloArcadas(d.arcadas))}
      ${campo('Instalação', d.instalacao ? dataBr(d.instalacao) : '')}
      ${campo('Tempo de tratamento', textoTempo(tempo))}
      ${campo('Previsão de término', fim ? `${dataBr(fim)} (${d.previsaoMeses} meses)` : '')}
      ${campo('Conclusão', d.conclusao ? dataBr(d.conclusao) : '')}
      ${campo('Próxima manutenção', prox ? `${dataBr(prox.data)} - ${textoPrazo(prazoManutencao(prox.data, hoje))}${prox.origem === 'sugerida' ? ' (sugerida pelo intervalo)' : ''}` : '')}
      ${campo('Objetivo do tratamento', d.objetivo)}
    </tbody></table>
    <div style="font-size:14px;font-weight:700;margin:12px 0 4px">Manutenções (${consultas.length})</div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr><th style="${TH}">Data</th><th style="${TH}">Ativação</th>${usaFio ? `<th style="${TH}">Fio</th>` : ''}<th style="${TH}">Elásticos</th><th style="${TH}">Observações</th><th style="${TH}">Próxima</th></tr></thead>
      <tbody>
        ${consultas.length === 0 ? `<tr><td style="${TD};color:#888" colspan="${usaFio ? 6 : 5}">Nenhuma manutenção registrada.</td></tr>` : consultas.map(k => `<tr>
          <td style="${TD};white-space:nowrap">${dataBr(k.data)}</td>
          <td style="${TD}">${esc(k.ativacao)}</td>
          ${usaFio ? `<td style="${TD}">${[k.fioSup && `Sup.: ${esc(k.fioSup)}`, k.fioInf && `Inf.: ${esc(k.fioInf)}`].filter(Boolean).join('<br>')}</td>` : ''}
          <td style="${TD}">${esc(k.elasticos)}</td>
          <td style="${TD}">${esc(k.obs)}${k.fotos.length ? ` <span style="color:#777">(${k.fotos.length} foto${k.fotos.length > 1 ? 's' : ''})</span>` : ''}</td>
          <td style="${TD};white-space:nowrap">${k.proxima ? dataBr(k.proxima) : ''}</td></tr>`).join('')}
      </tbody>
    </table>
    <div style="font-size:14px;font-weight:700;margin:14px 0 4px">Linha do tempo</div>
    <table style="width:100%;border-collapse:collapse"><tbody>
      ${tl.map(e => `<tr style="page-break-inside:avoid"><td style="${TD};width:78px;white-space:nowrap">${dataBr(e.data)}</td>
        <td style="${TD}"><strong>${esc(e.titulo)}</strong>${e.estado === 'futuro' ? ' <span style="color:#777">(previsto)</span>' : e.estado === 'atrasado' ? ' <span style="color:#b91c1c">(vencido)</span>' : ''}
        ${e.detalhe ? `<div style="color:#444;font-size:11.5px">${esc(e.detalhe)}</div>` : ''}</td></tr>`).join('') || `<tr><td style="${TD};color:#888">Sem eventos ainda.</td></tr>`}
    </tbody></table>
    ${d.obs.trim() ? `<div style="margin-top:10px;font-size:12px"><strong>Observações:</strong> ${esc(d.obs).replace(/\n/g, '<br>')}</div>` : ''}
    ${assinatura}`
}

export function imprimirOdonto(html: string) {
  printDocumento(html, null)
}
