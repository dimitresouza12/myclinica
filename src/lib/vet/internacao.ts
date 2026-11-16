// Internação simples do pet: entrada e saída, motivo, leito/baia, prescrições e evoluções por turno, alta com resumo
// imprimível. Modelos de dados versionados (v:1) guardados em vet_internacoes e vet_internacao_itens
// (supabase/migrations/20261135_vet_internacao_exames.sql), validação e o HTML do impresso. Lógica pura, testada em
// internacao.test.ts. Horários no fuso de Brasília (UTC-3 o ano todo).

import { BRASIL_TZ, brasilDayOf, hojeBrasil } from '@/lib/brasilDate'
import { assinaturaHtml, ESTILO_TD, ESTILO_TH } from '@/lib/medico/impresso'
import { cabecalhoPetHtml, esc, type CabecalhoPet, type ProfissionalImpresso } from './cabecalhoPet'
import { dataBr, diasEntre, isoValido } from './datas'
import { lerNumero } from './numeros'

// ── Tipos ────────────────────────────────────────────────────────

export type StatusInternacao = 'internado' | 'alta' | 'obito' | 'transferido'
export type SaidaInternacao = Exclude<StatusInternacao, 'internado'>
export type TipoItem = 'prescricao' | 'evolucao'
export type Turno = 'manha' | 'tarde' | 'noite'

export const STATUS_ROTULO: Record<StatusInternacao, string> = { internado: 'Internado', alta: 'Alta', obito: 'Óbito', transferido: 'Transferido' }
export const SAIDA_ROTULO: Record<SaidaInternacao, string> = { alta: 'Alta médica', obito: 'Óbito', transferido: 'Transferência' }
export const TURNO_ROTULO: Record<Turno, string> = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' }
export const TURNO_FAIXA: Record<Turno, string> = { manha: '07h às 12h59', tarde: '13h às 18h59', noite: '19h às 06h59' }
export const TURNOS: Turno[] = ['manha', 'tarde', 'noite']

export const VIAS = ['Oral', 'Intravenosa', 'Intramuscular', 'Subcutânea', 'Tópica', 'Oftálmica', 'Otológica', 'Retal', 'Inalatória', 'Outra'] as const
export const FREQUENCIAS = ['A cada 6 horas', 'A cada 8 horas', 'A cada 12 horas', 'A cada 24 horas', 'Dose única', 'Infusão contínua'] as const

export const MAX_MOTIVO = 600
export const MAX_LEITO = 60
export const MAX_TEXTO = 2000

/** Linha de vet_internacoes como a tela usa. */
export interface Internacao {
  id: string
  status: StatusInternacao
  /** instante ISO */
  entrada_em: string
  saida_em: string | null
  leito: string | null
  motivo: string
  dados: unknown
  created_at: string
}

/** Linha de vet_internacao_itens como a tela usa. */
export interface ItemInternacao {
  id: string
  internacao_id: string
  tipo: TipoItem
  /** instante ISO */
  registrado_em: string
  turno: Turno
  dados: unknown
  created_at: string
}

export interface AltaDados {
  /** O que aconteceu e como o pet saiu: texto livre do veterinário. */
  resumo: string
  medicacaoPos: string
  orientacoes: string
  /** AAAA-MM-DD, vazio = sem retorno marcado */
  retornoEm: string
  profissional: ProfissionalImpresso | null
}

export interface InternacaoDados {
  v: 1
  /** Diagnóstico ou suspeita na entrada. */
  diagnostico: string
  alta: AltaDados | null
}

export interface PrescricaoDados {
  v: 1
  medicamento: string
  dose: string
  via: string
  frequencia: string
  observacao: string
  suspensa: boolean
}

export interface EvolucaoDados {
  v: 1
  texto: string
  temperaturaC: number | null
  fc: number | null
  fr: number | null
}

// ── Data e hora (Brasília) ───────────────────────────────────────

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/

export function horaValida(h: string | null | undefined): h is string {
  return HORA.test(h ?? '')
}

/** "2026-11-16" + "14:30" -> instante ISO (UTC). Data ou hora inválida: null. */
export function combinarDataHora(data: string | null | undefined, hora: string | null | undefined): string | null {
  if (!isoValido(data) || !horaValida(hora)) return null
  const d = new Date(`${data}T${hora}:00.000-03:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Dia (AAAA-MM-DD) e hora (HH:MM) de um instante ISO em Brasília. Instante inválido: vazios. */
export function separarDataHora(iso: string | null | undefined): { data: string; hora: string } {
  const d = iso ? new Date(iso) : null
  if (!d || Number.isNaN(d.getTime())) return { data: '', hora: '' }
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: BRASIL_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
  return { data: hojeBrasil(d), hora: `${get('hour')}:${get('minute')}` }
}

/** Agora, em Brasília, nos formatos dos campos de data e hora. */
export function agoraBrasil(now: Date = new Date()): { data: string; hora: string } {
  return separarDataHora(now.toISOString())
}

/** "16/11/2026 14:30" (instante inválido: ''). */
export function dataHoraBr(iso: string | null | undefined): string {
  const { data, hora } = separarDataHora(iso)
  return data ? `${dataBr(data)} ${hora}` : ''
}

/** Turno de um horário HH:MM: manhã 07h às 12h59, tarde 13h às 18h59, noite 19h às 06h59. Hora inválida: manhã. */
export function turnoDaHora(hora: string): Turno {
  if (!horaValida(hora)) return 'manha'
  const h = Number(hora.slice(0, 2))
  if (h >= 7 && h < 13) return 'manha'
  if (h >= 13 && h < 19) return 'tarde'
  return 'noite'
}

/** Turno de um instante ISO. */
export function turnoDoInstante(iso: string): Turno {
  return turnoDaHora(separarDataHora(iso).hora)
}

/**
 * Dia da internação em contagem de calendário: o dia da entrada é o dia 1. Aberta: até hoje; encerrada: até o dia da saída.
 */
export function diasDeInternacao(entradaEm: string, saidaEm: string | null, agora: Date = new Date()): number {
  const de = brasilDayOf(entradaEm)
  const ate = saidaEm ? brasilDayOf(saidaEm) : hojeBrasil(agora)
  const n = diasEntre(de, ate)
  return n === null ? 1 : Math.max(n, 0) + 1
}

/** "1 dia", "3 dias". */
export function textoDias(n: number): string {
  return `${n} ${n === 1 ? 'dia' : 'dias'}`
}

// ── Leitura do JSON gravado ──────────────────────────────────────

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function profissionalDe(v: unknown): ProfissionalImpresso | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const nome = texto(o.nome, 160)
  return nome ? { nome, registro: texto(o.registro, 60), rqe: texto(o.rqe, 40) } : null
}

export function internacaoVaziaDados(): InternacaoDados {
  return { v: 1, diagnostico: '', alta: null }
}

export function altaVazia(): AltaDados {
  return { resumo: '', medicacaoPos: '', orientacoes: '', retornoEm: '', profissional: null }
}

/** Lê o JSON gravado (de qualquer versão ou lixo) e devolve sempre dados válidos para a tela. */
export function normalizarInternacao(raw: unknown): InternacaoDados {
  const base = internacaoVaziaDados()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>
  let alta: AltaDados | null = null
  if (o.alta && typeof o.alta === 'object') {
    const a = o.alta as Record<string, unknown>
    const retorno = typeof a.retornoEm === 'string' && isoValido(a.retornoEm) ? a.retornoEm : ''
    alta = {
      resumo: texto(a.resumo, MAX_TEXTO),
      medicacaoPos: texto(a.medicacaoPos, MAX_TEXTO),
      orientacoes: texto(a.orientacoes, MAX_TEXTO),
      retornoEm: retorno,
      profissional: profissionalDe(a.profissional),
    }
  }
  return { v: 1, diagnostico: texto(o.diagnostico, MAX_MOTIVO), alta }
}

export function prescricaoVazia(): PrescricaoDados {
  return { v: 1, medicamento: '', dose: '', via: '', frequencia: '', observacao: '', suspensa: false }
}

export function normalizarPrescricao(raw: unknown): PrescricaoDados {
  const base = prescricaoVazia()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>
  return {
    v: 1,
    medicamento: texto(o.medicamento, 120),
    dose: texto(o.dose, 80),
    via: texto(o.via, 40),
    frequencia: texto(o.frequencia, 60),
    observacao: texto(o.observacao, 300),
    suspensa: o.suspensa === true,
  }
}

function numeroOuNulo(v: unknown, min: number, max: number): number | null {
  const n = lerNumero(v)
  return n !== null && n >= min && n <= max ? n : null
}

export const FAIXA_TEMPERATURA = { min: 30, max: 45 } as const
export const FAIXA_FC = { min: 10, max: 400 } as const
export const FAIXA_FR = { min: 2, max: 200 } as const

export function evolucaoVazia(): EvolucaoDados {
  return { v: 1, texto: '', temperaturaC: null, fc: null, fr: null }
}

export function normalizarEvolucao(raw: unknown): EvolucaoDados {
  const base = evolucaoVazia()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>
  return {
    v: 1,
    texto: texto(o.texto, MAX_TEXTO),
    temperaturaC: numeroOuNulo(o.temperaturaC, FAIXA_TEMPERATURA.min, FAIXA_TEMPERATURA.max),
    fc: numeroOuNulo(o.fc, FAIXA_FC.min, FAIXA_FC.max),
    fr: numeroOuNulo(o.fr, FAIXA_FR.min, FAIXA_FR.max),
  }
}

// ── Validação (lista vazia = pode salvar) ────────────────────────

interface Momento { data: string; hora: string }

function validarMomento(m: Momento, rotulo: string, agora: Date): string[] {
  if (!isoValido(m.data)) return [`Informe a data de ${rotulo}.`]
  if (!horaValida(m.hora)) return [`Informe a hora de ${rotulo} (formato 14:30).`]
  const iso = combinarDataHora(m.data, m.hora)
  // tolera 5 minutos de diferença entre o relógio do aparelho e o do servidor
  if (iso && new Date(iso).getTime() > agora.getTime() + 5 * 60_000) return [`A data e hora de ${rotulo} estão no futuro.`]
  return []
}

export function validarEntrada(v: Momento & { motivo: string; leito: string; diagnostico: string }, agora: Date = new Date()): string[] {
  const erros = validarMomento(v, 'entrada', agora)
  if (!v.motivo.trim()) erros.push('Informe o motivo da internação.')
  if (v.motivo.length > MAX_MOTIVO) erros.push(`O motivo passa de ${MAX_MOTIVO} caracteres.`)
  if (v.leito.length > MAX_LEITO) erros.push(`O leito ou a baia passa de ${MAX_LEITO} caracteres.`)
  if (v.diagnostico.length > MAX_MOTIVO) erros.push(`O diagnóstico passa de ${MAX_MOTIVO} caracteres.`)
  return erros
}

export function validarPrescricao(v: Momento & { medicamento: string; dose: string; frequencia: string; observacao: string }, agora: Date = new Date()): string[] {
  const erros = validarMomento(v, 'início', agora)
  if (!v.medicamento.trim()) erros.push('Informe o medicamento.')
  if (!v.dose.trim()) erros.push('Informe a dose.')
  if (!v.frequencia.trim()) erros.push('Informe a frequência.')
  if (v.observacao.length > 300) erros.push('A observação passa de 300 caracteres.')
  return erros
}

export interface SinaisDigitados { temperatura: string; fc: string; fr: string }

function validarSinal(valor: string, nome: string, faixa: { min: number; max: number }, unidade: string): string | null {
  if (!valor.trim()) return null
  const n = lerNumero(valor)
  if (n === null) return `${nome}: digite um número.`
  if (n < faixa.min || n > faixa.max) return `${nome} fora do esperado (${faixa.min} a ${faixa.max} ${unidade}).`
  return null
}

export function validarEvolucao(v: Momento & { texto: string } & SinaisDigitados, agora: Date = new Date()): string[] {
  const erros = validarMomento(v, 'registro', agora)
  if (!v.texto.trim()) erros.push('Escreva a evolução do pet neste turno.')
  if (v.texto.length > MAX_TEXTO) erros.push(`A evolução passa de ${MAX_TEXTO} caracteres.`)
  for (const e of [
    validarSinal(v.temperatura, 'Temperatura', FAIXA_TEMPERATURA, '°C'),
    validarSinal(v.fc, 'Frequência cardíaca', FAIXA_FC, 'bpm'),
    validarSinal(v.fr, 'Frequência respiratória', FAIXA_FR, 'mpm'),
  ]) if (e) erros.push(e)
  return erros
}

export function validarAlta(v: Momento & { resumo: string; entradaEm: string; retornoEm: string }, agora: Date = new Date()): string[] {
  const erros = validarMomento(v, 'saída', agora)
  const saida = combinarDataHora(v.data, v.hora)
  if (saida && new Date(saida).getTime() < new Date(v.entradaEm).getTime()) erros.push('A saída não pode ser antes da entrada.')
  if (!v.resumo.trim()) erros.push('Escreva o resumo da internação.')
  if (v.resumo.length > MAX_TEXTO) erros.push(`O resumo passa de ${MAX_TEXTO} caracteres.`)
  if (v.retornoEm && !isoValido(v.retornoEm)) erros.push('A data de retorno é inválida.')
  return erros
}

// ── Consultas sobre a lista ──────────────────────────────────────

/** Internação aberta do pet (no máximo uma), ou null. */
export function internacaoAberta(lista: Internacao[]): Internacao | null {
  return lista.find(i => i.status === 'internado') ?? null
}

/** Da mais recente para a mais antiga (empate pela criação). */
export function maisRecentesPrimeiro(lista: Internacao[]): Internacao[] {
  return [...lista].sort((a, b) => b.entrada_em.localeCompare(a.entrada_em) || b.created_at.localeCompare(a.created_at))
}

/** Itens de uma internação, de um tipo, em ordem cronológica. */
export function itensDaInternacao(itens: ItemInternacao[], internacaoId: string, tipo: TipoItem): ItemInternacao[] {
  return itens
    .filter(i => i.internacao_id === internacaoId && i.tipo === tipo)
    .sort((a, b) => a.registrado_em.localeCompare(b.registrado_em) || a.created_at.localeCompare(b.created_at))
}

export interface DiaDeEvolucoes {
  /** AAAA-MM-DD */
  dia: string
  turnos: { turno: Turno; itens: ItemInternacao[] }[]
}

/** Evoluções agrupadas por dia e turno. Dias na ordem pedida; turnos e registros em ordem cronológica. */
export function evolucoesPorDia(evolucoes: ItemInternacao[], ordem: 'asc' | 'desc' = 'asc'): DiaDeEvolucoes[] {
  const cronologicas = [...evolucoes].sort((a, b) => a.registrado_em.localeCompare(b.registrado_em))
  const dias = new Map<string, ItemInternacao[]>()
  for (const e of cronologicas) {
    const dia = separarDataHora(e.registrado_em).data
    dias.set(dia, [...(dias.get(dia) ?? []), e])
  }
  const lista = [...dias.entries()].sort(([a], [b]) => (ordem === 'asc' ? a.localeCompare(b) : b.localeCompare(a)))
  return lista.map(([dia, itens]) => ({
    dia,
    turnos: TURNOS
      .map(turno => ({ turno, itens: itens.filter(i => i.turno === turno) }))
      .filter(t => t.itens.length > 0),
  }))
}

/** "T 38,5 °C | FC 120 bpm | FR 28 mpm" (só o que foi medido; vazio se nada). */
export function resumoDosSinais(e: EvolucaoDados): string {
  const f = (n: number) => String(n).replace('.', ',')
  return [
    e.temperaturaC !== null ? `T ${f(e.temperaturaC)} °C` : '',
    e.fc !== null ? `FC ${f(e.fc)} bpm` : '',
    e.fr !== null ? `FR ${f(e.fr)} mpm` : '',
  ].filter(Boolean).join(' | ')
}

/** "Meloxicam 0,1 mg/kg, Oral, a cada 24 horas". */
export function resumoDaPrescricao(p: PrescricaoDados): string {
  return [`${p.medicamento}${p.dose ? ` ${p.dose}` : ''}`, p.via, p.frequencia ? p.frequencia.toLowerCase() : ''].filter(Boolean).join(', ')
}

// ── Colunas do item ──────────────────────────────────────────────

/** Colunas de vet_internacao_itens a partir do que a tela montou: o turno sai sempre do horário. */
export function colunasDoItem(args: { data: string; hora: string }): { registrado_em: string; turno: Turno } | null {
  const iso = combinarDataHora(args.data, args.hora)
  return iso ? { registrado_em: iso, turno: turnoDoInstante(iso) } : null
}

// ── Impresso: resumo de alta / ficha de internação ───────────────

const linhaDado = (rotulo: string, valor: string) =>
  valor.trim() ? `<div style="font-size:12.5px"><span style="color:#555">${esc(rotulo)}:</span> <strong>${esc(valor)}</strong></div>` : ''

const blocoTexto = (titulo: string, valor: string) =>
  valor.trim()
    ? `<div style="margin-top:14px;page-break-inside:avoid"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#555;margin-bottom:3px">${esc(titulo)}</div><div style="font-size:12.5px;white-space:pre-wrap;line-height:1.5">${esc(valor)}</div></div>`
    : ''

/** HTML do impresso da internação: "RESUMO DE ALTA" quando encerrada (alta ou transferência), "FICHA DE INTERNAÇÃO" enquanto aberta. */
export function htmlInternacao(c: CabecalhoPet, i: Internacao, itens: ItemInternacao[], agora: Date = new Date()): string {
  const d = normalizarInternacao(i.dados)
  const aberta = i.status === 'internado'
  const titulo = aberta ? 'FICHA DE INTERNAÇÃO' : i.status === 'obito' ? 'RESUMO DA INTERNAÇÃO' : 'RESUMO DE ALTA'
  const selo = aberta ? 'INTERNADO' : STATUS_ROTULO[i.status].toUpperCase()
  const dias = diasDeInternacao(i.entrada_em, i.saida_em, agora)

  const prescricoes = itensDaInternacao(itens, i.id, 'prescricao').map(p => ({ item: p, dados: normalizarPrescricao(p.dados) }))
  const linhasPresc = prescricoes.map(({ item, dados }) => `<tr style="page-break-inside:avoid">
      <td style="${ESTILO_TD}"><strong>${esc(dados.medicamento)}</strong>${dados.observacao ? `<div style="font-size:11px;color:#555">${esc(dados.observacao)}</div>` : ''}</td>
      <td style="${ESTILO_TD}">${esc(dados.dose)}</td>
      <td style="${ESTILO_TD}">${esc(dados.via)}</td>
      <td style="${ESTILO_TD}">${esc(dados.frequencia)}</td>
      <td style="${ESTILO_TD};white-space:nowrap">${esc(dataHoraBr(item.registrado_em))}${dados.suspensa ? '<div style="font-size:11px;color:#555">Suspensa</div>' : ''}</td>
    </tr>`).join('')
  const blocoPresc = prescricoes.length === 0 ? '' : `
    <div style="margin:16px 0 4px;font-size:13px;font-weight:700;page-break-after:avoid">Prescrições durante a internação</div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr><th style="${ESTILO_TH}">Medicamento</th><th style="${ESTILO_TH}">Dose</th><th style="${ESTILO_TH}">Via</th><th style="${ESTILO_TH}">Frequência</th><th style="${ESTILO_TH}">Início</th></tr></thead>
      <tbody>${linhasPresc}</tbody>
    </table>`

  const dias_ = evolucoesPorDia(itensDaInternacao(itens, i.id, 'evolucao'), 'asc')
  const blocoEvol = dias_.length === 0 ? '' : `
    <div style="margin:16px 0 4px;font-size:13px;font-weight:700;page-break-after:avoid">Evolução por turno</div>
    ${dias_.map(dia => `
      <div style="margin:10px 0 2px;font-size:12px;font-weight:700;color:#333;page-break-after:avoid">${esc(dataBr(dia.dia))}</div>
      <table style="width:100%;border-collapse:collapse"><tbody>
        ${dia.turnos.flatMap(t => t.itens.map(e => {
          const ev = normalizarEvolucao(e.dados)
          const sinais = resumoDosSinais(ev)
          return `<tr style="page-break-inside:avoid">
            <td style="${ESTILO_TD};width:92px;white-space:nowrap">${esc(TURNO_ROTULO[t.turno])}<div style="font-size:11px;color:#555">${esc(separarDataHora(e.registrado_em).hora)}</div></td>
            <td style="${ESTILO_TD};white-space:pre-wrap">${sinais ? `<div style="font-size:11px;color:#555;margin-bottom:2px">${esc(sinais)}</div>` : ''}${esc(ev.texto)}</td>
          </tr>`
        })).join('')}
      </tbody></table>`).join('')}`

  const alta = d.alta
  const profissional = alta?.profissional ?? c.profissional

  return `${cabecalhoPetHtml(c, titulo, selo)}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 24px;margin-bottom:6px">
      ${linhaDado('Entrada', dataHoraBr(i.entrada_em))}
      ${linhaDado('Saída', i.saida_em ? dataHoraBr(i.saida_em) : 'ainda internado')}
      ${linhaDado('Permanência', textoDias(dias))}
      ${linhaDado('Leito / baia', i.leito ?? '')}
    </div>
    ${blocoTexto('Motivo da internação', i.motivo)}
    ${blocoTexto('Diagnóstico ou suspeita', d.diagnostico)}
    ${blocoTexto(aberta ? 'Resumo' : 'Resumo da internação', alta?.resumo ?? '')}
    ${blocoPresc}
    ${blocoEvol}
    ${blocoTexto('Medicação após a alta', alta?.medicacaoPos ?? '')}
    ${blocoTexto('Orientações ao tutor', alta?.orientacoes ?? '')}
    ${alta?.retornoEm ? `<div style="margin-top:14px;font-size:12.5px"><strong>Retorno:</strong> ${esc(dataBr(alta.retornoEm))}</div>` : ''}
    ${assinaturaHtml(profissional)}`
}
