import { describe, expect, it } from 'vitest'
import { SPECIALTY_CONFIG, mergeSpecialtyConfigs } from '@/lib/specialtyConfig'
import { unsavedLabels } from '@/lib/prontuario/leaveGuard'
import { resolveTab } from '@/lib/prontuario/navigation'

describe('aba Exames e receitas do prontuário', () => {
  it('só a Medicina tem a aba, inclusive em clínica multi-área', () => {
    expect(SPECIALTY_CONFIG.medico.recordTabs).toContain('medicina')
    for (const [area, cfg] of Object.entries(SPECIALTY_CONFIG)) {
      if (area !== 'medico') expect(cfg.recordTabs).not.toContain('medicina')
    }
    expect(mergeSpecialtyConfigs(['medico', 'nutri']).recordTabs).toEqual(expect.arrayContaining(['medicina', 'nutri']))
    expect(mergeSpecialtyConfigs(['odonto']).recordTabs).not.toContain('medicina')
  })
  it('avisa antes de sair com pedido, receita ou medida em preenchimento', () => {
    expect(unsavedLabels({ medicina: true })).toEqual(['o pedido de exames, a receita ou a medida de crescimento em preenchimento'])
  })
  it('?aba=medicina abre a aba só se ela existir para a clínica', () => {
    expect(resolveTab('medicina', ['ficha', 'medicina', 'timeline'])).toBe('medicina')
    expect(resolveTab('medicina', ['ficha', 'timeline'])).toBe('ficha')
  })
})
