import type { ClinicType } from '@/types'

interface ProcedureSuggestion {
  name: string
  category: string
}

/** Usado tanto para semear a clínica no cadastro quanto para sugerir
 *  nomes ao adicionar um procedimento manualmente. Preço fica sempre
 *  a definir (0) — cada clínica precifica do seu jeito. */
export const PROCEDURE_SUGGESTIONS: Record<ClinicType, ProcedureSuggestion[]> = {
  odonto: [
    { name: 'Consulta / Avaliação',        category: 'Consulta' },
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
  ],
  medico: [
    { name: 'Consulta Médica',             category: 'Consulta' },
    { name: 'Retorno',                     category: 'Consulta' },
    { name: 'Exame de Rotina',             category: 'Exame' },
    { name: 'Eletrocardiograma',           category: 'Exame' },
    { name: 'Pequena Cirurgia',            category: 'Cirurgia' },
    { name: 'Sutura',                      category: 'Procedimento' },
    { name: 'Aplicação de Vacina',         category: 'Vacinação' },
    { name: 'Curativo',                    category: 'Procedimento' },
    { name: 'Ultrassonografia',            category: 'Radiologia' },
  ],
  estetica: [
    { name: 'Avaliação Estética',          category: 'Consulta' },
    { name: 'Limpeza de Pele',             category: 'Limpeza de Pele' },
    { name: 'Peeling Químico',             category: 'Peeling' },
    { name: 'Botox',                       category: 'Botox' },
    { name: 'Preenchimento Facial',        category: 'Preenchimento' },
    { name: 'Depilação a Laser',           category: 'Laser' },
    { name: 'Massagem Modeladora',         category: 'Massagem' },
    { name: 'Drenagem Linfática',          category: 'Corporal' },
    { name: 'Microagulhamento',            category: 'Outros' },
  ],
  vet: [
    { name: 'Consulta Veterinária',        category: 'Consulta' },
    { name: 'Vacinação',                   category: 'Vacinação' },
    { name: 'Castração',                   category: 'Cirurgia' },
    { name: 'Banho e Tosa',                category: 'Banho & Tosa' },
    { name: 'Exame de Sangue',             category: 'Exame' },
    { name: 'Vermifugação',                category: 'Consulta' },
    { name: 'Radiografia',                 category: 'Radiologia' },
    { name: 'Aplicação de Microchip',      category: 'Outros' },
  ],
  fisio: [
    { name: 'Avaliação Fisioterapêutica',  category: 'Avaliação' },
    { name: 'Sessão de Fisioterapia',      category: 'Consulta' },
    { name: 'Eletroterapia',               category: 'Eletroterapia' },
    { name: 'Pilates Terapêutico',         category: 'Pilates' },
    { name: 'RPG',                         category: 'Outros' },
    { name: 'Massoterapia',                category: 'Massagem' },
    { name: 'Hidroterapia',                category: 'Hidroterapia' },
  ],
  psico: [
    { name: 'Sessão de Psicoterapia',      category: 'Psicoterapia' },
    { name: 'Avaliação Psicológica',       category: 'Avaliação Psicológica' },
    { name: 'Terapia de Casal',            category: 'Psicoterapia' },
    { name: 'Orientação Vocacional',       category: 'Outros' },
  ],
  nutri: [
    { name: 'Consulta Nutricional',        category: 'Consulta' },
    { name: 'Avaliação Antropométrica',    category: 'Avaliação Nutricional' },
    { name: 'Plano Alimentar',             category: 'Plano Alimentar' },
    { name: 'Retorno Nutricional',         category: 'Consulta' },
    { name: 'Bioimpedância',               category: 'Avaliação Nutricional' },
  ],
}
