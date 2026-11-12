import { describe, it, expect } from 'vitest'
import { MODULES, blankPermissions, presetPermissions } from './permissionPresets'

describe('presets por cargo', () => {
  it('são só sugestão: recepção e auxiliar começam sem Financeiro e Configurações', () => {
    for (const role of ['recepcao', 'auxiliar']) {
      const perms = presetPermissions(role)
      expect(perms.financeiro).toMatchObject({ can_view: false, can_edit: false })
      expect(perms.configuracoes).toMatchObject({ can_view: false, can_edit: false })
    }
  })
  it('admin recebe todos os módulos', () => {
    const perms = presetPermissions('admin')
    for (const m of MODULES) expect(perms[m.key]).toMatchObject({ can_view: true, can_edit: true })
  })
  it('blankPermissions cobre todos os módulos, tudo desmarcado', () => {
    const perms = blankPermissions()
    for (const m of MODULES) expect(perms[m.key]).toMatchObject({ can_view: false, can_edit: false })
  })
})
