import { describe, expect, it } from 'vitest'
import {
  ageInYears, buildGuardianColumns, EMPTY_GUARDIAN_FORM, guardianIdent, guardianIsFocus, guardianLabels, hasGuardianData,
  isGuardianColumnError, isMinor, stripGuardianColumns,
} from './responsavel'

const TODAY = new Date(2026, 10, 11) // 11/11/2026

describe('idade e menor de idade', () => {
  it('conta anos completos', () => {
    expect(ageInYears('2008-11-11', TODAY)).toBe(18)
    expect(ageInYears('2008-11-12', TODAY)).toBe(17)
    expect(ageInYears('2020-01-01', TODAY)).toBe(6)
  })
  it('data inválida ou futura não tem idade', () => {
    expect(ageInYears('', TODAY)).toBeNull()
    expect(ageInYears(null, TODAY)).toBeNull()
    expect(ageInYears('2030-01-01', TODAY)).toBeNull()
  })
  it('isMinor: só abaixo de 18 com data válida', () => {
    expect(isMinor('2015-05-05', TODAY)).toBe(true)
    expect(isMinor('2008-11-11', TODAY)).toBe(false)
    expect(isMinor(null, TODAY)).toBe(false)
  })
})

describe('áreas e rótulos', () => {
  it('destaca fono, to, psico e vet', () => {
    expect(guardianIsFocus(['fono'])).toBe(true)
    expect(guardianIsFocus(['odonto', 'to'])).toBe(true)
    expect(guardianIsFocus(['odonto', 'estetica'])).toBe(false)
    expect(guardianIsFocus([])).toBe(false)
  })
  it('rótulo Tutor só em clínica veterinária pura', () => {
    expect(guardianLabels(['vet']).name).toBe('Nome do tutor')
    expect(guardianLabels(['vet', 'medico']).name).toBe('Nome do responsável')
    expect(guardianLabels(['fono']).title).toBe('Responsável legal')
  })
})

describe('colunas', () => {
  const v = { nome: ' Ana Souza ', cpf: '123.456.789-09', parentesco: 'Mãe', telefone: '(85) 99999-8888' }
  it('sem colunas no banco não envia nada', () => {
    expect(buildGuardianColumns(v, { enabled: false })).toEqual({})
  })
  it('com colunas, vazio vira null', () => {
    expect(buildGuardianColumns(v, { enabled: true })).toEqual({
      guardian_name: 'Ana Souza', guardian_cpf: '123.456.789-09', guardian_relationship: 'Mãe', guardian_phone: '(85) 99999-8888',
    })
    expect(buildGuardianColumns(EMPTY_GUARDIAN_FORM, { enabled: true })).toEqual({
      guardian_name: null, guardian_cpf: null, guardian_relationship: null, guardian_phone: null,
    })
  })
  it('hasGuardianData', () => {
    expect(hasGuardianData(EMPTY_GUARDIAN_FORM)).toBe(false)
    expect(hasGuardianData({ ...EMPTY_GUARDIAN_FORM, nome: 'A' })).toBe(true)
    expect(hasGuardianData(null)).toBe(false)
  })
  it('reconhece erro de coluna ausente do responsável e ignora outros', () => {
    expect(isGuardianColumnError({ code: 'PGRST204', message: "Could not find the 'guardian_name' column of 'patients' in the schema cache" })).toBe(true)
    expect(isGuardianColumnError({ code: '42703', message: 'column "guardian_cpf" of relation "patients" does not exist' })).toBe(true)
    expect(isGuardianColumnError({ code: 'PGRST204', message: "Could not find the 'pet_sex' column" })).toBe(false)
    expect(isGuardianColumnError({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(isGuardianColumnError(null)).toBe(false)
  })
  it('stripGuardianColumns tira só as colunas do responsável', () => {
    expect(stripGuardianColumns({ name: 'X', guardian_name: 'A', guardian_cpf: 'B', guardian_relationship: 'C', guardian_phone: 'D' })).toEqual({ name: 'X' })
  })
})

describe('guardianIdent', () => {
  it('nome com CPF formatado, só nome ou vazio', () => {
    expect(guardianIdent({ guardian_name: 'Ana Souza', guardian_cpf: '12345678909' })).toBe('Ana Souza, CPF 123.456.789-09')
    expect(guardianIdent({ guardian_name: 'Ana Souza' })).toBe('Ana Souza')
    expect(guardianIdent({ guardian_cpf: '12345678909' })).toBe('')
    expect(guardianIdent(null)).toBe('')
  })
})

describe('campos do responsável nos documentos e contratos', () => {
  it('contrato preenche {{responsavel}} e {{responsavel_ident}}', async () => {
    const { renderContract } = await import('@/lib/contratos/modelo')
    const base = {
      patientName: 'Pedro', clinicName: 'Clínica Sol', amount: 100, paymentMethod: 'Pix',
      validFrom: '2026-11-01', validUntil: '2027-11-01', today: '2026-11-11',
    }
    const t = 'Responsável: {{responsavel_ident}}. Nome: {{responsavel}}.'
    expect(renderContract(t, { ...base, guardianName: 'Ana Souza', guardianCpf: '12345678909' }).text)
      .toBe('Responsável: Ana Souza, CPF 123.456.789-09. Nome: Ana Souza.')
    // sem responsável cadastrado, fica pendente (não some em silêncio)
    const semResp = renderContract(t, base)
    expect(semResp.missing.length).toBeGreaterThan(0)
    expect(semResp.text).toContain('[')
  })
  it('documento resolve os campos do responsável', async () => {
    const { resolveDocFields } = await import('@/lib/documentos/campos')
    const f = resolveDocFields({
      patientName: 'Pedro', guardianName: ' Ana Souza ', guardianCpf: '12345678909',
      council: { sigla: 'CRM' } as never, today: '2026-11-11',
    })
    expect(f.responsavel).toBe('Ana Souza')
    expect(f.responsavelIdent).toBe('Ana Souza, CPF 123.456.789-09')
    expect(resolveDocFields({ patientName: 'Pedro', council: { sigla: 'CRM' } as never, today: '2026-11-11' }).responsavelIdent).toBe('')
  })
})
