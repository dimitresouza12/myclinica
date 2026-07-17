export const PET_SPECIES = [
  'Canino',
  'Felino',
  'Ave',
  'Roedor',
  'Coelho',
  'Réptil',
  'Equino',
  'Outro',
] as const

export type PetSpecies = typeof PET_SPECIES[number]

export const PET_BREEDS: Record<string, string[]> = {
  Canino: [
    'SRD (Vira-lata)', 'Labrador Retriever', 'Golden Retriever', 'Poodle', 'Bulldog Francês',
    'Bulldog Inglês', 'Pastor Alemão', 'Shih Tzu', 'Yorkshire Terrier', 'Pinscher',
    'Chihuahua', 'Beagle', 'Rottweiler', 'Dachshund (Salsicha)', 'Border Collie',
    'Boxer', 'Husky Siberiano', 'Maltês', 'Lhasa Apso', 'Cocker Spaniel',
    'Pug', 'Schnauzer', 'Akita', 'Dálmata', 'Pit Bull',
    'São Bernardo', 'Basset Hound', 'Weimaraner', 'Doberman', 'Fox Paulistinha',
    'Spitz Alemão (Lulu da Pomerânia)', 'Shar Pei', 'Buldogue Campeiro', 'Outra',
  ],
  Felino: [
    'SRD (Vira-lata)', 'Persa', 'Siamês', 'Maine Coon', 'Angorá',
    'Sphynx', 'British Shorthair', 'Ragdoll', 'Bengal', 'Norueguês da Floresta',
    'Munchkin', 'Exótico de Pelo Curto', 'Himalaio', 'Outra',
  ],
  Ave: [
    'Calopsita', 'Periquito Australiano', 'Papagaio', 'Canário', 'Agapornis',
    'Cacatua', 'Araruna', 'Curió', 'Coleiro', 'Outra',
  ],
  Roedor: [
    'Hamster', 'Porquinho-da-índia (Guinea Pig)', 'Chinchila', 'Rato', 'Gerbil',
    'Outra',
  ],
  Coelho: [
    'Mini Lop', 'Holandês', 'Angorá', 'Rex', 'Fuzzy Lop', 'Outra',
  ],
  Réptil: [
    'Iguana', 'Jabuti', 'Tartaruga', 'Jiboia', 'Cágado', 'Lagarto', 'Outra',
  ],
  Equino: [
    'Puro Sangue Inglês', 'Mangalarga Marchador', 'Quarto de Milha', 'Crioulo',
    'Campolina', 'Árabe', 'Outra',
  ],
  Outro: [],
}

/** Campos extras de anamnese, somados aos campos gerais de "vet", conforme a espécie selecionada. */
export const VET_ANAMNESIS_EXTRA_BY_SPECIES: Record<string, [string, string][]> = {
  Ave: [
    ['a-gaiola', 'Tipo de gaiola/viveiro e enriquecimento ambiental'],
    ['a-luz_solar', 'Exposição à luz solar / UV'],
  ],
  Réptil: [
    ['a-terrario', 'Temperatura e umidade do terrário'],
    ['a-aquecimento', 'Fonte de aquecimento / UVB'],
  ],
  Equino: [
    ['a-manejo', 'Manejo (baia, piquete, uso — lazer, esporte, trabalho)'],
    ['a-casco', 'Ferrageamento e casco'],
  ],
  Roedor: [
    ['a-gaiola_ambiente', 'Tipo de gaiola/ambiente e substrato'],
  ],
  Coelho: [
    ['a-gaiola_ambiente', 'Tipo de gaiola/ambiente e substrato'],
  ],
}

/** Campos extras de exame clínico, somados aos campos gerais de "vet", conforme a espécie selecionada. */
export const VET_EXAM_EXTRA_BY_SPECIES: Record<string, [string, string][]> = {
  Ave: [
    ['e-plumagem', 'Estado da plumagem / Muda'],
    ['e-postura_voc', 'Postura e vocalização'],
    ['e-cloaca', 'Cloaca (aspecto)'],
  ],
  Réptil: [
    ['e-muda_pele', 'Muda de pele'],
    ['e-cav_oral', 'Cavidade oral e conjuntiva'],
    ['e-temp_pref', 'Temperatura corporal preferencial (comportamento)'],
  ],
  Equino: [
    ['e-claudicacao', 'Claudicação / Aparelho locomotor'],
    ['e-tpc', 'Tempo de preenchimento capilar (TPC)'],
    ['e-motilidade', 'Ausculta intestinal (motilidade)'],
  ],
  Roedor: [
    ['e-denticao', 'Dentição (incisivos/molares)'],
    ['e-pelagem', 'Pelagem e pele'],
  ],
  Coelho: [
    ['e-denticao', 'Dentição (incisivos/molares)'],
    ['e-pelagem', 'Pelagem e pele'],
  ],
}
