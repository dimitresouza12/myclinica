import { describe, it, expect } from 'vitest'
import { genderSelectOptions, GENDER_OPTIONS } from './gender'

describe('opções de gênero', () => {
  it('uma lista só, com "Selecionar" na frente', () => {
    const o = genderSelectOptions('')
    expect(o.map(x => x.value)).toEqual(['', ...GENDER_OPTIONS])
  })
  it('valor antigo "Outro" continua aparecendo no seletor (não fica em branco)', () => {
    const o = genderSelectOptions('Outro')
    expect(o.some(x => x.value === 'Outro')).toBe(true)
  })
  it('valor da lista não duplica', () => {
    expect(genderSelectOptions('Feminino').filter(x => x.value === 'Feminino')).toHaveLength(1)
  })
})
