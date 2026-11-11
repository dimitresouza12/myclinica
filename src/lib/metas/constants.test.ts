import { describe, expect, it } from 'vitest'
import { metasAreasOf, resolveMetasArea } from './constants'

describe('áreas de metas', () => {
  it('lista só as áreas elegíveis, sem repetir e em ordem fixa', () => {
    expect(metasAreasOf(['psico', 'odonto', 'fono', 'fono', 'to'])).toEqual(['fono', 'to', 'psico'])
    expect(metasAreasOf(['odonto', 'estetica'])).toEqual([])
  })
  it('o profissional logado começa na própria área; senão, na primeira da clínica', () => {
    expect(resolveMetasArea('to', ['fono', 'to'])).toBe('to')
    expect(resolveMetasArea('medico', ['odonto', 'fisio', 'psico'])).toBe('fisio')
    expect(resolveMetasArea(null, ['odonto'])).toBeNull()
  })
})
