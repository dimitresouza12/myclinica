// Atestado, declaração de comparecimento e laudo simples ESTRUTURADOS: o profissional escolhe a finalidade e informa
// dias ou horário; o sistema monta o texto (sem IA) a partir de um modelo com campos {{...}} e dos dados do cadastro.
// Lógica pura, testada em documentos.test.ts. O texto gerado entra no corpo do documento e continua editável.

import { addDaysIso, formatDateBr, numeroPorExtenso, parseIsoDay, type ResolvedDocFields } from './campos'
import { fillTemplate, listTokens } from './modelo'
import { CAMPO_LABEL } from './camposModelo'

export type DocKind = 'atestado' | 'declaracao_comparecimento' | 'laudo'
export type Finalidade = 'comparecimento' | 'afastamento' | 'aptidao' | 'acompanhante'
export type AptidaoPara = 'atividade_fisica' | 'atividade_laboral' | 'atividade_escolar'
export type LaudoFinalidade = 'encaminhamento' | 'retorno_trabalho' | 'escola' | 'beneficio' | 'acompanhamento'
export type LaudoResultado = 'sem_alteracoes' | 'com_alteracoes' | 'compativel'

export const STRUCTURED_KINDS: readonly DocKind[] = ['atestado', 'declaracao_comparecimento', 'laudo']

export function isStructuredKind(t: string): t is DocKind {
  return (STRUCTURED_KINDS as readonly string[]).includes(t)
}

export const FINALIDADE_LABEL: Record<Finalidade, string> = {
  comparecimento: 'Comparecimento',
  afastamento: 'Afastamento',
  aptidao: 'Aptidão',
  acompanhante: 'Acompanhante',
}

/** Finalidades de cada tipo: a declaração só fala de comparecimento e de acompanhante; o laudo não usa finalidade de atestado. */
export const FINALIDADES_POR_TIPO: Record<DocKind, Finalidade[]> = {
  atestado: ['comparecimento', 'afastamento', 'aptidao', 'acompanhante'],
  declaracao_comparecimento: ['comparecimento', 'acompanhante'],
  laudo: [],
}

export const APTIDAO_LABEL: Record<AptidaoPara, string> = {
  atividade_fisica: 'a prática de atividades físicas',
  atividade_laboral: 'o exercício de atividades laborais',
  atividade_escolar: 'a participação em atividades escolares',
}

export const LAUDO_FINALIDADE_LABEL: Record<LaudoFinalidade, string> = {
  encaminhamento: 'encaminhamento a outro serviço ou profissional',
  retorno_trabalho: 'retorno ao trabalho',
  escola: 'apresentação à escola',
  beneficio: 'solicitação de benefício',
  acompanhamento: 'acompanhamento clínico',
}

export const LAUDO_RESULTADO_LABEL: Record<LaudoResultado, string> = {
  sem_alteracoes: 'sem alterações dignas de nota',
  com_alteracoes: 'com alterações, descritas na observação abaixo',
  compativel: 'compatível com o quadro clínico informado',
}

export interface DocForm {
  kind: DocKind
  finalidade: Finalidade
  /** Dia do atendimento / emissão, "AAAA-MM-DD". */
  data: string
  /** Afastamento: número de dias (texto do campo). */
  dias: string
  /** Comparecimento e acompanhante: horário "HH:mm". */
  inicio: string
  fim: string
  acompanhante: string
  aptidaoPara: AptidaoPara
  laudoFinalidade: LaudoFinalidade
  laudoResultado: LaudoResultado
  /** CID-10 opcional; só entra no texto com a autorização do paciente. */
  cid: string
  cidAutorizado: boolean
  observacao: string
}

export function defaultDocForm(kind: DocKind, today: string): DocForm {
  return {
    kind,
    finalidade: FINALIDADES_POR_TIPO[kind][0] ?? 'comparecimento',
    data: today,
    dias: '1',
    inicio: '',
    fim: '',
    acompanhante: '',
    aptidaoPara: 'atividade_fisica',
    laudoFinalidade: 'acompanhamento',
    laudoResultado: 'sem_alteracoes',
    cid: '',
    cidAutorizado: false,
    observacao: '',
  }
}

/** Atestado e laudo aceitam CID (com autorização); declaração de comparecimento nunca leva diagnóstico. */
export function acceptsCid(kind: DocKind): boolean {
  return kind === 'atestado' || kind === 'laudo'
}

export function usesHorario(f: Pick<DocForm, 'kind' | 'finalidade'>): boolean {
  return f.kind !== 'laudo' && (f.finalidade === 'comparecimento' || f.finalidade === 'acompanhante')
}

export function usesDias(f: Pick<DocForm, 'kind' | 'finalidade'>): boolean {
  return f.kind === 'atestado' && f.finalidade === 'afastamento'
}

export function usesAcompanhante(f: Pick<DocForm, 'kind' | 'finalidade'>): boolean {
  return f.kind !== 'laudo' && f.finalidade === 'acompanhante'
}

export function usesAptidao(f: Pick<DocForm, 'kind' | 'finalidade'>): boolean {
  return f.kind === 'atestado' && f.finalidade === 'aptidao'
}

export const MAX_OBSERVACAO = 500
export const MAX_DIAS_AFASTAMENTO = 365
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/

/** Erros que impedem de gerar o texto (lista vazia = pode gerar). Mensagens prontas para a tela. */
export function validateDocForm(f: DocForm, fields: Pick<ResolvedDocFields, 'paciente' | 'medico'>): string[] {
  const errors: string[] = []
  if (!fields.paciente) errors.push('Paciente sem nome no cadastro.')
  if (!fields.medico) errors.push('Escolha o profissional responsável: o nome e o registro dele entram no documento.')
  if (!parseIsoDay(f.data)) errors.push('Informe a data do documento.')
  if (usesDias(f)) {
    const n = Number(f.dias)
    if (!Number.isInteger(n) || n < 1 || n > MAX_DIAS_AFASTAMENTO) errors.push(`Informe os dias de afastamento (de 1 a ${MAX_DIAS_AFASTAMENTO}).`)
  }
  if (usesHorario(f)) {
    if (!HORA.test(f.inicio) || !HORA.test(f.fim)) errors.push('Informe o horário de início e de fim.')
    else if (f.fim <= f.inicio) errors.push('O horário de fim precisa ser depois do início.')
  }
  if (usesAcompanhante(f) && f.acompanhante.trim().length < 3) errors.push('Informe o nome do acompanhante.')
  if (acceptsCid(f.kind) && f.cid.trim() && !f.cidAutorizado) {
    errors.push('Para incluir o CID, marque que o paciente autorizou. Sem autorização, apague o CID.')
  }
  if (f.observacao.length > MAX_OBSERVACAO) errors.push(`A observação passa de ${MAX_OBSERVACAO} caracteres.`)
  return errors
}

export type ModeloTextos = Record<string, string>

/**
 * Modelos de texto padrão do sistema, com campos {{...}}. São genéricos e editáveis (a tela pede revisão com o
 * conselho profissional). A chave é `<tipo>.<finalidade>`; uma clínica com modelos próprios passa o seu mapa em
 * buildDocText sem mudar o resto.
 */
export const MODELOS_PADRAO: ModeloTextos = {
  'atestado.afastamento': 'Eu, {{profissional_ident}}, atesto, para os devidos fins, que {{paciente_ident}}, foi atendido(a) por mim em {{data}} e necessita de afastamento de suas atividades por {{dias_texto}}, {{periodo_afastamento}}.',
  'atestado.comparecimento': 'Eu, {{profissional_ident}}, atesto, para os devidos fins, que {{paciente_ident}}, compareceu a atendimento em {{data}}, {{horario}}.',
  'atestado.aptidao': 'Eu, {{profissional_ident}}, atesto, para os devidos fins, que {{paciente_ident}}, foi avaliado(a) por mim em {{data}} e encontra-se apto(a) para {{aptidao}}.',
  'atestado.acompanhante': 'Eu, {{profissional_ident}}, atesto, para os devidos fins, que {{acompanhante}} acompanhou {{paciente_ident}} em atendimento realizado em {{data}}, {{horario}}.',
  'declaracao_comparecimento.comparecimento': 'Declaro, para os devidos fins, que {{paciente_ident}}, compareceu a atendimento em {{data}}, {{horario}}.',
  'declaracao_comparecimento.acompanhante': 'Declaro, para os devidos fins, que {{acompanhante}} acompanhou {{paciente_ident}} em atendimento realizado em {{data}}, {{horario}}.',
  'laudo': 'Eu, {{profissional_ident}}, emito este laudo, para fins de {{laudo_finalidade}}, referente a {{paciente_ident}}, avaliado(a) em {{data}}. Resultado da avaliação: {{laudo_resultado}}.',
  'trecho.cid': 'CID-10: {{cid}}, informado com a autorização expressa do paciente.',
  'trecho.observacao': 'Observação: {{observacao}}',
}

export function modeloKey(f: Pick<DocForm, 'kind' | 'finalidade'>): string {
  return f.kind === 'laudo' ? 'laudo' : `${f.kind}.${f.finalidade}`
}

/** "3 (três) dias" / "1 (um) dia". */
export function diasTexto(n: number): string {
  return `${n} (${numeroPorExtenso(n)}) ${n === 1 ? 'dia' : 'dias'}`
}

function horarioTexto(inicio: string, fim: string): string {
  return `no período das ${inicio} às ${fim}`
}

/** Valores de cada campo {{...}} (ver camposModelo.ts). Vazio = o dado não existe para este formulário. */
export function buildDocValues(f: DocForm, fields: ResolvedDocFields): Record<string, string> {
  const dias = Number(f.dias)
  const temDias = Number.isInteger(dias) && dias >= 1
  const fim = temDias ? addDaysIso(f.data, dias - 1) : ''
  const horarioOk = HORA.test(f.inicio) && HORA.test(f.fim)
  return {
    profissional_ident: fields.profissionalIdent,
    paciente_ident: fields.pacienteIdent,
    paciente: fields.paciente,
    responsavel: fields.responsavel,
    responsavel_ident: fields.responsavelIdent,
    cpf: fields.cpf,
    data: fields.data,
    data_extenso: fields.dataExtenso,
    profissional: fields.medico,
    registro: fields.registro,
    rqe: fields.rqe,
    clinica: fields.clinica,
    dias_texto: temDias ? diasTexto(dias) : '',
    dias: temDias ? String(dias) : '',
    periodo_afastamento: temDias ? (dias === 1 ? `somente em ${formatDateBr(f.data)}` : `no período de ${formatDateBr(f.data)} a ${formatDateBr(fim)}`) : '',
    horario: horarioOk ? horarioTexto(f.inicio, f.fim) : '',
    hora_inicio: horarioOk ? f.inicio : '',
    hora_fim: horarioOk ? f.fim : '',
    acompanhante: f.acompanhante.trim(),
    aptidao: APTIDAO_LABEL[f.aptidaoPara],
    laudo_finalidade: LAUDO_FINALIDADE_LABEL[f.laudoFinalidade],
    laudo_resultado: LAUDO_RESULTADO_LABEL[f.laudoResultado],
    // o CID só existe no texto com a autorização do paciente
    cid: acceptsCid(f.kind) && f.cid.trim() && f.cidAutorizado ? f.cid.trim() : '',
  }
}

/** Modelo de texto em uso (o da clínica, se houver; senão o padrão do sistema). */
export function modeloDe(f: Pick<DocForm, 'kind' | 'finalidade'>, modelos: ModeloTextos = MODELOS_PADRAO): string {
  return modelos[modeloKey(f)] ?? MODELOS_PADRAO[modeloKey(f)] ?? ''
}

/**
 * Avisos para um modelo PRÓPRIO da clínica: campo que o modelo usa e que está vazio neste formulário (sairia como
 * "[campo]" no texto). Lista vazia = o modelo se preenche por completo.
 */
export function modeloCamposVazios(f: DocForm, fields: ResolvedDocFields, modelos: ModeloTextos): string[] {
  if (modelos[modeloKey(f)] === undefined) return []
  const values = buildDocValues(f, fields)
  return listTokens(modeloDe(f, modelos))
    .filter(k => !(values[k] ?? '').trim())
    .map(k => `O modelo da clínica usa o campo "${CAMPO_LABEL[k] ?? k}", mas ele está sem valor. Preencha no formulário ou no cadastro.`)
}

/**
 * Monta o texto do documento (parágrafos separados por linha em branco). Chame validateDocForm antes: campo que
 * faltar vira "[campo]" no texto em vez de sair em branco.
 */
export function buildDocText(f: DocForm, fields: ResolvedDocFields, modelos: ModeloTextos = MODELOS_PADRAO): string {
  const values = buildDocValues(f, fields)
  const model = modeloDe(f, modelos)
  const paragraphs = [fillTemplate(model, values, CAMPO_LABEL).text]

  const cid = f.cid.trim()
  // modelo com {{cid}} no corpo já leva o CID: o parágrafo à parte não repete
  if (acceptsCid(f.kind) && cid && f.cidAutorizado && !listTokens(model).includes('cid')) {
    paragraphs.push(fillTemplate(modelos['trecho.cid'] ?? MODELOS_PADRAO['trecho.cid'], { cid }).text)
  }
  const obs = f.observacao.trim()
  if (obs) paragraphs.push(fillTemplate(modelos['trecho.observacao'] ?? MODELOS_PADRAO['trecho.observacao'], { observacao: obs }).text)
  return paragraphs.join('\n\n')
}

const HTML_ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const PARAGRAPH_STYLE = "font-family:Georgia,'Times New Roman',serif;font-size:13px;line-height:1.7;color:#2B3430;margin:0 0 10px"

/** Texto puro (o da prévia, já editado) para o corpo do documento: parágrafos escapados, quebra simples vira <br>. */
export function textToBodyHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n{2,}/)
    .filter(p => p.trim() !== '')
    .map(p => `<p style="${PARAGRAPH_STYLE}">${p.replace(/[&<>"']/g, c => HTML_ESC[c]).replace(/\n/g, '<br>')}</p>`)
    .join('')
}
