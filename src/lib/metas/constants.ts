import type { GoalResult, GoalStatus, MetasArea } from './types'

export const STATUS_LABEL: Record<GoalStatus, string> = {
  em_andamento: 'Em andamento',
  atingida: 'Atingida',
  suspensa: 'Suspensa',
  cancelada: 'Encerrada',
}

export const STATUS_ORDER: GoalStatus[] = ['em_andamento', 'atingida', 'suspensa', 'cancelada']

/** Pontuação de cada resultado no gráfico (0 a 100). */
export const RESULT_SCORE: Record<GoalResult, number> = {
  adquirido: 100,
  com_pista: 50,
  nao_adquirido: 0,
}

export const RESULT_ORDER: GoalResult[] = ['adquirido', 'com_pista', 'nao_adquirido']

export interface AreaProfile {
  area: MetasArea
  /** Nome da aba no prontuário */
  tabLabel: string
  /** Sigla do plano */
  planAcronym: string
  planTitle: string
  resultLabel: Record<GoalResult, string>
  domains: string[]
  /** Psicologia não guarda nota por sessão: o sigilo da psicoterapia (Res. CFP 001/2009) não permite texto livre aqui. */
  allowSessionNote: boolean
  /** Exemplo mostrado no campo de título */
  titlePlaceholder: string
  criterionPlaceholder: string
}

const RESULT_PADRAO: Record<GoalResult, string> = {
  adquirido: 'Adquirido',
  com_pista: 'Com pista',
  nao_adquirido: 'Não adquirido',
}

export const AREA_PROFILE: Record<MetasArea, AreaProfile> = {
  fono: {
    area: 'fono',
    tabLabel: 'Plano terapêutico',
    planAcronym: 'PEI',
    planTitle: 'Plano Terapêutico Individual (PEI)',
    resultLabel: RESULT_PADRAO,
    domains: ['Linguagem expressiva', 'Linguagem receptiva', 'Fala e articulação', 'Motricidade orofacial', 'Voz', 'Fluência', 'Audição', 'Deglutição e alimentação', 'Comunicação social', 'Leitura e escrita'],
    allowSessionNote: true,
    titlePlaceholder: 'Ex.: produzir /r/ em sílaba medial',
    criterionPlaceholder: 'Ex.: 80% de acerto em 3 sessões seguidas',
  },
  to: {
    area: 'to',
    tabLabel: 'Plano terapêutico',
    planAcronym: 'PTI',
    planTitle: 'Projeto Terapêutico Individual (PTI)',
    resultLabel: { adquirido: 'Independente', com_pista: 'Com apoio', nao_adquirido: 'Não realiza' },
    domains: ['AVDs', 'AIVDs', 'Integração sensorial', 'Coordenação motora fina', 'Coordenação motora grossa', 'Regulação emocional', 'Participação escolar', 'Brincar', 'Habilidades sociais', 'Tecnologia assistiva'],
    allowSessionNote: true,
    titlePlaceholder: 'Ex.: vestir a camiseta sozinho',
    criterionPlaceholder: 'Ex.: realiza sem ajuda em 4 de 5 tentativas',
  },
  fisio: {
    area: 'fisio',
    tabLabel: 'Metas',
    planAcronym: 'Metas',
    planTitle: 'Metas do tratamento',
    resultLabel: { adquirido: 'Atingida', com_pista: 'Parcial', nao_adquirido: 'Não atingida' },
    domains: ['Dor', 'Amplitude de movimento', 'Força muscular', 'Equilíbrio', 'Marcha', 'Função e atividades diárias', 'Respiratório', 'Postura'],
    allowSessionNote: true,
    titlePlaceholder: 'Ex.: subir um lance de escada sem dor',
    criterionPlaceholder: 'Ex.: dor abaixo de 3 na escala EVA',
  },
  psico: {
    area: 'psico',
    tabLabel: 'Metas',
    planAcronym: 'Metas',
    planTitle: 'Metas terapêuticas',
    resultLabel: { adquirido: 'Alcançada', com_pista: 'Em progresso', nao_adquirido: 'Não alcançada' },
    domains: ['Regulação emocional', 'Habilidades sociais', 'Comportamento', 'Atenção e funções executivas', 'Rotina e autonomia', 'Relações familiares'],
    allowSessionNote: false,
    titlePlaceholder: 'Ex.: usar estratégia de respiração em situação de estresse',
    criterionPlaceholder: 'Ex.: usa a estratégia em 3 de 4 situações',
  },
}

/** Nome da área no alternador da aba (clínica com mais de uma área que usa metas). */
export const AREA_NOME: Record<MetasArea, string> = {
  fono: 'Fonoaudiologia',
  to: 'Terapia ocupacional',
  fisio: 'Fisioterapia',
  psico: 'Psicologia',
}

const METAS_AREAS: readonly MetasArea[] = ['fono', 'to', 'fisio', 'psico']

/** Áreas da clínica que usam metas, sem repetição e na ordem fixa fono, to, fisio, psico. */
export function metasAreasOf(clinicAreas: readonly string[]): MetasArea[] {
  return METAS_AREAS.filter(a => clinicAreas.includes(a))
}

/** Perfil usado quando o profissional logado é de uma das áreas; senão, a primeira área da clínica que usa metas. */
export function resolveMetasArea(
  userArea: string | null | undefined,
  clinicAreas: readonly string[],
): MetasArea | null {
  const isArea = (v: string | null | undefined): v is MetasArea => v === 'fono' || v === 'to' || v === 'fisio' || v === 'psico'
  if (isArea(userArea)) return userArea
  const hit = clinicAreas.find(isArea)
  return hit ?? null
}
