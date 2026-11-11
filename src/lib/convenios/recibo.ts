// Recibo para reembolso (plano de livre escolha): o paciente entrega à operadora. Traz o profissional (nome, conselho,
// RQE) e o CPF do paciente e do pagador. CPF/CNPJ do prestador e cidade não existem no cadastro: saem em branco.
import { esc, type ClinicInfo } from '@/lib/print'
import { formatCpf } from '@/lib/numericFormat'
import { formatBrPhone } from '@/lib/phoneFormat'
import { councilForProfessional, formatRegistration, formatRqe } from '@/lib/professionalCouncil'
import type { ClinicType } from '@/types'
import { diaBR } from './csv'
import { formatarReais } from './tiss'
import type { ConvenioPatient, ConvenioProfessional } from './types'

const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

function ate999(n: number): string {
  if (n === 100) return 'cem'
  const c = Math.floor(n / 100)
  const r = n % 100
  const partes: string[] = []
  if (c) partes.push(CENTENAS[c])
  if (r) {
    if (r < 20) partes.push(UNIDADES[r])
    else {
      const d = Math.floor(r / 10)
      const u = r % 10
      partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d])
    }
  }
  return partes.join(' e ')
}

function inteiroPorExtenso(n: number): string {
  if (n === 0) return 'zero'
  const milhoes = Math.floor(n / 1_000_000)
  const milhares = Math.floor((n % 1_000_000) / 1000)
  const resto = n % 1000
  const grupos: Array<{ texto: string; valor: number }> = []
  if (milhoes) grupos.push({ texto: milhoes === 1 ? 'um milhão' : `${ate999(milhoes)} milhões`, valor: milhoes })
  if (milhares) grupos.push({ texto: milhares === 1 ? 'mil' : `${ate999(milhares)} mil`, valor: milhares })
  if (resto) grupos.push({ texto: ate999(resto), valor: resto })
  // "e" antes do último grupo quando ele é menor que 100 ou centena exata (mil e cem; dois mil e quinhentos)
  const ultimo = grupos[grupos.length - 1]
  const antes = grupos.slice(0, -1).map(g => g.texto).join(' ')
  if (!antes) return ultimo.texto
  return `${antes}${ultimo.valor < 100 || ultimo.valor % 100 === 0 ? ' e ' : ' '}${ultimo.texto}`
}

/** 1250.5 → "mil duzentos e cinquenta reais e cinquenta centavos". Valores acima de 999 milhões ou negativos: ''. */
export function valorPorExtenso(valor: number): string {
  if (!Number.isFinite(valor) || valor < 0 || valor >= 1_000_000_000) return ''
  const cents = Math.round(valor * 100)
  const reais = Math.floor(cents / 100)
  const centavos = cents % 100
  const pReais = reais > 0 ? `${inteiroPorExtenso(reais)} ${reais === 1 ? 'real' : reais % 1_000_000 === 0 ? 'de reais' : 'reais'}` : ''
  const pCent = centavos > 0 ? `${inteiroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}` : ''
  if (pReais && pCent) return `${pReais} e ${pCent}`
  return pReais || pCent || 'zero reais'
}

export interface ReciboEntrada {
  clinic: ClinicInfo
  clinicType: ClinicType
  patient: ConvenioPatient
  professional: ConvenioProfessional | null
  /** o que foi feito ("Consulta", "Sessão de fisioterapia") */
  descricao: string
  /** AAAA-MM-DD do atendimento */
  dia: string
  valor: number
  /** sobrescreve o pagador do cadastro (nome e CPF) */
  pagadorNome?: string
  pagadorCpf?: string
}

export interface ReciboDados {
  pagadorNome: string
  pagadorCpf: string
  pacienteNome: string
  pacienteCpf: string
  mesmoPagador: boolean
  profissionalNome: string
  registro: string
  rqe: string
  descricao: string
  dia: string
  valor: string
  valorExtenso: string
}

export function montarRecibo(e: ReciboEntrada): ReciboDados {
  const p = e.professional
  const council = councilForProfessional({ specialtyType: p?.specialty_type ?? null, specialty: p?.specialty ?? null, clinicType: e.clinicType })
  const pagadorNome = (e.pagadorNome ?? e.patient.payer_name ?? '').trim() || e.patient.name
  const pagadorCpf = formatCpf((e.pagadorCpf ?? '').trim() || e.patient.payer_cpf || e.patient.cpf)
  const pacienteCpf = formatCpf(e.patient.cpf)
  return {
    pagadorNome,
    pagadorCpf,
    pacienteNome: e.patient.name,
    pacienteCpf,
    mesmoPagador: pagadorNome === e.patient.name && pagadorCpf === pacienteCpf,
    profissionalNome: p?.name ?? '',
    registro: formatRegistration(council, p?.registration_number),
    rqe: formatRqe(p?.rqe),
    descricao: e.descricao.trim(),
    dia: e.dia,
    valor: formatarReais(e.valor),
    valorExtenso: valorPorExtenso(e.valor),
  }
}

export function reciboParaHtml(d: ReciboDados, clinic: ClinicInfo, geradoEm: string): string {
  const linha = (rotulo: string, valor: string, branco = false) =>
    `<div class="f"><small>${esc(rotulo)}</small><span>${valor ? esc(valor) : branco ? '&nbsp;' : '-'}</span></div>`
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Recibo para reembolso - ${esc(d.pacienteNome)}</title><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 32px; max-width: 800px; margin: 0 auto; }
    h1 { font-size: 20px; } .head { padding-bottom: 12px; border-bottom: 2px solid #333; margin-bottom: 20px; }
    .head p { font-size: 12px; color: #555; margin-top: 2px; }
    h2 { font-size: 16px; margin-bottom: 12px; }
    .texto { line-height: 1.9; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; margin-bottom: 14px; }
    .f small { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #777; }
    .f span { display: block; border-bottom: 1px solid #bbb; padding: 2px 0; min-height: 20px; font-size: 13px; }
    .sign { margin-top: 64px; max-width: 360px; border-top: 1px solid #333; padding-top: 6px; font-size: 12px; text-align: center; color: #333; }
    .nota { margin-top: 28px; font-size: 10px; color: #777; }
    @media print { body { padding: 0; } }
  </style></head><body>
    <div class="head"><h1>${esc(clinic.name)}</h1>${clinic.address ? `<p>${esc(clinic.address)}</p>` : ''}${clinic.phone ? `<p>${esc(formatBrPhone(clinic.phone))}</p>` : ''}</div>
    <h2>Recibo de prestação de serviços de saúde</h2>
    <p class="texto">Recebi de <b>${esc(d.pagadorNome)}</b>${d.pagadorCpf ? `, CPF ${esc(d.pagadorCpf)}` : ''}, a importância de <b>${esc(d.valor)}</b>${d.valorExtenso ? ` (${esc(d.valorExtenso)})` : ''},
      referente a <b>${esc(d.descricao || 'atendimento de saúde')}</b> prestado${d.mesmoPagador ? '' : ` a <b>${esc(d.pacienteNome)}</b>${d.pacienteCpf ? `, CPF ${esc(d.pacienteCpf)}` : ''},`} em ${esc(diaBR(d.dia))}. Dou plena e geral quitação.</p>
    <div class="grid">
      ${linha('Paciente (beneficiário)', d.pacienteNome)}${linha('CPF do paciente', d.pacienteCpf, true)}
      ${linha('Profissional que prestou o atendimento', d.profissionalNome, true)}${linha('Registro no conselho', [d.registro, d.rqe].filter(Boolean).join(' · '), true)}
      ${linha('CPF ou CNPJ do prestador', '', true)}${linha('Cidade e UF', '', true)}
    </div>
    <div class="sign">${esc(d.profissionalNome || clinic.name)}</div>
    <p class="nota">Recibo emitido em ${esc(geradoEm)}. Campos em branco são preenchidos à mão. Para reembolso, a operadora pode exigir também o relatório do atendimento e o comprovante de pagamento.</p>
  </body></html>`
}

