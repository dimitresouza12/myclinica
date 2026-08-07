/** Campos extras de anamnese/exame, somados por cima da ficha base de
 *  `medico` (specialtyConfig.tsx), conforme a sub-especialidade do
 *  profissional (professionals.specialty — texto livre, sugerido pela
 *  lista `professionalSpecialties.medico`). Mesmo padrão de
 *  vetSpecies.ts (extras por espécie do pet), aqui chaveado pela
 *  sub-área médica em vez da espécie.
 *
 *  Cobertura: só as sub-especialidades mais comuns em clínica
 *  multiprofissional (Bloco F). `Clínico Geral` e qualquer sub-área fora
 *  desta lista ficam só com a ficha base — igual `vet` hoje pra espécie
 *  não mapeada. */
export const MEDICO_ANAMNESIS_EXTRA_BY_SPECIALTY: Record<string, [string, string][]> = {
  Cardiologia: [
    ['a-fatores_risco_cv', 'Fatores de risco cardiovascular (tabagismo, sedentarismo, dislipidemia)'],
    ['a-eventos_cardiacos', 'Histórico de eventos cardíacos (infarto, AVC, arritmia)'],
    ['a-exames_previos', 'ECG / exames cardiológicos prévios'],
  ],
  Pediatria: [
    ['a-gestacao_parto', 'Gestação e parto (tipo, intercorrências)'],
    ['a-aleitamento', 'Aleitamento e alimentação'],
    ['a-calendario_vacinal', 'Calendário vacinal'],
    ['a-marcos_dev', 'Marcos do desenvolvimento'],
  ],
  Psiquiatria: [
    ['a-hist_pessoal', 'Histórico pessoal relevante (infância, traumas, perdas)'],
    ['a-trat_anteriores', 'Tratamentos psiquiátricos ou psicológicos anteriores'],
    ['a-substancias', 'Uso de álcool, tabaco ou outras substâncias'],
    ['a-risco', 'Triagem de risco (ideação suicida / autolesão)'],
  ],
  Ginecologia: [
    ['a-dum', 'Data da última menstruação (DUM)'],
    ['a-hist_obstetrico', 'Histórico obstétrico (gestações, partos, abortos)'],
    ['a-metodo_contraceptivo', 'Método contraceptivo em uso'],
    ['a-ultimo_preventivo', 'Último exame preventivo (Papanicolau)'],
  ],
  Ortopedia: [
    ['a-mecanismo_trauma', 'Mecanismo de trauma (se houver)'],
    ['a-regiao_acometida', 'Região acometida'],
  ],
  Dermatologia: [
    ['a-fototipo', 'Fototipo (Fitzpatrick I–VI)'],
    ['a-hist_cancer_pele', 'Histórico de câncer de pele (pessoal ou familiar)'],
    ['a-exposicao_solar', 'Exposição solar (uso de protetor solar)'],
  ],
  Endocrinologia: [
    ['a-hist_familiar_endocrino', 'Histórico familiar endócrino'],
    ['a-diabetes_tireoide', 'Diabetes ou doença de tireoide prévios'],
    ['a-uso_hormonios', 'Uso de hormônios'],
  ],
  Oftalmologia: [
    ['a-cirurgia_ocular', 'Histórico de cirurgia ocular'],
    ['a-oculos_lentes', 'Uso de óculos / lentes de contato'],
    ['a-doencas_oculares_familia', 'Doenças oculares na família'],
  ],
  Otorrinolaringologia: [
    ['a-otite_sinusite', 'Histórico de otite / sinusite'],
    ['a-exposicao_ruido', 'Exposição a ruído'],
    ['a-alergias_respiratorias', 'Alergias respiratórias'],
  ],
  Neurologia: [
    ['a-cefaleia', 'Cefaleia (padrão, frequência)'],
    ['a-convulsao_avc', 'Histórico de convulsão / AVC'],
    ['a-alt_forca_sensibilidade', 'Alterações de força ou sensibilidade'],
  ],
  Urologia: [
    ['a-sintomas_urinarios', 'Sintomas urinários (frequência, urgência, jato)'],
    ['a-hist_calculo_renal', 'Histórico de cálculo renal'],
  ],
}

/** Opções mostradas na pergunta "em qual área da medicina você atua?"
 *  (cadastro e quiz) — só as sub-especialidades com ficha extra mapeada
 *  acima, mais "Clínico Geral" e "Outra". A lista completa e mais ampla
 *  de `professionalSpecialties.medico` (specialtyConfig.tsx) continua
 *  existindo só para o autocomplete de Equipe. */
export const MEDICO_AREA_OPTIONS = ['Clínico Geral', ...Object.keys(MEDICO_ANAMNESIS_EXTRA_BY_SPECIALTY), 'Outra']

export const MEDICO_EXAM_EXTRA_BY_SPECIALTY: Record<string, [string, string][]> = {
  Cardiologia: [
    ['e-ausculta_detalhada', 'Ausculta detalhada (sopros, ritmo)'],
    ['e-pulsos_perifericos', 'Pulsos periféricos'],
    ['e-edema_mmii', 'Edema de membros inferiores'],
  ],
  Pediatria: [
    ['e-peso_altura_pc', 'Peso / Altura / Perímetro cefálico (percentil)'],
    ['e-reflexos', 'Reflexos'],
    ['e-dnpm', 'Desenvolvimento neuropsicomotor'],
  ],
  Psiquiatria: [
    ['e-humor', 'Humor e afeto'],
    ['e-pensamento', 'Curso e conteúdo do pensamento'],
    ['e-percepcao', 'Percepção (alucinações, ilusões)'],
    ['e-risco', 'Triagem de risco'],
  ],
  Ginecologia: [
    ['e-exame_ginecologico', 'Exame ginecológico'],
    ['e-mamas', 'Exame das mamas'],
  ],
  Ortopedia: [
    ['e-adm', 'ADM — Amplitude de Movimento'],
    ['e-forca_muscular', 'Força muscular (escala 0–5)'],
    ['e-testes_especiais', 'Testes especiais'],
  ],
  Dermatologia: [
    ['e-lesao', 'Lesão (tipo, localização, tamanho)'],
    ['e-dermatoscopia', 'Dermatoscopia'],
  ],
  Endocrinologia: [
    ['e-glicemia', 'Glicemia'],
    ['e-hba1c', 'HbA1c'],
    ['e-palpacao_tireoide', 'Palpação de tireoide'],
    ['e-imc_circ_abdominal', 'IMC / Circunferência abdominal'],
  ],
  Oftalmologia: [
    ['e-acuidade_visual', 'Acuidade visual'],
    ['e-pressao_intraocular', 'Pressão intraocular'],
    ['e-fundo_olho', 'Fundo de olho'],
  ],
  Otorrinolaringologia: [
    ['e-otoscopia', 'Otoscopia'],
    ['e-rinoscopia', 'Rinoscopia'],
    ['e-orofaringe', 'Orofaringe'],
  ],
  Neurologia: [
    ['e-forca_muscular', 'Força muscular'],
    ['e-reflexos', 'Reflexos'],
    ['e-coordenacao', 'Coordenação'],
    ['e-marcha', 'Marcha'],
    ['e-pares_cranianos', 'Pares cranianos'],
  ],
  Urologia: [
    ['e-toque_retal', 'Toque retal (quando aplicável)'],
    ['e-exame_urologico', 'Exame urológico'],
    ['e-psa', 'PSA (se houver)'],
  ],
}
