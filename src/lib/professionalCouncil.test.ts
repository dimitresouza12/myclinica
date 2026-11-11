import { describe, expect, it } from 'vitest'
import { councilForAreas, councilForProfessional, councilForType, formatRegistration, formatRqe, recordNormForType, registrationFieldLabel } from './professionalCouncil'
import { getFieldCatalog } from './documentFieldCatalog'
import { buildSignatureBlock, buildEmitenteBlock } from './documentHtml'
import { SPECIALTY_CONFIG, mergeSpecialtyConfigs } from './specialtyConfig'
import type { ClinicType } from '@/types'

const ALL: ClinicType[] = ['odonto', 'medico', 'estetica', 'vet', 'fisio', 'psico', 'nutri', 'fono', 'to']

describe('conselho por área', () => {
  it('mapeia cada área pro seu conselho', () => {
    expect(councilForType('medico')).toEqual({ code: 'CRM', label: 'CRM / RQE' })
    expect(councilForType('odonto').code).toBe('CRO')
    expect(councilForType('vet').code).toBe('CRMV')
    expect(councilForType('fisio').code).toBe('CREFITO')
    expect(councilForType('to').code).toBe('CREFITO')
    expect(councilForType('psico').code).toBe('CRP')
    expect(councilForType('nutri').code).toBe('CRN')
    expect(councilForType('fono').code).toBe('CREFONO')
  })

  it('estética e área desconhecida usam rótulo genérico, nunca CRO/CRM', () => {
    expect(councilForType('estetica')).toEqual({ code: '', label: 'Registro profissional' })
    expect(councilForType(null).label).toBe('Registro profissional')
    expect(councilForType(undefined).code).toBe('')
  })

  it('todas as 9 áreas têm rótulo', () => {
    for (const t of ALL) expect(councilForType(t).label).toBeTruthy()
  })

  it('a área do profissional manda sobre a da clínica', () => {
    expect(councilForProfessional({ specialtyType: 'psico', clinicType: 'odonto' }).code).toBe('CRP')
    expect(councilForProfessional({ specialtyType: null, clinicType: 'vet' }).code).toBe('CRMV')
    expect(councilForProfessional({}).code).toBe('')
  })

  it('na estética, especialidades com conselho próprio usam o dele', () => {
    expect(councilForProfessional({ specialtyType: 'estetica', specialty: 'Biomedicina Estética' }).code).toBe('CRBM')
    expect(councilForProfessional({ specialtyType: 'estetica', specialty: 'Dermatologia' }).code).toBe('CRM')
    expect(councilForProfessional({ specialtyType: 'estetica', specialty: 'Fisioterapia Dermato Funcional' }).code).toBe('CREFITO')
    expect(councilForProfessional({ specialtyType: 'estetica', specialty: 'Esteticista' }).code).toBe('')
    // especialidade não muda conselho fora da estética
    expect(councilForProfessional({ specialtyType: 'odonto', specialty: 'Dermatologia' }).code).toBe('CRO')
  })
})

describe('formatRegistration', () => {
  const crp = councilForType('psico')
  it('prefixa a sigla quando só há o número', () => {
    expect(formatRegistration(crp, '06/12345')).toBe('CRP 06/12345')
  })
  it('mantém quando o profissional já digitou a sigla', () => {
    expect(formatRegistration(crp, 'CRP 06/12345')).toBe('CRP 06/12345')
    expect(formatRegistration(councilForType('medico'), 'CRM-CE 12345 / RQE 678')).toBe('CRM-CE 12345 / RQE 678')
    expect(formatRegistration(councilForType('fisio'), 'crefito 6/12345-F')).toBe('crefito 6/12345-F')
  })
  it('vazio quando não há número e sem prefixo em área sem sigla', () => {
    expect(formatRegistration(crp, '')).toBe('')
    expect(formatRegistration(crp, null)).toBe('')
    expect(formatRegistration(councilForType('estetica'), ' 123 ')).toBe('123')
  })
})

describe('norma do prontuário', () => {
  it('cita só onde há norma conhecida', () => {
    expect(recordNormForType('fisio')).toBe('COFFITO 414/2012')
    expect(recordNormForType('psico')).toBe('CFP 001/2009')
    expect(recordNormForType('medico')).toBe('CFM 1.638/2002')
    expect(recordNormForType('estetica')).toBeNull()
    expect(recordNormForType(undefined)).toBeNull()
  })
})

describe('configuração de especialidades (documentos e abas)', () => {
  it('estética pura não tem odontograma, receita controlada nem atestado', () => {
    expect(SPECIALTY_CONFIG.estetica.recordTabs).not.toContain('odontograma')
    const types = SPECIALTY_CONFIG.estetica.documents.map(d => d.type)
    expect(types).not.toContain('receita_especial')
    expect(types).not.toContain('atestado')
  })

  it('clínica com estética + odonto continua vendo o odontograma', () => {
    expect(mergeSpecialtyConfigs(['estetica', 'odonto']).recordTabs).toContain('odontograma')
    expect(mergeSpecialtyConfigs(['estetica']).recordTabs).not.toContain('odontograma')
  })

  it('fisio tem a aba corpograma (mapa de dor); estética continua sem odontograma', () => {
    expect(SPECIALTY_CONFIG.fisio.recordTabs).toContain('corpograma')
    expect(mergeSpecialtyConfigs(['fisio']).recordTabs).toContain('corpograma')
    expect(mergeSpecialtyConfigs(['estetica', 'fisio']).recordTabs).toEqual(['faceograma', 'corpograma', 'comparador', 'metas'])
    expect(SPECIALTY_CONFIG.estetica.recordTabs).not.toContain('odontograma')
  })

  it('fisio, fono e to têm Laudo/Relatório; psico, nutri e vet têm seus modelos', () => {
    for (const t of ['fisio', 'fono', 'to', 'psico', 'nutri', 'vet'] as ClinicType[]) {
      const laudo = SPECIALTY_CONFIG[t].documents.find(d => d.type === 'laudo')
      expect(laudo, t).toBeTruthy()
      expect(laudo?.body, t).toBeTruthy()
      expect(laudo?.reviewNote, t).toBe(true)
    }
  })

  it('cada área não repete tipo de documento', () => {
    for (const t of ALL) {
      const types = SPECIALTY_CONFIG[t].documents.map(d => d.type)
      expect(new Set(types).size, t).toBe(types.length)
    }
  })

  it('psicologia tem declaração sem CID (modelo genérico com aviso de revisão)', () => {
    const decl = SPECIALTY_CONFIG.psico.documents.find(d => d.type === 'declaracao_comparecimento')
    expect(decl?.body).toContain('não contém informações sobre diagnóstico')
    expect(decl?.reviewNote).toBe(true)
  })
})

describe('RQE e rótulos de registro', () => {
  it('formatRqe prefixa a sigla, mantém se já vier e some quando vazio', () => {
    expect(formatRqe('12345')).toBe('RQE 12345')
    expect(formatRqe(' rqe 12345 ')).toBe('rqe 12345')
    expect(formatRqe('')).toBe('')
    expect(formatRqe(null)).toBe('')
  })

  it('rótulo do registro segue o conselho; sem conselho fica genérico', () => {
    expect(registrationFieldLabel(councilForType('odonto'))).toBe('Registro profissional (CRO)')
    expect(registrationFieldLabel(councilForType('medico'))).toBe('Registro profissional (CRM / RQE)')
    expect(registrationFieldLabel(councilForType('estetica'))).toBe('Registro profissional')
  })

  it('councilForAreas: um conselho só vale; áreas divergentes viram genérico', () => {
    expect(councilForAreas(['fisio', 'to']).code).toBe('CREFITO')
    expect(councilForAreas(['odonto', 'fisio']).code).toBe('')
    expect(councilForAreas([]).code).toBe('')
  })

  it('catálogo de campos: rótulo do registro vem do conselho e RQE só em medicina', () => {
    const odonto = getFieldCatalog('atestado', councilForType('odonto'))
    expect(odonto.find(f => f.key === 'registro')?.label).toBe('Registro profissional (CRO)')
    expect(odonto.some(f => f.key === 'rqe')).toBe(false)
    const medico = getFieldCatalog('atestado', councilForType('medico'))
    expect(medico.some(f => f.key === 'rqe')).toBe(true)
    expect(getFieldCatalog('atestado').find(f => f.key === 'registro')?.label).toBe('Registro profissional')
    expect(JSON.stringify(getFieldCatalog('receita_especial', councilForType('medico')))).not.toContain('CRO/CRM')
  })

  it('RQE só aparece nos documentos quando preenchido', () => {
    const council = councilForType('medico')
    const base = { doctorName: 'Dra. A', registrationNumber: '123', council, professionalId: 'p1' }
    expect(buildSignatureBlock(base)).not.toContain('RQE')
    expect(buildSignatureBlock({ ...base, rqe: '999' })).toContain('RQE 999')
    expect(buildEmitenteBlock({ ...base, clinicAddress: 'Av. B' })).toContain('CRM / RQE:')
    const emitente = buildEmitenteBlock({ ...base, rqe: '999', clinicAddress: 'Av. B' })
    expect(emitente).toContain('RQE: <strong>999</strong>')
    expect(emitente).not.toContain('CRM / RQE')
  })
})
