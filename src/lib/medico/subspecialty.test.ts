import { describe, it, expect } from 'vitest'
import { matchMedicoSpecialty, medicoSelectValue, medicoExtrasKey, CLINICO_GERAL } from './subspecialty'

describe('sub-especialidade médica', () => {
  it('casa o nome exato', () => {
    expect(matchMedicoSpecialty('Cardiologia')).toBe('Cardiologia')
    expect(matchMedicoSpecialty('Radiologia / Ultrassonografia')).toBe('Radiologia / Ultrassonografia')
  })
  it('casa grafias aproximadas (o defeito do plano)', () => {
    expect(matchMedicoSpecialty('Cardiologista')).toBe('Cardiologia')
    expect(matchMedicoSpecialty('Ginecologia e Obstetrícia')).toBe('Ginecologia')
    expect(matchMedicoSpecialty('ginecologista')).toBe('Ginecologia')
    expect(matchMedicoSpecialty('Pediatra')).toBe('Pediatria')
    expect(matchMedicoSpecialty('Ortopedia e Traumatologia')).toBe('Ortopedia')
    expect(matchMedicoSpecialty('Otorrinolaringologista')).toBe('Otorrinolaringologia')
    expect(matchMedicoSpecialty('Ultrassonografista')).toBe('Radiologia / Ultrassonografia')
  })
  it('vazio, Clínico Geral e Outra não têm campos extras', () => {
    expect(matchMedicoSpecialty(null)).toBeNull()
    expect(matchMedicoSpecialty('')).toBeNull()
    expect(matchMedicoSpecialty('Clínico Geral')).toBeNull()
    expect(matchMedicoSpecialty('Outra')).toBeNull()
    expect(medicoSelectValue('Outra')).toBe(CLINICO_GERAL)
    expect(medicoExtrasKey(CLINICO_GERAL)).toBeNull()
    expect(medicoExtrasKey('Neurologia')).toBe('Neurologia')
  })
})
