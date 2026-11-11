import { describe, expect, it } from 'vitest'
import {
  clinicAreaList, isMultiArea, withClinicArea, defaultProfessionalArea, clinicalRoleForArea,
  roleOrAreaValue, specialtyPlaceholder, specialtyHint, specialtyOptions, isClinicalRole,
} from './clinicAreas'
import { CLINIC_TYPE_OPTIONS, getSpecialtyConfig } from './specialtyConfig'
import { councilForProfessional } from './professionalCouncil'

describe('áreas da clínica', () => {
  it('lista as áreas, com fallback na área do cadastro', () => {
    expect(clinicAreaList({ type: 'medico', specialties: [] })).toEqual(['medico'])
    expect(clinicAreaList({ type: 'medico', specialties: ['medico', 'fono'] })).toEqual(['medico', 'fono'])
  })

  it('multi-área vem da flag ou de mais de uma área', () => {
    expect(isMultiArea({ type: 'medico', specialties: ['medico'], isMultiSpecialty: false })).toBe(false)
    expect(isMultiArea({ type: 'medico', specialties: ['medico', 'to'], isMultiSpecialty: false })).toBe(true)
    expect(isMultiArea({ type: 'medico', specialties: ['medico'], isMultiSpecialty: true })).toBe(true)
  })

  it('acrescenta área sem duplicar', () => {
    expect(withClinicArea(['medico'], 'fono')).toEqual({ areas: ['medico', 'fono'], changed: true })
    expect(withClinicArea(['medico', 'fono'], 'fono').changed).toBe(false)
  })

  it('pré-seleciona a área só em clínica de uma área', () => {
    expect(defaultProfessionalArea({ type: 'medico', specialties: ['medico'] })).toBe('medico')
    expect(defaultProfessionalArea({ type: 'medico', specialties: ['medico', 'fono'] })).toBe('')
  })

  it('cargo clínico acompanha a área', () => {
    expect(clinicalRoleForArea('odonto')).toBe('dentista')
    expect(clinicalRoleForArea('medico')).toBe('medico')
    expect(clinicalRoleForArea('fono')).toBe('profissional')
    expect(clinicalRoleForArea('to')).toBe('profissional')
    expect(clinicalRoleForArea('')).toBe('profissional')
    expect(isClinicalRole('recepcao')).toBe(false)
    expect(isClinicalRole('profissional')).toBe(true)
  })

  it('valor do seletor de função: usuário antigo sem área resolve pra área da clínica', () => {
    expect(roleOrAreaValue('medico', null, 'medico')).toBe('medico')
    expect(roleOrAreaValue('dentista', '', 'odonto')).toBe('odonto')
    expect(roleOrAreaValue('recepcao', null, 'medico')).toBe('recepcao')
    expect(roleOrAreaValue('admin', null, 'medico')).toBe('admin')
    expect(roleOrAreaValue('profissional', 'fono', 'medico')).toBe('fono')
    // cargo genérico que não bate com a área da clínica não vira área por engano
    expect(roleOrAreaValue('dentista', null, 'medico')).toBe('dentista')
  })

  it('as 9 áreas, fono e TO incluídas, têm sugestões, conselho e duração próprios', () => {
    const values = CLINIC_TYPE_OPTIONS.map(o => o.value)
    expect(values).toHaveLength(9)
    expect(values).toEqual(expect.arrayContaining(['fono', 'to']))
    expect(councilForProfessional({ specialtyType: 'fono', clinicType: 'medico' }).code).toBe('CREFONO')
    expect(councilForProfessional({ specialtyType: 'to', clinicType: 'medico' }).code).toBe('CREFITO')
    expect(getSpecialtyConfig('fono').professionalSpecialties).toContain('Linguagem')
    for (const v of values) expect(specialtyOptions(v).length).toBeGreaterThan(1)
  })

  it('Medicina deixa claro que a especialidade médica entra no campo Especialidade', () => {
    expect(specialtyHint('medico')).toContain('Cardiologia')
    expect(specialtyHint('medico')).toContain('Pediatria')
    expect(specialtyHint('fono')).toBeNull()
    expect(specialtyPlaceholder('')).toBe('Escolha a área acima primeiro')
    expect(specialtyPlaceholder('medico')).toBe('Selecione a especialidade')
  })

  it('seletor de especialidade: só opções da área, sem texto livre', () => {
    const medico = specialtyOptions('medico').map(o => o.value)
    expect(medico).toEqual(['', ...getSpecialtyConfig('medico').professionalSpecialties])
    expect(medico).toEqual(expect.arrayContaining(['Clínico Geral', 'Cardiologia', 'Pediatria']))
    expect(specialtyOptions('fono').map(o => o.value)).not.toContain('Cardiologia')
    expect(specialtyOptions('').map(o => o.value)).toEqual([''])
  })

  it('valor salvo fora da lista vira opção extra, sem duplicar o que já está na lista', () => {
    const custom = specialtyOptions('medico', 'Medicina Integrativa').map(o => o.value)
    expect(custom[custom.length - 1]).toBe('Medicina Integrativa')
    expect(custom.filter(v => v === 'Medicina Integrativa')).toHaveLength(1)
    const inList = specialtyOptions('medico', 'Cardiologia').map(o => o.value)
    expect(inList.filter(v => v === 'Cardiologia')).toHaveLength(1)
    expect(inList).toHaveLength(specialtyOptions('medico').length)
  })
})
