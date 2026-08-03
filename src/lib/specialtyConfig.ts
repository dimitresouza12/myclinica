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

interface SpecialtyConfig {
  roles: RoleOption[]
  documents: DocTypeOption[]
  stockCategories: string[]
  financeCategoriasReceita: string[]
  financeCategoriasDespesa: string[]
  defaultDurationMinutes: number
  professionalSpecialties: string[]
}

const BASE_ROLES: RoleOption[] = [
  { value: 'recepcao', label: 'Recepção' },
]
const ADMIN_ROLE: RoleOption = { value: 'admin', label: 'Admin (acesso total)' }

// Os 4 tipos de documento existem como slot fixo no banco (clinic_document_templates.type
// tem CHECK constraint pros 4 valores). Cada especialidade escolhe só os que fazem sentido
// pro seu conselho profissional emitir, com rótulo e título de impressão corretos —
// evita, por ex., um psicólogo (que não pode prescrever medicamento) ver "RECEITA MÉDICA".
const DOC_RECEITA_COMUM_MEDICO: DocTypeOption = { type: 'receita_comum', label: 'Receita Comum', title: 'RECEITA MÉDICA' }
const DOC_RECEITA_ESPECIAL_MEDICO: DocTypeOption = { type: 'receita_especial', label: 'Receita Especial', title: 'RECEITA DE CONTROLE ESPECIAL' }
const DOC_DECLARACAO: DocTypeOption = { type: 'declaracao_comparecimento', label: 'Declaração de Comparecimento', title: 'DECLARAÇÃO DE COMPARECIMENTO' }

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
    professionalSpecialties: ['Clínico Geral', 'Ortodontia', 'Endodontia', 'Periodontia', 'Implantodontia', 'Odontopediatria', 'Cirurgia Bucomaxilofacial', 'Prótese Dentária'],
  },
  medico: {
    roles: [...BASE_ROLES, { value: 'medico', label: 'Médico' }, ADMIN_ROLE],
    documents: [DOC_RECEITA_COMUM_MEDICO, DOC_RECEITA_ESPECIAL_MEDICO, DOC_DECLARACAO, { type: 'atestado', label: 'Atestado', title: 'ATESTADO MÉDICO' }],
    stockCategories: ['material', 'medicamento', 'descartavel', 'equipamento', 'outro'],
    financeCategoriasReceita: ['Consulta', 'Procedimento', 'Exame', 'Plano', 'Outros'],
    financeCategoriasDespesa: ['Material', 'Salário', 'Aluguel', 'Equipamento', 'Marketing', 'Outros'],
    defaultDurationMinutes: 30,
    professionalSpecialties: ['Clínico Geral', 'Cardiologia', 'Dermatologia', 'Ginecologia', 'Pediatria', 'Ortopedia', 'Psiquiatria', 'Endocrinologia'],
  },
  estetica: {
    roles: [...BASE_ROLES, { value: 'profissional', label: 'Esteticista' }, ADMIN_ROLE],
    documents: [
      { type: 'receita_comum', label: 'Receita', title: 'RECEITA' },
      DOC_RECEITA_ESPECIAL_MEDICO,
      DOC_DECLARACAO,
      { type: 'atestado', label: 'Atestado', title: 'ATESTADO' },
    ],
    stockCategories: ['cosmetico', 'injetavel', 'descartavel', 'equipamento', 'outro'],
    financeCategoriasReceita: ['Consulta', 'Procedimento Estético', 'Pacote', 'Plano', 'Outros'],
    financeCategoriasDespesa: ['Material', 'Salário', 'Aluguel', 'Equipamento', 'Marketing', 'Outros'],
    defaultDurationMinutes: 60,
    professionalSpecialties: ['Esteticista', 'Biomedicina Estética', 'Dermatologia', 'Cosmetologia'],
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
  },
}

export function getSpecialtyConfig(type: ClinicType | undefined): SpecialtyConfig {
  return SPECIALTY_CONFIG[type ?? 'odonto'] ?? SPECIALTY_CONFIG.odonto
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
