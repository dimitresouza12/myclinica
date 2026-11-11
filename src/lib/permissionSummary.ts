import {
  MODULES,
  SUPPORT_ROLES,
  isAdminOnlyModule,
  isEditBlockedForRole,
  presetPermissions,
  type ModuleDef,
  type PermissionsForm,
} from './permissionPresets'

// Textos e ações em lote da tela de permissões do usuário (Configurações > Equipe).
// Funções puras: a tela só liga isso aos botões e ao estado do formulário.

const labelOf = (key: string, modules: ModuleDef[]) => modules.find(m => m.key === key)?.label ?? key

/** "A", "A e B", "A, B e C" */
export function joinPt(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`
}

/**
 * Resumo em linguagem simples do que o cargo pode fazer.
 * Ex.: "Recepção: edita Agenda e Pacientes; vê Dashboard e Procedimentos. Não acessa Prontuário e Financeiro."
 * Módulos só do administrador (Configurações, Metas) ficam fora da conta.
 */
export function permissionSummary(
  roleLabel: string,
  perms: PermissionsForm,
  modules: ModuleDef[] = MODULES,
): string {
  const relevant = modules.filter(m => !isAdminOnlyModule(m.key))
  const edits = relevant.filter(m => perms[m.key]?.can_view && perms[m.key]?.can_edit).map(m => m.label)
  const views = relevant.filter(m => perms[m.key]?.can_view && !perms[m.key]?.can_edit).map(m => m.label)
  const none = relevant.filter(m => !perms[m.key]?.can_view).map(m => m.label)

  const parts: string[] = []
  if (edits.length > 0) parts.push(`edita ${joinPt(edits)}`)
  if (views.length > 0) parts.push(`vê ${joinPt(views)}`)
  let text = `${roleLabel}: `
  if (parts.length === 0) text += 'sem acesso a nenhum módulo.'
  else {
    text += parts.join('; ')
    text += none.length > 0 ? `. Não acessa ${joinPt(none)}.` : '. Acessa todos os módulos.'
  }
  const fin = perms.financeiro
  if (fin?.can_view && fin.metadata?.show_totals !== true) text += ' No Financeiro, não vê totais e gráficos.'
  return text
}

/**
 * Avisos (não bloqueiam salvar) para combinações perigosas.
 * Recepção e auxiliar com Prontuário, Financeiro, Equipe ou Configurações; e qualquer cargo
 * que não seja admin podendo editar Equipe ou Configurações.
 */
export function permissionWarnings(
  role: string,
  roleLabel: string,
  perms: PermissionsForm,
  modules: ModuleDef[] = MODULES,
): string[] {
  if (role === 'admin' || role === 'superadmin') return []
  const out: string[] = []
  const isSupport = (SUPPORT_ROLES as readonly string[]).includes(role)
  if (isSupport) {
    const sensitive = ['prontuario', 'financeiro', 'equipe', 'configuracoes']
      .filter(k => perms[k]?.can_view)
      .map(k => labelOf(k, modules))
    if (sensitive.length > 0) {
      out.push(`${roleLabel} com acesso a ${joinPt(sensitive)}: são dados sensíveis (clínicos, financeiros ou de administração). Confirme se faz sentido.`)
    }
  }
  const adminEdits = ['equipe', 'configuracoes']
    .filter(k => perms[k]?.can_edit)
    .map(k => labelOf(k, modules))
  if (adminEdits.length > 0) {
    out.push(`Quem edita ${joinPt(adminEdits)} pode mudar acessos e dados da clínica. Isso costuma ser só do administrador.`)
  }
  return out
}

/** "Restaurar padrão do cargo": o preset do cargo; Configurações e Metas ficam como estão (são só do administrador). */
export function restoreRolePreset(role: string, current: PermissionsForm): PermissionsForm {
  const preset = presetPermissions(role)
  return keepAdminOnly(preset, current)
}

/**
 * "Marcar tudo": Ver e Editar em todos os módulos que o cargo pode editar.
 * Onde a trava do cargo (recepção e auxiliar) impede editar, marca só Ver. Módulos só do admin ficam como estão.
 * Opções extras (ex.: ver totais financeiros) também ligam.
 */
export function markAllModules(role: string, current: PermissionsForm, modules: ModuleDef[] = MODULES): PermissionsForm {
  const next: PermissionsForm = { ...current }
  for (const m of modules) {
    if (isAdminOnlyModule(m.key)) continue
    const prev = current[m.key] ?? { can_view: false, can_edit: false, metadata: {} }
    const metadata: Record<string, unknown> = { ...prev.metadata }
    for (const k of Object.keys(metadata)) if (typeof metadata[k] === 'boolean') metadata[k] = true
    next[m.key] = { can_view: true, can_edit: !isEditBlockedForRole(role, m.key), metadata }
  }
  return next
}

/** "Limpar": tira Ver e Editar de tudo (opções extras desligam). Módulos só do admin ficam como estão. */
export function clearAllModules(current: PermissionsForm, modules: ModuleDef[] = MODULES): PermissionsForm {
  const next: PermissionsForm = { ...current }
  for (const m of modules) {
    if (isAdminOnlyModule(m.key)) continue
    const prev = current[m.key] ?? { can_view: false, can_edit: false, metadata: {} }
    const metadata: Record<string, unknown> = { ...prev.metadata }
    for (const k of Object.keys(metadata)) if (typeof metadata[k] === 'boolean') metadata[k] = false
    next[m.key] = { can_view: false, can_edit: false, metadata }
  }
  return next
}

/** Antes de gravar: módulos só do administrador nunca saem com Editar ligado. */
export function sanitizeForSave(perms: PermissionsForm): PermissionsForm {
  const next: PermissionsForm = {}
  for (const [key, p] of Object.entries(perms)) {
    next[key] = isAdminOnlyModule(key) ? { ...p, can_edit: false } : p
  }
  return next
}

function keepAdminOnly(base: PermissionsForm, current: PermissionsForm): PermissionsForm {
  const next: PermissionsForm = { ...base }
  for (const key of Object.keys(base)) {
    if (isAdminOnlyModule(key) && current[key]) next[key] = current[key]
  }
  return next
}
