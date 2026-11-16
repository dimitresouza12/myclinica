// Catálogo próprio de exames comuns para o pedido de exames da Medicina: nome, categoria e, quando há certeza, o código
// TUSS (Terminologia Unificada da Saúde Suplementar, ANS). Lista de apoio à seleção, escrita para o MyClinica: não é
// tabela de procedimentos de operadora e não traz preço, preparo nem valores de referência. O que não está aqui entra
// como exame livre no pedido.
//
// TUSS: só aparece nos exames cujo código é inequívoco e muito usado. A operadora manda a tabela vigente: na dúvida,
// o código fica vazio (o pedido sai sem ele, o que é válido). Conferir em https://www.gov.br/ans (TUSS, tabela 22)
// antes de ampliar.

export type GrupoExame = 'laboratorial' | 'imagem' | 'funcional'

export const GRUPO_ROTULO: Record<GrupoExame, string> = {
  laboratorial: 'Laboratoriais',
  imagem: 'Imagem',
  funcional: 'Funcionais',
}

export interface ExameCatalogo {
  /** Identificador estável (slug) guardado no pedido. */
  id: string
  nome: string
  grupo: GrupoExame
  categoria: string
  /** Código TUSS de 8 dígitos, só se houver certeza. */
  tuss?: string
  /** Outros nomes pelos quais o exame é procurado (sigla, nome popular). */
  busca?: string[]
}

type Def = [id: string, nome: string, tuss?: string, busca?: string[]]

const lab = (categoria: string, defs: Def[]): ExameCatalogo[] =>
  defs.map(([id, nome, tuss, busca]) => ({ id, nome, grupo: 'laboratorial', categoria, ...(tuss ? { tuss } : {}), ...(busca ? { busca } : {}) }))
const img = (categoria: string, defs: Def[]): ExameCatalogo[] =>
  defs.map(([id, nome, tuss, busca]) => ({ id, nome, grupo: 'imagem', categoria, ...(tuss ? { tuss } : {}), ...(busca ? { busca } : {}) }))
const fun = (categoria: string, defs: Def[]): ExameCatalogo[] =>
  defs.map(([id, nome, tuss, busca]) => ({ id, nome, grupo: 'funcional', categoria, ...(tuss ? { tuss } : {}), ...(busca ? { busca } : {}) }))

export const EXAMES_CATALOGO: ExameCatalogo[] = [
  ...lab('Hematologia', [
    ['hemograma', 'Hemograma completo', '40304361', ['eritrograma', 'leucograma', 'plaquetas']],
    ['reticulocitos', 'Reticulócitos'],
    ['vhs', 'Velocidade de hemossedimentação (VHS)', undefined, ['vhs']],
    ['tipagem-abo-rh', 'Tipagem sanguínea ABO e Rh', undefined, ['grupo sanguineo', 'fator rh']],
    ['coombs-indireto', 'Coombs indireto'],
    ['esfregaco', 'Esfregaço de sangue periférico (análise morfológica)'],
  ]),
  ...lab('Coagulação', [
    ['tap-inr', 'Tempo de protrombina (TAP) e INR', undefined, ['tp', 'inr', 'protrombina']],
    ['ttpa', 'Tempo de tromboplastina parcial ativada (TTPA)', undefined, ['kptt']],
    ['fibrinogenio', 'Fibrinogênio'],
    ['d-dimero', 'D-dímero'],
  ]),
  ...lab('Glicose e diabetes', [
    ['glicemia-jejum', 'Glicemia de jejum', '40302040', ['glicose']],
    ['hba1c', 'Hemoglobina glicada (HbA1c)', undefined, ['glico', 'a1c', 'hemoglobina glicosilada']],
    ['tog-75', 'Teste oral de tolerância à glicose (curva glicêmica, 75 g)', undefined, ['tolerancia a glicose', 'curva glicemica', 'tog']],
    ['insulina-jejum', 'Insulina de jejum'],
    ['peptideo-c', 'Peptídeo C'],
    ['homa-ir', 'Glicemia e insulina de jejum (índice HOMA-IR)', undefined, ['resistencia insulinica']],
  ]),
  ...lab('Lipídeos', [
    ['colesterol-total', 'Colesterol total', '40301630'],
    ['hdl', 'Colesterol HDL', undefined, ['hdl colesterol']],
    ['ldl', 'Colesterol LDL', undefined, ['ldl colesterol']],
    ['triglicerideos', 'Triglicerídeos', undefined, ['triglicérides', 'tg']],
    ['perfil-lipidico', 'Perfil lipídico completo', undefined, ['lipidograma', 'colesterol e fracoes']],
    ['lipoproteina-a', 'Lipoproteína (a)', undefined, ['lp(a)']],
  ]),
  ...lab('Função renal e eletrólitos', [
    ['creatinina', 'Creatinina', undefined, ['tfg', 'taxa de filtracao glomerular']],
    ['ureia', 'Ureia'],
    ['acido-urico', 'Ácido úrico'],
    ['sodio', 'Sódio'],
    ['potassio', 'Potássio'],
    ['calcio', 'Cálcio total'],
    ['calcio-ionico', 'Cálcio iônico'],
    ['magnesio', 'Magnésio'],
    ['fosforo', 'Fósforo'],
    ['cistatina-c', 'Cistatina C'],
  ]),
  ...lab('Função hepática e pancreática', [
    ['tgo', 'TGO (AST)', undefined, ['ast', 'transaminase oxalacetica']],
    ['tgp', 'TGP (ALT)', undefined, ['alt', 'transaminase piruvica']],
    ['gama-gt', 'Gama-glutamil transferase (gama GT)', undefined, ['ggt']],
    ['fosfatase-alcalina', 'Fosfatase alcalina'],
    ['bilirrubinas', 'Bilirrubina total e frações', undefined, ['bilirrubina direta', 'bilirrubina indireta']],
    ['albumina', 'Albumina'],
    ['proteinas-totais', 'Proteínas totais e frações'],
    ['amilase', 'Amilase'],
    ['lipase', 'Lipase'],
    ['ldh', 'Desidrogenase lática (LDH)', undefined, ['dhl']],
  ]),
  ...lab('Tireoide', [
    ['tsh', 'TSH (hormônio tireoestimulante)', '40316521'],
    ['t4-livre', 'T4 livre'],
    ['t3-total', 'T3 total'],
    ['t3-livre', 'T3 livre'],
    ['anti-tpo', 'Anticorpo anti-TPO', undefined, ['antiperoxidase']],
    ['anti-tireoglobulina', 'Anticorpo antitireoglobulina'],
    ['trab', 'Anticorpo anti-receptor de TSH (TRAb)'],
    ['tireoglobulina', 'Tireoglobulina'],
    ['calcitonina', 'Calcitonina'],
  ]),
  ...lab('Hormônios', [
    ['pth', 'Paratormônio (PTH)', undefined, ['paratormonio']],
    ['cortisol', 'Cortisol sérico'],
    ['prolactina', 'Prolactina'],
    ['fsh', 'FSH (hormônio folículo-estimulante)'],
    ['lh', 'LH (hormônio luteinizante)'],
    ['estradiol', 'Estradiol'],
    ['progesterona', 'Progesterona'],
    ['testosterona-total', 'Testosterona total'],
    ['testosterona-livre', 'Testosterona livre'],
    ['shbg', 'SHBG (globulina ligadora de hormônios sexuais)'],
    ['dhea-s', 'Sulfato de dehidroepiandrosterona (DHEA-S)', undefined, ['sdhea']],
    ['17-oh-progesterona', '17-hidroxiprogesterona'],
    ['beta-hcg', 'Beta-HCG quantitativo', undefined, ['gravidez', 'gonadotrofina corionica']],
    ['igf-1', 'IGF-1 (somatomedina C)'],
    ['amh', 'Hormônio anti-mülleriano (AMH)'],
  ]),
  ...lab('Vitaminas, ferro e nutrientes', [
    ['vitamina-d', 'Vitamina D, 25-hidroxi', undefined, ['25 oh', 'colecalciferol']],
    ['vitamina-b12', 'Vitamina B12', undefined, ['cobalamina', 'cianocobalamina']],
    ['acido-folico', 'Ácido fólico (folato)'],
    ['ferro-serico', 'Ferro sérico'],
    ['ferritina', 'Ferritina'],
    ['transferrina', 'Transferrina e saturação da transferrina', undefined, ['capacidade de ligacao do ferro', 'ctlf']],
    ['zinco', 'Zinco'],
    ['homocisteina', 'Homocisteína'],
  ]),
  ...lab('Inflamação e imunologia', [
    ['pcr', 'Proteína C reativa (PCR)', undefined, ['pcr ultrassensivel']],
    ['fator-reumatoide', 'Fator reumatoide'],
    ['fan', 'Pesquisa de fator antinúcleo (FAN)', undefined, ['antinuclear']],
    ['anti-ccp', 'Anticorpo anti-CCP'],
    ['aslo', 'Antiestreptolisina O (ASLO)'],
    ['complemento', 'Complemento C3 e C4'],
    ['ige-total', 'IgE total'],
    ['anti-transglutaminase', 'Anticorpo antitransglutaminase IgA', undefined, ['celíaca', 'doenca celiaca']],
  ]),
  ...lab('Marcadores cardíacos e tumorais', [
    ['troponina', 'Troponina'],
    ['ck-mb', 'CK-MB'],
    ['ck-total', 'Creatinofosfoquinase (CPK)', undefined, ['ck', 'cpk']],
    ['bnp', 'BNP ou NT-proBNP'],
    ['psa-total', 'PSA total', undefined, ['antigeno prostatico']],
    ['psa-livre', 'PSA livre'],
    ['cea', 'Antígeno carcinoembrionário (CEA)'],
    ['ca-125', 'CA 125'],
    ['ca-19-9', 'CA 19-9'],
    ['ca-15-3', 'CA 15-3'],
    ['afp', 'Alfafetoproteína (AFP)'],
  ]),
  ...lab('Urina', [
    ['eas', 'Urina tipo 1 (EAS)', '40311210', ['urina rotina', 'sumario de urina', 'eas']],
    ['urocultura', 'Urocultura com antibiograma', undefined, ['cultura de urina']],
    ['urina-24h', 'Proteinúria de 24 horas', undefined, ['proteinuria']],
    ['depuracao-creatinina', 'Depuração de creatinina (urina de 24 horas)', undefined, ['clearance de creatinina']],
    ['relacao-albumina-creatinina', 'Relação albumina/creatinina em amostra de urina', undefined, ['microalbuminuria']],
    ['urina-hcg', 'Teste de gravidez na urina'],
  ]),
  ...lab('Fezes', [
    ['epf', 'Exame parasitológico de fezes (EPF)', undefined, ['parasitologico', 'protoparasitologico']],
    ['sangue-oculto', 'Pesquisa de sangue oculto nas fezes'],
    ['coprocultura', 'Coprocultura'],
    ['calprotectina', 'Calprotectina fecal'],
    ['h-pylori-fezes', 'Pesquisa de antígeno de Helicobacter pylori nas fezes'],
  ]),
  ...lab('Infecções e sorologias', [
    ['hiv', 'Anti-HIV 1 e 2 (teste combinado)', undefined, ['aids']],
    ['hbsag', 'HBsAg (hepatite B)'],
    ['anti-hbs', 'Anti-HBs (imunidade para hepatite B)'],
    ['anti-hbc', 'Anti-HBc total'],
    ['anti-hcv', 'Anti-HCV (hepatite C)'],
    ['anti-hav', 'Anti-HAV IgG e IgM (hepatite A)'],
    ['vdrl', 'VDRL', undefined, ['sifilis']],
    ['fta-abs', 'FTA-ABS (sífilis)'],
    ['toxoplasmose', 'Toxoplasmose IgG e IgM'],
    ['rubeola', 'Rubéola IgG e IgM'],
    ['citomegalovirus', 'Citomegalovírus IgG e IgM'],
    ['dengue', 'Dengue (NS1 e sorologia)'],
    ['covid-antigeno', 'Pesquisa de antígeno de SARS-CoV-2'],
    ['covid-pcr', 'SARS-CoV-2 por PCR'],
    ['h-pylori-sorologia', 'Helicobacter pylori (sorologia)'],
    ['chlamydia-gonococo', 'Pesquisa de clamídia e gonococo por PCR'],
    ['hemocultura', 'Hemocultura'],
    ['cultura-garganta', 'Cultura de secreção de orofaringe'],
  ]),
  ...lab('Ginecologia e obstetrícia', [
    ['papanicolau', 'Citologia oncótica cervicovaginal (Papanicolau)', undefined, ['preventivo']],
    ['hpv-dna', 'Pesquisa de HPV (DNA-HPV)'],
    ['bacterioscopia-vaginal', 'Bacterioscopia de secreção vaginal'],
    ['cultura-secrecao-vaginal', 'Cultura de secreção vaginal'],
    ['strepto-b', 'Pesquisa de Streptococcus do grupo B (swab vaginal e anal)'],
    ['espermograma', 'Espermograma'],
  ]),
  ...img('Radiografia', [
    ['rx-torax', 'Radiografia de tórax (PA e perfil)', undefined, ['raio x torax']],
    ['rx-seios-face', 'Radiografia de seios da face'],
    ['rx-coluna-cervical', 'Radiografia de coluna cervical'],
    ['rx-coluna-toracica', 'Radiografia de coluna torácica'],
    ['rx-coluna-lombar', 'Radiografia de coluna lombossacra'],
    ['rx-bacia', 'Radiografia de bacia'],
    ['rx-ombro', 'Radiografia de ombro'],
    ['rx-joelho', 'Radiografia de joelho'],
    ['rx-quadril', 'Radiografia de quadril'],
    ['rx-mao-punho', 'Radiografia de mão e punho'],
    ['rx-pe-tornozelo', 'Radiografia de pé e tornozelo'],
    ['rx-abdome', 'Radiografia simples de abdome'],
    ['rx-escoliose', 'Radiografia de coluna total (escanograma)'],
    ['rx-idade-ossea', 'Radiografia de mão e punho para idade óssea'],
  ]),
  ...img('Ultrassonografia', [
    ['us-abdome-total', 'Ultrassonografia de abdome total', undefined, ['usg abdome', 'ecografia abdominal']],
    ['us-abdome-superior', 'Ultrassonografia de abdome superior'],
    ['us-rins-vias', 'Ultrassonografia de rins e vias urinárias'],
    ['us-pelvica', 'Ultrassonografia pélvica', undefined, ['us ginecologica']],
    ['us-transvaginal', 'Ultrassonografia transvaginal'],
    ['us-prostata', 'Ultrassonografia de próstata'],
    ['us-tireoide', 'Ultrassonografia de tireoide', undefined, ['us cervical']],
    ['us-mamas', 'Ultrassonografia de mamas'],
    ['us-obstetrica', 'Ultrassonografia obstétrica'],
    ['us-morfologica', 'Ultrassonografia morfológica'],
    ['us-translucencia', 'Ultrassonografia de translucência nucal'],
    ['us-doppler-obstetrico', 'Ultrassonografia obstétrica com Doppler'],
    ['us-doppler-carotidas', 'Ultrassonografia com Doppler de carótidas e vertebrais'],
    ['us-doppler-venoso-mmii', 'Ultrassonografia com Doppler venoso de membros inferiores'],
    ['us-doppler-arterial-mmii', 'Ultrassonografia com Doppler arterial de membros inferiores'],
    ['us-bolsa-escrotal', 'Ultrassonografia de bolsa escrotal'],
    ['us-partes-moles', 'Ultrassonografia de partes moles'],
    ['us-musculoesqueletica', 'Ultrassonografia musculoesquelética (ombro, joelho, tendões)'],
    ['us-quadril-infantil', 'Ultrassonografia de quadril infantil'],
    ['us-transfontanela', 'Ultrassonografia transfontanela'],
  ]),
  ...img('Tomografia computadorizada', [
    ['tc-cranio', 'Tomografia computadorizada de crânio'],
    ['tc-seios-face', 'Tomografia computadorizada de seios da face'],
    ['tc-pescoco', 'Tomografia computadorizada de pescoço'],
    ['tc-torax', 'Tomografia computadorizada de tórax'],
    ['tc-abdome-total', 'Tomografia computadorizada de abdome total'],
    ['tc-abdome-superior', 'Tomografia computadorizada de abdome superior'],
    ['tc-pelve', 'Tomografia computadorizada de pelve'],
    ['tc-coluna-lombar', 'Tomografia computadorizada de coluna lombar'],
    ['tc-coluna-cervical', 'Tomografia computadorizada de coluna cervical'],
    ['angiotc-torax', 'Angiotomografia de tórax'],
    ['escore-calcio', 'Tomografia para escore de cálcio coronariano'],
  ]),
  ...img('Ressonância magnética', [
    ['rm-cranio', 'Ressonância magnética de crânio'],
    ['rm-coluna-cervical', 'Ressonância magnética de coluna cervical'],
    ['rm-coluna-lombar', 'Ressonância magnética de coluna lombossacra'],
    ['rm-coluna-toracica', 'Ressonância magnética de coluna torácica'],
    ['rm-joelho', 'Ressonância magnética de joelho'],
    ['rm-ombro', 'Ressonância magnética de ombro'],
    ['rm-quadril', 'Ressonância magnética de quadril'],
    ['rm-tornozelo', 'Ressonância magnética de tornozelo'],
    ['rm-abdome', 'Ressonância magnética de abdome superior'],
    ['rm-pelve', 'Ressonância magnética de pelve'],
    ['rm-mamas', 'Ressonância magnética de mamas'],
    ['rm-articulacao-temporomandibular', 'Ressonância magnética de articulação temporomandibular'],
  ]),
  ...img('Mamografia e densitometria', [
    ['mamografia', 'Mamografia bilateral', undefined, ['mamografia digital']],
    ['densitometria', 'Densitometria óssea (coluna e fêmur)', undefined, ['dexa', 'osteoporose']],
    ['densitometria-corpo-total', 'Densitometria de corpo total (composição corporal)'],
  ]),
  ...img('Contrastados e medicina nuclear', [
    ['cintilografia-miocardica', 'Cintilografia de perfusão miocárdica'],
    ['cintilografia-tireoide', 'Cintilografia de tireoide'],
    ['cintilografia-ossea', 'Cintilografia óssea'],
    ['urografia', 'Urografia excretora'],
    ['esofagografia', 'Esofagograma (trânsito esofágico)'],
  ]),
  ...fun('Cardiologia', [
    ['ecg', 'Eletrocardiograma de repouso (ECG)', '40101010', ['eletro']],
    ['ecocardiograma', 'Ecocardiograma transtorácico com Doppler', undefined, ['eco']],
    ['teste-ergometrico', 'Teste ergométrico', undefined, ['esforco']],
    ['holter', 'Holter de 24 horas (monitorização do ritmo)'],
    ['mapa', 'Monitorização ambulatorial da pressão arterial (MAPA)'],
    ['eco-estresse', 'Ecocardiograma sob estresse'],
  ]),
  ...fun('Pulmão e sono', [
    ['espirometria', 'Espirometria com prova broncodilatadora', undefined, ['prova de funcao pulmonar']],
    ['polissonografia', 'Polissonografia', undefined, ['estudo do sono']],
    ['oximetria-noturna', 'Oximetria noturna'],
  ]),
  ...fun('Neurologia', [
    ['eeg', 'Eletroencefalograma (EEG)'],
    ['enmg', 'Eletroneuromiografia (ENMG)', undefined, ['emg']],
    ['potencial-evocado', 'Potencial evocado auditivo (BERA)', undefined, ['bera']],
  ]),
  ...fun('Digestivo', [
    ['endoscopia', 'Endoscopia digestiva alta', undefined, ['eda']],
    ['colonoscopia', 'Colonoscopia'],
    ['retossigmoidoscopia', 'Retossigmoidoscopia'],
    ['teste-respiratorio-h-pylori', 'Teste respiratório da ureia (Helicobacter pylori)'],
    ['ph-metria', 'pHmetria esofágica'],
  ]),
  ...fun('Olhos, ouvidos e garganta', [
    ['audiometria', 'Audiometria tonal e vocal'],
    ['impedanciometria', 'Impedanciometria'],
    ['nasofibroscopia', 'Nasofibrolaringoscopia'],
    ['mapeamento-retina', 'Mapeamento de retina'],
    ['tonometria', 'Tonometria (pressão intraocular)'],
    ['campimetria', 'Campimetria computadorizada'],
    ['oct-retina', 'Tomografia de coerência óptica (OCT) de retina'],
  ]),
  ...fun('Pele e outros procedimentos', [
    ['dermatoscopia', 'Dermatoscopia'],
    ['biopsia-pele', 'Biópsia de pele com exame anatomopatológico'],
    ['colposcopia', 'Colposcopia'],
    ['anatomopatologico', 'Exame anatomopatológico (peça cirúrgica ou biópsia)'],
  ]),
]

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const PORID = new Map(EXAMES_CATALOGO.map(e => [e.id, e]))
// Como a categoria é chamada no dia a dia (entra na busca de todos os exames dela).
const APELIDO_DA_CATEGORIA: Record<string, string[]> = {
  Ultrassonografia: ['ultrassom', 'usg', 'ecografia'],
  Radiografia: ['raio x', 'rx'],
  'Tomografia computadorizada': ['tomografia', 'tc'],
  'Ressonância magnética': ['ressonancia', 'rnm'],
  'Mamografia e densitometria': ['mamo'],
}

const INDICE = EXAMES_CATALOGO.map(e => ({ e, texto: norm([e.nome, e.categoria, ...(APELIDO_DA_CATEGORIA[e.categoria] ?? []), ...(e.busca ?? [])].join(' | ')) }))

export function examePorId(id: string): ExameCatalogo | undefined {
  return PORID.get(id)
}

/** Categorias de cada grupo, na ordem em que aparecem no catálogo. */
export function categoriasDoGrupo(grupo: GrupoExame | 'todos'): string[] {
  const out: string[] = []
  for (const e of EXAMES_CATALOGO) {
    if ((grupo === 'todos' || e.grupo === grupo) && !out.includes(e.categoria)) out.push(e.categoria)
  }
  return out
}

/**
 * Busca no catálogo sem acento nem maiúscula: cada palavra digitada precisa aparecer no nome, na categoria ou nos
 * nomes alternativos. Sem texto, devolve tudo do grupo/categoria (na ordem do catálogo).
 */
export function buscarExames(texto: string, filtro: { grupo?: GrupoExame | 'todos'; categoria?: string | null } = {}): ExameCatalogo[] {
  const palavras = norm(texto).split(/\s+/).filter(Boolean)
  return INDICE
    .filter(({ e, texto: t }) => {
      if (filtro.grupo && filtro.grupo !== 'todos' && e.grupo !== filtro.grupo) return false
      if (filtro.categoria && e.categoria !== filtro.categoria) return false
      return palavras.every(p => t.includes(p))
    })
    .map(x => x.e)
}
