// Texto do contrato de prestação de serviços entre a MyClinica e a clínica. Função pura: o texto assinado é
// TEXTO PURO (mesma regra da assinatura eletrônica em lib/assinatura) e todo número, data e nome entra aqui,
// de modo que o hash do conteúdo cobre exatamente o que o responsável leu.
//
// RASCUNHO PARA REVISÃO DE ADVOGADO: enquanto CONTRATO_EM_REVISAO for true, o texto abre com um aviso. Depois
// da revisão jurídica, ajustar as cláusulas e mudar a constante (a versão vai junto no hash, ver CONTRATO_VERSAO).

import { formatBrl, formatCpf, formatDateBr, formatDateExtenso } from '@/lib/documentos/campos'
import { normalizeDocText } from '@/lib/assinatura/texto'
import { PLAN_CATALOG, type PublicPlan } from '@/lib/planCatalog'
import { MAX_INSTALLMENTS, type ContractMonths, type ContractPaymentMode } from '@/lib/contratoPrecos'

export const CONTRATO_VERSAO = 'rascunho-2026-11-24-v2'
export const CONTRATO_EM_REVISAO = true
export const CONTRATO_TITULO = 'Contrato de Prestação de Serviços de Software (MyClinica)'

export const AVISO_RASCUNHO =
  'RASCUNHO PARA REVISÃO DE ADVOGADO. Este texto ainda não foi revisado juridicamente. Não usar com clientes antes da revisão e da retirada deste aviso.'

/** Marcador de dado da CONTRATADA que ainda não foi configurado (o servidor não cria contrato com isto no texto). */
export const A_PREENCHER = 'A PREENCHER'

export interface Contratada {
  razaoSocial: string
  cnpj: string
  cidadeUf: string
}

/**
 * Dados da CONTRATADA vêm do ambiente, para não ficarem fixos no código nem serem inventados:
 * MYCLINICA_CONTRATADA_RAZAO_SOCIAL, MYCLINICA_CONTRATADA_CNPJ, MYCLINICA_CONTRATADA_CIDADE_UF.
 * Sem eles o campo sai como "A PREENCHER" e o servidor recusa gerar o contrato (ver contratadaPendencias).
 */
export function contratadaFromEnv(env: Record<string, string | undefined> = process.env): Contratada {
  const get = (k: string) => env[k]?.trim() || A_PREENCHER
  return {
    razaoSocial: get('MYCLINICA_CONTRATADA_RAZAO_SOCIAL'),
    cnpj: get('MYCLINICA_CONTRATADA_CNPJ'),
    cidadeUf: get('MYCLINICA_CONTRATADA_CIDADE_UF'),
  }
}

/** Campos da CONTRATADA ainda sem valor. Vazio = pronto para gerar contratos. */
export function contratadaPendencias(c: Contratada): string[] {
  const out: string[] = []
  if (c.razaoSocial === A_PREENCHER) out.push('razão social')
  if (c.cnpj === A_PREENCHER) out.push('CPF ou CNPJ')
  if (c.cidadeUf === A_PREENCHER) out.push('cidade/UF do foro')
  return out
}

export interface ContractTextData {
  contratada: Contratada
  clinicName: string
  clinicAddress?: string | null
  clinicPhone?: string | null
  clinicEmail?: string | null
  responsibleName: string
  responsibleCpf: string
  plan: PublicPlan
  months: ContractMonths
  paymentMode: ContractPaymentMode
  installments: number
  monthlyValue: number
  /** Primeira mensalidade com a promoção da Black Friday (50%), quando aplicada no mês a mês. */
  promoFirstValue?: number | null
  /** Total do contrato, sem a taxa do cartão. */
  contractTotal: number
  cardFeeValue: number
  /** Total efetivamente cobrado (contrato + taxa de cartão). */
  totalValue: number
  installmentValue: number
  /** AAAA-MM-DD */
  firstDueDate: string
  /** AAAA-MM-DD: dia em que o contrato foi gerado. */
  generatedOn: string
}

const brl = (v: number) => `R$ ${formatBrl(v)}`

function limiteTexto(plan: PublicPlan): string {
  const lim = PLAN_CATALOG[plan].professionalLimit
  if (lim === null) return 'sem limite de profissionais cadastrados'
  return lim === 1 ? 'até 1 profissional cadastrado' : `até ${lim} profissionais cadastrados`
}

export function buildContractText(d: ContractTextData): string {
  const plano = PLAN_CATALOG[d.plan]
  const meses = `${d.months} meses`
  const mensal = d.paymentMode === 'monthly'
  const parcelado = !mensal && d.installments > 1
  const primeira = formatDateBr(d.firstDueDate)
  const primeiraExt = formatDateExtenso(d.firstDueDate)

  const L: string[] = []
  if (CONTRATO_EM_REVISAO) L.push(AVISO_RASCUNHO, '')
  L.push(CONTRATO_TITULO.toUpperCase(), '')
  L.push('Pelo presente instrumento particular, as partes abaixo qualificadas, doravante denominadas CONTRATADA e CONTRATANTE, e conjuntamente Partes, ajustam o contrato de prestação de serviços que se rege pelas cláusulas seguintes.')
  L.push('')

  L.push('CLÁUSULA 1ª - DAS PARTES')
  L.push(`CONTRATADA: ${d.contratada.razaoSocial}, nome comercial MyClinica, ${docContratada(d.contratada.cnpj)}, com sede em ${d.contratada.cidadeUf}.`)
  const contatos = [
    d.clinicAddress ? `endereço ${d.clinicAddress}` : '',
    d.clinicPhone ? `telefone ${d.clinicPhone}` : '',
    d.clinicEmail ? `e-mail ${d.clinicEmail}` : '',
  ].filter(Boolean).join(', ')
  L.push(`CONTRATANTE: ${d.clinicName}${contatos ? ` (${contatos})` : ''}, neste ato representada por ${d.responsibleName}, inscrito(a) no CPF sob o nº ${formatCpf(d.responsibleCpf)}.`)
  L.push('1.1. O representante da CONTRATANTE declara ter poderes para contratar em nome dela e responde pela veracidade dos dados informados.')
  L.push('1.2. A CONTRATANTE deve manter seus dados cadastrais e de contato atualizados. Comunicações enviadas aos dados informados presumem-se recebidas.')
  L.push('')

  L.push('CLÁUSULA 2ª - DO OBJETO')
  L.push(`2.1. O objeto deste contrato é o licenciamento, em caráter não exclusivo, intransferível e temporário, do uso do sistema MyClinica, na modalidade de software como serviço, acessado pela internet, no plano ${plano.label} (${limiteTexto(d.plan)}).`)
  L.push('2.2. As funcionalidades são as descritas para o plano contratado no momento da contratação. A CONTRATADA pode evoluir o sistema, sem reduzir de forma substancial as funcionalidades do plano durante o prazo.')
  L.push('2.3. Não estão incluídos: equipamentos, acesso à internet, linha telefônica ou número de WhatsApp, serviços de terceiros e consultoria ou treinamento além do suporte previsto neste contrato.')
  L.push('2.4. O software, a marca e a documentação pertencem à CONTRATADA. Os dados inseridos pela CONTRATANTE pertencem a ela. É vedado à CONTRATANTE copiar, descompilar, sublicenciar ou revender o sistema.')
  L.push('')

  L.push('CLÁUSULA 3ª - DO PRAZO')
  L.push(`3.1. O contrato vigora por ${meses}, contados da data da primeira cobrança, ${primeiraExt}.`)
  L.push('3.2. Encerrado o prazo, o uso continua no plano mensal, sem prazo mínimo e cancelável a qualquer tempo, pelo preço de tabela vigente. A CONTRATADA informará esse preço com antecedência mínima de 30 dias do fim do prazo.')
  L.push('')

  L.push('CLÁUSULA 4ª - DO PREÇO E DO PAGAMENTO')
  if (mensal) {
    if (d.promoFirstValue != null) {
      L.push(`4.1. A CONTRATANTE pagará ${brl(d.promoFirstValue)} na primeira mensalidade, com 50% de desconto da promoção Black Friday, e ${brl(d.monthlyValue)} em cada uma das ${d.months - 1} mensalidades seguintes, totalizando ${brl(d.contractTotal)} em ${meses}. As cobranças são emitidas por meio da plataforma de pagamentos Asaas, a primeira com vencimento em ${primeira} e as demais no mesmo dia dos meses seguintes.`)
    } else {
      L.push(`4.1. A CONTRATANTE pagará mensalidade de ${brl(d.monthlyValue)}, durante ${meses}, totalizando ${brl(d.contractTotal)}. As cobranças são emitidas por meio da plataforma de pagamentos Asaas, a primeira com vencimento em ${primeira} e as demais no mesmo dia dos meses seguintes.`)
    }
    L.push('4.2. A CONTRATANTE escolhe, a cada cobrança, a forma de pagamento entre as aceitas pela plataforma (Pix, boleto ou cartão de crédito).')
  } else if (parcelado) {
    L.push(`4.1. A CONTRATANTE pagará o valor do contrato, de ${brl(d.contractTotal)}, em cobrança única emitida por meio da plataforma de pagamentos Asaas, com vencimento em ${primeira}, por cartão de crédito parcelado em ${d.installments} vezes.`)
    L.push(`4.2. A taxa de parcelamento cobrada pela operadora de pagamento é repassada à CONTRATANTE. O acréscimo é de ${brl(d.cardFeeValue)}, e o total cobrado no cartão é de ${brl(d.totalValue)}, em ${d.installments} parcelas de ${brl(d.installmentValue)}. A CONTRATANTE declara ter ciência desse acréscimo antes de assinar.`)
  } else {
    L.push(`4.1. A CONTRATANTE pagará o valor do contrato, de ${brl(d.contractTotal)}, em cobrança única emitida por meio da plataforma de pagamentos Asaas, com vencimento em ${primeira}, por Pix, boleto ou cartão de crédito em uma parcela, sem acréscimo.`)
    L.push(`4.2. Se a CONTRATANTE optar por parcelar no cartão de crédito, em até ${MAX_INSTALLMENTS} vezes, a taxa de parcelamento cobrada pela operadora de pagamento é repassada a ela e informada antes da confirmação.`)
  }
  L.push('4.3. O valor do contrato não é reajustado durante o prazo, ainda que o preço de tabela do plano mude.')
  L.push('4.4. O atraso no pagamento sujeita a CONTRATANTE a multa de 2% (dois por cento) sobre o valor em atraso, juros de mora de 1% (um por cento) ao mês e correção monetária pelo IPCA, calculados pro rata die, além das medidas de cobrança cabíveis.')
  L.push('')

  L.push('CLÁUSULA 5ª - DO CANCELAMENTO E DA RESCISÃO')
  if (mensal) {
    L.push(`5.1. A CONTRATANTE pode cancelar este contrato antes do fim do prazo de ${meses}. Nesse caso, permanecem devidas as mensalidades restantes até o fim do prazo, nos vencimentos originais, e não há devolução de mensalidades já pagas.`)
  } else {
    L.push('5.1. A CONTRATANTE pode cancelar este contrato antes do fim do prazo, mas o valor pago corresponde ao prazo inteiro e não há devolução, salvo o direito de arrependimento previsto em lei, quando aplicável, e os casos em que a CONTRATADA der causa à indisponibilidade prolongada do sistema.')
  }
  L.push('5.2. Qualquer das Partes pode rescindir este contrato por descumprimento da outra, se esta, notificada por escrito, não corrigir a falta em 10 dias. A CONTRATADA pode rescindir de imediato em caso de uso ilícito do sistema ou de fraude no pagamento.')
  L.push('5.3. Encerrado o contrato, por qualquer causa, a CONTRATADA mantém os dados da CONTRATANTE disponíveis para exportação por 30 dias e, depois, os elimina, salvo se a lei exigir a conservação.')
  L.push('5.4. O plano mensal sem contrato não é objeto deste instrumento e pode ser cancelado a qualquer momento, sem multa.')
  L.push('')

  L.push('CLÁUSULA 6ª - DAS OBRIGAÇÕES DA CONTRATADA')
  L.push('6.1. Manter o sistema disponível, empregando esforços técnicos razoáveis. A CONTRATADA não garante funcionamento ininterrupto e avisará com antecedência razoável as manutenções programadas.')
  L.push('6.2. Prestar suporte técnico por WhatsApp ou e-mail, em dias úteis e em horário comercial.')
  L.push('6.3. Adotar medidas técnicas e administrativas aptas a proteger os dados contra acesso não autorizado, perda e alteração.')
  L.push('')

  L.push('CLÁUSULA 7ª - DAS OBRIGAÇÕES DA CONTRATANTE')
  L.push('7.1. Manter em sigilo os dados de acesso, responder por tudo o que for feito com eles e respeitar o limite de profissionais do plano contratado.')
  L.push('7.2. Usar o sistema conforme a lei e as normas do seu conselho profissional, e responder pelo conteúdo que registra, inclusive prontuários, receitas e documentos clínicos.')
  L.push('7.3. Obter dos pacientes as autorizações necessárias ao tratamento dos seus dados e ao contato por WhatsApp, e cumprir os prazos legais de guarda de prontuário, que são de sua responsabilidade.')
  L.push('7.4. Não usar o sistema para envio de mensagens não solicitadas, nem para qualquer finalidade ilícita.')
  L.push('')

  L.push('CLÁUSULA 8ª - DA PROTEÇÃO DE DADOS PESSOAIS')
  L.push('8.1. Para os dados pessoais de pacientes e de profissionais inseridos no sistema, a CONTRATANTE é a controladora e a CONTRATADA é a operadora, nos termos da Lei nº 13.709/2018 (LGPD). Esses dados incluem dados pessoais sensíveis referentes à saúde.')
  L.push('8.2. A CONTRATADA trata os dados somente para prestar o serviço, conforme as instruções da CONTRATANTE, e mantém sigilo sobre eles.')
  L.push('8.3. A CONTRATANTE autoriza a CONTRATADA a usar provedores de infraestrutura em nuvem, de pagamento, de mensageria e de inteligência artificial como suboperadores, sempre sob dever de proteção equivalente.')
  L.push('8.4. A CONTRATADA comunicará à CONTRATANTE, em até 72 horas da ciência, incidente de segurança que possa afetar dados pessoais, e colaborará no atendimento aos titulares e às autoridades.')
  L.push('8.5. Os recursos de inteligência artificial, quando habilitados, apenas auxiliam o trabalho. A revisão e a decisão final sobre o conteúdo e a conduta clínica são do profissional.')
  L.push('')

  L.push('CLÁUSULA 9ª - DO WHATSAPP E DOS SERVIÇOS DE TERCEIROS')
  L.push('9.1. A integração com o WhatsApp e com a plataforma de pagamentos depende de serviços de terceiros, sujeitos às regras e à disponibilidade desses terceiros.')
  L.push('9.2. A CONTRATADA não responde por suspensão, bloqueio ou restrição do número da CONTRATANTE no WhatsApp, nem por falha desses serviços que não lhe seja imputável.')
  L.push('')

  L.push('CLÁUSULA 10ª - DA LIMITAÇÃO DE RESPONSABILIDADE')
  L.push('10.1. O sistema é ferramenta de apoio e não substitui o julgamento do profissional de saúde.')
  L.push('10.2. A responsabilidade da CONTRATADA limita-se aos danos diretos comprovados e ao valor pago pela CONTRATANTE nos 12 meses anteriores ao fato, e não alcança lucros cessantes nem danos indiretos, ressalvados dolo e culpa grave e o que a lei não permitir limitar.')
  L.push('')

  L.push('CLÁUSULA 11ª - DA CONFIDENCIALIDADE')
  L.push('11.1. Cada Parte mantém em sigilo as informações não públicas da outra a que tiver acesso em razão deste contrato, durante a vigência e por 2 anos depois dela.')
  L.push('')

  L.push('CLÁUSULA 12ª - DA ASSINATURA ELETRÔNICA')
  L.push('12.1. As Partes reconhecem como válida a assinatura eletrônica deste contrato, nos termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001 e da Lei nº 14.063/2020, art. 4º, I, e aceitam esse meio como prova de autoria e de integridade do documento.')
  L.push('12.2. A CONTRATANTE se identifica por código de 6 dígitos enviado por WhatsApp ao telefone cadastrado, por nome completo, CPF e assinatura manuscrita na tela ou digitada.')
  L.push('12.3. Ficam registrados, como prova, a data e a hora, o endereço IP, o dispositivo, o código de verificação e as impressões digitais (hash) do texto e da assinatura. Essa assinatura não usa certificado ICP-Brasil.')
  L.push('12.4. O contrato obriga as Partes a partir da assinatura da CONTRATANTE. A CONTRATADA confirma o contrato por assinatura digital posterior, feita pela plataforma gov.br e anexada ao registro do contrato.')
  L.push('')

  L.push('CLÁUSULA 13ª - DAS DISPOSIÇÕES GERAIS')
  L.push('13.1. Este contrato, os Termos de Uso e a Política de Privacidade da MyClinica formam o acordo integral entre as Partes. Havendo conflito, prevalece este contrato.')
  L.push('13.2. A tolerância de uma Parte com o descumprimento da outra não é novação nem renúncia. Se uma cláusula for considerada inválida, as demais continuam em vigor.')
  L.push('13.3. Nenhuma Parte pode ceder este contrato sem a concordância da outra, exceto a CONTRATADA para sucessora do negócio, mediante aviso.')
  L.push('13.4. Alterações deste contrato exigem acordo escrito, inclusive eletrônico.')
  L.push('')

  L.push('CLÁUSULA 14ª - DO FORO')
  L.push(`14.1. Fica eleito o foro da comarca de ${d.contratada.cidadeUf}, com renúncia a qualquer outro, por mais privilegiado que seja, para resolver as questões deste contrato.`)
  L.push('')

  L.push('E, por estarem de acordo, as Partes firmam este contrato por meio eletrônico.')
  L.push('')
  L.push(`Contrato gerado em ${formatDateExtenso(d.generatedOn)}. Versão do texto: ${CONTRATO_VERSAO}.`)

  return normalizeDocText(L.join('\n'))
}

/** O texto ainda traz algum campo "A PREENCHER" da CONTRATADA? */
/** CPF (11 dígitos) = pessoa física; CNPJ (14) = empresa; "A PREENCHER" segue como CNPJ. */
export function docContratada(doc: string): string {
  const dig = doc.replace(/\D/g, '')
  if (dig.length === 11) return `pessoa física inscrita no CPF sob o nº ${formatCpf(dig)}`
  return `inscrita no CNPJ sob o nº ${doc}`
}

/** Rótulo curto do documento da CONTRATADA para o bloco de assinatura do PDF. */
export function rotuloDocContratada(doc: string): string {
  const dig = doc.replace(/\D/g, '')
  return dig.length === 11 ? `CPF ${formatCpf(dig)}` : `CNPJ ${doc}`
}

export function textoTemPendencia(text: string): boolean {
  return text.includes(A_PREENCHER)
}
