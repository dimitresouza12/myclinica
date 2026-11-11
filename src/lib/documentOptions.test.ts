import { describe, expect, it } from 'vitest'
import { resolveDocumentOptions, SPECIALTY_CONFIG } from './specialtyConfig'
import type { ClinicType, DocumentTemplateType } from '@/types'

const types = (o: ReturnType<typeof resolveDocumentOptions>) => o.map(d => d.type)

// Documentos que cada área oferecia ANTES da Onda 1 (git HEAD) — nenhum pode sumir
// numa clínica existente.
const LEGACY: Record<ClinicType, DocumentTemplateType[]> = {
  odonto: ['receita_comum', 'receita_especial', 'declaracao_comparecimento', 'atestado'],
  medico: ['receita_comum', 'receita_especial', 'declaracao_comparecimento', 'atestado', 'laudo'],
  estetica: ['receita_comum', 'receita_especial', 'declaracao_comparecimento', 'atestado', 'laudo'],
  vet: ['receita_comum', 'receita_especial', 'declaracao_comparecimento', 'atestado'],
  fisio: ['declaracao_comparecimento', 'atestado'],
  psico: ['declaracao_comparecimento', 'atestado'],
  nutri: ['receita_comum', 'declaracao_comparecimento'],
  fono: ['declaracao_comparecimento', 'atestado'],
  to: ['declaracao_comparecimento', 'atestado'],
}
const ALL = Object.keys(LEGACY) as ClinicType[]

describe('resolveDocumentOptions', () => {
  it('odonto agora também tem Laudo', () => {
    expect(types(SPECIALTY_CONFIG.odonto.documents)).toContain('laudo')
  })

  it('clínica de área única sem profissional/área: mesmos documentos de antes (exceto estética pura)', () => {
    for (const t of ALL.filter(a => a !== 'estetica')) {
      const got = types(resolveDocumentOptions({ clinicType: t, clinicSpecialties: [t] }))
      for (const legacy of LEGACY[t]) expect(got, `${t}/${legacy}`).toContain(legacy)
    }
  })

  it('estética pura: sem receita especial/atestado; modelo salvo mantém o tipo visível', () => {
    const base = resolveDocumentOptions({ clinicType: 'estetica', clinicSpecialties: ['estetica'] })
    expect(types(base)).not.toContain('receita_especial')
    expect(types(base)).not.toContain('atestado')
    const saved = resolveDocumentOptions({ clinicType: 'estetica', clinicSpecialties: ['estetica'], savedTypes: ['atestado', 'receita_especial'] })
    expect(types(saved)).toEqual(expect.arrayContaining(['atestado', 'receita_especial']))
    expect(new Set(types(saved)).size).toBe(types(saved).length)
  })

  it('estética pura com dermatologista/biomédico/dentista mantém o conjunto completo', () => {
    for (const specialty of ['Dermatologia', 'Biomedicina Estética', 'Dentista', 'Harmonização Orofacial']) {
      const got = types(resolveDocumentOptions({ clinicType: 'estetica', clinicSpecialties: ['estetica'], professionalType: 'estetica', professionalSpecialty: specialty }))
      expect(got, specialty).toEqual(expect.arrayContaining(LEGACY.estetica))
    }
    // esteticista comum continua sem
    const plain = types(resolveDocumentOptions({ clinicType: 'estetica', clinicSpecialties: ['estetica'], professionalType: 'estetica', professionalSpecialty: 'Esteticista' }))
    expect(plain).not.toContain('atestado')
  })

  it('estética+odonto: profissional sem specialty_type não perde nada', () => {
    const got = types(resolveDocumentOptions({ clinicType: 'estetica', clinicSpecialties: ['estetica', 'odonto'], professionalType: null }))
    for (const legacy of [...LEGACY.estetica, ...LEGACY.odonto]) expect(got).toContain(legacy)
  })

  it('estética+odonto: sem profissional definido ou profissional de estética continua com receita especial e atestado', () => {
    const none = types(resolveDocumentOptions({ clinicType: 'estetica', clinicSpecialties: ['estetica', 'odonto'] }))
    expect(none).toEqual(expect.arrayContaining(['receita_especial', 'atestado', 'laudo']))
    const est = types(resolveDocumentOptions({ clinicType: 'estetica', clinicSpecialties: ['estetica', 'odonto'], professionalType: 'estetica' }))
    expect(est).toEqual(expect.arrayContaining(LEGACY.estetica))
  })

  it('estética+odonto: dentista vê os documentos de odonto (incluindo laudo)', () => {
    const got = types(resolveDocumentOptions({ clinicType: 'estetica', clinicSpecialties: ['estetica', 'odonto'], professionalType: 'odonto' }))
    expect(got).toEqual(expect.arrayContaining([...LEGACY.odonto, 'laudo']))
  })

  it('usa a área do usuário logado quando o profissional não tem área', () => {
    const got = types(resolveDocumentOptions({ clinicType: 'estetica', clinicSpecialties: ['estetica', 'odonto'], professionalType: null, userType: 'odonto' }))
    expect(got).toEqual(expect.arrayContaining(LEGACY.odonto))
  })

  it('profissional de outra área vê os documentos dela; tipos com modelo salvo continuam visíveis', () => {
    const psi = types(resolveDocumentOptions({ clinicType: 'estetica', clinicSpecialties: ['estetica', 'psico'], professionalType: 'psico' }))
    expect(psi).toEqual(['declaracao_comparecimento', 'atestado', 'laudo'].filter(t => psi.includes(t as DocumentTemplateType)))
    const withSaved = types(resolveDocumentOptions({ clinicType: 'estetica', clinicSpecialties: ['estetica', 'psico'], professionalType: 'psico', savedTypes: ['receita_especial'] }))
    expect(withSaved).toContain('receita_especial')
  })

  it('sem nenhuma informação, cai em odonto (comportamento de getSpecialtyConfig)', () => {
    expect(types(resolveDocumentOptions({}))).toEqual(types(SPECIALTY_CONFIG.odonto.documents))
  })

  it('TCLE e termo de imagem da estética ficam escondidos com a flag desligada', () => {
    for (const specialties of [['estetica'], ['estetica', 'odonto']] as ClinicType[][]) {
      const got = types(resolveDocumentOptions({ clinicType: 'estetica', clinicSpecialties: specialties, esteticaExtras: false }))
      expect(got).not.toContain('tcle')
      expect(got).not.toContain('termo_imagem')
    }
  })

  it('com a flag ligada, só áreas de estética ganham TCLE e termo de imagem', () => {
    const est = types(resolveDocumentOptions({ clinicType: 'estetica', clinicSpecialties: ['estetica'], esteticaExtras: true }))
    expect(est).toEqual(expect.arrayContaining(['tcle', 'termo_imagem']))
    const odonto = types(resolveDocumentOptions({ clinicType: 'odonto', clinicSpecialties: ['odonto'], esteticaExtras: true }))
    expect(odonto).not.toContain('tcle')
    const psi = types(resolveDocumentOptions({ clinicType: 'estetica', clinicSpecialties: ['estetica', 'psico'], professionalType: 'psico', esteticaExtras: true }))
    expect(psi).not.toContain('tcle')
  })

  it('modelo já salvo de TCLE continua visível mesmo com a flag desligada', () => {
    const got = types(resolveDocumentOptions({ clinicType: 'estetica', clinicSpecialties: ['estetica'], savedTypes: ['tcle'] }))
    expect(got).toContain('tcle')
  })
})
