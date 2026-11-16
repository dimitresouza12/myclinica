/**
 * Escalas clínicas com pontuação automática: PHQ-9 e GAD-7 (psicologia, medicina e nutrição),
 * Oswestry, Roland-Morris e Berg (fisioterapia) e Índice de Barthel (terapia ocupacional e fisioterapia).
 * Psicologia também tem WHO-5 e DASS-21; terapia ocupacional tem a Escala de Lawton (AIVD) e dois checklists próprios
 * (observação sensorial e rotina/desempenho ocupacional). As fichas estruturadas de fonoaudiologia (audiograma, voz,
 * fluência, motricidade orofacial) não são escalas de soma: ficam em ./protocolos.ts e entram na mesma lista (`escalasParaAreas`).
 * Só definição e conta; a tela está em src/components/prontuario/escalas e o formato do registro em ./registro.ts.
 *
 * Instrumentos de rastreio e acompanhamento: a pontuação orienta, não fecha diagnóstico.
 * O Inventário de Depressão de Beck (BDI), a COPM, o Perfil Sensorial (Dunn) e o MoCA não entram: são instrumentos licenciados.
 * Também ficaram de fora, por dúvida sobre a licença de uso em software comercial: ISI (Mapi Research Trust), EPDS (Royal College
 * of Psychiatrists), AUDIT e SRQ-20 (a OMS libera para uso não comercial; sem confirmação para um sistema pago).
 */

import { protocolosParaAreas, type AvaliacaoDef } from './protocolos'

export type EscalaId = 'phq9' | 'gad7' | 'who5' | 'dass21' | 'odi' | 'roland' | 'berg' | 'barthel' | 'lawton' | 'sensorial' | 'rotina'

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
  /** Como o profissional conduz o item (Berg: o que pedir ao paciente); aparece em letra menor abaixo do enunciado */
  orientacao?: string
}

export type TomFaixa = 'ok' | 'info' | 'wait' | 'warn' | 'bad'

export interface FaixaEscala {
  de: number
  ate: number
  rotulo: string
  tom: TomFaixa
}

/**
 * Parte de uma escala que tem pontuação própria (DASS-21: depressão, ansiedade e estresse; checklists por área).
 * Não há total geral: cada subescala tem a sua soma, o seu máximo e as suas faixas.
 */
export interface SubescalaDef {
  id: string
  nome: string
  /** Posições, em `itens`, que entram nesta subescala */
  itens: number[]
  /** DASS-21: a soma dos 7 itens é dobrada para ficar na régua da DASS-42 */
  multiplicador?: number
  maximo: number
  eixo: number[]
  faixas: FaixaEscala[]
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
  /** Máximo da escala (27, 21, 100, 24, 56...), já com o multiplicador */
  maximo: number
  /** WHO-5: a soma bruta (0 a 25) vira índice de 0 a 100 multiplicando por 4 */
  multiplicador?: number
  /** Escalas sem total geral (DASS-21, checklists): o resultado sai por subescala e `valor` fica nulo */
  subescalas?: SubescalaDef[]
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

/** Escala com valores explícitos por opção (Barthel: 0, 5, 10, 15 conforme o item). */
const ov = (...pares: [number, string][]): OpcaoEscala[] => pares.map(([valor, rotulo]) => ({ valor, rotulo }))

const SIM_NAO: OpcaoEscala[] = [
  { valor: 0, rotulo: 'Não' },
  { valor: 1, rotulo: 'Sim' },
]

/**
 * Roland-Morris (24 itens, sim/não, 0 a 24).
 * ATENÇÃO: o texto das frases abaixo é uma redação própria, fiel ao sentido de cada item do original, e NÃO a
 * transcrição literal da versão brasileira (Nusbaum et al., 2001). Conferir com a versão oficial antes de
 * tratar como instrumento validado.
 * Interpretação: o instrumento não tem faixas oficiais. Só 0 e o ponto de corte de 14 pontos (uso comum na
 * literatura para incapacidade importante) são tratados como limites; a faixa 1 a 13 é descritiva.
 */
export const ROLAND: EscalaDef = {
  id: 'roland',
  sigla: 'Roland-Morris',
  nome: 'Questionário de Incapacidade de Roland-Morris',
  instrucao: 'Leia cada frase com o(a) paciente e marque "Sim" quando ela descrever como ele(a) está hoje por causa da dor nas costas. Marque "Não" quando não descrever. Cada "Sim" vale 1 ponto.',
  dominio: 'Incapacidade funcional por dor lombar',
  unidade: 'pontos',
  maximo: 24,
  eixo: [0, 6, 12, 18, 24],
  omissoesPermitidas: 0,
  areas: ['fisio'],
  opcoesComuns: SIM_NAO,
  itens: [
    { curto: 'Fica em casa', texto: 'Fico em casa a maior parte do tempo por causa das costas.' },
    { curto: 'Muda de posição', texto: 'Mudo de posição com frequência para tentar deixar as costas confortáveis.' },
    { curto: 'Anda mais devagar', texto: 'Ando mais devagar do que de costume por causa das costas.' },
    { curto: 'Não faz tarefas de casa', texto: 'Por causa das costas, não faço nenhum dos trabalhos que costumo fazer em casa.' },
    { curto: 'Usa corrimão', texto: 'Por causa das costas, uso o corrimão para subir escadas.' },
    { curto: 'Deita para descansar', texto: 'Por causa das costas, deito para descansar com mais frequência.' },
    { curto: 'Apoia-se para sair da poltrona', texto: 'Por causa das costas, preciso me apoiar em alguma coisa para levantar de uma poltrona.' },
    { curto: 'Pede ajuda aos outros', texto: 'Por causa das costas, tento fazer com que outras pessoas façam as coisas por mim.' },
    { curto: 'Veste-se mais devagar', texto: 'Visto-me mais devagar do que de costume por causa das costas.' },
    { curto: 'Fica pouco tempo em pé', texto: 'Fico em pé só por curtos períodos por causa das costas.' },
    { curto: 'Evita abaixar ou ajoelhar', texto: 'Por causa das costas, evito me abaixar ou me ajoelhar.' },
    { curto: 'Dificuldade para levantar da cadeira', texto: 'Tenho dificuldade para me levantar de uma cadeira por causa das costas.' },
    { curto: 'Dor quase o tempo todo', texto: 'Sinto dor nas costas quase o tempo todo.' },
    { curto: 'Dificuldade para virar na cama', texto: 'Tenho dificuldade para me virar na cama por causa das costas.' },
    { curto: 'Apetite reduzido', texto: 'Meu apetite não está bom por causa da dor nas costas.' },
    { curto: 'Dificuldade para calçar meias', texto: 'Tenho dificuldade para calçar meias por causa da dor nas costas.' },
    { curto: 'Anda só curtas distâncias', texto: 'Só ando curtas distâncias por causa da dor nas costas.' },
    { curto: 'Sono pior', texto: 'Durmo pior por causa das costas.' },
    { curto: 'Precisa de ajuda para vestir-se', texto: 'Por causa da dor nas costas, preciso de ajuda de outra pessoa para me vestir.' },
    { curto: 'Fica sentado(a) o dia todo', texto: 'Fico sentado(a) a maior parte do dia por causa das costas.' },
    { curto: 'Evita trabalhos pesados', texto: 'Evito trabalhos pesados em casa por causa das costas.' },
    { curto: 'Mais irritado(a)', texto: 'Por causa da dor nas costas, fico mais irritado(a) e de mau humor com as pessoas do que de costume.' },
    { curto: 'Sobe escadas mais devagar', texto: 'Subo escadas mais devagar do que de costume por causa das costas.' },
    { curto: 'Fica na cama', texto: 'Fico na cama a maior parte do tempo por causa das costas.' },
  ],
  faixas: [
    { de: 0, ate: 0, rotulo: 'Sem incapacidade', tom: 'ok' },
    { de: 1, ate: 13, rotulo: 'Incapacidade leve a moderada', tom: 'info' },
    { de: 14, ate: 24, rotulo: 'Incapacidade importante', tom: 'warn' },
  ],
  fonte: {
    original: 'Roland M, Morris R. A study of the natural history of back pain. Part I: development of a reliable and sensitive measure of disability in low-back pain. Spine, 1983;8(2):141-4.',
    portugues: 'Versão em português do Brasil: Nusbaum L, Natour J, Ferraz MB, Goldenberg J. Translation, adaptation and validation of the Roland-Morris questionnaire - Brazil Roland-Morris. Braz J Med Biol Res, 2001;34(2):203-10.',
    nota: 'Pontuação de 0 a 24 (um ponto por "Sim"). O instrumento não define faixas oficiais: 14 pontos ou mais é o corte usual para incapacidade importante, e uma melhora de cerca de 30% costuma ser tomada como relevante. Avalia dor lombar; não substitui o exame físico.',
  },
}

/** Opções 0 a 4 de um item de Berg, da pior para a melhor execução. Descrições em redação própria (ver ressalva em BERG). */
const berg = (...rotulos: string[]) => o(...rotulos)

/**
 * Escala de Equilíbrio de Berg (14 itens, 0 a 4, total 0 a 56).
 * ATENÇÃO: os enunciados, as orientações e os critérios de cada nota são uma redação própria em português, fiel ao
 * sentido do instrumento original, e NÃO a transcrição literal da versão brasileira (Miyamoto et al., 2004).
 * Conferir com a versão oficial antes de tratar como instrumento validado. Cada item vai de 0 (não executa ou
 * precisa de ajuda) a 4 (executa com segurança e dentro do critério de tempo ou distância).
 * Risco de queda: 41 a 56 baixo, 21 a 40 médio, 0 a 20 alto.
 */
export const BERG: EscalaDef = {
  id: 'berg',
  sigla: 'Berg',
  nome: 'Escala de Equilíbrio de Berg',
  instrucao: 'Observe o(a) paciente em cada tarefa e marque a nota (0 a 4) que descreve o melhor desempenho dele(a). Em caso de dúvida entre duas notas, marque a menor. Use cadeira com apoio de braços e degrau ou banquinho firmes.',
  dominio: 'Equilíbrio funcional',
  unidade: 'pontos',
  maximo: 56,
  eixo: [0, 14, 28, 42, 56],
  omissoesPermitidas: 0,
  areas: ['fisio'],
  itens: [
    {
      curto: 'Sentado para em pé',
      texto: 'Passar de sentado para em pé',
      orientacao: 'Peça que se levante, sem usar as mãos para se apoiar, se puder.',
      opcoes: berg(
        'Precisa de ajuda moderada ou máxima para levantar.',
        'Precisa de ajuda mínima para levantar ou se estabilizar.',
        'Consegue levantar usando as mãos, depois de várias tentativas.',
        'Consegue levantar sozinho(a), usando as mãos.',
        'Consegue levantar sem usar as mãos e se estabiliza sozinho(a).',
      ),
    },
    {
      curto: 'Em pé sem apoio',
      texto: 'Ficar em pé sem apoio',
      orientacao: 'Peça que fique em pé por 2 minutos, sem se segurar em nada.',
      opcoes: berg(
        'Não consegue ficar em pé por 30 segundos sem ajuda.',
        'Precisa de várias tentativas para ficar 30 segundos sem apoio.',
        'Consegue ficar 30 segundos sem apoio.',
        'Consegue ficar 2 minutos com supervisão.',
        'Consegue ficar 2 minutos com segurança.',
      ),
    },
    {
      curto: 'Sentado sem apoio',
      texto: 'Ficar sentado sem apoio nas costas, com os pés apoiados no chão ou em um banquinho',
      orientacao: 'Peça que fique sentado com os braços cruzados por 2 minutos.',
      opcoes: berg(
        'Não consegue ficar sentado 10 segundos sem apoio.',
        'Consegue ficar sentado 10 segundos.',
        'Consegue ficar sentado 30 segundos.',
        'Consegue ficar sentado 2 minutos com supervisão.',
        'Consegue ficar sentado 2 minutos com segurança.',
      ),
    },
    {
      curto: 'Em pé para sentado',
      texto: 'Passar de em pé para sentado',
      orientacao: 'Peça que se sente.',
      opcoes: berg(
        'Precisa de ajuda para sentar.',
        'Senta sozinho(a), mas sem controlar a descida.',
        'Usa a parte de trás das pernas contra a cadeira para controlar a descida.',
        'Controla a descida usando as mãos.',
        'Senta com segurança, usando pouco as mãos.',
      ),
    },
    {
      curto: 'Transferências',
      texto: 'Transferir-se entre duas cadeiras (ou da cadeira para a cama)',
      orientacao: 'Disponha as cadeiras para uma transferência com giro. Peça uma transferência para um lado com apoio de braços e outra para o lado sem apoio.',
      opcoes: berg(
        'Precisa de duas pessoas para ajudar ou supervisionar com segurança.',
        'Precisa de uma pessoa para ajudar.',
        'Consegue com orientação verbal ou supervisão.',
        'Consegue com segurança, mas depende claramente das mãos.',
        'Consegue com segurança, usando pouco as mãos.',
      ),
    },
    {
      curto: 'Em pé, olhos fechados',
      texto: 'Ficar em pé sem apoio com os olhos fechados',
      orientacao: 'Peça que feche os olhos e fique parado(a) por 10 segundos.',
      opcoes: berg(
        'Precisa de ajuda para não cair.',
        'Não mantém os olhos fechados por 3 segundos, mas permanece estável.',
        'Consegue ficar 3 segundos.',
        'Consegue ficar 10 segundos com supervisão.',
        'Consegue ficar 10 segundos com segurança.',
      ),
    },
    {
      curto: 'Em pé, pés juntos',
      texto: 'Ficar em pé sem apoio com os pés juntos',
      orientacao: 'Peça que junte os pés e fique em pé, sem se segurar.',
      opcoes: berg(
        'Precisa de ajuda para juntar os pés e não consegue manter 15 segundos.',
        'Precisa de ajuda para juntar os pés, mas mantém 15 segundos.',
        'Junta os pés sozinho(a), mas não consegue manter 30 segundos.',
        'Junta os pés sozinho(a) e mantém 1 minuto com supervisão.',
        'Junta os pés sozinho(a) e mantém 1 minuto com segurança.',
      ),
    },
    {
      curto: 'Alcance à frente',
      texto: 'Alcançar à frente com o braço estendido, em pé',
      orientacao: 'Peça que levante o braço a 90 graus, estenda os dedos e alcance o mais longe que puder à frente. Meça com uma fita ou régua na ponta dos dedos, sem deixar que o(a) paciente toque nela.',
      opcoes: berg(
        'Perde o equilíbrio ao tentar ou precisa de apoio externo.',
        'Alcança à frente, mas precisa de supervisão.',
        'Alcança mais de 5 cm.',
        'Alcança com segurança mais de 12 cm.',
        'Alcança com confiança mais de 25 cm.',
      ),
    },
    {
      curto: 'Pegar objeto do chão',
      texto: 'Pegar um objeto do chão, em pé',
      orientacao: 'Peça que pegue um chinelo ou sapato colocado à frente dos pés.',
      opcoes: berg(
        'Não consegue tentar ou precisa de ajuda para não perder o equilíbrio ou cair.',
        'Não consegue pegar e precisa de supervisão durante a tentativa.',
        'Não consegue pegar, mas chega a 2 a 5 cm do objeto e mantém o equilíbrio sozinho(a).',
        'Pega o objeto, mas precisa de supervisão.',
        'Pega o objeto com segurança e facilidade.',
      ),
    },
    {
      curto: 'Olhar para trás',
      texto: 'Virar-se para olhar para trás por cima dos ombros esquerdo e direito, em pé',
      orientacao: 'Peça que gire o tronco e olhe diretamente para trás por cima do ombro esquerdo e depois do direito.',
      opcoes: berg(
        'Precisa de ajuda para não perder o equilíbrio ou cair.',
        'Precisa de supervisão ao virar.',
        'Vira só de lado, mas mantém o equilíbrio.',
        'Olha para trás só de um lado; do outro há menor deslocamento do peso.',
        'Olha para trás pelos dois lados, com bom deslocamento do peso.',
      ),
    },
    {
      curto: 'Giro de 360 graus',
      texto: 'Girar 360 graus',
      orientacao: 'Peça que dê uma volta completa, faça uma pausa e dê outra volta completa para o lado contrário.',
      opcoes: berg(
        'Precisa de ajuda enquanto gira.',
        'Precisa de supervisão próxima ou orientação verbal.',
        'Gira com segurança, mas devagar.',
        'Gira com segurança para um lado só, em 4 segundos ou menos.',
        'Gira com segurança para os dois lados, em 4 segundos ou menos cada.',
      ),
    },
    {
      curto: 'Alternar pés no degrau',
      texto: 'Colocar os pés alternadamente em um degrau ou banquinho, em pé e sem apoio',
      orientacao: 'Peça que toque cada pé no degrau, alternando, até completar 4 toques com cada pé (8 no total).',
      opcoes: berg(
        'Precisa de ajuda para não cair ou não consegue tentar.',
        'Completa mais de 2 toques e precisa de ajuda mínima.',
        'Completa 4 toques sem ajuda, mas com supervisão.',
        'Completa os 8 toques sozinho(a), mas em mais de 20 segundos.',
        'Fica em pé com segurança e completa os 8 toques em até 20 segundos.',
      ),
    },
    {
      curto: 'Um pé à frente',
      texto: 'Ficar em pé sem apoio com um pé à frente do outro',
      orientacao: 'Peça que coloque um pé diretamente à frente do outro. Se não conseguir, que dê um passo longo o bastante para o calcanhar do pé da frente ficar à frente dos dedos do outro pé.',
      opcoes: berg(
        'Perde o equilíbrio ao dar o passo ou ao ficar em pé.',
        'Precisa de ajuda para dar o passo, mas mantém 15 segundos.',
        'Dá um pequeno passo sozinho(a) e mantém 30 segundos.',
        'Coloca um pé à frente do outro (sem alinhar) sozinho(a) e mantém 30 segundos.',
        'Coloca um pé diretamente à frente do outro, alinhados, sozinho(a) e mantém 30 segundos.',
      ),
    },
    {
      curto: 'Em pé sobre uma perna',
      texto: 'Ficar em pé sobre uma perna só',
      orientacao: 'Peça que fique em uma perna o máximo que conseguir, sem se segurar.',
      opcoes: berg(
        'Não consegue tentar ou precisa de ajuda para não cair.',
        'Tenta levantar a perna e não mantém 3 segundos, mas permanece em pé sozinho(a).',
        'Levanta a perna sozinho(a) e mantém 3 segundos ou mais.',
        'Levanta a perna sozinho(a) e mantém de 5 a 10 segundos.',
        'Levanta a perna sozinho(a) e mantém mais de 10 segundos.',
      ),
    },
  ],
  faixas: [
    { de: 0, ate: 20, rotulo: 'Alto risco de queda', tom: 'bad' },
    { de: 21, ate: 40, rotulo: 'Médio risco de queda', tom: 'wait' },
    { de: 41, ate: 56, rotulo: 'Baixo risco de queda', tom: 'ok' },
  ],
  fonte: {
    original: 'Berg K, Wood-Dauphinee S, Williams JI, Maki B. Measuring balance in the elderly: validation of an instrument. Can J Public Health, 1992;83(Suppl 2):S7-11.',
    portugues: 'Versão em português do Brasil: Miyamoto ST, Lombardi Junior I, Berg KO, Ramos LR, Natour J. Brazilian version of the Berg balance scale. Braz J Med Biol Res, 2004;37(9):1411-21.',
    nota: 'Os 14 itens somam de 0 a 56. Classificação de risco de queda usada aqui: 41 a 56 baixo, 21 a 40 médio, 0 a 20 alto. Alguns estudos adotam outros pontos de corte (por exemplo 45) conforme a população. Não substitui a avaliação funcional completa.',
  },
}

/**
 * Índice de Barthel (10 atividades de vida diária, 0 a 100 em passos de 5).
 * ATENÇÃO: os enunciados e os critérios de cada nível são uma redação própria, fiel ao sentido do índice original
 * (Mahoney e Barthel, 1965), e NÃO a transcrição literal da versão brasileira (Minosso et al., 2010). Conferir com
 * a versão oficial antes de tratar como instrumento validado.
 * Os pontos de cada nível seguem o índice original (0/5, 0/5/10 ou 0/5/10/15 conforme a atividade).
 */
export const BARTHEL: EscalaDef = {
  id: 'barthel',
  sigla: 'Barthel',
  nome: 'Índice de Barthel',
  instrucao: 'Em cada atividade, marque o nível que descreve o que o(a) paciente realmente faz (não o que poderia fazer). Considere o desempenho habitual nas últimas 24 a 48 horas.',
  dominio: 'Independência nas atividades de vida diária',
  unidade: 'pontos',
  maximo: 100,
  eixo: [0, 25, 50, 75, 100],
  omissoesPermitidas: 0,
  areas: ['to', 'fisio'],
  itens: [
    {
      curto: 'Alimentação',
      texto: 'Alimentação',
      opcoes: ov(
        [0, 'Dependente: precisa ser alimentado(a) por outra pessoa.'],
        [5, 'Precisa de ajuda, por exemplo para cortar os alimentos ou passar manteiga.'],
        [10, 'Independente: come sozinho(a) em tempo razoável.'],
      ),
    },
    {
      curto: 'Banho',
      texto: 'Banho',
      opcoes: ov(
        [0, 'Dependente: precisa de ajuda para se banhar.'],
        [5, 'Independente: toma banho sozinho(a), inclusive entrar e sair do chuveiro.'],
      ),
    },
    {
      curto: 'Higiene pessoal',
      texto: 'Higiene pessoal (rosto, cabelo, dentes, barba)',
      opcoes: ov(
        [0, 'Precisa de ajuda com a higiene pessoal.'],
        [5, 'Independente: faz sozinho(a) o rosto, o cabelo, os dentes e a barba.'],
      ),
    },
    {
      curto: 'Uso do vaso sanitário',
      texto: 'Uso do vaso sanitário',
      opcoes: ov(
        [0, 'Dependente: precisa de ajuda total.'],
        [5, 'Precisa de alguma ajuda, por exemplo com o equilíbrio, a roupa ou o papel higiênico.'],
        [10, 'Independente: usa o vaso, cuida da roupa e se limpa sozinho(a).'],
      ),
    },
    {
      curto: 'Subir escadas',
      texto: 'Subir escadas',
      opcoes: ov(
        [0, 'Incapaz de subir escadas.'],
        [5, 'Precisa de ajuda física, orientação verbal ou auxílio de marcha.'],
        [10, 'Independente: sobe e desce um lance de escada com segurança.'],
      ),
    },
    {
      curto: 'Vestir-se',
      texto: 'Vestir-se',
      opcoes: ov(
        [0, 'Dependente: precisa de ajuda para quase tudo.'],
        [5, 'Precisa de ajuda, mas faz pelo menos metade sozinho(a), em tempo razoável.'],
        [10, 'Independente: veste-se e despe-se, inclusive botões, zíperes e sapatos.'],
      ),
    },
    {
      curto: 'Controle intestinal',
      texto: 'Controle intestinal',
      opcoes: ov(
        [0, 'Incontinente (ou precisa de enema ou ajuda para evacuar).'],
        [5, 'Acidente ocasional (no máximo uma vez por semana).'],
        [10, 'Continente.'],
      ),
    },
    {
      curto: 'Controle vesical',
      texto: 'Controle vesical',
      opcoes: ov(
        [0, 'Incontinente ou usa sonda e não consegue manejá-la sozinho(a).'],
        [5, 'Acidente ocasional (no máximo uma vez a cada 24 horas).'],
        [10, 'Continente (ou maneja a própria sonda ou coletor com independência).'],
      ),
    },
    {
      curto: 'Deambulação',
      texto: 'Deambulação em superfície plana',
      opcoes: ov(
        [0, 'Não anda ou anda menos de 50 metros.'],
        [5, 'Independente em cadeira de rodas por mais de 50 metros, inclusive em curvas.'],
        [10, 'Anda mais de 50 metros com ajuda de uma pessoa (verbal ou física).'],
        [15, 'Independente: anda mais de 50 metros, podendo usar bengala ou muleta.'],
      ),
    },
    {
      curto: 'Transferência cadeira-cama',
      texto: 'Transferência da cadeira para a cama e de volta',
      opcoes: ov(
        [0, 'Incapaz: não tem equilíbrio para ficar sentado(a).'],
        [5, 'Precisa de muita ajuda (uma ou duas pessoas, ajuda física), mas consegue ficar sentado(a).'],
        [10, 'Precisa de pouca ajuda (orientação verbal ou apoio físico leve).'],
        [15, 'Independente.'],
      ),
    },
  ],
  faixas: [
    { de: 0, ate: 20, rotulo: 'Dependência total', tom: 'bad' },
    { de: 21, ate: 60, rotulo: 'Dependência grave', tom: 'warn' },
    { de: 61, ate: 90, rotulo: 'Dependência moderada', tom: 'wait' },
    { de: 91, ate: 99, rotulo: 'Dependência leve', tom: 'info' },
    { de: 100, ate: 100, rotulo: 'Independente', tom: 'ok' },
  ],
  fonte: {
    original: 'Mahoney FI, Barthel DW. Functional evaluation: the Barthel Index. Md State Med J, 1965;14:61-5.',
    portugues: 'Versão em português do Brasil: Minosso JSM, Amendola F, Alvarenga MRM, Oliveira MAC. Validação, no Brasil, do Índice de Barthel em idosos atendidos em ambulatórios. Acta Paul Enferm, 2010;23(2):218-23.',
    nota: 'Soma dos 10 itens (0 a 100). Faixas: 0 a 20 total, 21 a 60 grave, 61 a 90 moderada, 91 a 99 leve, 100 independente; a literatura traz outras estratificações. Pontuação 100 não significa que o(a) paciente viva sem ajuda, só que é independente nessas atividades.',
  },
}

/**
 * WHO-5, Índice de Bem-Estar da OMS (5 itens, últimas 2 semanas).
 * Fonte: Organização Mundial da Saúde, Escritório Regional para a Europa (1998), projeto DEPCARE. Uso gratuito e sem pedido de
 * permissão (confirmado na ficha do CORC, que remete ao site do WHO-5; conferir a nota do titular antes de uso comercial amplo).
 * Os enunciados e as opções abaixo são redação própria, fiel ao sentido dos 5 itens originais, e não a tradução oficial.
 * Pontuação: soma de 0 a 25 vezes 4 = 0 a 100 (quanto MAIOR, melhor o bem-estar). Pontos de corte da literatura: 50 ou menos
 * sugere bem-estar baixo e vale rastrear depressão; 28 ou menos é o ponto mais restrito, próximo do que se vê em depressão maior.
 */
const FREQUENCIA_WHO5: OpcaoEscala[] = [
  { valor: 5, rotulo: 'Todo o tempo' },
  { valor: 4, rotulo: 'A maior parte do tempo' },
  { valor: 3, rotulo: 'Mais da metade do tempo' },
  { valor: 2, rotulo: 'Menos da metade do tempo' },
  { valor: 1, rotulo: 'Algumas vezes' },
  { valor: 0, rotulo: 'Em nenhum momento' },
]

export const WHO5: EscalaDef = {
  id: 'who5',
  sigla: 'WHO-5',
  nome: 'Índice de Bem-Estar da OMS (WHO-5)',
  instrucao: 'Marque, para cada frase, o que mais se aproxima de como o(a) paciente se sentiu nas últimas 2 semanas. Aqui, quanto maior a pontuação, melhor o bem-estar.',
  dominio: 'Bem-estar emocional nas últimas 2 semanas',
  unidade: 'pontos',
  maximo: 100,
  multiplicador: 4,
  eixo: [0, 25, 50, 75, 100],
  omissoesPermitidas: 0,
  areas: ['psico'],
  opcoesComuns: FREQUENCIA_WHO5,
  itens: [
    { curto: 'Alegria e bom humor', texto: 'Sentiu-se alegre e de bom humor' },
    { curto: 'Calma e tranquilidade', texto: 'Sentiu-se calmo(a) e tranquilo(a)' },
    { curto: 'Disposição', texto: 'Sentiu-se ativo(a) e com disposição' },
    { curto: 'Acordar descansado', texto: 'Acordou sentindo-se descansado(a) e renovado(a)' },
    { curto: 'Dia a dia com interesse', texto: 'Teve um dia a dia com coisas que lhe interessam' },
  ],
  faixas: [
    { de: 0, ate: 28, rotulo: 'Bem-estar muito baixo', tom: 'bad' },
    { de: 29, ate: 50, rotulo: 'Bem-estar baixo', tom: 'wait' },
    { de: 51, ate: 100, rotulo: 'Bem-estar adequado', tom: 'ok' },
  ],
  fonte: {
    original: 'World Health Organization, Regional Office for Europe. Well-Being Measures in Primary Health Care: the DepCare Project. Copenhague, 1998. Revisão: Topp CW, Østergaard SD, Søndergaard S, Bech P. The WHO-5 Well-Being Index: a systematic review of the literature. Psychother Psychosom, 2015;84(3):167-76.',
    portugues: 'Há versão em português do WHO-5; os enunciados desta tela são redação própria em português do Brasil, fiel ao sentido dos 5 itens, e não a tradução oficial.',
    nota: 'A soma de 0 a 25 é multiplicada por 4 (0 a 100). Índice de 50 ou menos sugere bem-estar baixo e indica investigar depressão; 28 ou menos é o ponto de corte mais restrito. É uma medida de bem-estar, não de ansiedade ou de outros quadros. Rastreio: não substitui a avaliação clínica nem fecha diagnóstico.',
  },
}

/**
 * DASS-21, Escalas de Depressão, Ansiedade e Estresse (versão curta, 21 itens, última semana).
 * Fonte: Lovibond SH, Lovibond PF. Manual for the Depression Anxiety Stress Scales, 2ª ed. Sydney: Psychology Foundation, 1995.
 * O questionário é de domínio público (declarado no site oficial da DASS, UNSW). Itens e opções abaixo em redação própria.
 * Pontuação: cada subescala soma 7 itens (0 a 3) e o resultado é DOBRADO (0 a 42) para usar as faixas do manual.
 * Depressão: itens 3, 5, 10, 13, 16, 17, 21. Ansiedade: 2, 4, 7, 9, 15, 19, 20. Estresse: 1, 6, 8, 11, 12, 14, 18.
 * As faixas descrevem gravidade relativa dos sintomas, não são pontos de corte diagnósticos.
 */
const DASS_OPCOES: OpcaoEscala[] = [
  { valor: 0, rotulo: 'Não se aplicou' },
  { valor: 1, rotulo: 'Aplicou-se em parte' },
  { valor: 2, rotulo: 'Aplicou-se bastante' },
  { valor: 3, rotulo: 'Aplicou-se muito' },
]

const faixasDass = (a: number, b: number, c: number, d: number): FaixaEscala[] => [
  { de: 0, ate: a, rotulo: 'Normal', tom: 'ok' },
  { de: a + 1, ate: b, rotulo: 'Leve', tom: 'info' },
  { de: b + 1, ate: c, rotulo: 'Moderado', tom: 'wait' },
  { de: c + 1, ate: d, rotulo: 'Grave', tom: 'warn' },
  { de: d + 1, ate: 42, rotulo: 'Extremamente grave', tom: 'bad' },
]

export const DASS21: EscalaDef = {
  id: 'dass21',
  sigla: 'DASS-21',
  nome: 'Escalas de Depressão, Ansiedade e Estresse (DASS-21)',
  instrucao: 'Pense na última semana. Para cada frase, marque o quanto ela se aplicou ao(à) paciente.',
  dominio: 'Sintomas de depressão, ansiedade e estresse na última semana',
  unidade: 'pontos',
  maximo: 63,
  eixo: [0, 14, 28, 42],
  omissoesPermitidas: 0,
  areas: ['psico'],
  opcoesComuns: DASS_OPCOES,
  itens: [
    { curto: 'Dificuldade de desacelerar', texto: 'Achou difícil se acalmar depois de ficar agitado(a)' },
    { curto: 'Boca seca', texto: 'Percebeu a boca seca' },
    { curto: 'Sem sentimentos positivos', texto: 'Não conseguiu sentir nenhum sentimento positivo' },
    { curto: 'Falta de ar', texto: 'Sentiu dificuldade para respirar sem ter feito esforço físico' },
    { curto: 'Falta de iniciativa', texto: 'Teve dificuldade para tomar a iniciativa de fazer as coisas' },
    { curto: 'Reação exagerada', texto: 'Reagiu de forma exagerada às situações' },
    { curto: 'Tremores', texto: 'Teve tremores, por exemplo nas mãos' },
    { curto: 'Muita energia nervosa', texto: 'Sentiu que gastava muita energia nervosa' },
    { curto: 'Medo de perder o controle', texto: 'Preocupou-se com situações em que poderia entrar em pânico ou passar vergonha' },
    { curto: 'Nada a esperar', texto: 'Sentiu que não havia nada a esperar do futuro' },
    { curto: 'Agitação', texto: 'Percebeu-se ficando agitado(a)' },
    { curto: 'Dificuldade de relaxar', texto: 'Achou difícil relaxar' },
    { curto: 'Tristeza', texto: 'Sentiu-se desanimado(a) e triste' },
    { curto: 'Intolerância a interrupções', texto: 'Ficou impaciente com qualquer coisa que o(a) impedisse de continuar o que fazia' },
    { curto: 'Quase em pânico', texto: 'Sentiu-se perto de entrar em pânico' },
    { curto: 'Sem entusiasmo', texto: 'Não conseguiu se entusiasmar com nada' },
    { curto: 'Pouco valor próprio', texto: 'Sentiu que valia pouco como pessoa' },
    { curto: 'Sensibilidade', texto: 'Sentiu-se sensível demais, ofendendo-se com facilidade' },
    { curto: 'Coração acelerado', texto: 'Percebeu os batimentos do coração sem ter feito esforço físico' },
    { curto: 'Medo sem motivo', texto: 'Sentiu medo sem ter um bom motivo' },
    { curto: 'Vida sem sentido', texto: 'Sentiu que a vida não tinha sentido' },
  ],
  faixas: [],
  subescalas: [
    { id: 'depressao', nome: 'Depressão', itens: [2, 4, 9, 12, 15, 16, 20], multiplicador: 2, maximo: 42, eixo: [0, 14, 28, 42], faixas: faixasDass(9, 13, 20, 27) },
    { id: 'ansiedade', nome: 'Ansiedade', itens: [1, 3, 6, 8, 14, 18, 19], multiplicador: 2, maximo: 42, eixo: [0, 14, 28, 42], faixas: faixasDass(7, 9, 14, 19) },
    { id: 'estresse', nome: 'Estresse', itens: [0, 5, 7, 10, 11, 13, 17], multiplicador: 2, maximo: 42, eixo: [0, 14, 28, 42], faixas: faixasDass(14, 18, 25, 33) },
  ],
  fonte: {
    original: 'Lovibond SH, Lovibond PF. Manual for the Depression Anxiety Stress Scales. 2ª ed. Sydney: Psychology Foundation of Australia, 1995. Questionário de domínio público (site oficial da DASS, UNSW).',
    portugues: 'Versão em português do Brasil: Vignola RCB, Tucci AM. Adaptation and validation of the Depression, Anxiety and Stress Scale (DASS) to Brazilian Portuguese. J Affect Disord, 2014;155:104-9. Os enunciados desta tela são redação própria, fiel ao sentido dos 21 itens.',
    nota: 'Cada subescala soma 7 itens e o resultado é dobrado (0 a 42). Depressão: normal 0 a 9, leve 10 a 13, moderado 14 a 20, grave 21 a 27, extremamente grave 28 ou mais. Ansiedade: 0 a 7, 8 e 9, 10 a 14, 15 a 19, 20 ou mais. Estresse: 0 a 14, 15 a 18, 19 a 25, 26 a 33, 34 ou mais. As faixas descrevem a gravidade relativa dos sintomas na última semana, não são pontos de corte diagnósticos. Não há total geral. O DASS-21 não tem item de risco de suicídio: se o item 21 (vida sem sentido) vier alto, converse sobre isso na sessão. Rastreio: não substitui a avaliação clínica.',
  },
}

/**
 * Escala de Atividades Instrumentais de Vida Diária (Lawton e Brody, 1969): 8 atividades, uso livre (publicação científica; uso
 * clínico sem licença, conforme o pedido que originou esta tela). Enunciados em redação própria.
 * Adaptação desta tela: cada atividade tem 3 níveis (0 não faz, 1 faz com ajuda, 2 faz sozinho(a)), como na adaptação brasileira
 * de Santos e Virtuoso Júnior (2008), em vez do 0/1 original; total de 0 a 16 (quanto MAIOR, mais independente).
 * As faixas abaixo são descritivas (não há ponto de corte validado): dividem o total em níveis de limitação.
 */
export const LAWTON: EscalaDef = {
  id: 'lawton',
  sigla: 'Lawton',
  nome: 'Escala de Atividades Instrumentais de Vida Diária (Lawton)',
  instrucao: 'Em cada atividade, marque o que o(a) paciente realmente faz hoje, não o que poderia fazer. Se alguém sempre faz por ele(a), mesmo que pudesse tentar, marque o nível 0.',
  dominio: 'Independência nas atividades instrumentais de vida diária',
  unidade: 'pontos',
  maximo: 16,
  eixo: [0, 4, 8, 12, 16],
  omissoesPermitidas: 0,
  areas: ['to'],
  itens: [
    {
      curto: 'Usar o telefone',
      texto: 'Usar o telefone',
      opcoes: ov(
        [0, 'Não usa o telefone, ou só atende quando alguém o(a) ajuda.'],
        [1, 'Liga só para números conhecidos ou já salvos, ou precisa de ajuda para alguma etapa.'],
        [2, 'Procura números, liga e atende sozinho(a).'],
      ),
    },
    {
      curto: 'Fazer compras',
      texto: 'Fazer compras',
      opcoes: ov(
        [0, 'Não consegue comprar nada, mesmo acompanhado(a).'],
        [1, 'Compra pequenas coisas ou precisa de companhia para fazer as compras.'],
        [2, 'Faz todas as compras sozinho(a).'],
      ),
    },
    {
      curto: 'Preparar refeições',
      texto: 'Preparar refeições',
      opcoes: ov(
        [0, 'Não prepara refeições; depende de outra pessoa.'],
        [1, 'Esquenta ou monta refeições simples, mas não planeja nem prepara refeições completas.'],
        [2, 'Planeja, prepara e serve as refeições sozinho(a).'],
      ),
    },
    {
      curto: 'Cuidar da casa',
      texto: 'Cuidar da casa (limpeza e arrumação)',
      opcoes: ov(
        [0, 'Não participa dos cuidados com a casa.'],
        [1, 'Faz tarefas leves (arrumar a cama, lavar a louça) ou precisa de ajuda nas pesadas.'],
        [2, 'Cuida da casa sozinho(a), inclusive das tarefas pesadas, ou só precisa de ajuda ocasional.'],
      ),
    },
    {
      curto: 'Lavar roupa',
      texto: 'Lavar roupa',
      opcoes: ov(
        [0, 'Não lava a roupa; depende de outra pessoa.'],
        [1, 'Lava só peças pequenas ou precisa de ajuda com a máquina ou o varal.'],
        [2, 'Cuida de toda a roupa sozinho(a).'],
      ),
    },
    {
      curto: 'Usar transporte',
      texto: 'Usar meios de transporte',
      opcoes: ov(
        [0, 'Não se desloca, ou só com a ajuda de outra pessoa no carro ou em transporte adaptado.'],
        [1, 'Usa transporte público ou táxi só acompanhado(a), ou vai apenas a lugares bem conhecidos.'],
        [2, 'Dirige ou usa transporte público ou táxi por conta própria.'],
      ),
    },
    {
      curto: 'Tomar os medicamentos',
      texto: 'Tomar os próprios medicamentos',
      opcoes: ov(
        [0, 'Não toma sozinho(a); alguém precisa dar ou lembrar a cada dose.'],
        [1, 'Toma se a dose for separada antes, ou erra horário e dose com frequência.'],
        [2, 'Toma na dose e no horário certos, por conta própria.'],
      ),
    },
    {
      curto: 'Cuidar do dinheiro',
      texto: 'Cuidar do dinheiro (contas, pagamentos, troco)',
      opcoes: ov(
        [0, 'Não lida com dinheiro.'],
        [1, 'Faz compras do dia a dia e pequenos pagamentos, mas precisa de ajuda com contas e bancos.'],
        [2, 'Paga contas, controla o orçamento e vai ao banco sozinho(a).'],
      ),
    },
  ],
  faixas: [
    { de: 0, ate: 5, rotulo: 'Limitação importante', tom: 'bad' },
    { de: 6, ate: 11, rotulo: 'Limitação moderada', tom: 'wait' },
    { de: 12, ate: 15, rotulo: 'Limitação leve', tom: 'info' },
    { de: 16, ate: 16, rotulo: 'Independente', tom: 'ok' },
  ],
  fonte: {
    original: 'Lawton MP, Brody EM. Assessment of older people: self-maintaining and instrumental activities of daily living. The Gerontologist, 1969;9(3):179-86.',
    portugues: 'Versão em português do Brasil: Santos RL, Virtuoso Júnior JS. Confiabilidade da versão brasileira da Escala de Atividades Instrumentais da Vida Diária. Rev Bras Promoç Saúde, 2008;21(4):290-6. Os enunciados desta tela são redação própria.',
    nota: 'Oito atividades com três níveis (0, 1 e 2), total de 0 a 16. As faixas são descritivas, sem ponto de corte validado: 16 independente, 12 a 15 limitação leve, 6 a 11 moderada, 0 a 5 importante. Olhe cada atividade, não só o total: uma única atividade em 0 pode ser o que precisa de intervenção. Considere sexo, cultura e hábito anterior (nem todos cozinhavam ou lavavam roupa antes).',
  },
}

/**
 * Checklist de observação sensorial: instrumento PRÓPRIO do MyClinica (sem relação com o Perfil Sensorial de Dunn, que é
 * licenciado e não é reproduzido nem imitado aqui). Seis sistemas, quatro comportamentos observáveis cada, frequência de 0 a 3.
 * Os comportamentos seguem a descrição geral de modulação, busca e evitação sensorial da literatura de integração sensorial
 * (Ayres, 1972; Miller e cols., 2007), em redação própria. NÃO há normas: as faixas apenas descrevem quanto foi observado e não
 * classificam o paciente.
 */
const FREQUENCIA_OBSERVACAO: OpcaoEscala[] = [
  { valor: 0, rotulo: 'Nunca' },
  { valor: 1, rotulo: 'Às vezes' },
  { valor: 2, rotulo: 'Com frequência' },
  { valor: 3, rotulo: 'Quase sempre' },
]

const faixasObservacao = (): FaixaEscala[] => [
  { de: 0, ate: 3, rotulo: 'Pouco observado', tom: 'ok' },
  { de: 4, ate: 7, rotulo: 'Observado com frequência', tom: 'wait' },
  { de: 8, ate: 12, rotulo: 'Observado com muita frequência', tom: 'warn' },
]

const subObservacao = (id: string, nome: string, itens: number[]): SubescalaDef => ({
  id, nome, itens, maximo: 12, eixo: [0, 4, 8, 12], faixas: faixasObservacao(),
})

export const SENSORIAL: EscalaDef = {
  id: 'sensorial',
  sigla: 'Obs. sensorial',
  nome: 'Checklist de observação sensorial (MyClinica)',
  instrucao: 'Com base na observação em sessão e no relato de quem convive com o(a) paciente, marque com que frequência cada comportamento aparece. É um registro para descrever e acompanhar, não um teste padronizado.',
  dominio: 'Comportamentos sensoriais observados, por sistema',
  unidade: 'pontos',
  maximo: 72,
  eixo: [0, 12, 24, 36, 48, 60, 72],
  omissoesPermitidas: 0,
  areas: ['to'],
  opcoesComuns: FREQUENCIA_OBSERVACAO,
  itens: [
    // tátil (0 a 3)
    { curto: 'Tátil: roupas e etiquetas', texto: 'Evita ou reclama de certas roupas, etiquetas, costuras ou tecidos' },
    { curto: 'Tátil: sujar as mãos', texto: 'Incomoda-se ao sujar as mãos (tinta, areia, cola, comida)' },
    { curto: 'Tátil: busca de toque', texto: 'Toca em tudo ou nas pessoas o tempo todo, mesmo quando não é adequado' },
    { curto: 'Tátil: pouca percepção', texto: 'Parece não perceber toques, machucados ou diferenças de temperatura' },
    // vestibular (4 a 7)
    { curto: 'Movimento: evita', texto: 'Evita balanço, escorregador ou mudanças bruscas de posição, ou enjoa com facilidade' },
    { curto: 'Movimento: busca', texto: 'Busca movimento o tempo todo (gira, pula, balança) e tem dificuldade para ficar parado(a)' },
    { curto: 'Movimento: insegurança', texto: 'Mostra medo ou insegurança com os pés fora do chão ou em superfícies instáveis' },
    { curto: 'Movimento: sem tontura', texto: 'Gira ou balança por muito tempo sem se cansar nem ficar tonto(a)' },
    // proprioceptivo (8 a 11)
    { curto: 'Corpo: esbarra', texto: 'Esbarra, derruba objetos ou parece desajeitado(a) no espaço' },
    { curto: 'Corpo: força excessiva', texto: 'Aperta, empurra ou bate em objetos e pessoas com mais força do que o necessário' },
    { curto: 'Corpo: busca pressão', texto: 'Busca pressão forte (abraço apertado, se enrolar, se jogar no chão ou nos móveis)' },
    { curto: 'Corpo: dosar força', texto: 'Tem dificuldade de dosar a força (quebra a ponta do lápis, rasga o papel)' },
    // auditivo (12 a 15)
    { curto: 'Audição: incômodo', texto: 'Tapa os ouvidos ou se incomoda com sons do dia a dia (liquidificador, secador, sirene)' },
    { curto: 'Audição: não responde', texto: 'Parece não ouvir quando chamado(a), mesmo sem alteração de audição' },
    { curto: 'Audição: distração', texto: 'Distrai-se com ruídos de fundo e perde o fio da tarefa' },
    { curto: 'Audição: busca sons', texto: 'Faz barulho ou busca sons altos com frequência' },
    // visual (16 a 19)
    { curto: 'Visão: luz forte', texto: 'Incomoda-se com luz forte ou fecha os olhos ao ar livre' },
    { curto: 'Visão: distração', texto: 'Distrai-se com estímulos visuais (movimento, cartazes, muitos objetos)' },
    { curto: 'Visão: achar objetos', texto: 'Tem dificuldade para achar um objeto no meio de vários' },
    { curto: 'Visão: fixação', texto: 'Olha de perto ou de lado, ou fixa o olhar em luzes e objetos que giram' },
    // oral e olfativo (20 a 23)
    { curto: 'Oral: seletividade', texto: 'Recusa alimentos pela textura, temperatura ou gosto; alimentação muito seletiva' },
    { curto: 'Oral: leva à boca', texto: 'Leva objetos à boca ou morde e mastiga o que não é comida, além do esperado para a idade' },
    { curto: 'Olfato: incômodo', texto: 'Incomoda-se com cheiros que a maioria das pessoas mal percebe' },
    { curto: 'Olfato: cheirar', texto: 'Cheira objetos, pessoas ou comida com frequência' },
  ],
  faixas: [],
  subescalas: [
    subObservacao('tatil', 'Tátil', [0, 1, 2, 3]),
    subObservacao('vestibular', 'Movimento e equilíbrio', [4, 5, 6, 7]),
    subObservacao('proprio', 'Propriocepção e força', [8, 9, 10, 11]),
    subObservacao('auditivo', 'Auditivo', [12, 13, 14, 15]),
    subObservacao('visual', 'Visual', [16, 17, 18, 19]),
    subObservacao('oral', 'Oral e olfativo', [20, 21, 22, 23]),
  ],
  fonte: {
    original: 'Checklist próprio do MyClinica, elaborado como roteiro de observação. Referência conceitual geral: Ayres AJ. Sensory Integration and Learning Disorders. Los Angeles: Western Psychological Services, 1972; Miller LJ, Anzalone ME, Lane SJ, Cermak SA, Osten ET. Concept evolution in sensory integration. Am J Occup Ther, 2007;61(2):135-40.',
    portugues: 'Texto original em português do Brasil, sem tradução de instrumento publicado.',
    nota: 'Não é um instrumento padronizado, não tem normas e não reproduz nem substitui o Perfil Sensorial. Cada sistema soma 4 comportamentos (0 a 12); as faixas só descrevem quanto foi observado (0 a 3 pouco, 4 a 7 com frequência, 8 a 12 com muita frequência) e não classificam o paciente. O mesmo sistema pode ter comportamentos de evitação e de busca: leia item a item. Use para planejar a intervenção e comparar o antes e o depois.',
  },
}

/**
 * Checklist de rotina e desempenho ocupacional: instrumento PRÓPRIO do MyClinica, em redação original. Não usa o formato da COPM
 * (problemas escolhidos pelo cliente com importância, desempenho e satisfação de 1 a 10), que é licenciada. Cinco áreas de
 * ocupação, quatro itens cada, nível de participação de 0 a 3. Sem normas: as faixas são descritivas.
 * Não repete o que o Barthel (AVD básicas) e o Lawton (AIVD) já cobrem.
 */
const PARTICIPACAO: OpcaoEscala[] = [
  { valor: 0, rotulo: 'Não participa' },
  { valor: 1, rotulo: 'Com muito apoio' },
  { valor: 2, rotulo: 'Com pouco apoio' },
  { valor: 3, rotulo: 'Com autonomia' },
]

const faixasParticipacao = (): FaixaEscala[] => [
  { de: 0, ate: 4, rotulo: 'Muito apoio na área', tom: 'warn' },
  { de: 5, ate: 8, rotulo: 'Apoio parcial', tom: 'wait' },
  { de: 9, ate: 12, rotulo: 'Boa autonomia', tom: 'ok' },
]

const subRotina = (id: string, nome: string, itens: number[]): SubescalaDef => ({
  id, nome, itens, maximo: 12, eixo: [0, 4, 8, 12], faixas: faixasParticipacao(),
})

export const ROTINA: EscalaDef = {
  id: 'rotina',
  sigla: 'Rotina',
  nome: 'Checklist de rotina e desempenho ocupacional (MyClinica)',
  instrucao: 'Para cada situação do dia a dia, marque o nível de participação do(a) paciente na rotina atual, segundo o relato de quem convive com ele(a) e o que foi observado. Todos os itens precisam de resposta: se uma situação não se aplica à idade do(a) paciente (por exemplo, escola para um adulto), marque o nível da situação equivalente (trabalho, estudo, tarefas de casa).',
  dominio: 'Participação e autonomia na rotina, por área de ocupação',
  unidade: 'pontos',
  maximo: 60,
  eixo: [0, 12, 24, 36, 48, 60],
  omissoesPermitidas: 0,
  areas: ['to'],
  opcoesComuns: PARTICIPACAO,
  itens: [
    // sono e descanso (0 a 3)
    { curto: 'Sono: adormecer', texto: 'Adormece em horário regular, sem muita dificuldade' },
    { curto: 'Sono: manter', texto: 'Mantém o sono durante a noite, sem despertares que atrapalhem o dia' },
    { curto: 'Sono: acordar', texto: 'Acorda e se organiza para começar o dia (levantar, se arrumar)' },
    { curto: 'Sono: descanso', texto: 'Percebe quando está cansado(a) e faz pausas de descanso' },
    // refeições (4 a 7)
    { curto: 'Refeição: à mesa', texto: 'Participa das refeições à mesa, com a família ou o grupo' },
    { curto: 'Refeição: variedade', texto: 'Come quantidade e variedade de alimentos suficientes' },
    { curto: 'Refeição: utensílios', texto: 'Usa prato, copo e talheres de forma adequada para a idade' },
    { curto: 'Refeição: ajudar', texto: 'Ajuda a preparar, servir ou arrumar a refeição' },
    // escola ou trabalho (8 a 11)
    { curto: 'Escola/trabalho: atenção', texto: 'Mantém a atenção na tarefa pelo tempo esperado' },
    { curto: 'Escola/trabalho: organização', texto: 'Organiza materiais, horários e etapas da tarefa' },
    { curto: 'Escola/trabalho: regras', texto: 'Segue a rotina e as regras do ambiente' },
    { curto: 'Escola/trabalho: concluir', texto: 'Conclui as tarefas no prazo' },
    // brincar e lazer (12 a 15)
    { curto: 'Lazer: escolher', texto: 'Escolhe e mantém uma atividade de lazer ou brincadeira' },
    { curto: 'Lazer: com outros', texto: 'Brinca ou pratica o lazer junto com outras pessoas' },
    { curto: 'Lazer: variar', texto: 'Varia as atividades, sem ficar só em uma' },
    { curto: 'Lazer: mudar', texto: 'Aceita trocar de atividade quando é preciso' },
    // participação social e familiar (16 a 19)
    { curto: 'Social: interagir', texto: 'Interage com familiares e colegas' },
    { curto: 'Social: sair', texto: 'Participa de atividades fora de casa (passeios, encontros, eventos, culto)' },
    { curto: 'Social: papéis', texto: 'Cumpre seu papel na casa e no grupo (tarefas, combinados)' },
    { curto: 'Social: mudanças', texto: 'Lida com mudanças na rotina e com imprevistos' },
  ],
  faixas: [],
  subescalas: [
    subRotina('sono', 'Sono e descanso', [0, 1, 2, 3]),
    subRotina('refeicoes', 'Refeições', [4, 5, 6, 7]),
    subRotina('escola', 'Escola ou trabalho', [8, 9, 10, 11]),
    subRotina('lazer', 'Brincar e lazer', [12, 13, 14, 15]),
    subRotina('social', 'Participação social e familiar', [16, 17, 18, 19]),
  ],
  fonte: {
    original: 'Checklist próprio do MyClinica, elaborado a partir das áreas de ocupação descritas no Marco de Trabalho da Prática de Terapia Ocupacional (AOTA, Occupational Therapy Practice Framework, 4ª ed., 2020). Não reproduz a COPM nem outro instrumento licenciado.',
    portugues: 'Texto original em português do Brasil, sem tradução de instrumento publicado.',
    nota: 'Não é um instrumento padronizado e não tem normas. Cada área soma 4 itens (0 a 12); as faixas só descrevem o apoio necessário (0 a 4 muito apoio, 5 a 8 apoio parcial, 9 a 12 boa autonomia). Combine com o Barthel (AVD básicas) e o Lawton (AIVD) para o perfil completo e defina as metas junto com o(a) paciente e a família.',
  },
}

export const ESCALAS: Record<EscalaId, EscalaDef> = {
  phq9: PHQ9, gad7: GAD7, who5: WHO5, dass21: DASS21, odi: ODI, roland: ROLAND, berg: BERG, barthel: BARTHEL,
  lawton: LAWTON, sensorial: SENSORIAL, rotina: ROTINA,
}

/** Ordem em que as escalas aparecem na tela. */
export const ESCALA_ORDEM: EscalaId[] = ['phq9', 'gad7', 'who5', 'dass21', 'odi', 'roland', 'berg', 'barthel', 'lawton', 'sensorial', 'rotina']

export function isEscalaId(v: unknown): v is EscalaId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ESCALAS, v)
}

/** Só as escalas de soma oferecidas para as áreas informadas (união, na ordem fixa), sem repetição. */
export function soEscalasParaAreas(areas: readonly string[]): EscalaDef[] {
  return ESCALA_ORDEM.map(id => ESCALAS[id]).filter(def => def.areas.some(a => areas.includes(a)))
}

/**
 * Avaliações oferecidas para as áreas informadas: as escalas de soma e, depois delas, as fichas estruturadas
 * (audiograma, voz, fluência, motricidade orofacial). A aba "Escalas" do prontuário lista tudo isto.
 */
export function escalasParaAreas(areas: readonly string[]): AvaliacaoDef[] {
  return [...soEscalasParaAreas(areas), ...protocolosParaAreas(areas)]
}


/** Uma resposta por item (mesma ordem de `def.itens`); null = em branco. */
export type Respostas = (number | null)[]

export function respostasVazias(def: EscalaDef): Respostas {
  return def.itens.map(() => null)
}

export function opcoesDoItem(def: EscalaDef, indice: number): OpcaoEscala[] {
  return def.itens[indice]?.opcoes ?? def.opcoesComuns ?? []
}

/**
 * Opções curtas (frequência, sim/não): aparecem lado a lado e saem por extenso no registro. Frases longas
 * (Oswestry, Barthel, Berg) vão em lista, e o registro guarda só "nota de máximo".
 */
export function opcoesCurtas(def: EscalaDef, indice: number): boolean {
  const ops = opcoesDoItem(def, indice)
  return ops.length <= 4 && ops.every(op => op.rotulo.length <= 28)
}

/** O valor existe entre as opções do item (protege contra dado salvo corrompido ou de outra versão). */
export function respostaValida(def: EscalaDef, indice: number, valor: unknown): valor is number {
  return typeof valor === 'number' && opcoesDoItem(def, indice).some(op => op.valor === valor)
}

/** Alinha as respostas ao tamanho da escala e zera o que não for uma opção válida. */
export function normalizarRespostas(def: EscalaDef, raw: readonly unknown[]): Respostas {
  return def.itens.map((_, i) => (respostaValida(def, i, raw[i]) ? (raw[i] as number) : null))
}

export interface ResultadoSubescala {
  id: string
  nome: string
  /** Soma da subescala (com o multiplicador); null enquanto incompleta */
  valor: number | null
  maximo: number
  faixa: FaixaEscala | null
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
  /** Resultado por subescala (DASS-21 e checklists); vazio nas escalas com total único */
  subescalas: ResultadoSubescala[]
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
  const mult = def.multiplicador ?? 1
  let valor: number | null = null
  // escalas com subescalas não têm total geral: o resultado sai em `subescalas`
  if (completo && !def.subescalas) valor = def.unidade === 'percentual' ? Math.round((soma / somaMaxima) * 100) : soma * mult

  const subescalas: ResultadoSubescala[] = (def.subescalas ?? []).map(sub => {
    const validos = sub.itens.filter(i => respostaValida(def, i, respostas[i]))
    const inteira = validos.length === sub.itens.length
    const v = completo && inteira ? validos.reduce((acc, i) => acc + (respostas[i] as number), 0) * (sub.multiplicador ?? 1) : null
    return { id: sub.id, nome: sub.nome, valor: v, maximo: sub.maximo, faixa: v === null ? null : (sub.faixas.find(f => v >= f.de && v <= f.ate) ?? null) }
  })

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
    subescalas,
  }
}

/** Texto do valor: "12 pontos" ou "34%". */
export function formatarValor(def: EscalaDef, valor: number): string {
  return def.unidade === 'percentual' ? `${valor}%` : `${valor} ${valor === 1 ? 'ponto' : 'pontos'}`
}
