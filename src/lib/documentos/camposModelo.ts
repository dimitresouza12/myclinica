// Catálogo dos campos {{...}} que um modelo de atestado, declaração ou laudo pode usar. É a ÚNICA lista aceita: o
// montador do texto (buildDocText em atestado.ts), a importação de modelo por foto e a gravação do modelo da clínica
// se apoiam nela. Campo fora daqui é descartado. Lógica pura (sem rede, sem banco), testada em importar.test.ts.
// Só importa TIPOS de atestado.ts: sem dependência circular em tempo de execução.

import type { DocKind, Finalidade } from './atestado'

export interface CampoModelo {
  key: string
  /** nome mostrado na tela */
  label: string
  /** o que o campo é, em uma frase (vai para o prompt da IA) */
  descricao: string
  /** como costuma aparecer preenchido (vai para o prompt e para a tela) */
  exemplo: string
}

export const CAMPOS_MODELO: readonly CampoModelo[] = [
  { key: 'paciente', label: 'Nome do paciente', descricao: 'nome completo do paciente', exemplo: 'Maria Souza' },
  { key: 'cpf', label: 'CPF do paciente', descricao: 'CPF do paciente', exemplo: '000.000.000-00' },
  { key: 'paciente_ident', label: 'Paciente com CPF', descricao: 'nome e CPF do paciente juntos, quando o modelo tem um só espaço para os dois', exemplo: 'Maria Souza, CPF 000.000.000-00' },
  { key: 'responsavel', label: 'Nome do responsável legal', descricao: 'nome do responsável legal (ou tutor) do paciente, quando houver', exemplo: 'Ana Souza' },
  { key: 'responsavel_ident', label: 'Responsável com CPF', descricao: 'nome e CPF do responsável legal (ou tutor) juntos', exemplo: 'Ana Souza, CPF 000.000.000-00' },
  { key: 'data', label: 'Data (dd/mm/aaaa)', descricao: 'data do atendimento ou da emissão, em numerais', exemplo: '10/11/2026' },
  { key: 'data_extenso', label: 'Data por extenso', descricao: 'data do atendimento ou da emissão escrita por extenso', exemplo: '10 de novembro de 2026' },
  { key: 'profissional', label: 'Nome do profissional', descricao: 'nome de quem assina o documento', exemplo: 'Ana Lima' },
  { key: 'registro', label: 'Registro no conselho', descricao: 'sigla e número do conselho profissional de quem assina (CRM, CRO, CREFITO, CRP...)', exemplo: 'CRM 12345' },
  { key: 'rqe', label: 'RQE', descricao: 'registro de qualificação de especialista (medicina)', exemplo: 'RQE 678' },
  { key: 'profissional_ident', label: 'Profissional com registro', descricao: 'nome do profissional junto do registro no conselho, quando o modelo tem um só espaço para os dois', exemplo: 'Ana Lima, CRM 12345' },
  { key: 'clinica', label: 'Nome da clínica', descricao: 'nome da clínica ou do consultório', exemplo: 'Clínica Sol' },
  { key: 'dias_texto', label: 'Dias de afastamento (por extenso)', descricao: 'quantidade de dias de afastamento com o número por extenso', exemplo: '3 (três) dias' },
  { key: 'dias', label: 'Dias de afastamento (número)', descricao: 'quantidade de dias de afastamento só em algarismos', exemplo: '3' },
  { key: 'periodo_afastamento', label: 'Período do afastamento', descricao: 'intervalo de datas do afastamento', exemplo: 'no período de 10/11/2026 a 12/11/2026' },
  { key: 'horario', label: 'Horário do atendimento (frase)', descricao: 'horário do atendimento escrito em uma frase', exemplo: 'no período das 14:00 às 15:00' },
  { key: 'hora_inicio', label: 'Hora de início', descricao: 'hora em que o atendimento começou', exemplo: '14:00' },
  { key: 'hora_fim', label: 'Hora de fim', descricao: 'hora em que o atendimento terminou', exemplo: '15:00' },
  { key: 'acompanhante', label: 'Nome do acompanhante', descricao: 'nome de quem acompanhou o paciente', exemplo: 'João Souza' },
  { key: 'aptidao', label: 'Apto para', descricao: 'atividade para a qual o paciente está apto', exemplo: 'a prática de atividades físicas' },
  { key: 'laudo_finalidade', label: 'Finalidade do laudo', descricao: 'para que serve o laudo', exemplo: 'encaminhamento' },
  { key: 'laudo_resultado', label: 'Resultado da avaliação', descricao: 'resultado ou conclusão da avaliação', exemplo: 'sem alterações' },
  { key: 'cid', label: 'CID-10', descricao: 'código CID-10 (só sai no documento com a autorização do paciente)', exemplo: 'J11' },
] as const

export const CAMPO_KEYS: readonly string[] = CAMPOS_MODELO.map(c => c.key)
export const CAMPO_LABEL: Record<string, string> = Object.fromEntries(CAMPOS_MODELO.map(c => [c.key, c.label.toLowerCase()]))

const BASE = ['paciente', 'cpf', 'paciente_ident', 'responsavel', 'responsavel_ident', 'data', 'data_extenso', 'profissional', 'registro', 'rqe', 'profissional_ident', 'clinica']

export function isCampoKey(v: unknown): v is string {
  return typeof v === 'string' && CAMPO_KEYS.includes(v)
}

/** Campos que fazem sentido para o tipo e a finalidade (o formulário só sabe preencher estes). */
export function camposPermitidos(kind: DocKind, finalidade?: Finalidade | null): string[] {
  const keys = [...BASE]
  if (kind === 'laudo') {
    keys.push('laudo_finalidade', 'laudo_resultado', 'cid')
    return keys
  }
  if (kind === 'atestado') keys.push('cid')
  if (kind === 'atestado' && finalidade === 'afastamento') keys.push('dias_texto', 'dias', 'periodo_afastamento')
  if (kind === 'atestado' && finalidade === 'aptidao') keys.push('aptidao')
  if (finalidade === 'comparecimento' || finalidade === 'acompanhante') keys.push('horario', 'hora_inicio', 'hora_fim')
  if (finalidade === 'acompanhante') keys.push('acompanhante')
  return keys
}

export function camposPermitidosDetalhe(kind: DocKind, finalidade?: Finalidade | null): CampoModelo[] {
  const ok = new Set(camposPermitidos(kind, finalidade))
  return CAMPOS_MODELO.filter(c => ok.has(c.key))
}
