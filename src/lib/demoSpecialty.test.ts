import { describe, expect, it } from 'vitest'
import { applyDemoSpecialty, DEMO_AREAS, isDemoArea, restoreDemoBase } from './demoSpecialty'
import { CLINIC_TYPE_LABELS, SPECIALTY_CONFIG } from './specialtyConfig'
import type { AuthClinic, AuthUser } from '@/types'

const clinic = { id: 'c1', type: 'estetica', demoMode: true, specialties: ['estetica', 'odonto'] } as unknown as AuthClinic
const user = { id: 'u1', role: 'admin', specialtyType: null, professionalId: null } as unknown as AuthUser

describe('demoSpecialty', () => {
  it('lista as 9 áreas, todas com rótulo e configuração', () => {
    expect(DEMO_AREAS).toHaveLength(9)
    for (const a of DEMO_AREAS) {
      expect(CLINIC_TYPE_LABELS[a]).toBeTruthy()
      expect(SPECIALTY_CONFIG[a].icon).toBeTruthy()
      expect(SPECIALTY_CONFIG[a].color).toMatch(/^\d+,\d+,\d+$/)
    }
  })

  it('isDemoArea só aceita uma das 9', () => {
    expect(isDemoArea('vet')).toBe(true)
    expect(isDemoArea('dentista')).toBe(false)
    expect(isDemoArea(null)).toBe(false)
  })

  it('apply troca type, specialties, specialtyType e professionalId sem mexer no resto', () => {
    const out = applyDemoSpecialty(clinic, user, 'vet', 'p9')
    expect(out.clinic.type).toBe('vet')
    expect(out.clinic.specialties).toEqual(['vet'])
    expect(out.user.specialtyType).toBe('vet')
    expect(out.user.professionalId).toBe('p9')
    expect(clinic.type).toBe('estetica')
  })

  it('restore devolve o que estava na base', () => {
    const applied = applyDemoSpecialty(clinic, user, 'psico', 'p1')
    const back = restoreDemoBase(applied.clinic, applied.user, { type: 'estetica', specialties: ['estetica', 'odonto'], specialtyType: null, professionalId: null })
    expect(back.clinic.type).toBe('estetica')
    expect(back.clinic.specialties).toEqual(['estetica', 'odonto'])
    expect(back.user.specialtyType).toBeNull()
    expect(back.user.professionalId).toBeNull()
  })
})
