// Módulos disponíveis para controle de permissão — precisa cobrir TODO
// module="..." usado em PermissionGuard pelo app (ver grep em src/app),
// senão o módulo fica bloqueado pra sempre pra quem não é admin, sem
// nenhum checkbox pra liberar (era exatamente o bug com procedimentos,
// relatórios, metas e campanhas antes desta lista ser completada).
export const MODULES = [
  { key: 'dashboard',     label: 'Dashboard',     icon: '', plusOnly: false },
  { key: 'pacientes',     label: 'Pacientes',      icon: '', plusOnly: false },
  { key: 'prontuario',    label: 'Prontuário',     icon: '', plusOnly: false },
  { key: 'agenda',        label: 'Agenda',         icon: '', plusOnly: false },
  { key: 'financeiro',    label: 'Financeiro',     icon: '', plusOnly: false },
  { key: 'comissoes',     label: 'Comissões',      icon: '', plusOnly: false },
  { key: 'procedimentos', label: 'Procedimentos',  icon: '', plusOnly: false },
  { key: 'relatorios',    label: 'Relatórios',     icon: '', plusOnly: false },
  { key: 'metas',         label: 'Metas',          icon: '', plusOnly: false },
  { key: 'estoque',       label: 'Estoque',        icon: '', plusOnly: false },
  { key: 'equipe',        label: 'Equipe',         icon: '', plusOnly: false },
  { key: 'crm',           label: 'CRM',            icon: '', plusOnly: true  },
  { key: 'campanhas',     label: 'Campanhas',      icon: '', plusOnly: true  },
  { key: 'configuracoes', label: 'Configurações',  icon: '', plusOnly: false },
]

export interface ModulePermForm {
  can_view: boolean
  can_edit: boolean
  metadata: Record<string, unknown>
}
export type PermissionsForm = Record<string, ModulePermForm>

// Opções extras configuráveis por módulo
export const MODULE_EXTRAS: Record<string, { key: string; label: string }[]> = {
  financeiro: [
    { key: 'show_totals', label: 'Ver totais e gráficos financeiros' },
  ],
}

// Ponto de partida ao criar um usuário novo — o admin ainda pode ajustar
// cada checkbox depois, isso é só o preset inicial por cargo. Módulo não
// listado aqui fica sem acesso (mais seguro por padrão do que dar tudo,
// que era o comportamento antigo e é o motivo de recepcionistas reais em
// produção terem hoje edição total de Financeiro e Configurações).
export const ROLE_PRESET_MODULES: Record<string, { edit?: string[]; view?: string[] }> = {
  recepcao:     { edit: ['agenda', 'pacientes'],                    view: ['dashboard', 'procedimentos'] },
  auxiliar:     { edit: ['agenda', 'estoque'],                      view: ['dashboard', 'pacientes', 'prontuario', 'procedimentos'] },
  dentista:     { edit: ['agenda', 'pacientes', 'prontuario'],      view: ['dashboard', 'procedimentos', 'relatorios'] },
  medico:       { edit: ['agenda', 'pacientes', 'prontuario'],      view: ['dashboard', 'procedimentos', 'relatorios'] },
  profissional: { edit: ['agenda', 'pacientes', 'prontuario'],      view: ['dashboard', 'procedimentos', 'relatorios'] },
}

export function presetPermissions(role: string): PermissionsForm {
  // Admin tem acesso total via short-circuit em usePermissions.ts e o
  // formulário de permissões nem aparece pra esse cargo — mantém o
  // comportamento antigo (tudo marcado) só pra não gravar uma linha
  // inconsistente no banco caso o cargo mude antes de salvar.
  if (role === 'admin' || role === 'superadmin') {
    return Object.fromEntries(MODULES.map(m => {
      const extras = MODULE_EXTRAS[m.key] ?? []
      return [m.key, { can_view: true, can_edit: true, metadata: Object.fromEntries(extras.map(e => [e.key, true])) }]
    }))
  }
  const preset = ROLE_PRESET_MODULES[role]
  return Object.fromEntries(MODULES.map(m => {
    const extras = MODULE_EXTRAS[m.key] ?? []
    const canEdit = preset?.edit?.includes(m.key) ?? false
    const canView = canEdit || (preset?.view?.includes(m.key) ?? false)
    return [m.key, { can_view: canView, can_edit: canEdit, metadata: Object.fromEntries(extras.map(e => [e.key, true])) }]
  }))
}

// Ponto de partida ao ABRIR um usuário existente pra edição: tudo
// desmarcado, e só o que realmente está salvo no banco (linha em
// clinic_user_permissions) é sobreposto por cima. Antes disso, um módulo
// SEM linha no banco aparecia marcado na tela — mentindo, porque em tempo
// de execução ausência de linha = negado (usePermissions.ts).
export function blankPermissions(): PermissionsForm {
  return Object.fromEntries(MODULES.map(m => {
    const extras = MODULE_EXTRAS[m.key] ?? []
    return [m.key, { can_view: false, can_edit: false, metadata: Object.fromEntries(extras.map(e => [e.key, true])) }]
  }))
}
