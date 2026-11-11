// Guias TISS (padrão ANS) de Consulta e SP/SADT para IMPRESSÃO, preenchidas com o que o sistema já sabe do
// atendimento. O que não temos (código na operadora, CNES, CBO, UF do conselho, senha de autorização, códigos TUSS...)
// sai em branco para preenchimento à mão: nada é inventado. Não gera XML de lote nem substitui o envio eletrônico.
import { brasilDayOf } from '@/lib/brasilDate'
import { esc, type ClinicInfo } from '@/lib/print'
import { formatCpf } from '@/lib/numericFormat'
import { formatBrPhone } from '@/lib/phoneFormat'
import { councilForProfessional } from '@/lib/professionalCouncil'
import type { ClinicType } from '@/types'
import { diaBR } from './csv'
import { findPlan, planPrice } from './plans'
import type { ConvenioAppointment, ConvenioPatient, ConvenioProcedure, ConvenioProfessional, InsurancePlan } from './types'

export type GuiaTipo = 'consulta' | 'sadt'

export interface GuiaCampo {
  rotulo: string
  /** vazio = caixa em branco para preencher à mão */
  valor: string
  /** largura em 12 colunas */
  colunas: number
}

export interface GuiaSecao { titulo: string; campos: GuiaCampo[] }

export interface GuiaProcedimentoLinha {
  tabela: string
  codigo: string
  descricao: string
  quantidade: string
  valorUnitario: string
  valorTotal: string
}

export interface GuiaDados {
  tipo: GuiaTipo
  titulo: string
  secoes: GuiaSecao[]
  /** só SP/SADT: tabela de procedimentos executados */
  procedimentos?: GuiaProcedimentoLinha[]
  /** só SP/SADT: total geral */
  totalGeral?: string
  /** campos de assinatura no pé da guia */
  assinaturas: string[]
}

export interface GuiaContexto {
  clinic: ClinicInfo
  clinicType: ClinicType
  patient: ConvenioPatient
  plans: InsurancePlan[]
  appointment: ConvenioAppointment
  professional: ConvenioProfessional | null
  procedures: ConvenioProcedure[]
}

export function formatarReais(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? '' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const c = (rotulo: string, valor: string | null | undefined, colunas: number): GuiaCampo => ({ rotulo, valor: (valor ?? '').trim(), colunas })

/** Valor a imprimir: tabela do convênio > valor do agendamento > preço do procedimento. null = em branco. */
export function valorDaGuia(ctx: GuiaContexto): number | null {
  const plan = findPlan(ctx.plans, ctx.patient)
  const doConvenio = planPrice(plan, ctx.appointment.procedure_id)
  if (doConvenio != null) return doConvenio
  if (ctx.appointment.procedure_price != null) return ctx.appointment.procedure_price
  const proc = ctx.procedures.find(p => p.id === ctx.appointment.procedure_id)
  return proc?.price ?? null
}

function nomeDoProcedimento(ctx: GuiaContexto): string {
  return ctx.appointment.procedure_name?.trim() || ctx.procedures.find(p => p.id === ctx.appointment.procedure_id)?.name || ''
}

function secaoContratado(ctx: GuiaContexto): GuiaSecao {
  return {
    titulo: 'Dados do contratado (prestador)',
    campos: [
      c('Nome do contratado', ctx.clinic.name, 6),
      c('Código na operadora', '', 3),
      c('Código CNES', '', 3),
      c('Endereço', ctx.clinic.address, 8),
      c('Telefone', ctx.clinic.phone ? formatBrPhone(ctx.clinic.phone) : '', 4),
    ],
  }
}

function secaoBeneficiario(ctx: GuiaContexto): GuiaSecao {
  const plan = findPlan(ctx.plans, ctx.patient)
  return {
    titulo: 'Dados do beneficiário',
    campos: [
      c('Número da carteira', ctx.patient.convenio_carteirinha, 4),
      c('Validade da carteira', diaBR(ctx.patient.convenio_validade), 3),
      c('Atendimento a RN (S/N)', '', 2),
      c('CNS (cartão nacional de saúde)', '', 3),
      c('Nome do beneficiário', ctx.patient.name, 7),
      c('CPF', formatCpf(ctx.patient.cpf), 3),
      c('Data de nascimento', diaBR(ctx.patient.birth_date), 2),
      c('Plano / operadora', ctx.patient.convenio ?? plan?.name, 7),
      c('Titular do plano', ctx.patient.convenio_titular, 5),
    ],
  }
}

function camposProfissional(ctx: GuiaContexto, rotuloNome: string): GuiaCampo[] {
  const p = ctx.professional
  const council = councilForProfessional({ specialtyType: p?.specialty_type ?? null, specialty: p?.specialty ?? null, clinicType: ctx.clinicType })
  return [
    c(rotuloNome, p?.name, 6),
    c('Conselho profissional', council.code, 2),
    c('Número no conselho', p?.registration_number, 2),
    c('UF', '', 1),
    c('CBO', '', 1),
  ]
}

function dataDoAtendimento(ctx: GuiaContexto): string {
  return diaBR(brasilDayOf(ctx.appointment.scheduled_at))
}

function secaoOperadora(ctx: GuiaContexto, extras: GuiaCampo[]): GuiaSecao {
  const plan = findPlan(ctx.plans, ctx.patient)
  return {
    titulo: 'Operadora',
    campos: [
      c('Registro ANS', plan?.ans_registry, 3),
      c('Nº da guia no prestador', '', 3),
      ...extras,
    ],
  }
}

export function montarGuiaConsulta(ctx: GuiaContexto): GuiaDados {
  const valor = valorDaGuia(ctx)
  return {
    tipo: 'consulta',
    titulo: 'Guia de Consulta',
    secoes: [
      secaoOperadora(ctx, [c('Nº da guia atribuído pela operadora', '', 6)]),
      secaoBeneficiario(ctx),
      secaoContratado(ctx),
      { titulo: 'Profissional executante', campos: camposProfissional(ctx, 'Nome do profissional executante') },
      {
        titulo: 'Atendimento',
        campos: [
          c('Data do atendimento', dataDoAtendimento(ctx), 3),
          c('Indicação de acidente', '', 3),
          c('Tipo de consulta', '', 3),
          c('Tabela', '', 3),
          c('Código do procedimento', '', 3),
          c('Descrição', nomeDoProcedimento(ctx), 6),
          c('Valor do procedimento', formatarReais(valor), 3),
          c('Observação / justificativa', '', 12),
        ],
      },
    ],
    assinaturas: ['Assinatura do profissional executante', 'Assinatura do beneficiário ou responsável'],
  }
}

export function montarGuiaSadt(ctx: GuiaContexto): GuiaDados {
  const valor = valorDaGuia(ctx)
  const descricao = nomeDoProcedimento(ctx)
  return {
    tipo: 'sadt',
    titulo: 'Guia de Serviço Profissional / Serviço Auxiliar de Diagnóstico e Terapia (SP/SADT)',
    secoes: [
      secaoOperadora(ctx, [
        c('Nº da guia principal', '', 3),
        c('Nº da guia atribuído pela operadora', '', 3),
        c('Data da autorização', '', 3),
        c('Senha', '', 3),
        c('Validade da senha', '', 3),
      ]),
      secaoBeneficiario(ctx),
      {
        titulo: 'Dados do solicitante',
        campos: [
          c('Código na operadora (contratado solicitante)', '', 4),
          c('Nome do contratado solicitante', '', 8),
          c('Nome do profissional solicitante', '', 6),
          c('Conselho profissional', '', 2),
          c('Número no conselho', '', 2),
          c('UF', '', 1),
          c('CBO', '', 1),
          c('Data da solicitação', '', 3),
          c('Caráter do atendimento (E/U)', '', 3),
          c('Indicação clínica', '', 6),
        ],
      },
      secaoContratado(ctx),
      { titulo: 'Profissional executante', campos: camposProfissional(ctx, 'Nome do profissional executante') },
      {
        titulo: 'Atendimento',
        campos: [
          c('Tipo de atendimento', '', 3),
          c('Indicação de acidente', '', 3),
          c('Tipo de consulta', '', 3),
          c('Motivo de encerramento', '', 3),
          c('Data de realização', dataDoAtendimento(ctx), 3),
          c('Observação / justificativa', '', 9),
        ],
      },
    ],
    procedimentos: [{
      tabela: '',
      codigo: '',
      descricao,
      quantidade: descricao ? '1' : '',
      valorUnitario: formatarReais(valor),
      valorTotal: formatarReais(valor),
    }],
    totalGeral: formatarReais(valor),
    assinaturas: ['Assinatura do profissional executante', 'Assinatura do beneficiário ou responsável', 'Carimbo do contratado'],
  }
}

export function montarGuia(tipo: GuiaTipo, ctx: GuiaContexto): GuiaDados {
  return tipo === 'consulta' ? montarGuiaConsulta(ctx) : montarGuiaSadt(ctx)
}

/** Campos que a guia deixa em branco (para o aviso na tela: "N campos para preencher à mão"). */
export function camposEmBranco(g: GuiaDados): number {
  return g.secoes.reduce((n, s) => n + s.campos.filter(x => !x.valor).length, 0)
}

const ESTILO = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 18px; max-width: 800px; margin: 0 auto; }
  h1 { font-size: 15px; margin-bottom: 2px; }
  .sub { font-size: 10px; color: #555; margin-bottom: 10px; }
  h2 { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; background: #eee; border: 1px solid #999; padding: 3px 6px; margin-top: 8px; }
  .grid { display: grid; grid-template-columns: repeat(12, 1fr); border-left: 1px solid #999; border-top: 1px solid #999; }
  .cell { border-right: 1px solid #999; border-bottom: 1px solid #999; padding: 2px 5px; min-height: 34px; }
  .cell small { display: block; font-size: 8.5px; color: #555; text-transform: uppercase; }
  .cell span { display: block; font-size: 11px; font-weight: 600; margin-top: 1px; overflow-wrap: anywhere; }
  table { width: 100%; border-collapse: collapse; margin-top: 0; }
  th, td { border: 1px solid #999; padding: 3px 5px; font-size: 10px; text-align: left; min-height: 24px; height: 24px; }
  th { background: #f4f4f4; text-transform: uppercase; font-size: 8.5px; }
  td.n { text-align: right; }
  .sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 34px; }
  .sign div { border-top: 1px solid #333; padding-top: 3px; font-size: 9px; text-align: center; color: #333; }
  .nota { margin-top: 14px; font-size: 9px; color: #555; line-height: 1.4; }
  @media print { body { padding: 0; } @page { margin: 12mm; } }
`

/** HTML de impressão (A4) da guia; todo texto vem escapado. */
export function guiaParaHtml(g: GuiaDados, clinicName: string, geradoEm: string): string {
  const secoes = g.secoes.map(s => `<h2>${esc(s.titulo)}</h2><div class="grid">${s.campos.map(x =>
    `<div class="cell" style="grid-column: span ${x.colunas}"><small>${esc(x.rotulo)}</small><span>${esc(x.valor) || '&nbsp;'}</span></div>`).join('')}</div>`).join('')
  const proc = g.procedimentos
    ? `<h2>Procedimentos e exames realizados</h2><table><thead><tr><th>Tabela</th><th>Código do procedimento</th><th>Descrição</th><th>Qtd.</th><th>Valor unitário</th><th>Valor total</th></tr></thead><tbody>
      ${g.procedimentos.map(p => `<tr><td>${esc(p.tabela)}</td><td>${esc(p.codigo)}</td><td>${esc(p.descricao)}</td><td>${esc(p.quantidade)}</td><td class="n">${esc(p.valorUnitario)}</td><td class="n">${esc(p.valorTotal)}</td></tr>`).join('')}
      ${Array.from({ length: 3 }, () => '<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>').join('')}
      <tr><td colspan="5" style="text-align:right"><b>Total geral</b></td><td class="n"><b>${esc(g.totalGeral ?? '')}</b></td></tr></tbody></table>`
    : ''
  const sign = `<div class="sign">${g.assinaturas.map(a => `<div>${esc(a)}</div>`).join('')}</div>`
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(g.titulo)}</title><style>${ESTILO}</style></head><body>
    <h1>${esc(g.titulo)}</h1>
    <p class="sub">Padrão TISS (ANS) &middot; ${esc(clinicName)} &middot; gerada em ${esc(geradoEm)}</p>
    ${secoes}${proc}${sign}
    <p class="nota">Impressão de apoio preenchida com os dados do cadastro da clínica. Campos em branco devem ser completados à mão e conferidos com o formulário exigido pela operadora. Este documento não substitui o envio eletrônico (XML) quando a operadora o exigir.</p>
  </body></html>`
}
