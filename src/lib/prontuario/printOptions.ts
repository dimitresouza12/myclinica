// Opções do menu Imprimir do prontuário e os textos da confirmação. Lógica pura (testada em printOptions.test.ts):
// o que cada opção imprime, quando ela fica indisponível e o aviso das anotações sigilosas de psicologia.

import type { MedicalRecord, RecordEntry } from '@/types'
import { stripConfidentialForPrint } from '@/lib/sigilo'

export type CorePrintId = 'prontuario' | 'ficha' | 'evolucao' | 'orcamento' | 'contrato'

export interface PrintOptionInfo {
  id: string
  /** Nome claro do que será impresso ("Prontuário completo"). Aparece no menu e na confirmação. */
  label: string
  /** O que entra na impressão, em tópicos curtos. */
  includes: string[]
  /** Quando preenchido, a opção aparece desativada com este motivo. */
  disabledReason?: string
  /** A impressão inclui a evolução clínica: a confirmação lembra que as notas sigilosas ficam de fora. */
  mentionsSigilo?: boolean
}

export interface PrintContext {
  record: MedicalRecord | null
  entries: RecordEntry[]
  entriesLoading: boolean
  /** Itens do orçamento (da Ficha, inclusive o que ainda não foi salvo). */
  planItemCount: number
}

/** Quantas anotações sigilosas ficam de fora de qualquer impressão. */
export function confidentialCount(entries: RecordEntry[]): number {
  return entries.length - stripConfidentialForPrint(entries).length
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Opções fixas do prontuário (as que dependem só dos dados do paciente), na ordem do menu. */
export function corePrintOptions(ctx: PrintContext): PrintOptionInfo[] {
  const { record, entries, entriesLoading, planItemCount } = ctx
  const evolutionCount = stripConfidentialForPrint(entries).length
  const waiting = entriesLoading ? 'Carregando os dados do prontuário' : undefined
  const evolucaoInclude = evolutionCount > 0 ? `Evolução clínica (${plural(evolutionCount, 'registro', 'registros')})` : 'Evolução clínica'
  const contract = (record?.contract_text ?? '').trim()

  return [
    {
      id: 'prontuario',
      label: 'Prontuário completo',
      includes: ['Identificação do paciente', 'Anamnese e exame clínico', 'Plano de tratamento', 'Odontograma e faceograma, quando houver marcações', evolucaoInclude],
      disabledReason: waiting,
      mentionsSigilo: true,
    },
    {
      id: 'ficha',
      label: 'Ficha clínica',
      includes: ['Identificação do paciente', 'Anamnese e exame clínico', 'Plano de tratamento', 'Odontograma e faceograma, quando houver marcações'],
      disabledReason: waiting,
    },
    {
      id: 'evolucao',
      label: 'Evolução clínica',
      includes: [evolucaoInclude],
      disabledReason: waiting ?? (evolutionCount === 0 ? 'Nenhuma evolução registrada para imprimir' : undefined),
      mentionsSigilo: true,
    },
    {
      id: 'orcamento',
      label: 'Orçamento do tratamento',
      includes: [planItemCount > 0 ? `Itens e valores do plano (${plural(planItemCount, 'item', 'itens')}) e a observação geral` : 'Itens e valores do plano de tratamento'],
      disabledReason: planItemCount === 0 ? 'Adicione itens ao plano de tratamento na Ficha clínica' : undefined,
    },
    {
      id: 'contrato',
      label: 'Contrato (texto salvo)',
      includes: ['Texto do contrato salvo na ficha, com linhas de assinatura da clínica e do paciente'],
      disabledReason: contract ? undefined : 'Nenhum contrato salvo para este paciente',
    },
  ]
}

/** Pergunta da confirmação: nome do que será impresso e para quem. */
export function confirmQuestion(label: string, patientName: string): string {
  return `Você vai imprimir: ${label} de ${patientName}. Deseja continuar?`
}

/** Aviso sobre anotações sigilosas de psicologia. Nunca promete mais do que o sistema faz: elas sempre ficam de fora. */
export function sigiloNotice(entries: RecordEntry[]): string {
  const n = confidentialCount(entries)
  const base = 'Anotações sigilosas de psicologia nunca saem na impressão.'
  if (n === 0) return base
  return `${base} ${plural(n, 'anotação sigilosa fica', 'anotações sigilosas ficam')} de fora desta.`
}
