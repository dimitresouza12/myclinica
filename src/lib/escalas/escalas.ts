/**
 * Escalas clínicas com pontuação automática: PHQ-9 e GAD-7 (psicologia, medicina e nutrição) e
 * Oswestry (fisioterapia). Só definição e conta; a tela está em src/components/prontuario/escalas
 * e o formato do registro em ./registro.ts.
 *
 * Instrumentos de rastreio e acompanhamento: a pontuação orienta, não fecha diagnóstico.
 * O Inventário de Depressão de Beck (BDI) não entra: é instrumento com direitos autorais.
 */

export type EscalaId = 'phq9' | 'gad7' | 'odi'

export interface OpcaoEscala {
  valor: number
  rotulo: string
}

export interface ItemEscala {
  /** Título curto, usado no histórico e no texto do prontuário */
  curto: string
  /** Enunciado completo, como aparece para quem responde */
  texto: string
  /** Opções próprias do item (Oswestry); sem isso vale `opcoesComuns` da escala */
  opcoes?: OpcaoEscala[]
  /** false = pergunta de apoio que não entra na soma (padrão: true) */
  pontua?: boolean
}

export type TomFaixa = 'ok' | 'info' | 'wait' | 'warn' | 'bad'

export interface FaixaEscala {
  de: number
  ate: number
  rotulo: string
  tom: TomFaixa
}

export interface EscalaDef {
  id: EscalaId
  sigla: string
  nome: string
  /** Pergunta ou instrução mostrada acima dos itens */
  instrucao: string
  /** O que a pontuação mede, para acompanhar o resultado ("Gravidade dos sintomas depressivos") */
  dominio: string
  itens: ItemEscala[]
  opcoesComuns?: OpcaoEscala[]
  /** 'pontos' = soma bruta; 'percentual' = % do máximo das seções respondidas (Oswestry) */
  unidade: 'pontos' | 'percentual'
  /** Máximo da escala (27, 21 ou 100) */
  maximo: number
  /** Rótulos do eixo Y do gráfico de evolução */
  eixo: number[]
  /** Quantos itens pontuáveis podem ficar em branco e ainda assim gerar resultado */
  omissoesPermitidas: number
  faixas: FaixaEscala[]
  /** Áreas (ClinicType) que oferecem a escala */
  areas: string[]
  fonte: {
    /** Instrumento original */
    original: string
    /** Versão validada em português do Brasil */
    portugues: string
    nota?: string
  }
}

const FREQUENCIA_2_SEMANAS: OpcaoEscala[] = [
  { valor: 0, rotulo: 'Nenhuma vez' },
  { valor: 1, rotulo: 'Vários dias' },
  { valor: 2, rotulo: 'Mais da metade dos dias' },
  { valor: 3, rotulo: 'Quase todos os dias' },
]

const DIFICULDADE_PHQ9: OpcaoEscala[] = [
  { valor: 0, rotulo: 'Nenhuma dificuldade' },
  { valor: 1, rotulo: 'Alguma dificuldade' },
  { valor: 2, rotulo: 'Muita dificuldade' },
  { valor: 3, rotulo: 'Extrema dificuldade' },
]

export const PHQ9: EscalaDef = {
  id: 'phq9',
  sigla: 'PHQ-9',
  nome: 'Questionário sobre a Saúde do Paciente (PHQ-9)',
  instrucao: 'Durante as últimas 2 semanas, com que frequência o(a) paciente foi incomodado(a) por qualquer um dos problemas abaixo?',
  dominio: 'Gravidade dos sintomas depressivos',
  unidade: 'pontos',
  maximo: 27,
  eixo: [0, 9, 18, 27],
  omissoesPermitidas: 0,
  areas: ['psico', 'medico', 'nutri'],
  opcoesComuns: FREQUENCIA_2_SEMANAS,
  itens: [
    { curto: 'Pouco interesse ou prazer', texto: 'Pouco interesse ou pouco prazer em fazer as coisas' },
    { curto: 'Humor deprimido', texto: 'Se sentir "para baixo", deprimido(a) ou sem perspectiva' },
    { curto: 'Alteração do sono', texto: 'Dificuldade para pegar no sono ou permanecer dormindo, ou dormir mais do que o costume' },
    { curto: 'Cansaço', texto: 'Se sentir cansado(a) ou com pouca energia' },
    { curto: 'Alteração do apetite', texto: 'Falta de apetite ou comer demais' },
    { curto: 'Sentimento de fracasso', texto: 'Se sentir mal consigo mesmo(a), ou achar que é um fracasso ou que decepcionou sua família ou a si mesmo(a)' },
    { curto: 'Dificuldade de concentração', texto: 'Dificuldade para se concentrar nas coisas, como ler o jornal ou ver televisão' },
    { curto: 'Lentidão ou agitação', texto: 'Lentidão para se movimentar ou falar, a ponto de as outras pessoas perceberem? Ou o oposto: estar tão agitado(a) ou inquieto(a) que fica andando de um lado para o outro muito mais do que de costume' },
    { curto: 'Pensamentos de se ferir ou de morte', texto: 'Pensar em se ferir de alguma maneira ou que seria melhor estar morto(a)' },
    {
      curto: 'Dificuldade no dia a dia',
      texto: 'Se o(a) paciente assinalou algum dos problemas acima, qual o grau de dificuldade que isso trouxe para trabalhar, cuidar das coisas em casa ou se relacionar com as pessoas?',
      opcoes: DIFICULDADE_PHQ9,
      pontua: false,
    },
  ],
  faixas: [
    { de: 0, ate: 4, rotulo: 'Mínima', tom: 'ok' },
    { de: 5, ate: 9, rotulo: 'Leve', tom: 'info' },
    { de: 10, ate: 14, rotulo: 'Moderada', tom: 'wait' },
    { de: 15, ate: 19, rotulo: 'Moderadamente grave', tom: 'warn' },
    { de: 20, ate: 27, rotulo: 'Grave', tom: 'bad' },
  ],
  fonte: {
    original: 'Spitzer RL, Kroenke K, Williams JBW. Validation and utility of a self-report version of PRIME-MD: the PHQ Primary Care Study. JAMA, 1999;282(18):1737-44. Kroenke K, Spitzer RL, Williams JBW. The PHQ-9. J Gen Intern Med, 2001;16(9):606-13.',
    portugues: 'Versão em português do Brasil validada por Santos IS, Tavares BF, Munhoz TN et al. Sensibilidade e especificidade do PHQ-9 entre adultos da população geral. Cad Saúde Pública, 2013;29(8):1533-43.',
    nota: 'Instrumento de rastreio e acompanhamento. Não substitui a avaliação clínica nem fecha diagnóstico.',
  },
}

export const GAD7: EscalaDef = {
  id: 'gad7',
  sigla: 'GAD-7',
  nome: 'Escala de Transtorno de Ansiedade Generalizada (GAD-7)',
  instrucao: 'Durante as últimas 2 semanas, com que frequência o(a) paciente foi incomodado(a) pelos problemas abaixo?',
  dominio: 'Gravidade dos sintomas de ansiedade',
  unidade: 'pontos',
  maximo: 21,
  eixo: [0, 7, 14, 21],
  omissoesPermitidas: 0,
  areas: ['psico', 'medico', 'nutri'],
  opcoesComuns: FREQUENCIA_2_SEMANAS,
  itens: [
    { curto: 'Nervosismo ou tensão', texto: 'Sentir-se nervoso(a), ansioso(a) ou muito tenso(a)' },
    { curto: 'Controle das preocupações', texto: 'Não ser capaz de impedir ou de controlar as preocupações' },
    { curto: 'Preocupação excessiva', texto: 'Preocupar-se muito com diversas coisas' },
    { curto: 'Dificuldade para relaxar', texto: 'Dificuldade para relaxar' },
    { curto: 'Inquietação', texto: 'Ficar tão agitado(a) que se torna difícil permanecer sentado(a)' },
    { curto: 'Irritabilidade', texto: 'Ficar facilmente aborrecido(a) ou irritado(a)' },
    { curto: 'Medo de algo ruim', texto: 'Sentir medo como se algo horrível fosse acontecer' },
  ],
  faixas: [
    { de: 0, ate: 4, rotulo: 'Mínima', tom: 'ok' },
    { de: 5, ate: 9, rotulo: 'Leve', tom: 'info' },
    { de: 10, ate: 14, rotulo: 'Moderada', tom: 'wait' },
    { de: 15, ate: 21, rotulo: 'Grave', tom: 'bad' },
  ],
  fonte: {
    original: 'Spitzer RL, Kroenke K, Williams JBW, Löwe B. A brief measure for assessing generalized anxiety disorder: the GAD-7. Arch Intern Med, 2006;166(10):1092-7.',
    portugues: 'Versão em português do Brasil: Moreno AL, DeSousa DA, Souza AMFLP et al. Factor structure, reliability, and item parameters of the Brazilian-Portuguese version of the GAD-7 questionnaire. Temas em Psicologia, 2016;24(1):367-76.',
    nota: 'Instrumento de rastreio e acompanhamento. Não substitui a avaliação clínica nem fecha diagnóstico.',
  },
}

const o = (...rotulos: string[]): OpcaoEscala[] => rotulos.map((rotulo, valor) => ({ valor, rotulo }))

export const ODI: EscalaDef = {
  id: 'odi',
  sigla: 'Oswestry',
  nome: 'Índice de Incapacidade de Oswestry (ODI 2.1a)',
  instrucao: 'Em cada seção, marque a afirmação que melhor descreve o(a) paciente hoje. Uma seção pode ficar em branco (por exemplo, vida sexual, quando não se aplica): o cálculo usa só as respondidas.',
  dominio: 'Incapacidade provocada pela dor lombar',
  unidade: 'percentual',
  maximo: 100,
  eixo: [0, 25, 50, 75, 100],
  omissoesPermitidas: 1,
  areas: ['fisio'],
  itens: [
    {
      curto: 'Intensidade da dor',
      texto: 'Seção 1: Intensidade da dor',
      opcoes: o(
        'Posso suportar a dor sem precisar usar analgésicos.',
        'A dor é forte, mas consigo me controlar sem usar analgésicos.',
        'Os analgésicos aliviam completamente a dor.',
        'Os analgésicos aliviam moderadamente a dor.',
        'Os analgésicos aliviam muito pouco a dor.',
        'Os analgésicos não têm efeito sobre a dor e não os uso.',
      ),
    },
    {
      curto: 'Cuidados pessoais',
      texto: 'Seção 2: Cuidados pessoais (lavar-se, vestir-se)',
      opcoes: o(
        'Posso cuidar de mim normalmente, sem sentir dor extra.',
        'Posso cuidar de mim normalmente, mas isso me causa dor extra.',
        'Cuidar de mim causa dor, e faço isso devagar e com cuidado.',
        'Preciso de alguma ajuda, mas consigo fazer a maior parte dos meus cuidados pessoais.',
        'Preciso de ajuda todos os dias na maior parte dos meus cuidados pessoais.',
        'Não consigo me vestir, lavo-me com dificuldade e fico na cama.',
      ),
    },
    {
      curto: 'Levantar peso',
      texto: 'Seção 3: Levantar peso',
      opcoes: o(
        'Posso levantar objetos pesados sem dor extra.',
        'Posso levantar objetos pesados, mas isso me causa dor extra.',
        'A dor me impede de levantar objetos pesados do chão, mas consigo se estiverem bem posicionados, por exemplo sobre uma mesa.',
        'A dor me impede de levantar objetos pesados, mas consigo levantar objetos leves ou médios se estiverem bem posicionados.',
        'Só consigo levantar objetos muito leves.',
        'Não consigo levantar nem carregar nada.',
      ),
    },
    {
      curto: 'Caminhar',
      texto: 'Seção 4: Caminhar',
      opcoes: o(
        'A dor não me impede de caminhar qualquer distância.',
        'A dor me impede de caminhar mais de 2 km.',
        'A dor me impede de caminhar mais de 1 km.',
        'A dor me impede de caminhar mais de 500 m.',
        'Só consigo caminhar usando bengala ou muletas.',
        'Fico na cama a maior parte do tempo e preciso me arrastar até o banheiro.',
      ),
    },
    {
      curto: 'Sentar',
      texto: 'Seção 5: Sentar',
      opcoes: o(
        'Posso sentar em qualquer cadeira pelo tempo que quiser.',
        'Só posso sentar na minha cadeira favorita pelo tempo que quiser.',
        'A dor me impede de ficar sentado(a) por mais de 1 hora.',
        'A dor me impede de ficar sentado(a) por mais de meia hora.',
        'A dor me impede de ficar sentado(a) por mais de 10 minutos.',
        'A dor me impede totalmente de ficar sentado(a).',
      ),
    },
    {
      curto: 'Ficar em pé',
      texto: 'Seção 6: Ficar em pé',
      opcoes: o(
        'Posso ficar em pé pelo tempo que quiser sem dor extra.',
        'Posso ficar em pé pelo tempo que quiser, mas isso me causa dor extra.',
        'A dor me impede de ficar em pé por mais de 1 hora.',
        'A dor me impede de ficar em pé por mais de meia hora.',
        'A dor me impede de ficar em pé por mais de 10 minutos.',
        'A dor me impede totalmente de ficar em pé.',
      ),
    },
    {
      curto: 'Dormir',
      texto: 'Seção 7: Dormir',
      opcoes: o(
        'A dor nunca perturba o meu sono.',
        'A dor perturba o meu sono de vez em quando.',
        'Por causa da dor, durmo menos de 6 horas.',
        'Por causa da dor, durmo menos de 4 horas.',
        'Por causa da dor, durmo menos de 2 horas.',
        'A dor me impede totalmente de dormir.',
      ),
    },
    {
      curto: 'Vida sexual',
      texto: 'Seção 8: Vida sexual (se aplicável)',
      opcoes: o(
        'Minha vida sexual é normal e não me causa dor extra.',
        'Minha vida sexual é normal, mas causa alguma dor extra.',
        'Minha vida sexual é quase normal, mas é muito dolorosa.',
        'Minha vida sexual é muito restringida pela dor.',
        'Minha vida sexual é quase inexistente por causa da dor.',
        'A dor impede totalmente a minha vida sexual.',
      ),
    },
    {
      curto: 'Vida social',
      texto: 'Seção 9: Vida social',
      opcoes: o(
        'Minha vida social é normal e não me causa dor extra.',
        'Minha vida social é normal, mas aumenta o grau da dor.',
        'A dor não tem efeito significativo na minha vida social, exceto por limitar atividades que exigem mais esforço, como dançar.',
        'A dor restringiu a minha vida social e não saio com tanta frequência.',
        'A dor restringiu a minha vida social à minha casa.',
        'Não tenho vida social por causa da dor.',
      ),
    },
    {
      curto: 'Locomoção e viagens',
      texto: 'Seção 10: Locomoção e viagens',
      opcoes: o(
        'Posso viajar para qualquer lugar sem dor.',
        'Posso viajar para qualquer lugar, mas isso me causa dor extra.',
        'A dor é forte, mas consigo fazer viagens de mais de 2 horas.',
        'A dor me limita a viagens de menos de 1 hora.',
        'A dor me limita a pequenos deslocamentos necessários, de menos de 30 minutos.',
        'A dor me impede de viajar, exceto para receber tratamento.',
      ),
    },
  ],
  faixas: [
    { de: 0, ate: 20, rotulo: 'Incapacidade mínima', tom: 'ok' },
    { de: 21, ate: 40, rotulo: 'Incapacidade moderada', tom: 'info' },
    { de: 41, ate: 60, rotulo: 'Incapacidade intensa', tom: 'wait' },
    { de: 61, ate: 80, rotulo: 'Incapacidade grave', tom: 'warn' },
    { de: 81, ate: 100, rotulo: 'Restrito ao leito ou exagero dos sintomas', tom: 'bad' },
  ],
  fonte: {
    original: 'Fairbank JCT, Pynsent PB. The Oswestry Disability Index. Spine, 2000;25(22):2940-52.',
    portugues: 'Versão em português do Brasil: Vigatto R, Alexandre NMC, Correa Filho HR. Development of a Brazilian Portuguese version of the Oswestry Disability Index. Spine, 2007;32(4):481-6.',
    nota: 'Resultado em % de incapacidade (soma das seções respondidas dividida pelo máximo possível). Avalia dor lombar; não substitui o exame físico.',
  },
}

export const ESCALAS: Record<EscalaId, EscalaDef> = { phq9: PHQ9, gad7: GAD7, odi: ODI }

/** Ordem em que as escalas aparecem na tela. */
export const ESCALA_ORDEM: EscalaId[] = ['phq9', 'gad7', 'odi']

export function isEscalaId(v: unknown): v is EscalaId {
  return v === 'phq9' || v === 'gad7' || v === 'odi'
}

/** Escalas oferecidas para as áreas informadas (união, na ordem fixa), sem repetição. */
export function escalasParaAreas(areas: readonly string[]): EscalaDef[] {
  return ESCALA_ORDEM.map(id => ESCALAS[id]).filter(def => def.areas.some(a => areas.includes(a)))
}

/** Uma resposta por item (mesma ordem de `def.itens`); null = em branco. */
export type Respostas = (number | null)[]

export function respostasVazias(def: EscalaDef): Respostas {
  return def.itens.map(() => null)
}

export function opcoesDoItem(def: EscalaDef, indice: number): OpcaoEscala[] {
  return def.itens[indice]?.opcoes ?? def.opcoesComuns ?? []
}

/** O valor existe entre as opções do item (protege contra dado salvo corrompido ou de outra versão). */
export function respostaValida(def: EscalaDef, indice: number, valor: unknown): valor is number {
  return typeof valor === 'number' && opcoesDoItem(def, indice).some(op => op.valor === valor)
}

/** Alinha as respostas ao tamanho da escala e zera o que não for uma opção válida. */
export function normalizarRespostas(def: EscalaDef, raw: readonly unknown[]): Respostas {
  return def.itens.map((_, i) => (respostaValida(def, i, raw[i]) ? (raw[i] as number) : null))
}

export interface ResultadoEscala {
  /** Itens pontuáveis respondidos */
  respondidos: number
  /** Itens pontuáveis da escala */
  total: number
  /** Dá para calcular o resultado e salvar */
  completo: boolean
  /** Soma bruta dos itens respondidos */
  soma: number
  /** Soma máxima possível entre os itens respondidos */
  somaMaxima: number
  /** Pontos (PHQ-9, GAD-7) ou % de incapacidade arredondada (Oswestry); null enquanto incompleto */
  valor: number | null
  faixa: FaixaEscala | null
  /** PHQ-9 item 9 positivo (qualquer resposta acima de "Nenhuma vez"): atenção clínica imediata */
  alertaRisco: boolean
}

export function faixaDe(def: EscalaDef, valor: number): FaixaEscala | null {
  return def.faixas.find(f => valor >= f.de && valor <= f.ate) ?? null
}

/** Índice do item de ideação suicida no PHQ-9 (item 9). */
export const PHQ9_ITEM_RISCO = 8

export function pontuar(def: EscalaDef, respostas: Respostas): ResultadoEscala {
  let respondidos = 0
  let total = 0
  let soma = 0
  let somaMaxima = 0
  def.itens.forEach((item, i) => {
    if (item.pontua === false) return
    total++
    const v = respostas[i]
    if (!respostaValida(def, i, v)) return
    respondidos++
    soma += v
    somaMaxima += Math.max(...opcoesDoItem(def, i).map(op => op.valor))
  })

  const completo = respondidos > 0 && total - respondidos <= def.omissoesPermitidas
  let valor: number | null = null
  if (completo) valor = def.unidade === 'percentual' ? Math.round((soma / somaMaxima) * 100) : soma

  const risco = def.id === 'phq9' ? respostas[PHQ9_ITEM_RISCO] : null
  return {
    respondidos,
    total,
    completo,
    soma,
    somaMaxima,
    valor,
    faixa: valor === null ? null : faixaDe(def, valor),
    alertaRisco: typeof risco === 'number' && risco > 0,
  }
}

/** Texto do valor: "12 pontos" ou "34%". */
export function formatarValor(def: EscalaDef, valor: number): string {
  return def.unidade === 'percentual' ? `${valor}%` : `${valor} ${valor === 1 ? 'ponto' : 'pontos'}`
}
