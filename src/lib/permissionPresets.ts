// Módulos disponíveis para controle de permissão — precisa cobrir TODO
// module="..." usado em PermissionGuard pelo app (ver grep em src/app),
// senão o módulo fica bloqueado pra sempre pra quem não é admin, sem
// nenhum checkbox pra liberar (era exatamente o bug com procedimentos,
// relatórios, metas e campanhas antes desta lista ser completada).
export interface ModuleDef {
  key: string
  label: string
  icon: string
  plusOnly: boolean
  /** uma linha: o que o módulo cobre (aparece sob o nome na tela de permissões) */
  desc: string
  /** dependência com outro módulo, mostrada sob a descrição */
  note?: string
}

export const MODULES: ModuleDef[] = [
  { key: 'dashboard',     label: 'Dashboard',     icon: '', plusOnly: false, desc: 'Visão geral do dia e indicadores' },
  { key: 'pacientes',     label: 'Pacientes',      icon: '', plusOnly: false, desc: 'Cadastro e lista de pacientes' },
  { key: 'prontuario',    label: 'Prontuário',     icon: '', plusOnly: false, desc: 'Dados clínicos, evolução e documentos', note: 'Contratos usam este módulo.' },
  { key: 'agenda',        label: 'Agenda',         icon: '', plusOnly: false, desc: 'Consultas, horários, bloqueios e fluxo de atendimento' },
  { key: 'financeiro',    label: 'Financeiro',     icon: '', plusOnly: false, desc: 'Receitas, despesas, recibos e convênios' },
  { key: 'comissoes',     label: 'Comissões',      icon: '', plusOnly: false, desc: 'Beneficiários e regras de comissão' },
  { key: 'procedimentos', label: 'Procedimentos',  icon: '', plusOnly: false, desc: 'Lista de procedimentos e valores' },
  { key: 'relatorios',    label: 'Relatórios',     icon: '', plusOnly: false, desc: 'Relatórios de desempenho e planilhas' },
  { key: 'metas',         label: 'Metas',          icon: '', plusOnly: false, desc: 'Meta de receita da clínica' },
  { key: 'estoque',       label: 'Estoque',        icon: '', plusOnly: false, desc: 'Produtos, lotes e movimentações' },
  { key: 'equipe',        label: 'Equipe',         icon: '', plusOnly: false, desc: 'Profissionais da agenda e seus logins', note: 'A aba Equipe das Configurações (acessos e permissões) é só do administrador.' },
  { key: 'crm',           label: 'CRM',            icon: '', plusOnly: false, desc: 'Funil de contatos e conversas', note: 'Mensagens (WhatsApp) usa este módulo.' },
  { key: 'campanhas',     label: 'Campanhas',      icon: '', plusOnly: true,  desc: 'Envio de campanhas por WhatsApp' },
  { key: 'configuracoes', label: 'Configurações',  icon: '', plusOnly: false, desc: 'Dados da clínica, plano e integrações' },
]

/** Módulos que só o administrador gerencia: na tela de permissões viram "Somente administrador", sem checkbox. */
export const ADMIN_ONLY_MODULES: readonly string[] = ['configuracoes', 'metas']
export const isAdminOnlyModule = (moduleKey: string): boolean => ADMIN_ONLY_MODULES.includes(moduleKey)

export interface ModulePermForm {
  can_view: boolean
  can_edit: boolean
  metadata: Record<string, unknown>
}
export type PermissionsForm = Record<string, ModulePermForm>

// Opções extras configuráveis por módulo
// defaultOn: valor inicial para um perfil novo (admin sempre recebe tudo ligado).
export const MODULE_EXTRAS: Record<string, { key: string; label: string; hint?: string; defaultOn: boolean }[]> = {
  financeiro: [
    {
      key: 'show_totals',
      label: 'Ver totais financeiros',
      hint: 'Totais, gráficos e valores de receita no Financeiro, Dashboard e Relatórios.',
      // começa desligado: só quem precisa enxerga o faturamento da clínica
      defaultOn: false,
    },
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
    return [m.key, { can_view: canView, can_edit: canEdit, metadata: Object.fromEntries(extras.map(e => [e.key, e.defaultOn])) }]
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
    return [m.key, { can_view: false, can_edit: false, metadata: Object.fromEntries(extras.map(e => [e.key, e.defaultOn])) }]
  }))
}

// Cargos de apoio (recepção, auxiliar) nunca recebem EDIÇÃO nestes módulos: quem edita Equipe,
// Configurações ou Financeiro administra a clínica. Ver só (can_view) continua permitido. Validação de tela:
// no banco a trava só existe com SQL (ex.: trigger em clinic_user_permissions).
export const SUPPORT_ROLES = ['recepcao', 'auxiliar'] as const
export const SUPPORT_ROLE_BLOCKED_EDIT = ['equipe', 'configuracoes', 'financeiro'] as const

export function isEditBlockedForRole(role: string, moduleKey: string): boolean {
  return (SUPPORT_ROLES as readonly string[]).includes(role)
    && (SUPPORT_ROLE_BLOCKED_EDIT as readonly string[]).includes(moduleKey)
}

/** Módulos em que o cargo de apoio está com can_edit marcado e não pode (vazio = ok). */
export function blockedEditViolations(role: string, perms: PermissionsForm): string[] {
  return Object.entries(perms)
    .filter(([key, p]) => p.can_edit && isEditBlockedForRole(role, key))
    .map(([key]) => key)
}

/** Mensagem para a tela, com o nome dos módulos. */
export function blockedEditMessage(violations: string[]): string {
  const names = violations.map(k => MODULES.find(m => m.key === k)?.label ?? k).join(', ')
  return `Recepção e auxiliar não podem ter permissão de edição em: ${names}. Deixe só "Ver" nesses módulos ou use o cargo Admin.`
}

/**
 * Valores financeiros (receita, caixa, ticket médio, metas) em telas que não são o Financeiro:
 * exige Ver no módulo Financeiro e a opção "Ver totais financeiros" (ausente = liberada, como no Financeiro).
 * Admin vê sempre.
 */
export function canSeeFinancialTotals(
  perm: { isAdmin: boolean; canView: boolean; metadata?: Record<string, unknown> },
): boolean {
  if (perm.isAdmin) return true
  return perm.canView && perm.metadata?.show_totals !== false
}
