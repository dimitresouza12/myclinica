// Termo de cobrança recorrente no cartão, mostrado no modal de cadastro do cartão e gravado como prova do aceite.
// Função pura (roda no navegador e no servidor): o servidor remonta o texto com os valores que ELE calculou e grava o
// hash sha256 desse texto, então a prova cobre exatamente o que a pessoa leu quando os valores batem (a rota já recusa
// com 409 `valor_diferente` quando não batem).
//
// TEXTO PADRÃO A REVISAR JURIDICAMENTE: redigido pelo produto, ainda sem revisão de advogado. Ao alterar qualquer
// cláusula, mude TERMO_VERSAO (a versão vai junto com a prova do aceite).

export const TERMO_VERSAO = 'cobranca-cartao-2026-11-23'
export const TERMO_TITULO = 'Termos da assinatura mensal no cartão'

/** Dias depois do vencimento em que o acesso segue liberado (espelha PRIMEIRA_COBRANCA_TOLERANCIA_DIAS de clinicStatus). */
const TOLERANCIA_DIAS = 2

export interface TermoInput {
  /** Nome do plano (ex.: "Completo"). */
  planoLabel: string
  /** Valor cheio mensal, em reais. */
  valorCheio: number
  /** Valor da 1ª cobrança, em reais (metade do cheio quando há promoção). */
  valorPrimeira: number
  /** Data da 1ª cobrança já formatada (DD/MM/AAAA). */
  dataPrimeira: string
  /** A 1ª mensalidade tem 50% de desconto. */
  promo: boolean
}

export interface TermoSecao {
  titulo: string
  paragrafos: string[]
}

export interface Termo {
  versao: string
  titulo: string
  secoes: TermoSecao[]
  /** Texto puro (título, seções e parágrafos), usado para o hash da prova. */
  texto: string
}

/** 99.9 → "R$ 99,90" (mesmo formato de cartaoCheckout.formatBrl, sem importar a lib de formulário). */
function brl(v: number): string {
  return `R$ ${v.toFixed(2).replace('.', ',')}`
}

export function montarTermo(i: TermoInput): Termo {
  const cobranca: string[] = [
    `Ao cadastrar o cartão, você autoriza a MyClinica, por meio do operador de pagamentos Asaas, a cobrar neste cartão a mensalidade do plano ${i.planoLabel}, de forma recorrente, a cada mês, até o cancelamento.`,
    `Hoje nada é cobrado (${brl(0)}). A primeira cobrança é de ${brl(i.valorPrimeira)}, em ${i.dataPrimeira}. Depois dela, a mensalidade é de ${brl(i.valorCheio)}, no mesmo dia de cada mês.`,
  ]
  if (i.promo) {
    cobranca.push(
      `O desconto de 50% da Black Friday vale somente para a primeira mensalidade (${brl(i.valorPrimeira)} em vez de ${brl(i.valorCheio)}). A partir da segunda mensalidade o valor é o cheio, de ${brl(i.valorCheio)}.`,
    )
  }

  const secoes: TermoSecao[] = [
    { titulo: '1. Cobrança recorrente no cartão', paragrafos: cobranca },
    {
      titulo: '2. Sem fidelidade e cancelamento',
      paragrafos: [
        'O plano é mensal e não tem fidelidade nem multa. Você pode cancelar a qualquer momento.',
        'O cancelamento vale para as cobranças seguintes. Mensalidade já paga não é devolvida, e o acesso segue até o fim do período pago.',
        'Para cancelar ou trocar o cartão, fale com o suporte da MyClinica pelos canais de atendimento.',
      ],
    },
    {
      titulo: '3. Falta de pagamento',
      paragrafos: [
        `Se uma cobrança não for paga, o acesso à clínica é bloqueado ${TOLERANCIA_DIAS} dias depois do vencimento. Os dados da clínica são mantidos e o acesso volta quando o pagamento é regularizado.`,
        'Cobranças recusadas pelo banco podem ser tentadas novamente pelo operador de pagamentos.',
      ],
    },
    {
      titulo: '4. Dados do cartão e privacidade',
      paragrafos: [
        'Os dados do cartão são enviados ao Asaas, que processa o pagamento. A MyClinica não armazena o número completo, a validade nem o código de segurança do cartão; guarda apenas a bandeira e os quatro últimos dígitos para identificar o cartão.',
        'Os dados do titular (nome, CPF ou CNPJ, e-mail, telefone e endereço) são usados para emitir e cobrar a assinatura, conforme a Lei Geral de Proteção de Dados (LGPD). Para exercer seus direitos como titular dos dados, fale com o suporte da MyClinica.',
      ],
    },
    {
      titulo: '5. Registro do aceite',
      paragrafos: [
        'Ao marcar "Li e concordo com os termos", você confirma que leu este texto. Registramos a data e hora, o endereço IP, o navegador e a versão do termo como comprovação do aceite.',
      ],
    },
  ]

  const texto = [TERMO_TITULO, ...secoes.flatMap(s => [s.titulo, ...s.paragrafos])].join('\n\n')
  return { versao: TERMO_VERSAO, titulo: TERMO_TITULO, secoes, texto }
}
