// Tela de cadastro do paciente: o que quem NÃO tem o módulo Prontuário enxerga em /pacientes/[id]
// (só dados cadastrais e contato, nada clínico). Lógica pura, testada em cadastro.test.ts.
import type { Patient } from '@/types'
import { cpfToInputValue, isoToDateBR } from '@/lib/numericFormat'
import { formatBrPhone } from '@/lib/phoneFormat'
import { petSexLabel, hasPetData } from '@/lib/pacientes/pet'

export interface CadastroRow { label: string; value: string }
export interface CadastroSection { key: string; title: string; rows: CadastroRow[] }

/**
 * Quem tem can_view de 'prontuario' vê o prontuário completo; os demais, só o cadastro.
 * Enquanto as permissões não carregaram não dá para decidir (a página espera).
 */
export function showsProntuario(perm: { canView: boolean; loaded: boolean }): boolean {
  return perm.loaded && perm.canView
}

/** Rótulo do atalho que leva a /pacientes/[id]: para quem não tem prontuário, a página é só o cadastro. */
export function patientOpenLabel(canViewProntuario: boolean): string {
  return canViewProntuario ? 'Abrir prontuário' : 'Abrir cadastro'
}

function text(v: string | null | undefined): string {
  return (v ?? '').toString().trim()
}

function rows(list: [string, string][]): CadastroRow[] {
  return list.filter(([, v]) => v !== '').map(([label, value]) => ({ label, value }))
}

/** Seções do cadastro, já sem campo vazio e sem seção vazia. */
export function buildCadastroSections(p: Patient): CadastroSection[] {
  const cpf = cpfToInputValue(p.cpf) || text(p.cpf)
  const sections: CadastroSection[] = [
    { key: 'contato', title: 'Contato', rows: rows([
      ['Telefone', formatBrPhone(p.phone)],
      ['E-mail', text(p.email)],
      ['Contato de emergência', text(p.emergency_contact)],
    ]) },
    { key: 'identificacao', title: 'Identificação', rows: rows([
      ['CPF', cpf],
      ['RG', text(p.rg)],
      ['Nascimento', isoToDateBR(p.birth_date)],
      ['Gênero', text(p.gender)],
      ['Ocupação', text(p.occupation)],
      ['Endereço', text(p.address)],
      ['Como nos conheceu', text(p.referred_by)],
    ]) },
    { key: 'responsavel', title: 'Responsável legal', rows: rows([
      ['Nome', text(p.guardian_name)],
      ['CPF', cpfToInputValue(p.guardian_cpf) || text(p.guardian_cpf)],
      ['Parentesco', text(p.guardian_relationship)],
      ['Telefone', formatBrPhone(p.guardian_phone)],
    ]) },
    { key: 'convenio', title: 'Convênio', rows: rows([
      ['Convênio', text(p.convenio)],
      ['Carteirinha', text(p.convenio_carteirinha)],
      ['Validade', isoToDateBR(p.convenio_validade)],
      ['Titular', text(p.convenio_titular)],
      ['Pagador', text(p.payer_name)],
      ['CPF do pagador', cpfToInputValue(p.payer_cpf) || text(p.payer_cpf)],
    ]) },
    { key: 'pet', title: 'Pet', rows: hasPetData(p) ? rows([
      ['Nome', text(p.pet_name)],
      ['Espécie', text(p.pet_species)],
      ['Raça', text(p.pet_breed)],
      ['Sexo', petSexLabel(p.pet_sex)],
      ['Nascimento', isoToDateBR(p.pet_birth_date)],
    ]) : [] },
    { key: 'observacoes', title: 'Observações cadastrais', rows: rows([['Observações', text(p.notes)]]) },
  ]
  return sections.filter(s => s.rows.length > 0)
}
