import { describe, it, expect } from 'vitest'
import { blankPermissions, blockedEditMessage, blockedEditViolations, isEditBlockedForRole, presetPermissions } from './permissionPresets'

describe('trava de edição para cargos de apoio', () => {
  it('recepção e auxiliar não editam equipe, configurações e financeiro', () => {
    for (const role of ['recepcao', 'auxiliar']) {
      for (const m of ['equipe', 'configuracoes', 'financeiro']) expect(isEditBlockedForRole(role, m)).toBe(true)
      expect(isEditBlockedForRole(role, 'agenda')).toBe(false)
    }
  })
  it('outros cargos não são afetados', () => {
    expect(isEditBlockedForRole('profissional', 'financeiro')).toBe(false)
    expect(isEditBlockedForRole('admin', 'equipe')).toBe(false)
  })
  it('os presets de recepção e auxiliar passam na validação', () => {
    expect(blockedEditViolations('recepcao', presetPermissions('recepcao'))).toEqual([])
    expect(blockedEditViolations('auxiliar', presetPermissions('auxiliar'))).toEqual([])
  })
  it('acha o can_edit proibido (caso da recepcionista com edição em equipe)', () => {
    const perms = blankPermissions()
    perms.equipe = { can_view: true, can_edit: true, metadata: {} }
    perms.financeiro = { can_view: true, can_edit: false, metadata: {} }
    perms.crm = { can_view: true, can_edit: true, metadata: {} }
    expect(blockedEditViolations('recepcao', perms)).toEqual(['equipe'])
    expect(blockedEditViolations('profissional', perms)).toEqual([])
    expect(blockedEditMessage(['equipe', 'financeiro'])).toContain('Equipe, Financeiro')
  })
})
