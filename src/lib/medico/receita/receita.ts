// Receita estruturada (sem banco de medicamentos pago): itens com medicamento, dose, via, posologia, duração e
// observação, escritos pelo profissional. O sistema NÃO sugere dose, não checa interação e não traz bula: o único apoio
// é a lista local de nomes genéricos para autocompletar (medicamentos.ts). Modelo de dados versionado (v:1) guardado em
// medico_registros (tipo 'receita'), validação e o HTML do impresso. Lógica pura, testada em receita.test.ts.
//
// PONTO DE INTEGRAÇÃO FUTURA COM A MEMED (NÃO IMPLEMENTADO):
//   A Memed (https://memed.com.br) é um serviço pago de prescrição digital com banco de medicamentos, checagem de
//   interações e assinatura digital válida para receita de controle especial. Quando o produto for contratá-la, o
//   encaixe natural é este módulo e o ReceitaPanel:
//     1. O ReceitaPanel ganharia um segundo caminho ao lado de "Salvar receita": "Prescrever pela Memed". Ele abre o
//        módulo de prescrição da Memed (script/SDK deles, carregado só quando o profissional escolhe esse caminho) já
//        com o paciente (nome, CPF, nascimento, telefone) do cadastro e o token do profissional.
//     2. O token do profissional e a chave da integração são segredo de servidor: a rota de API do MyClinica os guarda e
//        entrega ao navegador só o token curto da sessão. Nada disso fica no código do cliente nem neste arquivo.
//     3. O retorno da Memed (identificador e link da prescrição, medicamentos prescritos) seria gravado como mais um
//        registro em medico_registros, com um campo `externo: { provedor: 'memed', id, url }` em ReceitaDados, mantendo
//        o histórico no prontuário. A receita estruturada deste arquivo continua existindo como alternativa gratuita.
//   Nenhuma chamada à Memed existe hoje, nem dependência, variável de ambiente ou tabela para ela.

import { assinaturaHtml, cabecalhoHtml, ESTILO_TD, esc, type CabecalhoImpresso, type ProfissionalImpresso } from '../impresso'

export type Via =
  | 'oral' | 'sublingual' | 'topica' | 'oftalmica' | 'otologica' | 'nasal' | 'inalatoria'
  | 'retal' | 'vaginal' | 'intramuscular' | 'subcutanea' | 'intravenosa' | 'transdermica'

export const VIA_ROTULO: Record<Via, string> = {
  oral: 'Oral',
  sublingual: 'Sublingual',
  topica: 'Tópica (na pele)',
  oftalmica: 'Oftálmica (nos olhos)',
  otologica: 'Otológica (nos ouvidos)',
  nasal: 'Nasal',
  inalatoria: 'Inalatória',
  retal: 'Retal',
  vaginal: 'Vaginal',
  intramuscular: 'Intramuscular',
  subcutanea: 'Subcutânea',
  intravenosa: 'Intravenosa',
  transdermica: 'Transdérmica',
}

export const VIAS: Via[] = Object.keys(VIA_ROTULO) as Via[]

export interface ItemReceita {
  medicamento: string
  /** Dose e apresentação como o profissional escreve: "500 mg, 1 comprimido". */
  dose: string
  via: Via | null
  /** "de 8 em 8 horas", "1 vez ao dia, à noite". */
  posologia: string
  /** "7 dias", "uso contínuo". */
  duracao: string
  observacao: string
}

export interface ReceitaDados {
  v: 1
  itens: ItemReceita[]
  /** Orientações gerais ao paciente (repouso, retorno, sinais de alerta). */
  orientacoes: string
  profissional: ProfissionalImpresso | null
}

export const MAX_ITENS_RECEITA = 20
export const MAX_ORIENTACOES = 800
const MAX_CAMPO = 200
const MAX_OBS_ITEM = 300

/** Atalhos de digitação para a posologia (frequências comuns; o profissional continua escrevendo a dele). */
export const POSOLOGIAS_COMUNS = [
  '1 vez ao dia',
  'de 12 em 12 horas',
  'de 8 em 8 horas',
  'de 6 em 6 horas',
  'à noite, ao deitar',
  'se necessário',
] as const

export function itemVazio(): ItemReceita {
  return { medicamento: '', dose: '', via: 'oral', posologia: '', duracao: '', observacao: '' }
}

export function receitaVazia(): ReceitaDados {
  return { v: 1, itens: [itemVazio()], orientacoes: '', profissional: null }
}

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/[ \t]+/g, ' ').slice(0, max) : '')

function profissionalDe(v: unknown): ProfissionalImpresso | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const nome = texto(o.nome, 160)
  return nome ? { nome, registro: texto(o.registro, 60), rqe: texto(o.rqe, 40) } : null
}

/** Lê o JSON gravado (qualquer versão ou lixo) e devolve sempre uma receita válida para a tela. */
export function normalizarReceita(raw: unknown): ReceitaDados {
  const base: ReceitaDados = { v: 1, itens: [], orientacoes: '', profissional: null }
  if (!raw || typeof raw !== 'object') return { ...base, itens: [itemVazio()] }
  const o = raw as Record<string, unknown>
  const itens: ItemReceita[] = []
  if (Array.isArray(o.itens)) {
    for (const it of o.itens) {
      if (!it || typeof it !== 'object') continue
      const r = it as Record<string, unknown>
      const medicamento = texto(r.medicamento, MAX_CAMPO)
      if (!medicamento) continue
      itens.push({
        medicamento,
        dose: texto(r.dose, MAX_CAMPO),
        via: typeof r.via === 'string' && (VIAS as string[]).includes(r.via) ? (r.via as Via) : null,
        posologia: texto(r.posologia, MAX_CAMPO),
        duracao: texto(r.duracao, MAX_CAMPO),
        observacao: texto(r.observacao, MAX_OBS_ITEM),
      })
      if (itens.length >= MAX_ITENS_RECEITA) break
    }
  }
  return { v: 1, itens: itens.length ? itens : [itemVazio()], orientacoes: texto(o.orientacoes, MAX_ORIENTACOES), profissional: profissionalDe(o.profissional) }
}

/** Itens com medicamento escrito (os em branco são ignorados ao salvar e imprimir). */
export function itensPreenchidos(d: ReceitaDados): ItemReceita[] {
  return d.itens.filter(i => i.medicamento.trim() !== '')
}

export function receitaTemConteudo(d: ReceitaDados): boolean {
  return itensPreenchidos(d).length > 0 || d.orientacoes.trim() !== ''
}

/** Erros que impedem de salvar ou imprimir (lista vazia = pode). Cada item precisa de dose e posologia: sem elas a receita não é utilizável. */
export function validarReceita(d: ReceitaDados): string[] {
  const erros: string[] = []
  const itens = itensPreenchidos(d)
  if (itens.length === 0) { erros.push('Escreva pelo menos um medicamento.'); return erros }
  itens.forEach((i, idx) => {
    const n = idx + 1
    if (!i.dose.trim()) erros.push(`Item ${n} (${i.medicamento.trim()}): informe a dose.`)
    if (!i.posologia.trim()) erros.push(`Item ${n} (${i.medicamento.trim()}): informe a posologia.`)
  })
  if (d.orientacoes.length > MAX_ORIENTACOES) erros.push(`As orientações passam de ${MAX_ORIENTACOES} caracteres.`)
  return erros
}

/** Resumo de uma linha para o histórico: "Amoxicilina, Dipirona e mais 1". */
export function resumoDaReceita(d: ReceitaDados, max = 2): string {
  const nomes = itensPreenchidos(d).map(i => i.medicamento.trim())
  if (nomes.length === 0) return 'Sem medicamentos'
  if (nomes.length <= max) return nomes.join(', ')
  return `${nomes.slice(0, max).join(', ')} e mais ${nomes.length - max}`
}

/** Mesmo medicamento já na receita (sem acento nem maiúscula): a tela avisa para não prescrever em duplicidade. */
export function medicamentosRepetidos(d: ReceitaDados): string[] {
  const chave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const vistos = new Set<string>()
  const repetidos: string[] = []
  for (const i of itensPreenchidos(d)) {
    const k = chave(i.medicamento)
    if (vistos.has(k) && !repetidos.some(r => chave(r) === k)) repetidos.push(i.medicamento.trim())
    vistos.add(k)
  }
  return repetidos
}

/** HTML do impresso "RECEITA MÉDICA" (mesmo título do documento Receita Comum). */
export function htmlReceita(c: CabecalhoImpresso, d: ReceitaDados): string {
  const itens = itensPreenchidos(d)
  const linha = (rotulo: string, valor: string) => (valor.trim() ? `<div style="font-size:12.5px"><span style="color:#555">${rotulo}:</span> ${esc(valor)}</div>` : '')
  const blocos = itens.map((i, idx) => `
    <tr style="page-break-inside:avoid">
      <td style="${ESTILO_TD};width:28px;color:#555;font-weight:700">${idx + 1}.</td>
      <td style="${ESTILO_TD}">
        <div style="font-size:14px;font-weight:700">${esc(i.medicamento)}</div>
        ${linha('Dose', i.dose)}
        ${i.via ? linha('Via', VIA_ROTULO[i.via]) : ''}
        ${linha('Posologia', i.posologia)}
        ${linha('Duração', i.duracao)}
        ${i.observacao.trim() ? `<div style="font-size:12px;color:#444;margin-top:2px;white-space:pre-wrap">Obs.: ${esc(i.observacao)}</div>` : ''}
      </td>
    </tr>`).join('')

  return `${cabecalhoHtml(c, 'RECEITA MÉDICA')}
    <table style="width:100%;border-collapse:collapse;margin-top:6px"><tbody>${blocos}</tbody></table>
    ${d.orientacoes.trim() ? `<div style="margin-top:14px;font-size:12.5px;white-space:pre-wrap"><strong>Orientações:</strong> ${esc(d.orientacoes)}</div>` : ''}
    ${assinaturaHtml(c.profissional)}`
}
