import { escapeHtml } from '@/lib/documentHtml'
import { alteracoes, MARCA_LABEL, POSICOES, resumoFonemico, TODAS_CONSOANTES } from './fonemas'
import type { FonemaAvaliacaoData } from './fonemas'
import { nivelInfo, resumoAvd } from './avd'
import type { ChecklistAvdData } from './avd'
import { AREA_PROFILE, STATUS_LABEL } from './constants'
import { lineChartSvg } from './chartSvg'
import { overallSeries, summarizePeriod, TREND_LABEL, type GoalPeriodSummary, type SeriesPoint } from './progress'
import type { Assessment, Goal, GoalLog, MetasArea } from './types'

export type Publico = 'escola' | 'convenio' | 'neuropediatra'

export const PUBLICO_LABEL: Record<Publico, string> = {
  escola: 'Escola',
  convenio: 'Convênio',
  neuropediatra: 'Neuropediatra / médico',
}

const PUBLICO_TITULO: Record<Publico, string> = {
  escola: 'Relatório para a escola',
  convenio: 'Relatório evolutivo para convênio',
  neuropediatra: 'Relatório evolutivo para o médico assistente',
}

export interface RelatorioInput {
  area: MetasArea
  publico: Publico
  from: string
  to: string
  clinic: { name: string; address?: string; phone?: string }
  patient: { name: string; birth_date?: string | null }
  professional: { name: string; registration: string } | null
  goals: Goal[]
  logs: GoalLog[]
  assessments: Assessment[]
  /** Texto livre do profissional (orientações à escola, impressão clínica etc.) */
  observacoes: string
  /** data de emissão YYYY-MM-DD */
  emitidoEm: string
}

export const brDate = (iso: string | null | undefined): string => {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

const COR = { linha: '#0B9B85', grade: '#d9dedd', texto: '#52716F' }

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

function resultadoLabel(area: MetasArea, r: GoalPeriodSummary['lastResult']): string {
  return r ? AREA_PROFILE[area].resultLabel[r] : 'Sem registro'
}

/** Parágrafo automático de abertura, só com o que está nos registros. */
export function resumoTexto(input: Pick<RelatorioInput, 'area' | 'from' | 'to' | 'goals' | 'logs'>): string {
  const sums = summarizePeriod(input.goals, input.logs, input.from, input.to)
  const comRegistro = sums.filter(s => s.sessions > 0)
  const datas = new Set(input.logs.filter(l => l.log_date >= input.from && l.log_date <= input.to).map(l => l.log_date))
  if (comRegistro.length === 0) return `No período de ${brDate(input.from)} a ${brDate(input.to)} não há registros de sessão nas metas.`
  const serie = overallSeries(input.goals, input.logs.filter(l => l.log_date >= input.from && l.log_date <= input.to))
  const atingidas = input.goals.filter(g => g.status === 'atingida').length
  const partes = [
    `No período de ${brDate(input.from)} a ${brDate(input.to)} foram registradas ${plural(datas.size, 'sessão', 'sessões')} em ${plural(comRegistro.length, 'meta', 'metas')}.`,
  ]
  if (serie.length >= 2) partes.push(`O desempenho geral nos registros foi de ${serie[0].score}% na primeira data e de ${serie[serie.length - 1].score}% na mais recente.`)
  else partes.push(`O desempenho geral no único dia registrado foi de ${serie[0].score}%.`)
  if (atingidas > 0) partes.push(`${plural(atingidas, 'meta foi marcada como atingida', 'metas foram marcadas como atingidas')}.`)
  return partes.join(' ')
}

function chartBlock(series: SeriesPoint[], label: string, height = 170): string {
  if (series.length === 0) return ''
  return `<div style="margin:6px 0 10px">${lineChartSvg(series, { ...COR, color: COR.linha, grid: COR.grade, text: COR.texto, label, height })}</div>`
}

function goalBlock(s: GoalPeriodSummary, area: MetasArea, publico: Publico, notes: GoalLog[]): string {
  const g = s.goal
  const p = AREA_PROFILE[area]
  const meta = [
    g.domain ? `Área: ${escapeHtml(g.domain)}` : '',
    g.criterion ? `Critério: ${escapeHtml(g.criterion)}` : '',
    g.target_date ? `Prazo: ${brDate(g.target_date)}` : '',
    `Situação: ${STATUS_LABEL[g.status]}`,
  ].filter(Boolean).join(' &middot; ')
  let corpo = ''
  if (s.sessions === 0) {
    corpo = '<p style="color:#666">Sem registros no período.</p>'
  } else if (publico === 'escola') {
    corpo = `<p>Resultado mais recente: <strong>${escapeHtml(resultadoLabel(area, s.lastResult))}</strong>. ${TREND_LABEL[s.trend] === 'Poucos registros' ? '' : `Tendência: ${TREND_LABEL[s.trend].toLowerCase()}.`}</p>`
  } else {
    corpo = `<p>${plural(s.sessions, 'registro', 'registros')}: ${s.counts.adquirido} ${escapeHtml(p.resultLabel.adquirido.toLowerCase())}, ${s.counts.com_pista} ${escapeHtml(p.resultLabel.com_pista.toLowerCase())}, ${s.counts.nao_adquirido} ${escapeHtml(p.resultLabel.nao_adquirido.toLowerCase())}. Resultado mais recente: <strong>${escapeHtml(resultadoLabel(area, s.lastResult))}</strong>. Desempenho médio recente: <strong>${s.percent}%</strong>. Tendência: ${TREND_LABEL[s.trend].toLowerCase()}.</p>`
      + (s.series.length > 1 ? chartBlock(s.series, `Evolução da meta ${g.title}`, 130) : '')
    // psicologia não leva texto livre de sessão para fora (sigilo), mesmo que exista nota legada
    if (publico === 'neuropediatra' && area !== 'psico' && notes.length > 0) {
      corpo += `<p style="font-size:12px;color:#444"><strong>Observações de sessão:</strong> ${notes.map(n => `${brDate(n.log_date)}: ${escapeHtml(n.note ?? '')}`).join('; ')}</p>`
    }
  }
  return `<div style="border:1px solid #ddd;border-radius:6px;padding:10px 12px;margin:0 0 10px;page-break-inside:avoid">
    <div style="font-weight:700;font-size:14px">${escapeHtml(g.title)}</div>
    <div style="font-size:11px;color:#666;margin:2px 0 6px">${meta}</div>
    ${corpo}
  </div>`
}

function fonemicoBlock(assessments: Assessment[], from: string, to: string): string {
  const all = assessments.filter(a => a.kind === 'quadro_fonemico').sort((a, b) => a.assessed_on.localeCompare(b.assessed_on))
  const noPeriodo = all.filter(a => a.assessed_on >= from && a.assessed_on <= to)
  const ultima = noPeriodo[noPeriodo.length - 1]
  if (!ultima) return ''
  const data = ultima.data as FonemaAvaliacaoData
  const r = resumoFonemico(data.cells ?? {})
  const serie: SeriesPoint[] = []
  for (const a of all) {
    const pcc = resumoFonemico((a.data as FonemaAvaliacaoData).cells ?? {}).pcc
    if (pcc !== null) serie.push({ date: a.assessed_on, score: pcc })
  }
  const alts = alteracoes(data.cells ?? {})
  const posLabel = Object.fromEntries(POSICOES.map(p => [p.key, p.label.toLowerCase()]))
  const lista = alts.length === 0 ? 'nenhuma alteração marcada' : alts.map(a => `/${escapeHtml(a.ipa)}/ ${posLabel[a.pos]} (${MARCA_LABEL[a.marca].toLowerCase()})`).join('; ')
  return `<h3 style="${H3}">Quadro fonêmico (${brDate(ultima.assessed_on)})</h3>
    <p>Consoantes avaliadas: ${r.avaliadas} de ${TODAS_CONSOANTES.length * POSICOES.length} posições. Corretas: ${r.corretas}; omitidas: ${r.omitidas}; substituídas: ${r.substituidas}; distorcidas: ${r.distorcidas}. Percentual de consoantes corretas: <strong>${r.pcc === null ? '-' : String(r.pcc).replace('.', ',') + '%'}</strong>.</p>
    <p style="font-size:12px;color:#444">Alterações registradas: ${lista}.</p>
    ${serie.length > 1 ? chartBlock(serie, 'Percentual de consoantes corretas por avaliação') : ''}`
}

function avdBlock(assessments: Assessment[], from: string, to: string): string {
  const all = assessments.filter(a => a.kind === 'checklist_avd').sort((a, b) => a.assessed_on.localeCompare(b.assessed_on))
  const noPeriodo = all.filter(a => a.assessed_on >= from && a.assessed_on <= to)
  const ultima = noPeriodo[noPeriodo.length - 1]
  if (!ultima) return ''
  const data = ultima.data as ChecklistAvdData
  const r = resumoAvd(data)
  const serie: SeriesPoint[] = all.map(a => ({ date: a.assessed_on, score: resumoAvd(a.data as ChecklistAvdData).indice ?? -1 })).filter(p => p.score >= 0)
  const linhas = (data.items ?? []).filter(i => i.nivel).map(i => `<tr><td style="padding:3px 6px;border-bottom:1px solid #eee">${escapeHtml(i.label)}</td><td style="padding:3px 6px;border-bottom:1px solid #eee">${escapeHtml(nivelInfo(i.nivel)?.label ?? '')}</td></tr>`).join('')
  return `<h3 style="${H3}">Checklist de independência nas atividades de vida diária (${brDate(ultima.assessed_on)})</h3>
    <p>Itens avaliados: ${r.avaliados} de ${r.total}. Independentes: ${r.independentes}. Índice de independência: <strong>${r.indice === null ? '-' : r.indice + '%'}</strong> (média simples dos níveis marcados).</p>
    ${linhas ? `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:6px">${linhas}</table>` : ''}
    ${serie.length > 1 ? chartBlock(serie, 'Índice de independência por avaliação') : ''}`
}

const H3 = 'font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#555;border-bottom:1px solid #ddd;padding-bottom:4px;margin:18px 0 8px'

/** HTML do relatório pronto para printDocumento (conteúdo da página, sem <html>). */
export function buildRelatorioHtml(i: RelatorioInput): string {
  const p = AREA_PROFILE[i.area]
  const goals = i.goals.filter(g => g.status !== 'cancelada' || i.logs.some(l => l.goal_id === g.id && l.log_date >= i.from && l.log_date <= i.to))
  const sums = summarizePeriod(goals, i.logs, i.from, i.to)
  const periodLogs = i.logs.filter(l => l.log_date >= i.from && l.log_date <= i.to)
  const serieGeral = overallSeries(goals, periodLogs)
  const notesByGoal = (id: string) => (i.area === 'psico' ? [] : periodLogs.filter(l => l.goal_id === id && l.note && l.note.trim()).slice(-3))
  const tecnico = i.publico !== 'escola'
  const mostrarAvaliacoes = tecnico

  return `
  <div style="display:flex;align-items:center;gap:12px;border-bottom:2px solid #333;padding-bottom:10px;margin-bottom:14px">
    <div>
      <div style="font-size:18px;font-weight:800">${escapeHtml(i.clinic.name)}</div>
      ${i.clinic.address ? `<div style="font-size:11px;color:#555">${escapeHtml(i.clinic.address)}</div>` : ''}
      ${i.clinic.phone ? `<div style="font-size:11px;color:#555">${escapeHtml(i.clinic.phone)}</div>` : ''}
    </div>
  </div>
  <h1 style="font-size:17px;margin:0 0 2px">${escapeHtml(PUBLICO_TITULO[i.publico])}</h1>
  <div style="font-size:12px;color:#555;margin-bottom:12px">${escapeHtml(p.planTitle)}</div>
  <table style="font-size:12.5px;border-collapse:collapse;margin-bottom:4px">
    <tr><td style="padding:2px 14px 2px 0;color:#777">Paciente</td><td><strong>${escapeHtml(i.patient.name)}</strong></td></tr>
    ${i.patient.birth_date ? `<tr><td style="padding:2px 14px 2px 0;color:#777">Nascimento</td><td>${escapeHtml(brDate(i.patient.birth_date))}</td></tr>` : ''}
    <tr><td style="padding:2px 14px 2px 0;color:#777">Período</td><td>${brDate(i.from)} a ${brDate(i.to)}</td></tr>
    ${i.professional ? `<tr><td style="padding:2px 14px 2px 0;color:#777">Profissional</td><td>${escapeHtml(i.professional.name)}${i.professional.registration ? ` &middot; ${escapeHtml(i.professional.registration)}` : ''}</td></tr>` : ''}
  </table>

  <h3 style="${H3}">Resumo do período</h3>
  <p>${escapeHtml(resumoTexto({ area: i.area, from: i.from, to: i.to, goals, logs: i.logs }))}</p>
  ${tecnico && serieGeral.length > 0 ? chartBlock(serieGeral, 'Desempenho geral por data') : ''}

  <h3 style="${H3}">Metas e evolução</h3>
  ${sums.length === 0 ? '<p style="color:#666">Nenhuma meta cadastrada.</p>' : sums.map(s => goalBlock(s, i.area, i.publico, notesByGoal(s.goal.id))).join('')}

  ${mostrarAvaliacoes && i.area === 'fono' ? fonemicoBlock(i.assessments, i.from, i.to) : ''}
  ${mostrarAvaliacoes && i.area === 'to' ? avdBlock(i.assessments, i.from, i.to) : ''}

  ${i.observacoes.trim() ? `<h3 style="${H3}">${i.publico === 'escola' ? 'Orientações para a escola' : 'Observações do profissional'}</h3><p style="white-space:pre-wrap">${escapeHtml(i.observacoes.trim())}</p>` : ''}

  <div style="margin-top:46px;display:flex;justify-content:space-between;align-items:flex-end;font-size:11px;color:#666">
    <div style="min-width:240px;border-top:1px solid #333;padding-top:4px;color:#111">
      ${i.professional ? `${escapeHtml(i.professional.name)}<br>${escapeHtml(i.professional.registration)}` : 'Profissional responsável'}
    </div>
    <div>Emitido em ${brDate(i.emitidoEm)}</div>
  </div>`
}
