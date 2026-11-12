import { describe, it, expect } from 'vitest'
import { blankPermissions, canSeeFinancialTotals, MODULES, presetPermissions } from './permissionPresets'
import { clearAllModules, joinPt, markAllModules, permissionSummary, permissionWarnings, restoreRolePreset } from './permissionSummary'

describe('joinPt', () => {
  it('junta em português', () => {
    expect(joinPt([])).toBe('')
    expect(joinPt(['A'])).toBe('A')
    expect(joinPt(['A', 'B'])).toBe('A e B')
    expect(joinPt(['A', 'B', 'C'])).toBe('A, B e C')
  })
})

describe('permissionSummary', () => {
  it('descreve o preset da recepção', () => {
    const text = permissionSummary('Recepção', presetPermissions('recepcao'))
    expect(text).toContain('Recepção: edita Pacientes e Agenda; vê Dashboard e Procedimentos.')
    expect(text).toContain('Não acessa Prontuário, Financeiro')
    // Configurações e Metas entram na conta como qualquer outro módulo
    expect(text).toContain('Configurações')
    expect(text).toContain('Metas')
  })
  it('sem nenhum acesso', () => {
    expect(permissionSummary('Auxiliar', blankPermissions())).toBe('Auxiliar: sem acesso a nenhum módulo.')
  })
  it('avisa quando o Financeiro está sem totais', () => {
    const perms = blankPermissions()
    perms.financeiro = { can_view: true, can_edit: false, metadata: { show_totals: false } }
    expect(permissionSummary('Dentista', perms)).toContain('vê Financeiro')
    expect(permissionSummary('Dentista', perms)).toContain('não vê totais')
    perms.financeiro.metadata = { show_totals: true }
    expect(permissionSummary('Dentista', perms)).not.toContain('não vê totais')
  })
  it('respeita a lista de módulos da clínica (sem campanhas fora do plano)', () => {
    const text = permissionSummary('Recepção', presetPermissions('recepcao'), MODULES.filter(m => !m.plusOnly))
    expect(text).not.toContain('Campanhas')
  })
})

describe('permissionWarnings', () => {
  it('recepção com prontuário e financeiro', () => {
    const perms = blankPermissions()
    perms.prontuario = { can_view: true, can_edit: false, metadata: {} }
    perms.financeiro = { can_view: true, can_edit: false, metadata: {} }
    const w = permissionWarnings('recepcao', 'Recepção', perms)
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('Prontuário e Financeiro')
  })
  it('recepção editando financeiro e configurações: aviso informativo, sem bloquear', () => {
    const perms = blankPermissions()
    perms.financeiro = { can_view: true, can_edit: true, metadata: {} }
    perms.configuracoes = { can_view: true, can_edit: true, metadata: {} }
    const w = permissionWarnings('recepcao', 'Recepção', perms)
    expect(w.some(x => x.includes('terá acesso de edição a Financeiro e Configurações'))).toBe(true)
  })
  it('profissional editando equipe', () => {
    const perms = blankPermissions()
    perms.equipe = { can_view: true, can_edit: true, metadata: {} }
    const w = permissionWarnings('dentista', 'Dentista', perms)
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('Equipe')
    expect(w[0]).toContain('nunca administradores')
  })
  it('recepção editando equipe: aviso de dado sensível e de acessos', () => {
    const perms = blankPermissions()
    perms.equipe = { can_view: true, can_edit: true, metadata: {} }
    const w = permissionWarnings('recepcao', 'Recepção', perms)
    expect(w).toHaveLength(2)
  })
  it('preset do dentista não gera aviso; admin nunca', () => {
    expect(permissionWarnings('dentista', 'Dentista', presetPermissions('dentista'))).toEqual([])
    const all = markAllModules(blankPermissions())
    expect(permissionWarnings('admin', 'Admin', all)).toEqual([])
  })
})

describe('ações em lote', () => {
  it('restaurar padrão devolve o preset do cargo', () => {
    const out = restoreRolePreset('recepcao')
    expect(out).toEqual(presetPermissions('recepcao'))
  })
  it('marcar tudo marca Ver e Editar em todos os módulos, para qualquer cargo', () => {
    const out = markAllModules(blankPermissions())
    for (const m of MODULES) expect(out[m.key]).toMatchObject({ can_view: true, can_edit: true })
    expect(out.financeiro.metadata.show_totals).toBe(true)
  })
  it('marcar tudo respeita a lista de módulos passada (sem campanhas fora do plano)', () => {
    const out = markAllModules(blankPermissions(), MODULES.filter(m => !m.plusOnly))
    expect(out.agenda.can_edit).toBe(true)
    expect(out.campanhas.can_view).toBe(false)
  })
  it('limpar desmarca tudo e desliga as opções extras', () => {
    const out = clearAllModules(presetPermissions('dentista'))
    expect(out.agenda).toMatchObject({ can_view: false, can_edit: false })
    expect(out.financeiro.metadata.show_totals).toBe(false)
  })
})

describe('Ver totais financeiros', () => {
  it('começa desligado por padrão em perfis novos, mas ligado para admin', () => {
    expect(presetPermissions('recepcao').financeiro.metadata.show_totals).toBe(false)
    expect(presetPermissions('dentista').financeiro.metadata.show_totals).toBe(false)
    expect(blankPermissions().financeiro.metadata.show_totals).toBe(false)
    expect(presetPermissions('admin').financeiro.metadata.show_totals).toBe(true)
  })
  it('regra de tela: admin vê; precisa de Ver em Financeiro; show_totals false esconde', () => {
    expect(canSeeFinancialTotals({ isAdmin: true, canView: false })).toBe(true)
    expect(canSeeFinancialTotals({ isAdmin: false, canView: false, metadata: {} })).toBe(false)
    expect(canSeeFinancialTotals({ isAdmin: false, canView: true, metadata: { show_totals: false } })).toBe(false)
    expect(canSeeFinancialTotals({ isAdmin: false, canView: true, metadata: { show_totals: true } })).toBe(true)
    expect(canSeeFinancialTotals({ isAdmin: false, canView: true, metadata: {} })).toBe(true)
  })
})
