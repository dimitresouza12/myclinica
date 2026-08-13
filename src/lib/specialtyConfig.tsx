import type { ReactNode } from 'react'
import type { ClinicType, DocumentTemplateType, UserRole } from '@/types'

interface RoleOption {
  value: UserRole
  label: string
}

interface DocTypeOption {
  type: DocumentTemplateType
  label: string
  title: string
}

interface ProcedureSuggestion {
  name: string
  category: string
}

// Abas extras do prontuário que só fazem sentido pra certas áreas
// (odontograma pra odonto/estética, faceograma/corpograma pra estética).
export type RecordTab = 'odontograma' | 'faceograma' | 'corpograma'

interface SpecialtyConfig {
  roles: RoleOption[]
  documents: DocTypeOption[]
  stockCategories: string[]
  financeCategoriasReceita: string[]
  financeCategoriasDespesa: string[]
  defaultDurationMinutes: number
  professionalSpecialties: string[]
  // Categorias de procedimento (tela Procedimentos) e sugestões de nome
  // pra semear a clínica no cadastro / autocompletar ao criar um novo.
  procedureCategories: string[]
  procedureSuggestions: ProcedureSuggestion[]
  // Campos de Anamnese e Exame Clínico da ficha do paciente — cada item é
  // [chave, rótulo]. Ver Bloco B (specialtyConfig.tsx) sobre por que isso
  // não é fundido em clínica multi-área: cada profissional vê só a ficha
  // da sua própria área, não uma união de campos de todas.
  anamnesisFields: [string, string][]
  clinicalExamFields: [string, string][]
  recordTabs: RecordTab[]
  // Ícone (glifo preenchido, currentColor) + cor "R,G,B" usados no seletor
  // de área do cadastro/quiz — um badge tonal por área.
  icon: ReactNode
  color: string
}

const BASE_ROLES: RoleOption[] = [
  { value: 'recepcao', label: 'Recepção' },
  { value: 'auxiliar', label: 'Auxiliar' },
]
const ADMIN_ROLE: RoleOption = { value: 'admin', label: 'Admin (acesso total)' }

// Os tipos de documento existem como slot fixo no banco (clinic_document_templates.type
// tem CHECK constraint pros valores possíveis — hoje 5, ver Especialidades Bloco A).
// Cada especialidade escolhe só os que fazem sentido pro seu conselho profissional
// emitir, com rótulo e título de impressão corretos — evita, por ex., um psicólogo
// (que não pode prescrever medicamento) ver "RECEITA MÉDICA".
const DOC_RECEITA_COMUM_MEDICO: DocTypeOption = { type: 'receita_comum', label: 'Receita Comum', title: 'RECEITA MÉDICA' }
const DOC_RECEITA_ESPECIAL_MEDICO: DocTypeOption = { type: 'receita_especial', label: 'Receita Especial', title: 'RECEITA DE CONTROLE ESPECIAL' }
const DOC_DECLARACAO: DocTypeOption = { type: 'declaracao_comparecimento', label: 'Declaração de Comparecimento', title: 'DECLARAÇÃO DE COMPARECIMENTO' }
// Laudo: pensado pro ultrassonografista e qualquer área que emita laudo de
// exame (não é receita nem atestado) — segue o mesmo modelo de upload/edição
// dos outros tipos, sem geração automática a partir da ficha.
const DOC_LAUDO: DocTypeOption = { type: 'laudo', label: 'Laudo', title: 'LAUDO' }

export const SPECIALTY_CONFIG: Record<ClinicType, SpecialtyConfig> = {
  odonto: {
    roles: [...BASE_ROLES, { value: 'dentista', label: 'Dentista' }, ADMIN_ROLE],
    documents: [
      { type: 'receita_comum', label: 'Receita Comum', title: 'RECEITA ODONTOLÓGICA' },
      { type: 'receita_especial', label: 'Receita Especial', title: 'RECEITA DE CONTROLE ESPECIAL' },
      DOC_DECLARACAO,
      { type: 'atestado', label: 'Atestado', title: 'ATESTADO ODONTOLÓGICO' },
    ],
    stockCategories: ['material', 'medicamento', 'descartavel', 'equipamento', 'outro'],
    financeCategoriasReceita: ['Consulta', 'Procedimento', 'Exame', 'Plano', 'Outros'],
    financeCategoriasDespesa: ['Material', 'Salário', 'Aluguel', 'Equipamento', 'Marketing', 'Outros'],
    defaultDurationMinutes: 40,
    professionalSpecialties: [
      'Clínico Geral', 'Ortodontia', 'Endodontia', 'Periodontia', 'Implantodontia', 'Odontopediatria',
      'Cirurgia Bucomaxilofacial', 'Prótese Dentária', 'Harmonização Orofacial', 'Dentística', 'Estomatologia',
      'DTM e Dor Orofacial', 'Odontologia do Sono', 'Radiologia Odontológica', 'Odontogeriatria',
    ],
    procedureCategories: ['Consulta', 'Cirurgia', 'Exame', 'Estética', 'Ortodontia', 'Endodontia', 'Periodontia', 'Prótese', 'Radiologia', 'Outros'],
    procedureSuggestions: [
      // Avaliação separada da Consulta de propósito: muita clínica de odonto
      // faz avaliação gratuita e cobra a consulta (ou vice-versa) — deixar
      // as duas como itens distintos permite precificar cada uma do seu jeito.
      { name: 'Consulta',                    category: 'Consulta' },
      { name: 'Avaliação',                   category: 'Consulta' },
      { name: 'Limpeza (Profilaxia)',        category: 'Consulta' },
      { name: 'Restauração',                 category: 'Outros' },
      { name: 'Extração Simples',            category: 'Cirurgia' },
      { name: 'Extração de Siso',            category: 'Cirurgia' },
      { name: 'Clareamento Dental',          category: 'Estética' },
      { name: 'Canal (Endodontia)',          category: 'Endodontia' },
      { name: 'Aparelho Ortodôntico',        category: 'Ortodontia' },
      { name: 'Manutenção de Aparelho',      category: 'Ortodontia' },
      { name: 'Prótese Dentária',            category: 'Prótese' },
      { name: 'Raspagem (Periodontia)',      category: 'Periodontia' },
      { name: 'Radiografia',                 category: 'Radiologia' },
      { name: 'Facetas',                     category: 'Estética' },
      { name: 'Bichectomia',                 category: 'Cirurgia' },
      { name: 'Gengivoplastia e Gengivectomia', category: 'Periodontia' },
    ],
    anamnesisFields: [
      ['a-queixa', 'Queixa principal / Motivo da consulta'],
      ['a-saude', 'Estado geral de saúde'],
      ['a-tratamento', 'Em tratamento médico? Qual?'],
      ['a-medicamentos', 'Medicamentos em uso'],
      ['a-alergia', 'Alergias (medicamentos, látex, anestésicos)'],
      ['a-pressao', 'Pressão arterial / Cardiopatias'],
      ['a-fumante', 'Fumante / Álcool'],
      ['a-gengiva', 'Sangramento gengival / Dor dentária'],
      ['a-hist_odonto', 'Histórico odontológico (última consulta, prótese, implante)'],
      ['a-bruxismo', 'Bruxismo / Ranger de dentes'],
      ['a-habitos', 'Hábitos bucais (chupar dedo, morder objetos)'],
    ],
    clinicalExamFields: [
      ['e-higiene', 'Higiene bucal (placa, tártaro)'],
      ['e-halitose', 'Halitose'],
      ['e-mucosa', 'Mucosa oral (cor, lesões, úlceras)'],
      ['e-palato', 'Palato / Língua / Assoalho bucal'],
      ['e-oclusao', 'Oclusão / Articulação temporomandibular (ATM)'],
      ['e-mobilidade', 'Mobilidade dentária'],
      ['e-sondagem', 'Profundidade de sondagem / Sangramento à sondagem'],
      ['e-dor', 'Dor à percussão / Sensibilidade ao frio/calor'],
      ['e-hipotese', 'Hipótese diagnóstica / Plano radiográfico'],
      ['e-obs', 'Observações gerais'],
    ],
    recordTabs: ['odontograma', 'faceograma'],
    color: '37,99,235',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c-2 0-3.5.9-4.6.9C5.6 3.9 4 5 4 7.4c0 1.7.4 2.7.9 4 .3.9.6 2 .7 3.4.2 2.7.6 6.2 3 6.2 1.9 0 2.2-1.8 2.5-3.6.2-1.1.3-2.2 1-2.2s.8 1.1 1 2.2c.3 1.8.6 3.6 2.5 3.6 2.4 0 2.8-3.5 3-6.2.1-1.4.4-2.5.7-3.4.5-1.3.9-2.3.9-4 0-2.4-1.6-3.5-3.4-3.5C15.5 3.9 14 3 12 3z"/></svg>
    ),
  },
  medico: {
    roles: [...BASE_ROLES, { value: 'medico', label: 'Médico' }, ADMIN_ROLE],
    documents: [DOC_RECEITA_COMUM_MEDICO, DOC_RECEITA_ESPECIAL_MEDICO, DOC_DECLARACAO, { type: 'atestado', label: 'Atestado', title: 'ATESTADO MÉDICO' }, DOC_LAUDO],
    stockCategories: ['material', 'medicamento', 'descartavel', 'equipamento', 'outro'],
    financeCategoriasReceita: ['Consulta', 'Procedimento', 'Exame', 'Plano', 'Outros'],
    financeCategoriasDespesa: ['Material', 'Salário', 'Aluguel', 'Equipamento', 'Marketing', 'Outros'],
    defaultDurationMinutes: 30,
    professionalSpecialties: [
      'Clínico Geral', 'Cardiologia', 'Dermatologia', 'Ginecologia', 'Pediatria', 'Ortopedia', 'Psiquiatria', 'Endocrinologia',
      'Oftalmologia', 'Otorrinolaringologia', 'Neurologia', 'Urologia', 'Gastroenterologia', 'Pneumologia', 'Reumatologia',
      'Geriatria', 'Nefrologia', 'Infectologia', 'Angiologia', 'Mastologia', 'Nutrologia', 'Medicina do Trabalho', 'Medicina Esportiva',
      'Radiologia / Ultrassonografia',
    ],
    procedureCategories: ['Consulta', 'Exame', 'Cirurgia', 'Procedimento', 'Vacinação', 'Radiologia', 'Outros'],
    procedureSuggestions: [
      { name: 'Consulta Médica',             category: 'Consulta' },
      { name: 'Retorno',                     category: 'Consulta' },
      { name: 'Exame de Rotina',             category: 'Exame' },
      { name: 'Eletrocardiograma',           category: 'Exame' },
      { name: 'Pequena Cirurgia',            category: 'Cirurgia' },
      { name: 'Sutura',                      category: 'Procedimento' },
      { name: 'Aplicação de Vacina',         category: 'Vacinação' },
      { name: 'Curativo',                    category: 'Procedimento' },
      { name: 'Ultrassonografia Abdominal Total',    category: 'Radiologia' },
      { name: 'Ultrassonografia Abdominal Superior', category: 'Radiologia' },
      { name: 'Ultrassonografia de Rins e Vias Urinárias', category: 'Radiologia' },
      { name: 'Ultrassonografia Transvaginal',       category: 'Radiologia' },
      { name: 'Ultrassonografia de Próstata (via Abdominal)', category: 'Radiologia' },
      { name: 'Ultrassonografia de Próstata (via Transretal)', category: 'Radiologia' },
      { name: 'Ultrassonografia de Tireoide',        category: 'Radiologia' },
      { name: 'Ultrassonografia de Mamas',           category: 'Radiologia' },
      { name: 'Ultrassonografia Obstétrica',         category: 'Radiologia' },
      { name: 'Ultrassonografia Morfológica',        category: 'Radiologia' },
      { name: 'Ultrassonografia de Translucência Nucal', category: 'Radiologia' },
      { name: 'Ultrassonografia de Articulações',    category: 'Radiologia' },
      { name: 'Ultrassonografia de Parede Abdominal', category: 'Radiologia' },
      { name: 'Ultrassonografia de Região Inguinal (Unilateral)', category: 'Radiologia' },
      { name: 'Ultrassonografia de Região Inguinal (Bilateral)', category: 'Radiologia' },
      { name: 'Vídeo Colposcopia',           category: 'Exame' },
      { name: 'Biópsia de Colo do Útero',    category: 'Procedimento' },
      { name: 'CAF (Cirurgia de Alta Frequência)', category: 'Cirurgia' },
      { name: 'Cirurgia Ginecológica',       category: 'Cirurgia' },
      { name: 'Consulta de Pré-Natal',       category: 'Consulta' },
      { name: 'Parto Normal',                category: 'Procedimento' },
      { name: 'Parto Cesária',               category: 'Cirurgia' },
    ],
    anamnesisFields: [
      ['a-motivo', 'Queixa principal / Motivo da consulta'],
      ['a-hist_doenca', 'História da doença atual (início, evolução, intensidade)'],
      ['a-comorbidades', 'Comorbidades (Diabetes, HAS, Cardiopatia, etc.)'],
      ['a-hist_familiar', 'Histórico familiar de doenças relevantes'],
      ['a-cirurgias', 'Cirurgias / Internações anteriores'],
      ['a-medicamentos', 'Medicamentos em uso'],
      ['a-alergia', 'Alergias (medicamentos, alimentos, outros)'],
      ['a-habitos', 'Hábitos de vida (Fumo / Álcool / Atividade física)'],
      ['a-sono', 'Qualidade do sono'],
      ['a-sintomas', 'Sintomas associados (febre, dor, náusea, etc.)'],
    ],
    clinicalExamFields: [
      ['e-pressao', 'Pressão Arterial (mmHg)'],
      ['e-fc', 'Frequência Cardíaca (bpm)'],
      ['e-fr', 'Frequência Respiratória (irpm)'],
      ['e-temp', 'Temperatura (°C)'],
      ['e-spo2', 'Saturação O₂ (%)'],
      ['e-glicemia', 'Glicemia capilar (mg/dL)'],
      ['e-antropometria', 'Peso / Altura / IMC'],
      ['e-ausculta', 'Ausculta Cardíaca / Pulmonar'],
      ['e-exame_fisico', 'Exame físico específico (região de queixa)'],
      ['e-hipotese', 'Hipótese diagnóstica (CID)'],
      ['e-conduta', 'Conduta / Solicitação de exames'],
      ['e-obs', 'Observações gerais'],
    ],
    recordTabs: [],
    color: '220,38,38',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor"><rect x="10" y="3" width="4" height="18" rx="1.4"/><rect x="3" y="10" width="18" height="4" rx="1.4"/></svg>
    ),
  },
  estetica: {
    roles: [...BASE_ROLES, { value: 'profissional', label: 'Esteticista' }, ADMIN_ROLE],
    documents: [
      { type: 'receita_comum', label: 'Receita', title: 'RECEITA' },
      DOC_RECEITA_ESPECIAL_MEDICO,
      DOC_DECLARACAO,
      { type: 'atestado', label: 'Atestado', title: 'ATESTADO' },
      DOC_LAUDO,
    ],
    stockCategories: ['cosmetico', 'injetavel', 'descartavel', 'equipamento', 'outro'],
    financeCategoriasReceita: ['Consulta', 'Procedimento Estético', 'Pacote', 'Plano', 'Outros'],
    financeCategoriasDespesa: ['Material', 'Salário', 'Aluguel', 'Equipamento', 'Marketing', 'Outros'],
    defaultDurationMinutes: 60,
    professionalSpecialties: ['Esteticista', 'Biomedicina Estética', 'Dermatologia', 'Cosmetologia', 'Estética Corporal', 'Massoterapia', 'Fisioterapia Dermato Funcional'],
    procedureCategories: ['Consulta', 'Limpeza de Pele', 'Peeling', 'Botox', 'Preenchimento', 'Laser', 'Massagem', 'Corporal', 'Outros'],
    procedureSuggestions: [
      { name: 'Avaliação Estética',          category: 'Consulta' },
      { name: 'Limpeza de Pele',             category: 'Limpeza de Pele' },
      { name: 'Peeling Químico',             category: 'Peeling' },
      { name: 'Botox',                       category: 'Botox' },
      { name: 'Preenchimento Facial',        category: 'Preenchimento' },
      { name: 'Depilação a Laser',           category: 'Laser' },
      { name: 'Massagem Modeladora',         category: 'Massagem' },
      { name: 'Drenagem Linfática',          category: 'Corporal' },
      { name: 'Criolipólise',                category: 'Corporal' },
      { name: 'Radiofrequência Corporal',    category: 'Corporal' },
      { name: 'Massagem Redutora',           category: 'Corporal' },
      { name: 'Carboxiterapia',              category: 'Corporal' },
      { name: 'Microagulhamento',            category: 'Outros' },
      { name: 'Lipo Enzimática',             category: 'Corporal' },
      { name: 'Retirada de Sinais',          category: 'Outros' },
      { name: 'Rejuvenescimento Facial',     category: 'Outros' },
      { name: 'Protocolo de Emagrecimento',  category: 'Corporal' },
    ],
    anamnesisFields: [
      ['a-queixa', 'Queixa principal / Região de interesse'],
      ['a-expectativa', 'Expectativas com o tratamento'],
      ['a-trat_anteriores', 'Tratamentos estéticos anteriores'],
      ['a-cosmeticos', 'Uso de cosméticos / Ácidos / Retinol'],
      ['a-isotretinoina', 'Uso de isotretinoína (últimos 6 meses?)'],
      ['a-anticoagulantes', 'Uso de anticoagulantes / AAS'],
      ['a-exposicao_solar', 'Exposição solar (usa protetor solar?)'],
      ['a-alergia', 'Alergias (cosméticos, anestésicos, látex)'],
      ['a-queloides', 'Histórico de queloides / Cicatrização ruim'],
      ['a-gestante', 'Gestante / Lactante?'],
      ['a-doencas', 'Doenças de pele (rosácea, psoríase, dermatite)'],
      ['a-cirurgia_plastica', 'Cirurgia plástica anterior (qual, quando)'],
      ['a-atividade_fisica', 'Prática de atividade física (tipo, frequência)'],
      ['a-retencao_liquido', 'Retenção de líquido / Inchaço'],
    ],
    clinicalExamFields: [
      ['e-tipo_pele', 'Tipo de pele (Normal, Seca, Oleosa, Mista)'],
      ['e-fototipo', 'Fototipo (Fitzpatrick I–VI)'],
      ['e-hidratacao', 'Grau de hidratação'],
      ['e-regiao', 'Região de interesse / Área a tratar'],
      ['e-manchas', 'Manchas / Melasma / Hiperpigmentação'],
      ['e-flacidez', 'Grau de flacidez / Celulite'],
      ['e-lesoes', 'Lesões visíveis (acne, rosácea, cicatrizes)'],
      ['e-medidas_corporais', 'Medidas corporais (busto / cintura / quadril)'],
      ['e-grau_celulite', 'Grau de celulite (escala 1-4)'],
      ['e-gordura_localizada', 'Distribuição de gordura localizada'],
      ['e-procedimento', 'Procedimento proposto / Protocolo'],
      ['e-contraindicacoes', 'Contraindicações identificadas'],
      ['e-obs', 'Observações gerais'],
    ],
    recordTabs: ['odontograma', 'faceograma', 'corpograma'],
    color: '219,39,119',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 6.6L20.5 10l-6.6 1.9L12 18.5l-1.9-6.6L3.5 10l6.6-1.9L12 2z"/></svg>
    ),
  },
  vet: {
    roles: [...BASE_ROLES, { value: 'profissional', label: 'Veterinário(a)' }, ADMIN_ROLE],
    documents: [
      { type: 'receita_comum', label: 'Receita Veterinária', title: 'RECEITA VETERINÁRIA' },
      { type: 'receita_especial', label: 'Receita de Controle Especial', title: 'RECEITA VETERINÁRIA DE CONTROLE ESPECIAL' },
      DOC_DECLARACAO,
      { type: 'atestado', label: 'Atestado', title: 'ATESTADO VETERINÁRIO' },
    ],
    stockCategories: ['medicamento', 'racao', 'vacina', 'descartavel', 'equipamento', 'outro'],
    financeCategoriasReceita: ['Consulta', 'Procedimento', 'Vacinação', 'Banho & Tosa', 'Exame', 'Outros'],
    financeCategoriasDespesa: ['Material', 'Ração/Insumos', 'Salário', 'Aluguel', 'Equipamento', 'Marketing', 'Outros'],
    defaultDurationMinutes: 30,
    professionalSpecialties: ['Clínico Geral', 'Cirurgia', 'Dermatologia Veterinária', 'Cardiologia Veterinária', 'Odontologia Veterinária'],
    procedureCategories: ['Consulta', 'Cirurgia', 'Vacinação', 'Exame', 'Banho & Tosa', 'Radiologia', 'Outros'],
    procedureSuggestions: [
      { name: 'Consulta Veterinária',        category: 'Consulta' },
      { name: 'Vacinação',                   category: 'Vacinação' },
      { name: 'Castração',                   category: 'Cirurgia' },
      { name: 'Banho e Tosa',                category: 'Banho & Tosa' },
      { name: 'Exame de Sangue',             category: 'Exame' },
      { name: 'Vermifugação',                category: 'Consulta' },
      { name: 'Radiografia',                 category: 'Radiologia' },
      { name: 'Aplicação de Microchip',      category: 'Outros' },
    ],
    anamnesisFields: [
      ['a-queixa', 'Motivo da consulta / Queixa principal'],
      ['a-alimentacao', 'Alimentação / Dieta (tipo, frequência, marca)'],
      ['a-ambiente', 'Ambiente onde vive (interno / externo)'],
      ['a-hist_doencas', 'Histórico de doenças / Cirurgias anteriores'],
      ['a-vacinas', 'Vacinação e vermifugação em dia?'],
      ['a-reproducao', 'Histórico reprodutivo (fêmeas: gestações, cio)'],
      ['a-medicamentos', 'Medicamentos em uso'],
      ['a-alergia', 'Alergias conhecidas'],
      ['a-contato', 'Contato com outros animais'],
    ],
    clinicalExamFields: [
      ['e-temperatura', 'Temperatura retal (°C)'],
      ['e-mucosas', 'Mucosas (cor, TPC)'],
      ['e-hidratacao', 'Grau de desidratação'],
      ['e-fc', 'Frequência Cardíaca (bpm)'],
      ['e-fr', 'Frequência Respiratória (mpm)'],
      ['e-linfonodos', 'Linfonodos (tamanho, consistência)'],
      ['e-peso', 'Peso (kg) / Escore corporal'],
      ['e-ausculta', 'Ausculta cardíaca / Pulmonar'],
      ['e-abd', 'Palpação abdominal'],
      ['e-hipotese', 'Hipótese diagnóstica / Exames solicitados'],
      ['e-obs', 'Observações gerais'],
    ],
    recordTabs: [],
    color: '180,83,9',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6.8" cy="9.3" r="2.1"/><circle cx="12" cy="6.6" r="2.1"/><circle cx="17.2" cy="9.3" r="2.1"/><path d="M12 12c-3.1 0-5.6 2.3-5.6 5 0 1.7 1.3 2.7 3 2.7.9 0 1.7-.3 2.6-.3s1.7.3 2.6.3c1.7 0 3-1 3-2.7 0-2.7-2.5-5-5.6-5z"/></svg>
    ),
  },
  fisio: {
    roles: [...BASE_ROLES, { value: 'profissional', label: 'Fisioterapeuta' }, ADMIN_ROLE],
    documents: [
      DOC_DECLARACAO,
      { type: 'atestado', label: 'Atestado', title: 'ATESTADO FISIOTERAPÊUTICO' },
    ],
    stockCategories: ['material', 'equipamento', 'descartavel', 'outro'],
    financeCategoriasReceita: ['Sessão', 'Avaliação', 'Pacote', 'Plano', 'Outros'],
    financeCategoriasDespesa: ['Material', 'Salário', 'Aluguel', 'Equipamento', 'Marketing', 'Outros'],
    defaultDurationMinutes: 50,
    professionalSpecialties: ['Ortopédica', 'Neurológica', 'Respiratória', 'Esportiva', 'RPG', 'Pilates'],
    procedureCategories: ['Consulta', 'Avaliação', 'Eletroterapia', 'Massagem', 'Pilates', 'Hidroterapia', 'Outros'],
    procedureSuggestions: [
      { name: 'Avaliação Fisioterapêutica',  category: 'Avaliação' },
      { name: 'Sessão de Fisioterapia',      category: 'Consulta' },
      { name: 'Eletroterapia',               category: 'Eletroterapia' },
      { name: 'Pilates Terapêutico',         category: 'Pilates' },
      { name: 'RPG',                         category: 'Outros' },
      { name: 'Massoterapia',                category: 'Massagem' },
      { name: 'Hidroterapia',                category: 'Hidroterapia' },
    ],
    anamnesisFields: [
      ['a-queixa', 'Queixa principal'],
      ['a-diagnostico', 'Diagnóstico médico / Encaminhamento'],
      ['a-regiao', 'Região acometida'],
      ['a-inicio', 'Início e causa (trauma, postura, esforço, cirurgia)'],
      ['a-dor', 'Intensidade da dor (0–10) e tipo (queimação, pontada, etc.)'],
      ['a-fatores', 'Fatores que pioram / melhoram'],
      ['a-cirurgias', 'Cirurgias ou fraturas anteriores'],
      ['a-comorbidades', 'Comorbidades (Diabetes, HAS, Osteoporose, etc.)'],
      ['a-medicamentos', 'Medicamentos em uso'],
      ['a-exames', 'Exames de imagem disponíveis (RX, RM, USG)'],
      ['a-sessoes', 'Número de sessões previstas / Frequência'],
      ['a-alergia', 'Alergias'],
    ],
    clinicalExamFields: [
      ['e-postura', 'Avaliação postural (anteriorização, escoliose, etc.)'],
      ['e-adm', 'ADM — Amplitude de Movimento (graus)'],
      ['e-forca', 'Força muscular (escala 0–5)'],
      ['e-sensibilidade', 'Sensibilidade / Parestesia / Dormência'],
      ['e-testes', 'Testes especiais (Lasègue, Phalen, Ortolani, etc.)'],
      ['e-palpacao', 'Dor à palpação / Pontos-gatilho'],
      ['e-edema', 'Edema / Inflamação / Temperatura local'],
      ['e-marcha', 'Avaliação de marcha / Equilíbrio'],
      ['e-hipotese', 'Diagnóstico fisioterapêutico'],
      ['e-obs', 'Observações gerais'],
    ],
    recordTabs: [],
    color: '234,88,12',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor"><rect x="1" y="9.5" width="3" height="5" rx="1.2"/><rect x="20" y="9.5" width="3" height="5" rx="1.2"/><rect x="4.3" y="7.5" width="2.6" height="9" rx="1.2"/><rect x="17.1" y="7.5" width="2.6" height="9" rx="1.2"/><rect x="6.7" y="11" width="10.6" height="2" rx="1"/></svg>
    ),
  },
  psico: {
    roles: [...BASE_ROLES, { value: 'profissional', label: 'Psicólogo(a)' }, ADMIN_ROLE],
    documents: [
      DOC_DECLARACAO,
      { type: 'atestado', label: 'Atestado', title: 'ATESTADO PSICOLÓGICO' },
    ],
    stockCategories: ['material', 'outro'],
    financeCategoriasReceita: ['Sessão', 'Avaliação Psicológica', 'Terapia de Casal', 'Pacote', 'Outros'],
    financeCategoriasDespesa: ['Material', 'Salário', 'Aluguel', 'Marketing', 'Outros'],
    defaultDurationMinutes: 50,
    professionalSpecialties: ['Clínica', 'TCC', 'Psicanálise', 'Infantil', 'Casal e Família', 'Neuropsicologia'],
    procedureCategories: ['Consulta', 'Avaliação Psicológica', 'Psicoterapia', 'Outros'],
    procedureSuggestions: [
      { name: 'Sessão de Psicoterapia',      category: 'Psicoterapia' },
      { name: 'Avaliação Psicológica',       category: 'Avaliação Psicológica' },
      { name: 'Terapia de Casal',            category: 'Psicoterapia' },
      { name: 'Orientação Vocacional',       category: 'Outros' },
    ],
    anamnesisFields: [
      ['a-queixa', 'Queixa principal / Motivo da busca'],
      ['a-hist_pessoal', 'Histórico pessoal relevante (infância, traumas, perdas)'],
      ['a-dinamica_familiar', 'Dinâmica familiar atual'],
      ['a-trat_anteriores', 'Tratamentos psicológicos ou psiquiátricos anteriores'],
      ['a-medicamentos', 'Medicamentos em uso (psiquiátricos ou outros)'],
      ['a-substancias', 'Uso de álcool, tabaco ou outras substâncias'],
      ['a-sono', 'Qualidade do sono (insônia, hipersonia, pesadelos)'],
      ['a-relacionamentos', 'Relacionamentos (familiar, social, afetivo)'],
      ['a-trabalho', 'Situação profissional / escolar'],
      ['a-objetivos', 'Objetivos com a terapia'],
      ['a-risco', 'Triagem de risco (ideação suicida / autolesão)'],
    ],
    clinicalExamFields: [
      ['e-apresentacao', 'Apresentação geral (aparência, higiene, postura, contato visual)'],
      ['e-humor', 'Humor e afeto (eutímico, deprimido, eufórico, ansioso)'],
      ['e-pensamento', 'Curso e conteúdo do pensamento (acelerado, lento, ruminações)'],
      ['e-percepcao', 'Percepção (alucinações auditivas/visuais, ilusões)'],
      ['e-cognicao', 'Memória, atenção, concentração e orientação'],
      ['e-critica', 'Crítica e julgamento (insight sobre a condição)'],
      ['e-escala_phq', 'Escala PHQ-9 / GAD-7 (pontuação se aplicada)'],
      ['e-hipotese', 'Hipótese diagnóstica (CID-10 / DSM-5)'],
      ['e-plano', 'Plano terapêutico / Abordagem utilizada'],
      ['e-obs', 'Observações da sessão'],
    ],
    recordTabs: [],
    color: '124,58,237',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4.5h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9.6L6 22v-4.5H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z"/></svg>
    ),
  },
  nutri: {
    roles: [...BASE_ROLES, { value: 'profissional', label: 'Nutricionista' }, ADMIN_ROLE],
    documents: [
      { type: 'receita_comum', label: 'Prescrição Dietética', title: 'PRESCRIÇÃO DIETÉTICA' },
      DOC_DECLARACAO,
    ],
    stockCategories: ['material', 'outro'],
    financeCategoriasReceita: ['Consulta', 'Avaliação Nutricional', 'Plano Alimentar', 'Retorno', 'Outros'],
    financeCategoriasDespesa: ['Material', 'Salário', 'Aluguel', 'Marketing', 'Outros'],
    defaultDurationMinutes: 40,
    professionalSpecialties: ['Clínica', 'Esportiva', 'Materno-Infantil', 'Comportamental', 'Estética'],
    procedureCategories: ['Consulta', 'Avaliação Nutricional', 'Plano Alimentar', 'Outros'],
    procedureSuggestions: [
      { name: 'Consulta Nutricional',        category: 'Consulta' },
      { name: 'Avaliação Antropométrica',    category: 'Avaliação Nutricional' },
      { name: 'Plano Alimentar',             category: 'Plano Alimentar' },
      { name: 'Retorno Nutricional',         category: 'Consulta' },
      { name: 'Bioimpedância',               category: 'Avaliação Nutricional' },
    ],
    anamnesisFields: [
      ['a-queixa', 'Objetivo principal / Queixa'],
      ['a-hist_clinico', 'Histórico clínico (Diabetes, HAS, dislipidemia, tireóide)'],
      ['a-cirurgias', 'Cirurgias / Internações anteriores'],
      ['a-medicamentos', 'Medicamentos em uso'],
      ['a-alergia', 'Alergias ou intolerâncias alimentares'],
      ['a-habitos', 'Hábitos alimentares (refeições/dia, horários, local)'],
      ['a-recordatorio', 'Recordatório alimentar 24h (o que comeu ontem)'],
      ['a-restricoes', 'Restrições alimentares (religiosas, preferências, aversões)'],
      ['a-hidratacao', 'Ingestão hídrica diária'],
      ['a-atividade', 'Prática de atividade física (tipo, frequência, duração)'],
      ['a-intestino', 'Funcionamento intestinal (frequência, consistência)'],
      ['a-hist_peso', 'Histórico de peso (máximo, mínimo, variações recentes)'],
    ],
    clinicalExamFields: [
      ['e-peso', 'Peso atual (kg)'],
      ['e-altura', 'Altura (cm)'],
      ['e-imc', 'IMC (kg/m²)'],
      ['e-cc', 'Circunferência abdominal (cm)'],
      ['e-cq', 'Relação cintura/quadril'],
      ['e-gordura', 'Percentual de gordura corporal (%)'],
      ['e-massa_magra', 'Massa magra (kg)'],
      ['e-pressao', 'Pressão arterial'],
      ['e-exames_lab', 'Exames laboratoriais (glicose, HbA1c, colesterol, TG, TSH)'],
      ['e-meta_calorica', 'Meta calórica / VET prescrito (kcal/dia)'],
      ['e-plano', 'Plano alimentar / Orientações prescritas'],
      ['e-obs', 'Observações gerais'],
    ],
    recordTabs: [],
    color: '22,163,74',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor"><rect x="11.2" y="2" width="1.6" height="3.6" rx="0.8"/><path d="M13 4c1.6-1.1 3.3-.7 4 .6-1.5.9-3 .6-4-.6z"/><circle cx="12" cy="14.5" r="7.2"/></svg>
    ),
  },
  fono: {
    roles: [...BASE_ROLES, { value: 'profissional', label: 'Fonoaudiólogo(a)' }, ADMIN_ROLE],
    documents: [
      DOC_DECLARACAO,
      { type: 'atestado', label: 'Atestado', title: 'ATESTADO FONOAUDIOLÓGICO' },
    ],
    stockCategories: ['material', 'equipamento', 'descartavel', 'outro'],
    financeCategoriasReceita: ['Sessão', 'Avaliação Fonoaudiológica', 'Pacote', 'Plano', 'Outros'],
    financeCategoriasDespesa: ['Material', 'Salário', 'Aluguel', 'Equipamento', 'Marketing', 'Outros'],
    defaultDurationMinutes: 40,
    professionalSpecialties: ['Linguagem', 'Motricidade Orofacial', 'Audiologia', 'Voz', 'Disfagia', 'Fluência (gagueira)', 'Fonoaudiologia Educacional'],
    procedureCategories: ['Consulta', 'Avaliação', 'Triagem Neonatal', 'Terapia de Linguagem', 'Motricidade Orofacial', 'Audiometria', 'Outros'],
    procedureSuggestions: [
      { name: 'Avaliação Fonoaudiológica',   category: 'Avaliação' },
      { name: 'Sessão de Terapia de Linguagem', category: 'Terapia de Linguagem' },
      { name: 'Terapia de Motricidade Orofacial', category: 'Motricidade Orofacial' },
      { name: 'Audiometria',                 category: 'Audiometria' },
      { name: 'Terapia de Fluência',         category: 'Outros' },
      { name: 'Teste da Orelhinha (Emissões Otoacústicas)', category: 'Triagem Neonatal' },
      { name: 'Teste da Linguinha (Avaliação do Frênulo Lingual)', category: 'Triagem Neonatal' },
    ],
    anamnesisFields: [
      ['a-queixa', 'Queixa principal / Motivo da busca'],
      ['a-marcos', 'Marcos do desenvolvimento (sentou, andou, falou)'],
      ['a-gestacao', 'Gestação e parto'],
      ['a-alimentacao', 'Amamentação e alimentação'],
      ['a-hist_escolar', 'Histórico escolar'],
      ['a-hist_auditivo', 'Histórico auditivo e exames prévios'],
      ['a-diagnosticos', 'Diagnósticos associados (TEA, TDAH, etc.)'],
      ['a-medicamentos', 'Medicamentos em uso'],
      ['a-outras_terapias', 'Outras terapias em curso'],
    ],
    clinicalExamFields: [
      ['e-ling_receptiva', 'Linguagem receptiva'],
      ['e-ling_expressiva', 'Linguagem expressiva'],
      ['e-fala', 'Fala e articulação'],
      ['e-voz', 'Voz'],
      ['e-fluencia', 'Fluência'],
      ['e-motricidade', 'Motricidade orofacial (lábios/língua/palato)'],
      ['e-degluticao', 'Deglutição'],
      ['e-triagem_auditiva', 'Triagem auditiva (Teste da Orelhinha) — resultado (passou/falhou, orelha)'],
      ['e-freio_lingual', 'Avaliação do frênulo lingual (Teste da Linguinha) — classificação'],
      ['e-obs', 'Observações gerais'],
    ],
    recordTabs: [],
    color: '79,70,229',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="10" width="2" height="4" rx="1"/><rect x="6" y="7" width="2" height="10" rx="1"/><rect x="10" y="4" width="2" height="16" rx="1"/><rect x="14" y="8" width="2" height="8" rx="1"/><rect x="18" y="11" width="2" height="2.5" rx="1"/></svg>
    ),
  },
  to: {
    roles: [...BASE_ROLES, { value: 'profissional', label: 'Terapeuta Ocupacional' }, ADMIN_ROLE],
    documents: [
      DOC_DECLARACAO,
      { type: 'atestado', label: 'Atestado', title: 'ATESTADO DE TERAPIA OCUPACIONAL' },
    ],
    stockCategories: ['material', 'equipamento', 'descartavel', 'outro'],
    financeCategoriasReceita: ['Sessão', 'Avaliação', 'Pacote', 'Plano', 'Outros'],
    financeCategoriasDespesa: ['Material', 'Salário', 'Aluguel', 'Equipamento', 'Marketing', 'Outros'],
    defaultDurationMinutes: 50,
    professionalSpecialties: ['Infantil/TEA', 'Integração Sensorial', 'Neurofuncional', 'Saúde Mental', 'Gerontologia', 'Reabilitação Física', 'Contexto Escolar'],
    procedureCategories: ['Consulta', 'Avaliação', 'Integração Sensorial', 'AVDs', 'Adaptação/Órtese', 'Outros'],
    procedureSuggestions: [
      { name: 'Avaliação Ocupacional',       category: 'Avaliação' },
      { name: 'Sessão de Integração Sensorial', category: 'Integração Sensorial' },
      { name: 'Treino de AVDs',              category: 'AVDs' },
      { name: 'Adaptação de Órtese',         category: 'Adaptação/Órtese' },
    ],
    anamnesisFields: [
      ['a-queixa', 'Queixa principal'],
      ['a-rotina', 'Rotina e AVDs'],
      ['a-marcos', 'Marcos do desenvolvimento'],
      ['a-perfil_sensorial', 'Perfil sensorial'],
      ['a-escola_trabalho', 'Escola / Trabalho'],
      ['a-autonomia', 'Nível de autonomia'],
      ['a-diagnosticos', 'Diagnósticos'],
      ['a-outras_terapias', 'Outras terapias em curso'],
    ],
    clinicalExamFields: [
      ['e-avds', 'AVDs (higiene, alimentação, vestuário)'],
      ['e-coord_fina', 'Coordenação motora fina'],
      ['e-coord_grossa', 'Coordenação motora grossa'],
      ['e-perfil_sensorial', 'Perfil sensorial'],
      ['e-cognicao', 'Cognição e atenção'],
      ['e-participacao', 'Participação social'],
      ['e-orteses', 'Uso de órtese/adaptação'],
      ['e-obs', 'Observações gerais'],
    ],
    recordTabs: [],
    color: '13,148,136',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 2a2 2 0 00-2 2v6.5a1.5 1.5 0 01-3 0V9a1 1 0 00-2 0v1.5a3.5 3.5 0 003.5 3.5H8v6a2 2 0 002 2h4a2 2 0 002-2v-6h1.5a3.5 3.5 0 003.5-3.5V9a1 1 0 00-2 0v1.5a1.5 1.5 0 01-3 0V4a2 2 0 00-2-2H8z"/></svg>
    ),
  },
}

export function getSpecialtyConfig(type: ClinicType | undefined): SpecialtyConfig {
  return SPECIALTY_CONFIG[type ?? 'odonto'] ?? SPECIALTY_CONFIG.odonto
}

// Rótulo em português de cada área — fonte única (antes só existia
// duplicado dentro de CLINIC_TYPES em login/page.tsx).
export const CLINIC_TYPE_LABELS: Record<ClinicType, string> = {
  odonto: 'Odontologia',
  medico: 'Medicina',
  estetica: 'Estética',
  vet: 'Veterinária',
  fisio: 'Fisioterapia',
  psico: 'Psicologia',
  nutri: 'Nutrição',
  fono: 'Fonoaudiologia',
  to: 'Terapia Ocupacional',
}

export const CLINIC_TYPE_OPTIONS: { value: ClinicType; label: string }[] =
  (Object.keys(CLINIC_TYPE_LABELS) as ClinicType[]).map(value => ({ value, label: CLINIC_TYPE_LABELS[value] }))

// Ícone + cor por área, na mesma ordem de CLINIC_TYPE_OPTIONS — fonte única
// do seletor de área no cadastro e no quiz (login/page.tsx), acabando com a
// lista literal que existia só lá.
export const CLINIC_TYPE_ICON_OPTIONS: { value: ClinicType; label: string; icon: ReactNode; color: string }[] =
  CLINIC_TYPE_OPTIONS.map(o => ({ ...o, icon: SPECIALTY_CONFIG[o.value].icon, color: SPECIALTY_CONFIG[o.value].color }))

// Cargo (clinic_users.role) que uma área usa — várias áreas dividem o
// mesmo cargo genérico 'profissional' (o preset de permissão é idêntico
// pras 5: agenda+pacientes+prontuário edit, dashboard+procedimentos+
// relatórios view). O rótulo humano de cada uma vem de specialty_type,
// não do cargo — é isso que resolve "Esteticista" vs "Nutricionista"
// não aparecerem como a mesma coisa na tela.
export function roleForSpecialty(type: ClinicType): UserRole {
  if (type === 'odonto') return 'dentista'
  if (type === 'medico') return 'medico'
  return 'profissional'
}

// Rótulo humano do profissional daquela área específica — ex: "Nutricionista",
// "Esteticista". Independe do cargo (role) genérico armazenado no banco.
export function specialtyRoleLabel(type: ClinicType): string {
  return getSpecialtyConfig(type).roles.find(r => !['recepcao', 'auxiliar', 'admin'].includes(r.value))?.label
    ?? CLINIC_TYPE_LABELS[type]
}

// Rótulo genérico por cargo — usado só como fallback de exibição quando
// não dá pra saber a área exata (ex: cargo sem specialty_type salvo).
// A tela de criar usuário numa clínica multi-área não usa isso pra
// escolher cargo — usa um seletor de Área dedicado (7 opções) que já
// resolve o cargo sozinho via roleForSpecialty().
const GENERIC_ROLE_LABEL: Partial<Record<UserRole, string>> = {
  dentista: 'Dentista',
  medico: 'Médico',
  profissional: 'Profissional',
}

// Configuração combinada de uma clínica multi-área: união de estoque,
// financeiro, documentos, abas de prontuário e especialidades sugeridas
// das áreas que a clínica de fato usa — sem duplicar 'profissional' quando
// várias áreas o compartilham. A duração padrão usa a área principal (o
// Bloco D troca isso por duração por profissional; até lá é só o valor
// inicial do formulário). anamnesisFields/clinicalExamFields NÃO são
// fundidos aqui de propósito — em clínica multi-área, cada profissional
// vê a ficha só da própria área (resolvida via getSpecialtyConfig direto
// pelo specialty_type dele, não por este merge); os campos abaixo ficam
// disponíveis só como fallback de exibição de uma única área.
export function mergeSpecialtyConfigs(types: ClinicType[]): SpecialtyConfig {
  const list = types.length > 0 ? types : ['odonto' as ClinicType]
  const configs = list.map(getSpecialtyConfig)
  const dedupe = <T,>(arrs: T[][], key: (t: T) => string): T[] => {
    const seen = new Set<string>()
    const out: T[] = []
    for (const arr of arrs) for (const item of arr) {
      const k = key(item)
      if (!seen.has(k)) { seen.add(k); out.push(item) }
    }
    return out
  }
  const roleValues = dedupe(list.map(t => [roleForSpecialty(t)]), v => v)
  return {
    roles: [
      ...BASE_ROLES,
      ...roleValues.map(value => ({ value, label: GENERIC_ROLE_LABEL[value] ?? value })),
      ADMIN_ROLE,
    ],
    documents: dedupe(configs.map(c => c.documents), d => d.type),
    stockCategories: dedupe(configs.map(c => c.stockCategories), c => c),
    financeCategoriasReceita: dedupe(configs.map(c => c.financeCategoriasReceita), c => c),
    financeCategoriasDespesa: dedupe(configs.map(c => c.financeCategoriasDespesa), c => c),
    defaultDurationMinutes: configs[0].defaultDurationMinutes,
    professionalSpecialties: dedupe(configs.map(c => c.professionalSpecialties), c => c),
    procedureCategories: dedupe(configs.map(c => c.procedureCategories), c => c),
    procedureSuggestions: dedupe(configs.map(c => c.procedureSuggestions), s => s.name),
    anamnesisFields: configs[0].anamnesisFields,
    clinicalExamFields: configs[0].clinicalExamFields,
    recordTabs: dedupe(configs.map(c => c.recordTabs), t => t),
    icon: configs[0].icon,
    color: configs[0].color,
  }
}

// Rótulo em português pra cada slug de categoria de estoque (o valor salvo
// no banco continua o slug em minúsculas — só a exibição muda).
export const STOCK_CATEGORY_LABELS: Record<string, string> = {
  material: 'Material',
  medicamento: 'Medicamento',
  descartavel: 'Descartável',
  equipamento: 'Equipamento',
  cosmetico: 'Cosmético',
  injetavel: 'Injetável',
  racao: 'Ração',
  vacina: 'Vacina',
  outro: 'Outro',
}

export function stockCategoryLabel(slug: string): string {
  return STOCK_CATEGORY_LABELS[slug] ?? slug
}
