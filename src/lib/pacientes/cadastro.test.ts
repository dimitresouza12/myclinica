import { describe, it, expect } from 'vitest'
import type { Patient } from '@/types'
import { buildCadastroSections, patientOpenLabel, showsProntuario } from './cadastro'

const base = {
  id: 'p1', clinic_id: 'c1', name: 'Maria', phone: null, email: null, cpf: null, rg: null, birth_date: null, gender: null,
  address: null, occupation: null, emergency_contact: null, referred_by: null, registration_status: null, self_registered: null,
  convenio: null, convenio_carteirinha: null, pet_name: null, pet_species: null, pet_breed: null, pet_weight: null, pet_age: null,
  pet_coat: null, pet_neutered: null, notes: null, avatar_url: null, is_active: true, created_at: '', updated_at: '',
} as Patient

describe('showsProntuario', () => {
  it('só com permissão carregada e can_view', () => {
    expect(showsProntuario({ canView: true, loaded: true })).toBe(true)
    expect(showsProntuario({ canView: false, loaded: true })).toBe(false)
    expect(showsProntuario({ canView: true, loaded: false })).toBe(false)
  })
})

describe('patientOpenLabel', () => {
  it('prontuário para quem tem, cadastro para quem não tem', () => {
    expect(patientOpenLabel(true)).toBe('Abrir prontuário')
    expect(patientOpenLabel(false)).toBe('Abrir cadastro')
  })
})

describe('buildCadastroSections', () => {
  it('paciente sem dados não gera seção vazia', () => {
    expect(buildCadastroSections(base)).toEqual([])
  })
  it('formata CPF, nascimento e telefone e agrupa por seção', () => {
    const s = buildCadastroSections({ ...base, cpf: '12345678909', birth_date: '1990-05-17', phone: '85999998888', email: 'a@b.com', notes: 'Prefere manhã' })
    const by = Object.fromEntries(s.map(x => [x.key, x.rows]))
    expect(by.identificacao).toContainEqual({ label: 'CPF', value: '123.456.789-09' })
    expect(by.identificacao).toContainEqual({ label: 'Nascimento', value: '17/05/1990' })
    expect(by.contato.map(r => r.label)).toEqual(['Telefone', 'E-mail'])
    expect(by.observacoes).toEqual([{ label: 'Observações', value: 'Prefere manhã' }])
  })
  it('CPF incompleto aparece como foi guardado', () => {
    const s = buildCadastroSections({ ...base, cpf: '123' })
    expect(s[0].rows).toEqual([{ label: 'CPF', value: '123' }])
  })
  it('responsável legal e convênio só aparecem se preenchidos', () => {
    const keys = buildCadastroSections({ ...base, guardian_name: 'Ana', convenio: 'Unimed' }).map(x => x.key)
    expect(keys).toEqual(['responsavel', 'convenio'])
  })
})
