import { describe, it, expect } from 'vitest'
import {
  petLabel, petAgeFromBirth, buildPetColumns, EMPTY_PET_FORM, parseNeutered, normalizeMicrochip, microchipError,
  sameTutor, otherPetsOfTutor, normalizePetSex, petSexLabel, hasPetData, petVisibility,
} from './pet'

const today = new Date(2026, 10, 10) // 10/11/2026

describe('rótulo do pet', () => {
  it('mostra pet e tutor quando há nome de pet', () => {
    expect(petLabel({ name: 'Maria Silva', pet_name: 'Thor' })).toBe('Thor (Tutor: Maria Silva)')
  })
  it('sem pet, só o nome', () => {
    expect(petLabel({ name: 'Maria Silva', pet_name: null })).toBe('Maria Silva')
    expect(petLabel({ name: 'Maria Silva', pet_name: '  ' })).toBe('Maria Silva')
    expect(petLabel(undefined)).toBe('')
  })
})

describe('idade a partir do nascimento', () => {
  it('dias, meses, anos', () => {
    expect(petAgeFromBirth('2026-11-01', today)).toBe('9 dias')
    expect(petAgeFromBirth('2026-11-09', today)).toBe('1 dia')
    expect(petAgeFromBirth('2026-06-10', today)).toBe('5 meses')
    expect(petAgeFromBirth('2026-07-10', today)).toBe('4 meses')
    expect(petAgeFromBirth('2025-10-10', today)).toBe('1 ano e 1 mês')
    expect(petAgeFromBirth('2023-11-10', today)).toBe('3 anos')
    expect(petAgeFromBirth('2023-02-01', today)).toBe('3 anos e 9 meses')
  })
  it('ainda não completou o mês', () => {
    expect(petAgeFromBirth('2026-07-11', today)).toBe('3 meses')
  })
  it('data futura ou inválida: vazio', () => {
    expect(petAgeFromBirth('2026-12-01', today)).toBe('')
    expect(petAgeFromBirth('', today)).toBe('')
    expect(petAgeFromBirth(null, today)).toBe('')
  })
})

describe('colunas do pet', () => {
  const full = { ...EMPTY_PET_FORM, nome: ' Thor ', especie: 'Canino', raca: 'Golden Retriever', sexo: 'macho', nascimentoISO: '2024-05-10', castrado: 'Sim', peso: '32,5', pelagem: 'dourada', microchip: '985 112 000 111 222' }
  it('sem as colunas extras, só grava as que existem hoje', () => {
    const c = buildPetColumns(full, { extras: false })
    expect(c).toMatchObject({ pet_name: 'Thor', pet_species: 'Canino', pet_breed: 'Golden Retriever', pet_coat: 'dourada', pet_weight: 32.5, pet_neutered: true })
    expect('pet_sex' in c).toBe(false)
    expect('pet_birth_date' in c).toBe(false)
    expect('pet_microchip' in c).toBe(false)
  })
  it('com as colunas extras, grava sexo, nascimento e microchip e preserva o texto de idade', () => {
    const c = buildPetColumns({ ...full, idadeTexto: '2 anos' }, { extras: true })
    expect(c).toMatchObject({ pet_sex: 'macho', pet_birth_date: '2024-05-10', pet_microchip: '985112000111222', pet_age: '2 anos' })
  })
  it('com nascimento e sem idade em texto, pet_age vai null; com extras desligado também preserva', () => {
    expect(buildPetColumns({ ...full, idadeTexto: '' }, { extras: true }).pet_age).toBeNull()
    expect(buildPetColumns({ ...full, idadeTexto: '2 anos' }, { extras: false }).pet_age).toBe('2 anos')
  })
  it('sem nascimento mantém o texto antigo de idade', () => {
    expect(buildPetColumns({ ...EMPTY_PET_FORM, nome: 'Mia', idadeTexto: '3 meses' }, { extras: true }).pet_age).toBe('3 meses')
  })
  it('vazio vira null, peso inválido vira null', () => {
    const c = buildPetColumns({ ...EMPTY_PET_FORM, peso: 'x' }, { extras: true })
    expect(c).toMatchObject({ pet_name: null, pet_species: null, pet_weight: null, pet_neutered: null, pet_sex: null, pet_microchip: null })
  })
  it('castrado e sexo', () => {
    expect(parseNeutered('Sim')).toBe(true)
    expect(parseNeutered('não')).toBe(false)
    expect(parseNeutered('talvez')).toBeNull()
    expect(normalizePetSex('Fêmea')).toBe('femea')
    expect(normalizePetSex('macho')).toBe('macho')
    expect(normalizePetSex('x')).toBe('')
    expect(petSexLabel('femea')).toBe('Fêmea')
  })
  it('microchip: só dígitos, 15 números', () => {
    expect(normalizeMicrochip('985-112')).toBe('985112')
    expect(normalizeMicrochip('')).toBeNull()
    expect(microchipError('985112')).toBe('O microchip tem 15 números.')
    expect(microchipError('985112000111222')).toBeNull()
    expect(microchipError('')).toBeNull()
  })
})

describe('vários pets do mesmo tutor', () => {
  const thor = { id: '1', name: 'Maria Silva', phone: '85999998888', cpf: null, pet_name: 'Thor' }
  const mia = { id: '2', name: 'Maria S.', phone: '(85) 99999-8888', cpf: '111.222.333-44', pet_name: 'Mia' }
  const outro = { id: '3', name: 'João', phone: '85988887777', cpf: '555.666.777-88', pet_name: 'Rex' }
  it('mesmo telefone, gravado de jeitos diferentes', () => {
    expect(sameTutor(thor, mia)).toBe(true)
    expect(sameTutor(thor, outro)).toBe(false)
  })
  it('mesmo CPF com telefone diferente', () => {
    expect(sameTutor({ ...outro, id: '9', phone: '85911112222', cpf: '55566677788' }, outro)).toBe(true)
  })
  it('CPFs completos diferentes nunca são o mesmo tutor, mesmo com telefone igual', () => {
    const a = { id: '1', name: 'Ana', phone: '85999998888', cpf: '111.222.333-44' }
    const b = { id: '2', name: 'Beto', phone: '(85) 99999-8888', cpf: '555.666.777-88' }
    expect(sameTutor(a, b)).toBe(false)
    expect(otherPetsOfTutor({ ...a, pet_name: 'Thor' }, [{ ...b, pet_name: 'Rex' }])).toEqual([])
  })
  it('CPF só de um lado (ou incompleto) ainda cai no telefone', () => {
    const a = { id: '1', name: 'Ana', phone: '85999998888', cpf: '111.222.333-44' }
    expect(sameTutor(a, { id: '2', name: 'Ana', phone: '85999998888', cpf: null })).toBe(true)
    expect(sameTutor(a, { id: '2', name: 'Ana', phone: '85999998888', cpf: '123' })).toBe(true)
  })
  it('sem telefone e sem CPF nunca junta pessoas diferentes', () => {
    expect(sameTutor({ id: 'a', name: 'A', phone: null, cpf: null }, { id: 'b', name: 'B', phone: null, cpf: null })).toBe(false)
  })
  it('lista os outros pets do tutor, por nome do pet', () => {
    expect(otherPetsOfTutor(thor, [thor, mia, outro]).map(p => p.pet_name)).toEqual(['Mia'])
  })
})

describe('visibilidade dos dados do pet', () => {
  const base = { specialtyType: null, isNew: true, markedAsPet: false, patientHasPetData: false }
  it('clínica sem veterinária nunca mostra', () => {
    expect(petVisibility({ ...base, clinicAreas: ['medico'], markedAsPet: true, patientHasPetData: true }))
      .toEqual({ showPet: false, vetOnly: false, askIsPet: false })
    expect(petVisibility({ ...base, clinicAreas: ['medico', 'odonto'], specialtyType: 'vet' }).showPet).toBe(false)
  })
  it('clínica só de veterinária mostra sempre, sem caixa', () => {
    for (const specialtyType of [null, 'vet', 'medico']) {
      expect(petVisibility({ ...base, clinicAreas: ['vet'], specialtyType, isNew: false }))
        .toEqual({ showPet: true, vetOnly: true, askIsPet: false })
    }
  })
  it('várias áreas: profissional de outra área nunca vê; vet vê', () => {
    const clinicAreas = ['vet', 'medico']
    expect(petVisibility({ ...base, clinicAreas, specialtyType: 'medico', markedAsPet: true, patientHasPetData: true }))
      .toEqual({ showPet: false, vetOnly: false, askIsPet: false })
    expect(petVisibility({ ...base, clinicAreas, specialtyType: 'vet' }))
      .toEqual({ showPet: true, vetOnly: false, askIsPet: false })
  })
  it('várias áreas, sem área: cadastro novo depende da caixa', () => {
    const clinicAreas = ['vet', 'estetica']
    expect(petVisibility({ ...base, clinicAreas })).toEqual({ showPet: false, vetOnly: false, askIsPet: true })
    expect(petVisibility({ ...base, clinicAreas, markedAsPet: true })).toEqual({ showPet: true, vetOnly: false, askIsPet: true })
  })
  it('várias áreas, sem área: edição só com dados de pet, sem caixa', () => {
    const clinicAreas = ['vet', 'estetica']
    expect(petVisibility({ ...base, clinicAreas, isNew: false })).toEqual({ showPet: false, vetOnly: false, askIsPet: false })
    expect(petVisibility({ ...base, clinicAreas, isNew: false, patientHasPetData: true }))
      .toEqual({ showPet: true, vetOnly: false, askIsPet: false })
  })
})

describe('hasPetData', () => {
  it('detecta qualquer dado de pet e ignora vazio', () => {
    expect(hasPetData(null)).toBe(false)
    expect(hasPetData({ pet_name: '  ', pet_species: null })).toBe(false)
    expect(hasPetData({ pet_name: 'Thor' })).toBe(true)
    expect(hasPetData({ pet_species: 'Cão' })).toBe(true)
    expect(hasPetData({ pet_weight: 0 })).toBe(true)
    expect(hasPetData({ pet_neutered: false })).toBe(true)
  })
})
