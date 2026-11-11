// CID-10 para busca local no campo de hipótese diagnóstica.
// - CID10_COMUNS: lista curta embutida (sugeridos e prioridade nos resultados; descrições em grafia atual).
// - Tabela completa (DATASUS, ~12 mil códigos): vive em cid10-datasus.json e só é baixada por import dinâmico
//   (loadCidCompleto) quando o campo de CID é aberto. O texto da hipótese continua livre.

export type CidEntry = readonly [code: string, description: string]

export const CID10_COMUNS: readonly CidEntry[] = [
  ['A09', 'Diarreia e gastroenterite de origem infecciosa presumível'],
  ['A90', 'Dengue [dengue clássico]'],
  ['A91', 'Febre hemorrágica devida ao vírus do dengue'],
  ['B07', 'Verrugas de origem viral'],
  ['B34.9', 'Infecção viral, não especificada'],
  ['B35.3', 'Tinha do pé [tinea pedis]'],
  ['B36.0', 'Pitiríase versicolor'],
  ['B37.9', 'Candidíase, não especificada'],
  ['B82.9', 'Parasitose intestinal, não especificada'],
  ['C50.9', 'Neoplasia maligna da mama, não especificada'],
  ['C61', 'Neoplasia maligna da próstata'],
  ['D25.9', 'Leiomioma do útero, não especificado'],
  ['D50.9', 'Anemia por deficiência de ferro, sem outra especificação'],
  ['E03.9', 'Hipotireoidismo, não especificado'],
  ['E04.9', 'Bócio não tóxico, não especificado'],
  ['E05.9', 'Tireotoxicose [hipertireoidismo], não especificada'],
  ['E10.9', 'Diabetes mellitus tipo 1 sem complicações'],
  ['E11.9', 'Diabetes mellitus tipo 2 sem complicações'],
  ['E14.9', 'Diabetes mellitus não especificado sem complicações'],
  ['E28.2', 'Síndrome do ovário policístico'],
  ['E55.9', 'Deficiência de vitamina D, não especificada'],
  ['E66.9', 'Obesidade, não especificada'],
  ['E78.0', 'Hipercolesterolemia pura'],
  ['E78.5', 'Hiperlipidemia, não especificada'],
  ['F10.2', 'Transtornos mentais e comportamentais devidos ao uso de álcool: síndrome de dependência'],
  ['F17.2', 'Transtornos mentais e comportamentais devidos ao uso de fumo: síndrome de dependência'],
  ['F32.9', 'Episódio depressivo, não especificado'],
  ['F33.9', 'Transtorno depressivo recorrente, não especificado'],
  ['F41.0', 'Transtorno de pânico [ansiedade paroxística episódica]'],
  ['F41.1', 'Ansiedade generalizada'],
  ['F41.2', 'Transtorno misto ansioso e depressivo'],
  ['F43.2', 'Transtornos de adaptação'],
  ['F51.0', 'Insônia não orgânica'],
  ['F84.0', 'Autismo infantil'],
  ['F90.0', 'Perturbação da atividade e da atenção [TDAH]'],
  ['G40.9', 'Epilepsia, não especificada'],
  ['G43.9', 'Enxaqueca, não especificada'],
  ['G44.2', 'Cefaleia tensional'],
  ['G47.0', 'Distúrbios do início e da manutenção do sono [insônias]'],
  ['G47.3', 'Apneia do sono'],
  ['G56.0', 'Síndrome do túnel do carpo'],
  ['H04.1', 'Outros transtornos da glândula lacrimal (olho seco)'],
  ['H10.9', 'Conjuntivite, não especificada'],
  ['H25.9', 'Catarata senil, não especificada'],
  ['H40.9', 'Glaucoma, não especificado'],
  ['H52.0', 'Hipermetropia'],
  ['H52.1', 'Miopia'],
  ['H52.2', 'Astigmatismo'],
  ['H65.9', 'Otite média não supurativa, não especificada'],
  ['H66.9', 'Otite média, não especificada'],
  ['H81.1', 'Vertigem paroxística benigna'],
  ['I10', 'Hipertensão essencial (primária)'],
  ['I20.9', 'Angina pectoris, não especificada'],
  ['I21.9', 'Infarto agudo do miocárdio, não especificado'],
  ['I25.1', 'Doença aterosclerótica do coração'],
  ['I48', 'Fibrilação e flutter atrial'],
  ['I50.9', 'Insuficiência cardíaca, não especificada'],
  ['I64', 'Acidente vascular cerebral, não especificado como hemorrágico ou isquêmico'],
  ['I83.9', 'Varizes dos membros inferiores sem úlcera ou inflamação'],
  ['J00', 'Nasofaringite aguda [resfriado comum]'],
  ['J01.9', 'Sinusite aguda, não especificada'],
  ['J02.9', 'Faringite aguda, não especificada'],
  ['J03.9', 'Amigdalite aguda, não especificada'],
  ['J06.9', 'Infecção aguda das vias aéreas superiores, não especificada'],
  ['J11.1', 'Influenza [gripe] com outras manifestações respiratórias, vírus não identificado'],
  ['J18.9', 'Pneumonia, não especificada'],
  ['J20.9', 'Bronquite aguda, não especificada'],
  ['J30.4', 'Rinite alérgica, não especificada'],
  ['J32.9', 'Sinusite crônica, não especificada'],
  ['J35.0', 'Amigdalite crônica'],
  ['J44.9', 'Doença pulmonar obstrutiva crônica, não especificada'],
  ['J45.9', 'Asma, não especificada'],
  ['K21.9', 'Doença do refluxo gastroesofágico sem esofagite'],
  ['K29.7', 'Gastrite, não especificada'],
  ['K30', 'Dispepsia'],
  ['K58.9', 'Síndrome do cólon irritável sem diarreia'],
  ['K59.0', 'Constipação'],
  ['K64.9', 'Hemorroidas não especificadas'],
  ['K76.0', 'Degeneração gordurosa do fígado, não classificada em outra parte'],
  ['K80.2', 'Calculose da vesícula biliar sem colecistite'],
  ['L03.9', 'Celulite, não especificada'],
  ['L20.9', 'Dermatite atópica, não especificada'],
  ['L21.9', 'Dermatite seborreica, não especificada'],
  ['L23.9', 'Dermatite alérgica de contato, de causa não especificada'],
  ['L30.9', 'Dermatite, não especificada'],
  ['L40.9', 'Psoríase, não especificada'],
  ['L50.9', 'Urticária, não especificada'],
  ['L70.0', 'Acne vulgar'],
  ['M06.9', 'Artrite reumatoide, não especificada'],
  ['M17.9', 'Gonartrose, não especificada'],
  ['M19.9', 'Artrose, não especificada'],
  ['M25.5', 'Dor articular'],
  ['M54.2', 'Cervicalgia'],
  ['M54.4', 'Lumbago com ciática'],
  ['M54.5', 'Dor lombar baixa'],
  ['M72.2', 'Fibromatose da fáscia plantar (fascite plantar)'],
  ['M75.1', 'Síndrome do manguito rotador'],
  ['M79.1', 'Mialgia'],
  ['M81.9', 'Osteoporose, não especificada'],
  ['N20.0', 'Calculose do rim'],
  ['N30.0', 'Cistite aguda'],
  ['N39.0', 'Infecção do trato urinário de localização não especificada'],
  ['N40', 'Hiperplasia da próstata'],
  ['N76.0', 'Vaginite aguda'],
  ['N80.9', 'Endometriose, não especificada'],
  ['N92.0', 'Menstruação excessiva e frequente com ciclo regular'],
  ['N95.1', 'Estados menopáusicos e climatéricos femininos'],
  ['O14.9', 'Pré-eclâmpsia, não especificada'],
  ['O21.9', 'Vômitos excessivos na gravidez, sem outra especificação'],
  ['O24.4', 'Diabetes mellitus que surge durante a gravidez'],
  ['R05', 'Tosse'],
  ['R07.4', 'Dor torácica, não especificada'],
  ['R10.4', 'Outras dores abdominais e as não especificadas'],
  ['R11', 'Náusea e vômitos'],
  ['R21', 'Erupção cutânea e outras erupções cutâneas não específicas'],
  ['R42', 'Tontura e instabilidade'],
  ['R50.9', 'Febre, não especificada'],
  ['R51', 'Cefaleia'],
  ['R53', 'Mal-estar e fadiga'],
  ['R60.9', 'Edema, não especificado'],
  ['R73.9', 'Hiperglicemia, não especificada'],
  ['S06.0', 'Concussão cerebral'],
  ['S93.4', 'Entorse e distensão do tornozelo'],
  ['T78.4', 'Alergia, não especificada'],
  ['U07.1', 'COVID-19, vírus identificado'],
  ['Z00.0', 'Exame médico geral'],
  ['Z00.1', 'Exame de saúde de rotina da criança'],
  ['Z01.4', 'Exame ginecológico (geral) (de rotina)'],
  ['Z23', 'Necessidade de imunização contra doença bacteriana única'],
  ['Z30.0', 'Aconselhamento e orientação geral sobre anticoncepção'],
  ['Z34.9', 'Supervisão de gravidez normal, não especificada'],
  ['Z76.0', 'Emissão de prescrição de repetição'],
]

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

/** "E11.9 - Diabetes mellitus tipo 2 sem complicações" */
export function cidText([code, description]: CidEntry): string {
  return `${code} - ${description}`
}

interface IndexItem {
  e: CidEntry
  /** código minúsculo, com ponto */
  code: string
  /** código minúsculo, sem ponto */
  flat: string
  /** descrição normalizada (sem acento, minúscula); inclui a descrição oficial quando difere da curta */
  desc: string
  common: boolean
}

export type CidIndex = readonly IndexItem[]

/**
 * Pré-processa uma lista para busca (normaliza uma vez só). Nos códigos que também estão em CID10_COMUNS vale a
 * descrição curta (a mesma que já foi salva em prontuários) e a oficial continua pesquisável; códigos que só
 * existem na lista curta (ex.: U07.1, posterior à edição do DATASUS) entram junto.
 */
export function buildCidIndex(list: readonly CidEntry[], comuns: readonly CidEntry[] = CID10_COMUNS): CidIndex {
  const commonByCode = new Map(comuns.map(e => [e[0], e] as const))
  const seen = new Set<string>()
  const items: IndexItem[] = []
  const push = (e: CidEntry, extra?: string) => {
    seen.add(e[0])
    const code = e[0].toLowerCase()
    items.push({
      e,
      code,
      flat: code.replace('.', ''),
      desc: extra && extra !== e[1] ? `${norm(e[1])} ${norm(extra)}` : norm(e[1]),
      common: commonByCode.has(e[0]),
    })
  }
  for (const full of list) {
    const c = commonByCode.get(full[0])
    if (c) push(c, full[1])
    else push(full)
  }
  for (const c of comuns) if (!seen.has(c[0])) push(c)
  return items
}

/**
 * Busca por código ("e11", "I10") ou por palavras da descrição ("diabetes tipo 2", "lombar").
 * Código vem primeiro; depois descrição que começa com a palavra; depois as que só contêm. Em empate, os
 * códigos comuns vêm antes. No máximo `limit`.
 */
export function searchCidIndex(query: string, index: CidIndex, limit = 8): CidEntry[] {
  const q = norm(query)
  if (q.length < 2) return []
  const qFlat = q.replace('.', '')
  const tokens = q.split(/\s+/).filter(Boolean)
  const scored: { it: IndexItem; score: number }[] = []
  for (const it of index) {
    let score = -1
    if (it.code === q) score = 0
    else if (it.flat.startsWith(qFlat)) score = 1
    else if (tokens.every(t => it.desc.includes(t))) score = it.desc.startsWith(tokens[0]) ? 2 : 3
    if (score >= 0) scored.push({ it, score })
  }
  return scored
    .sort((a, b) => a.score - b.score || Number(b.it.common) - Number(a.it.common) || a.it.code.localeCompare(b.it.code))
    .slice(0, limit)
    .map(s => s.it.e)
}

/** Busca na lista curta (ou numa lista passada). */
export function searchCid(query: string, limit = 8, list: readonly CidEntry[] = CID10_COMUNS): CidEntry[] {
  return searchCidIndex(query, list === CID10_COMUNS ? getComunsIndex() : buildCidIndex(list, []), limit)
}

let comunsIndex: CidIndex | null = null
/** Índice da lista curta, montado uma vez. */
export function getComunsIndex(): CidIndex {
  return (comunsIndex ??= buildCidIndex(CID10_COMUNS))
}

let completoPromise: Promise<CidIndex> | null = null
/**
 * Baixa a tabela completa (chunk separado, só na primeira chamada) e devolve o índice de busca já com a lista
 * curta priorizada. Em caso de falha, a próxima chamada tenta de novo.
 */
export function loadCidCompleto(): Promise<CidIndex> {
  if (!completoPromise) {
    completoPromise = import('./cid10-datasus.json')
      .then(m => buildCidIndex(m.default as unknown as CidEntry[]))
      .catch(err => {
        completoPromise = null
        throw err
      })
  }
  return completoPromise
}
